import { db } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { eq, or, and, sql, desc, isNull } from "drizzle-orm";
import { scrapeUrlWithLocalPlaywright } from "../lib/local-browser-scraper";
import { scrapeProductDirectHtml } from "../lib/html-scraper";
import { getCleanDomain } from "../lib/utils";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
  extractDeliveryInfo,
} from "../lib/network-extractor";

let isRescueRunning = false;
let lastRescueAttemptTime = 0;

/**
 * Rescues failed or pending product extractions using the local residential IP and browser.
 * Runs during worker idle periods to repair Cloudflare-blocked products automatically.
 */
export async function rescueFailedProductsBatch(limit = 3, force = false): Promise<number> {
  if (isRescueRunning) return 0;
  
  // Throttle rescue checks to run at most once every 60 seconds unless forced (e.g. startup)
  const now = Date.now();
  if (!force && now - lastRescueAttemptTime < 60000) return 0;
  lastRescueAttemptTime = now;

  isRescueRunning = true;

  try {
    // Find products that failed or are pending/missing valid prices
    // Ignore products already marked as permanently deleted/ignored or dead 404 links
    const failedItems = await db
      .select()
      .from(scrapedProducts)
      .where(
        and(
          sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`,
          or(
            eq(scrapedProducts.scrapeStatus, "failed"),
            eq(scrapedProducts.scrapeStatus, "pending"),
            isNull(scrapedProducts.currentPrice),
            eq(scrapedProducts.currentPrice, "0 DT"),
            eq(scrapedProducts.currentPrice, "0")
          ),
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%404%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%Dead link%'`
        )
      )
      .orderBy(desc(scrapedProducts.createdAt))
      .limit(limit);

    if (failedItems.length === 0) {
      return 0;
    }

    console.log(`\n[Local Rescue] 🔍 Found ${failedItems.length} failed/pending product(s) to rescue locally...`);
    let rescuedCount = 0;

    for (const item of failedItems) {
      const targetUrl = item.url;
      if (!targetUrl || !targetUrl.startsWith("http")) continue;

      console.log(`[Local Rescue] Attempting local recovery for: ${targetUrl}`);

      // 1. Try fast local direct HTML scrape first (residential IP bypasses most Cloudflare rules)
      let extractionResult: any = await scrapeProductDirectHtml(targetUrl).catch(() => null);

      // 2. If direct HTML didn't get title/price or failed, trigger local Playwright browser
      if (
        !extractionResult?.success ||
        !extractionResult.data ||
        !extractionResult.data.title ||
        !extractionResult.data.current_price
      ) {
        console.log(`[Local Rescue] Direct fetch incomplete. Launching local Playwright browser for: ${targetUrl}...`);
        extractionResult = await scrapeUrlWithLocalPlaywright(targetUrl);
      }

      if (extractionResult?.success && extractionResult.data && extractionResult.data.title) {
        const extracted = extractionResult.data;
        const rawHtml = extractionResult.rawHtml || "";
        const finalUrl = targetUrl;
        const resolvedDomain = getCleanDomain(finalUrl);
        const platform = detectStorePlatform(rawHtml, finalUrl);
        const phones = extractTunisianPhoneNumbers(rawHtml);
        const wa = extractWhatsAppNumbers(rawHtml);
        const pixels = extractMetaPixelIds(rawHtml);
        const delivery = extractDeliveryInfo(rawHtml, extracted.delivery_cost);

        const formattedOffers = (extracted.all_offers || []).map((o: any) => ({
          tierName: o.tier_name,
          price: o.price,
          savings: o.savings,
        }));

        await db
          .update(scrapedProducts)
          .set({
            domain: resolvedDomain || item.domain,
            title: extracted.title,
            currentPrice: extracted.current_price || item.currentPrice,
            originalPrice: extracted.original_price || item.originalPrice,
            currency: extracted.currency || item.currency || "TND",
            discountOrOffer: extracted.discount_or_offer || item.discountOrOffer,
            mainImageUrl: extracted.main_image_url || item.mainImageUrl,
            galleryImages: extracted.gallery_images || item.galleryImages || [],
            allOffers: formattedOffers.length > 0 ? formattedOffers : item.allOffers,
            storePlatform: platform || item.storePlatform,
            phoneNumbers: phones.length > 0 ? phones : item.phoneNumbers,
            whatsappNumbers: wa.length > 0 ? wa : item.whatsappNumbers,
            metaPixelIds: pixels.length > 0 ? pixels : item.metaPixelIds,
            deliveryCost: delivery.label || item.deliveryCost,
            scrapeStatus: "success",
            failureReason: null,
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));

        // Relink unlinked ads for this product
        await db
          .update(ads)
          .set({ productId: item.id })
          .where(sql`${ads.productId} IS NULL AND ${ads.linkUrl} LIKE ${`%${targetUrl}%`}`);

        rescuedCount++;
        console.log(`[Local Rescue] ✅ Successfully rescued: "${extracted.title}" ➔ ${extracted.current_price || "Price N/A"}`);
      } else {
        console.warn(`[Local Rescue] ⚠️ Could not rescue ${targetUrl}: ${extractionResult?.error || "Unknown"}`);
        await db
          .update(scrapedProducts)
          .set({
            failureReason: extractionResult?.error || "Local rescue attempt could not extract details",
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));
      }
    }

    return rescuedCount;
  } catch (err: any) {
    console.error("[Local Rescue] Unexpected error during rescue loop:", err.message);
    return 0;
  } finally {
    isRescueRunning = false;
  }
}
