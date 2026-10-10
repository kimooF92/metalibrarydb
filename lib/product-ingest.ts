import { db } from "@/db";
import { ads, scrapedProducts, trackedPages, brandDomains, adObservations, workspaces } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
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
import { validateProductWithGatekeeper } from "@/lib/typesafe-jev";

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
export async function linkAndAutoScrapeProduct({
  adId,
  linkUrl,
  pageId,
  adCopy,
  workspaceId,
}: {
  adId?: string;
  linkUrl: string | null | undefined;
  pageId?: string | null;
  adCopy?: string | null;
  workspaceId?: string | null;
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
        await db
          .update(ads)
          .set({ productId: prodId })
          .where(eq(ads.id, adId));
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
        await db
          .update(ads)
          .set({ productId: prodId })
          .where(eq(ads.id, adId));
      }
      return { productId: prodId, isNew: false };
    }

    // Link ad to newly created product record
    if (adId) {
      await db
        .update(ads)
        .set({ productId: targetProductId })
        .where(eq(ads.id, adId));
    }

    // 3. Queue asynchronous background scraping (Non-blocking)
    queueBackgroundScrape(async () => {
      // Check if already in-flight
      if (inFlightScrapes.has(normalizedUrl)) {
        await inFlightScrapes.get(normalizedUrl);
        return;
      }

      const scrapePromise = (async () => {
        try {
          console.log(`[Auto-Scraper] Starting background product extraction: ${normalizedUrl}`);

          // Resolve workspace default currency dynamically
          let fallbackCurrency = "TND";
          let fallbackCurrencySymbol = "DT";
          if (resolvedWorkspaceId) {
            const ws = await db.query.workspaces.findFirst({
              where: eq(workspaces.id, resolvedWorkspaceId),
              columns: { currency: true, currencySymbol: true },
            });
            if (ws?.currency) fallbackCurrency = ws.currency;
            if (ws?.currencySymbol) fallbackCurrencySymbol = ws.currencySymbol;
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
                scrapeStatus: isDead ? "ignored" : "failed",
                failureReason: extractionResult.error || "Extraction failed",
                lastScrapedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(scrapedProducts.id, targetProductId));
            return;
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
                domain: resolvedDomain || undefined,
                title: extracted.title || normalizedUrl,
                scrapeStatus: "ignored",
                failureReason: gateCheck.reason || "Non-product item filtered by gatekeeper",
                lastScrapedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(scrapedProducts.id, targetProductId));
            return;
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

          // AI classification bypassed per user instructions to avoid external failures/delays
          const category = null;
          const subCategory = null;
          const targetAudience = null;

          const formattedOffers = (extracted.all_offers || []).map((offer) => ({
            tierName: offer.tier_name,
            price: offer.price ? formatPrice(offer.price, fallbackCurrencySymbol) : offer.price,
            savings: offer.savings,
          }));

          const effectiveCurrency = extracted.currency || fallbackCurrency;
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
            .where(eq(scrapedProducts.id, targetProductId));

          // Ensure all matching ads are linked to this product ID
          await db
            .update(ads)
            .set({ productId: targetProductId })
            .where(sql`${ads.productId} IS NULL AND ${ads.linkUrl} LIKE ${`%${normalizedUrl}%`}`);

          console.log(`[Auto-Scraper] Successfully extracted: "${extracted.title || normalizedUrl}" (${extracted.current_price || "N/A"})`);
        } catch (scrapeErr: any) {
          console.error(`[Auto-Scraper] Failed to extract product ${normalizedUrl}:`, scrapeErr?.message || scrapeErr);
          await db
            .update(scrapedProducts)
            .set({
              scrapeStatus: "failed",
              failureReason: scrapeErr?.message || "Background extraction error",
              updatedAt: new Date(),
            })
            .where(eq(scrapedProducts.id, targetProductId));
        } finally {
          inFlightScrapes.delete(normalizedUrl);
        }
      })();

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
