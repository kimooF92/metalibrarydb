import { db } from "@/db";
import { ads, scrapedProducts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { normalizeProductUrl, extractProductFromUrl } from "@/lib/firecrawl";
import { getCleanDomain } from "@/lib/utils";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
  extractDeliveryInfo,
} from "@/lib/network-extractor";

// In-flight URL scrape deduplication map to prevent redundant concurrent Firecrawl requests
const inFlightScrapes = new Map<string, Promise<any>>();

// Concurrency limiter for background auto-scraping (max 3 concurrent scrapes)
const MAX_CONCURRENT_AUTO_SCRAPES = 3;
let activeScrapesCount = 0;
const scrapeQueue: Array<() => Promise<void>> = [];

function processNextScrape() {
  if (activeScrapesCount >= MAX_CONCURRENT_AUTO_SCRAPES || scrapeQueue.length === 0) {
    return;
  }
  const nextTask = scrapeQueue.shift();
  if (nextTask) {
    activeScrapesCount++;
    nextTask().finally(() => {
      activeScrapesCount--;
      processNextScrape();
    });
  }
}

function queueBackgroundScrape(task: () => Promise<void>) {
  scrapeQueue.push(task);
  processNextScrape();
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
}: {
  adId?: string;
  linkUrl: string | null | undefined;
  pageId?: string | null;
  adCopy?: string | null;
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
    // 1. Check if product already exists in scrapedProducts table
    const existing = await db
      .select({
        id: scrapedProducts.id,
        scrapeStatus: scrapedProducts.scrapeStatus,
        lastScrapedAt: scrapedProducts.lastScrapedAt,
      })
      .from(scrapedProducts)
      .where(eq(scrapedProducts.url, normalizedUrl))
      .limit(1);

    if (existing.length > 0) {
      const prodId = existing[0].id;
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
        pageId: pageId || null,
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
        .select({ id: scrapedProducts.id })
        .from(scrapedProducts)
        .where(eq(scrapedProducts.url, normalizedUrl))
        .limit(1);
      const prodId = recheck[0]?.id || null;
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
          const extractionResult = await extractProductFromUrl(normalizedUrl);

          if (!extractionResult.success || !extractionResult.data) {
            await db
              .update(scrapedProducts)
              .set({
                scrapeStatus: "failed",
                failureReason: extractionResult.error || "Extraction failed",
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

          const phoneNumbers = extractTunisianPhoneNumbers(rawHtml);
          const whatsappNumbers = extractWhatsAppNumbers(rawHtml);
          const metaPixelIds = extractMetaPixelIds(rawHtml);
          const storePlatform = detectStorePlatform(rawHtml, normalizedUrl);
          const deliveryInfo = extractDeliveryInfo(rawHtml, extracted.delivery_cost);
          const deliveryCost = deliveryInfo?.label || null;

          const formattedOffers = (extracted.all_offers || []).map((offer) => ({
            tierName: offer.tier_name,
            price: offer.price,
            savings: offer.savings,
          }));

          const updateTime = new Date();
          await db
            .update(scrapedProducts)
            .set({
              title: extracted.title,
              currentPrice: extracted.current_price,
              originalPrice: extracted.original_price || null,
              currency: extracted.currency || "TND",
              discountOrOffer: extracted.discount_or_offer || null,
              mainImageUrl: extracted.main_image_url || null,
              galleryImages: extracted.gallery_images || [],
              allOffers: formattedOffers.length > 0 ? formattedOffers : null,
              phoneNumbers: phoneNumbers.length > 0 ? phoneNumbers : null,
              whatsappNumbers: whatsappNumbers.length > 0 ? whatsappNumbers : null,
              metaPixelIds: metaPixelIds.length > 0 ? metaPixelIds : null,
              storePlatform: storePlatform || "other",
              deliveryCost: deliveryCost || null,
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
  }>
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
