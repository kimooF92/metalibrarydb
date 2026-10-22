import { db } from "@/db";
import { ads, adProducts, scrapedProducts, trackedPages, brandDomains, adObservations, workspaces, queue } from "@/db/schema";
import { eq, sql, and, or, isNull } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { normalizeProductUrl, extractProductFromUrl } from "@/lib/firecrawl";
import { getCleanDomain, isValidPageId } from "@/lib/utils";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
  extractDeliveryInfo,
} from "@/lib/network-extractor";
import { formatPrice, formatDelivery } from "@/lib/format-price";
import { validateProductWithGatekeeper, classifyProductWithJev } from "@/lib/typesafe-jev";
import { classifyProductOffline } from "@/lib/product-classifier";
import { detectExtractionDoubt, resolvePriceDoubtWithJev } from "@/lib/doubt-detector";

// In-flight URL scrape deduplication map to prevent redundant concurrent Firecrawl requests
const inFlightScrapes = new Map<string, Promise<any>>();

// Concurrency limiter for background auto-scraping (max 3 concurrent scrapes)
const MAX_CONCURRENT_AUTO_SCRAPES = 3;
let activeScrapesCount = 0;
let totalDrainedCount = 0;
const scrapeQueue: Array<() => Promise<void>> = [];
const drainListeners: Array<() => void> = [];

function checkDrainNotification() {
  if (activeScrapesCount === 0 && scrapeQueue.length === 0) {
    while (drainListeners.length > 0) {
      const listener = drainListeners.shift();
      listener?.();
    }
  }
}

function processNextScrape() {
  if (activeScrapesCount >= MAX_CONCURRENT_AUTO_SCRAPES || scrapeQueue.length === 0) {
    checkDrainNotification();
    return;
  }
  const nextTask = scrapeQueue.shift();
  if (nextTask) {
    activeScrapesCount++;
    nextTask().finally(() => {
      activeScrapesCount--;
      totalDrainedCount++;
      processNextScrape();
      checkDrainNotification();
    });
  }
}

function queueBackgroundScrape(task: () => Promise<void>) {
  scrapeQueue.push(task);
  processNextScrape();
}

/**
 * Awaits until all queued background product scrapes complete or until the timeout is reached.
 */
export async function waitForScrapeQueueDrain(timeoutMs: number = 45000): Promise<{ drained: number; remaining: number }> {
  if (activeScrapesCount === 0 && scrapeQueue.length === 0) {
    return { drained: totalDrainedCount, remaining: 0 };
  }

  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ drained: totalDrainedCount, remaining: activeScrapesCount + scrapeQueue.length });
      }
    }, timeoutMs);

    drainListeners.push(() => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ drained: totalDrainedCount, remaining: 0 });
      }
    });
  });
}

/**
 * Normalizes, deduplicates, and automatically enriches product landing page URLs.
 * 1. Resolves Facebook redirect shims and strips UTM tracking parameters.
 * 2. Checks if product already exists in scrapedProducts (instant link, $0 cost).
 * 3. If new, creates a pending scrapedProduct record and triggers background Firecrawl extraction.
 */
/**
 * Links an ad to a product in both the ad_products junction table (for multi-product / carousel support)
 * and the canonical ads.productId column (for primary backward compatibility).
 */
export async function linkAdToProduct(
  adId: string,
  targetProductId: string,
  isPrimary: boolean = true,
  cardIndex: number = 0
): Promise<void> {
  try {
    // 1. Upsert into ad_products junction table
    await db
      .insert(adProducts)
      .values({
        adId,
        productId: targetProductId,
        isPrimary,
        cardIndex,
      })
      .onConflictDoNothing();

    // 2. Set ads.productId if primary OR if ads.productId is currently unset
    if (isPrimary) {
      await db
        .update(ads)
        .set({ productId: targetProductId })
        .where(eq(ads.id, adId));
    } else {
      await db
        .update(ads)
        .set({ productId: targetProductId })
        .where(and(eq(ads.id, adId), isNull(ads.productId)));
    }
  } catch (err) {
    console.warn("[Product Ingest] linkAdToProduct warning:", err);
  }
}

export async function linkAndAutoScrapeProduct({
  adId,
  linkUrl,
  pageId,
  adCopy,
  workspaceId,
  isPrimary = true,
  cardIndex = 0,
}: {
  adId?: string;
  linkUrl: string | null | undefined;
  pageId?: string | null;
  adCopy?: string | null;
  workspaceId?: string | null;
  isPrimary?: boolean;
  cardIndex?: number;
}): Promise<{ productId: string | null; isNew: boolean }> {
  if (!linkUrl) return { productId: null, isNew: false };

  const normalizedUrl = normalizeProductUrl(linkUrl);
  if (!normalizedUrl) return { productId: null, isNew: false };

  // Skip pure social media profile links
  const socialDomains = [
    "facebook.com",
    "instagram.com",
    "wa.me",
    "api.whatsapp.com",
    "m.me",
    "tiktok.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "t.me",
  ];
  const domain = getCleanDomain(normalizedUrl) || "";
  if (!domain || socialDomains.some((d) => domain.includes(d))) {
    return { productId: null, isNew: false };
  }

  try {
    // Resolve workspace and brand domain hierarchy
    let resolvedWorkspaceId = workspaceId;
    let resolvedBrandDomainId: string | null = null;

    const cleanPageId = isValidPageId(pageId) ? (pageId as string) : null;
    if (cleanPageId) {
      const pageRec = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.pageId, cleanPageId),
        columns: { workspaceId: true, brandDomainId: true },
      });
      if (pageRec?.workspaceId && !resolvedWorkspaceId) {
        resolvedWorkspaceId = pageRec.workspaceId;
      }
      if (pageRec?.brandDomainId) {
        resolvedBrandDomainId = pageRec.brandDomainId;
      }
    }

    if (domain) {
      const bd = await db.query.brandDomains.findFirst({
        where: sql`lower(${brandDomains.domain}) = ${domain.toLowerCase()}`,
        columns: { id: true, workspaceId: true },
      });
      if (bd) {
        if (!resolvedBrandDomainId) resolvedBrandDomainId = bd.id;
        if (!resolvedWorkspaceId && bd.workspaceId) resolvedWorkspaceId = bd.workspaceId;
      }
    }

    if (!resolvedWorkspaceId && adId) {
      const adObs = await db
        .select({
          workspaceId: trackedPages.workspaceId,
          brandDomainId: trackedPages.brandDomainId,
        })
        .from(adObservations)
        .innerJoin(trackedPages, eq(adObservations.trackedPageId, trackedPages.id))
        .where(eq(adObservations.adId, adId))
        .limit(1);

      if (adObs.length > 0 && adObs[0].workspaceId) {
        resolvedWorkspaceId = adObs[0].workspaceId;
        if (!resolvedBrandDomainId && adObs[0].brandDomainId) {
          resolvedBrandDomainId = adObs[0].brandDomainId;
        }
      }
    }

    if (!resolvedWorkspaceId) {
      const activeWs = await getActiveWorkspace();
      resolvedWorkspaceId = activeWs.id;
    }

    // 1. Check if product already exists in scrapedProducts table
    const existing = await db
      .select({
        id: scrapedProducts.id,
        workspaceId: scrapedProducts.workspaceId,
        brandDomainId: scrapedProducts.brandDomainId,
        pageId: scrapedProducts.pageId,
        scrapeStatus: scrapedProducts.scrapeStatus,
        lastScrapedAt: scrapedProducts.lastScrapedAt,
      })
      .from(scrapedProducts)
      .where(eq(scrapedProducts.url, normalizedUrl))
      .limit(1);

    if (existing.length > 0) {
      const prod = existing[0];
      // If user deleted or ignored this product, do not resurrect or link it
      if (prod.scrapeStatus === "deleted" || prod.scrapeStatus === "ignored") {
        return { productId: null, isNew: false };
      }

      const prodId = prod.id;

      // Reconcile and fix workspaceId / brandDomainId / pageId if missing or mismatched
      const updates: any = {};
      if (resolvedWorkspaceId && prod.workspaceId !== resolvedWorkspaceId) {
        updates.workspaceId = resolvedWorkspaceId;
      }
      if (resolvedBrandDomainId && prod.brandDomainId !== resolvedBrandDomainId) {
        updates.brandDomainId = resolvedBrandDomainId;
      }
      if (isValidPageId(pageId) && !prod.pageId) {
        updates.pageId = pageId;
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db
          .update(scrapedProducts)
          .set(updates)
          .where(eq(scrapedProducts.id, prodId));
      }

      // Link ad to existing product record immediately
      if (adId) {
        await linkAdToProduct(adId, prodId, isPrimary, cardIndex);
      }
      return { productId: prodId, isNew: false };
    }

    // 2. Insert new pending product entry
    const now = new Date();

    const [newProduct] = await db
      .insert(scrapedProducts)
      .values({
        url: normalizedUrl,
        domain: domain || null,
        pageId: isValidPageId(pageId) ? pageId : null,
        workspaceId: resolvedWorkspaceId,
        brandDomainId: resolvedBrandDomainId || null,
        title: domain || "Product",
        scrapeStatus: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: scrapedProducts.id });

    const targetProductId = newProduct?.id;

    if (!targetProductId) {
      // Handled conflict: Fetch existing ID
      const recheck = await db
        .select({ id: scrapedProducts.id, workspaceId: scrapedProducts.workspaceId })
        .from(scrapedProducts)
        .where(eq(scrapedProducts.url, normalizedUrl))
        .limit(1);
      const prodId = recheck[0]?.id || null;

      if (prodId && resolvedWorkspaceId && recheck[0]?.workspaceId !== resolvedWorkspaceId) {
        await db
          .update(scrapedProducts)
          .set({ workspaceId: resolvedWorkspaceId, brandDomainId: resolvedBrandDomainId || undefined, updatedAt: now })
          .where(eq(scrapedProducts.id, prodId));
      }

      if (adId && prodId) {
        await linkAdToProduct(adId, prodId, isPrimary, cardIndex);
      }
      return { productId: prodId, isNew: false };
    }

    // Link ad to newly created product record
    if (adId && targetProductId) {
      await linkAdToProduct(adId, targetProductId, isPrimary, cardIndex);
    }

    // Insert into PostgreSQL durable queue for background worker (Task 2.1)
    let targetTrackedPageUuid: string | null = null;
    if (isValidPageId(pageId)) {
      try {
        const pageRec = await db.query.trackedPages.findFirst({
          where: eq(trackedPages.pageId, String(pageId)),
          columns: { id: true },
        });
        if (pageRec) targetTrackedPageUuid = pageRec.id;
      } catch {}
    }

    try {
      await db
        .insert(queue)
        .values({
          trackedPageId: targetTrackedPageUuid,
          jobType: "product_scrape",
          status: "pending",
          priority: 5,
          failureReason: `product:${targetProductId}`,
          workspaceId: resolvedWorkspaceId,
        })
        .onConflictDoNothing();
    } catch (queueErr) {
      console.warn(`[Product Ingest] Non-fatal queue insertion warning:`, queueErr);
    }

    // 3. Queue asynchronous background scraping (Non-blocking)
    queueBackgroundScrape(async () => {
      // Check if already in-flight
      if (inFlightScrapes.has(normalizedUrl)) {
        await inFlightScrapes.get(normalizedUrl);
        return;
      }

      const scrapePromise = processProductExtraction(targetProductId, normalizedUrl, {
        workspaceId: resolvedWorkspaceId,
        adCopy,
      }).finally(() => {
        inFlightScrapes.delete(normalizedUrl);
      });

      inFlightScrapes.set(normalizedUrl, scrapePromise);
      await scrapePromise;
    });

    return { productId: targetProductId, isNew: true };
  } catch (err: any) {
    console.error(`[Product Ingest] Error linking product for URL "${normalizedUrl}":`, err?.message || err);
    return { productId: null, isNew: false };
  }
}

/**
 * Executes full product extraction, AI classification, price refereeing, and exact canonical ad linking.
 * Can be called immediately in background or by the worker durable queue.
 */
export async function processProductExtraction(
  productId: string,
  normalizedUrl: string,
  options?: {
    workspaceId?: string | null;
    adCopy?: string | null;
  }
): Promise<{ success: boolean; status: string; error?: string }> {
  try {
    // 1. Atomic claim check: ensure another worker or process is not already extracting this product
    const claimed = await db
      .update(scrapedProducts)
      .set({ scrapeStatus: "scraping", updatedAt: new Date() })
      .where(
        and(
          eq(scrapedProducts.id, productId),
          sql`${scrapedProducts.scrapeStatus} NOT IN ('scraping', 'success', 'ignored')`
        )
      )
      .returning({ id: scrapedProducts.id });

    if (!claimed || claimed.length === 0) {
      console.log(`[Auto-Scraper] Product ${productId} is already scraping or completed. Skipping duplicate execution.`);
      return { success: true, status: "already_claimed" };
    }

    console.log(`[Auto-Scraper] Starting product extraction: ${normalizedUrl}`);

    // Resolve workspace default currency dynamically
    let fallbackCurrency = "TND";
    let fallbackCurrencySymbol = "DT";
    if (options?.workspaceId) {
      try {
        const ws = await db.query.workspaces.findFirst({
          where: eq(workspaces.id, options.workspaceId),
          columns: { currency: true, currencySymbol: true },
        });
        if (ws?.currency) fallbackCurrency = ws.currency;
        if (ws?.currencySymbol) fallbackCurrencySymbol = ws.currencySymbol;
      } catch {}
    }

    const extractionResult = await extractProductFromUrl(normalizedUrl, {
      defaultCurrency: fallbackCurrency,
      defaultCurrencySymbol: fallbackCurrencySymbol,
    });

    if (!extractionResult.success || !extractionResult.data) {
      const isDead = extractionResult.error?.includes("[Dead link]") || extractionResult.error?.includes("404");
      await db
        .update(scrapedProducts)
        .set({
          rawExtract: null,
          scrapeStatus: isDead ? "ignored" : "failed",
          failureReason: extractionResult.error || "Extraction failed",
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scrapedProducts.id, productId));
      return { success: false, status: isDead ? "ignored" : "failed", error: extractionResult.error };
    }

    const extracted = extractionResult.data;
    const rawHtml =
      extractionResult.raw?.html ||
      extractionResult.raw?.data?.html ||
      extractionResult.raw?.rawHtml ||
      "";

    const finalEffectiveUrl = extracted.resolved_url || normalizedUrl;
    const resolvedDomain = getCleanDomain(finalEffectiveUrl);

    // Hybrid 0-Credit Noise Gatekeeper: drop policy, cart, legal, or non-product pages
    const gateCheck = await validateProductWithGatekeeper(
      extracted.title,
      finalEffectiveUrl,
      extracted.current_price
    );

    if (!gateCheck.isProduct) {
      console.log(
        `[Auto-Scraper Gatekeeper] Dropped non-product page: "${extracted.title || finalEffectiveUrl}" (${gateCheck.reason})`
      );
      await db
        .update(scrapedProducts)
        .set({
          rawExtract: null,
          domain: resolvedDomain || undefined,
          title: extracted.title || normalizedUrl,
          scrapeStatus: "ignored",
          failureReason: gateCheck.reason || "Non-product item filtered by gatekeeper",
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scrapedProducts.id, productId));
      return { success: true, status: "ignored" };
    }

    const phoneNumbers = extractTunisianPhoneNumbers(rawHtml);
    const whatsappNumbers = extractWhatsAppNumbers(rawHtml);
    const metaPixelIds = extractMetaPixelIds(rawHtml);
    const storePlatform = detectStorePlatform(rawHtml, finalEffectiveUrl);
    const deliveryInfo = extractDeliveryInfo(
      rawHtml,
      extracted.delivery_cost,
      extracted.all_offers,
      fallbackCurrencySymbol
    );
    const deliveryCost = deliveryInfo?.label ? formatDelivery(deliveryInfo.label, fallbackCurrencySymbol) : null;

    // High-speed Decision AI classification (Span/Jev model with AI cascade fallback)
    let category: string | null = null;
    let subCategory: string | null = null;
    let targetAudience: string | null = null;

    if (extracted.title) {
      try {
        const jevClassification = await classifyProductWithJev(extracted.title, {
          domain: resolvedDomain,
          url: finalEffectiveUrl,
          adText: options?.adCopy || null,
          allowGeneral: false,
        });

        if (jevClassification?.category && jevClassification.category !== "General & Other") {
          category = jevClassification.category;
          subCategory = jevClassification.subCategory;
          targetAudience = jevClassification.targetAudience;
        } else {
          const fallback = classifyProductOffline(extracted.title);
          category = fallback.category;
          subCategory = fallback.subCategory;
          targetAudience = fallback.targetAudience;
        }
      } catch (err: any) {
        console.warn(`[Auto-Scraper] Decision AI classification error for "${extracted.title}":`, err?.message || err);
        const fallback = classifyProductOffline(extracted.title);
        category = fallback.category;
        subCategory = fallback.subCategory;
        targetAudience = fallback.targetAudience;
      }
    }

    const formattedOffers = (extracted.all_offers || []).map((offer) => ({
      tierName: offer.tier_name,
      price: offer.price ? formatPrice(offer.price, fallbackCurrencySymbol) : offer.price,
      savings: offer.savings,
    }));

    const effectiveCurrency = extracted.currency || fallbackCurrency;

    // 0-Cost Anomaly / Doubt Detector: triggers Jev referee ONLY on suspicious prices
    const doubt = detectExtractionDoubt({
      title: extracted.title,
      currentPrice: extracted.current_price,
      url: finalEffectiveUrl,
    });

    if (doubt.hasDoubt && doubt.needsPriceReferee) {
      console.log(`[Auto-Scraper] Doubt flagged on "${extracted.title}": ${doubt.reasons.join(", ")}`);
      try {
        const resolved = await resolvePriceDoubtWithJev({
          productTitle: extracted.title,
          extractedPrice: extracted.current_price,
          html: rawHtml,
          markdown: extractionResult.raw?.markdown,
          fallbackCurrencySymbol,
        });

        if (resolved?.resolvedPrice) {
          console.log(
            `[Auto-Scraper Jev Referee] Corrected price from "${extracted.current_price}" -> "${resolved.resolvedPrice}" (${(resolved.confidence * 100).toFixed(0)}% conf)`
          );
          extracted.current_price = resolved.resolvedPrice;
        }
      } catch (err: any) {
        console.warn("[Auto-Scraper Jev Referee] Price resolution skipped:", err?.message || err);
      }
    }

    const effectivePrice = formatPrice(extracted.current_price, fallbackCurrencySymbol);
    const effectiveOriginalPrice = extracted.original_price
      ? formatPrice(extracted.original_price, fallbackCurrencySymbol)
      : null;

    const updateTime = new Date();
    await db
      .update(scrapedProducts)
      .set({
        domain: resolvedDomain || undefined,
        title: extracted.title,
        currentPrice: effectivePrice,
        originalPrice: effectiveOriginalPrice,
        currency: effectiveCurrency,
        discountOrOffer: extracted.discount_or_offer || null,
        mainImageUrl: extracted.main_image_url || null,
        galleryImages: extracted.gallery_images || [],
        allOffers: formattedOffers.length > 0 ? formattedOffers : null,
        phoneNumbers: phoneNumbers.length > 0 ? phoneNumbers : null,
        whatsappNumbers: whatsappNumbers.length > 0 ? whatsappNumbers : null,
        metaPixelIds: metaPixelIds.length > 0 ? metaPixelIds : null,
        storePlatform: storePlatform || "other",
        deliveryCost: deliveryCost || null,
        category,
        subCategory,
        targetAudience,
        rawExtract: extractionResult.raw || null,
        scrapeStatus: "success",
        failureReason: null,
        lastScrapedAt: updateTime,
        updatedAt: updateTime,
      })
      .where(eq(scrapedProducts.id, productId));

    // Task 3.1: Exact canonical normalized URL equality linking (replacing unindexed LIKE)
    const matchingAds = await db
      .select({ id: ads.id })
      .from(ads)
      .where(
        or(
          eq(ads.linkUrl, normalizedUrl),
          sql`LOWER(TRIM(TRAILING '/' FROM ${ads.linkUrl})) = LOWER(TRIM(TRAILING '/' FROM ${normalizedUrl}))`
        )
      );

    for (const mAd of matchingAds) {
      await linkAdToProduct(mAd.id, productId, true, 0);
    }

    // Complete any pending queue jobs for this product
    await db
      .update(queue)
      .set({ status: "completed", finishedAt: updateTime })
      .where(
        and(
          eq(queue.jobType, "product_scrape"),
          eq(queue.status, "pending"),
          eq(queue.failureReason, `product:${productId}`)
        )
      )
      .catch(() => {});

    console.log(`[Auto-Scraper] Successfully extracted: "${extracted.title || normalizedUrl}" (${extracted.current_price || "N/A"})`);
    return { success: true, status: "success" };
  } catch (scrapeErr: any) {
    console.error(`[Auto-Scraper] Failed to extract product ${normalizedUrl}:`, scrapeErr?.message || scrapeErr);
    await db
      .update(scrapedProducts)
      .set({
        rawExtract: null,
        scrapeStatus: "failed",
        failureReason: scrapeErr?.message || "Background extraction error",
        updatedAt: new Date(),
      })
      .where(eq(scrapedProducts.id, productId));
    return { success: false, status: "failed", error: scrapeErr?.message };
  }
}

/**
 * Batch processes an array of ads to extract, deduplicate, and auto-scrape all unique product landing pages.
 */
export async function bulkLinkAndAutoScrapeProducts(
  adsToProcess: Array<{
    id: string;
    linkUrl: string | null | undefined;
    pageId?: string | null;
    caption?: string | null;
    workspaceId?: string | null;
  }>,
  batchWorkspaceId?: string | null
) {
  if (!adsToProcess || adsToProcess.length === 0) return { linked: 0, newProducts: 0 };

  let linkedCount = 0;
  let newProductsCount = 0;

  for (const item of adsToProcess) {
    if (!item.linkUrl) continue;
    try {
      const res = await linkAndAutoScrapeProduct({
        adId: item.id,
        linkUrl: item.linkUrl,
        pageId: item.pageId,
        adCopy: item.caption,
        workspaceId: item.workspaceId || batchWorkspaceId || null,
      });
      if (res.productId) {
        linkedCount++;
        if (res.isNew) newProductsCount++;
      }
    } catch (e: any) {
      console.warn(`[Bulk Product Ingest] Error processing ad ${item.id}:`, e.message);
    }
  }

  return { linked: linkedCount, newProducts: newProductsCount };
}
