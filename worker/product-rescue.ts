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
    // Find products that failed or are pending and lack a product image.
    // If a product image already exists, it is NOT considered a failure (even with 0 DT).
    // Never recheck 404s, dead links, or impossible-to-scrape items.
    const failedItems = await db
      .select()
      .from(scrapedProducts)
      .where(
        and(
          // 1. Only rescue pending or failed items (never touch 'success', 'deleted', or 'ignored')
          sql`${scrapedProducts.scrapeStatus} IN ('failed', 'pending')`,
          // 2. If product image already exists, it's NOT a fail! (user requirement)
          isNull(scrapedProducts.mainImageUrl),
          // 3. Minimum 24h cooldown between rescue attempts
          sql`(${scrapedProducts.lastScrapedAt} IS NULL OR ${scrapedProducts.lastScrapedAt} < NOW() - INTERVAL '24 hours')`,
          // 4. Do NOT recheck 404s, dead links, or impossible items
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%[Dead link%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%[Impossible%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%404%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%Dead link%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%ERR_NAME_NOT_RESOLVED%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%ENOTFOUND%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%ECONNREFUSED%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%ERR_CONNECTION_REFUSED%'`
        )
      )
      // 5. Fair rotation: items never rescued locally first, then oldest attempts
      .orderBy(sql`${scrapedProducts.lastScrapedAt} ASC NULLS FIRST`)
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

      // 1. Try fast local direct HTML scrape first
      let extractionResult: any = await scrapeProductDirectHtml(targetUrl).catch(() => null);

      // Check if direct fetch already detected a dead link / 404
      const isDirectDead =
        extractionResult?.error?.includes("[Dead link]") ||
        extractionResult?.error?.includes("404") ||
        extractionResult?.error?.includes("ENOTFOUND") ||
        extractionResult?.error?.includes("ERR_NAME_NOT_RESOLVED") ||
        extractionResult?.error?.includes("ECONNREFUSED");

      if (isDirectDead) {
        console.warn(`[Local Rescue] 🛑 Dead link confirmed for ${targetUrl} (${extractionResult?.error}). Flagging as ignored permanently.`);
        await db
          .update(scrapedProducts)
          .set({
            scrapeStatus: "ignored",
            failureReason: extractionResult?.error || "[Dead link] HTTP 404 Not Found",
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));
        continue;
      }

      const hasDirectImage = Boolean(extractionResult?.data?.main_image_url);
      const hasDirectPrice = Boolean(
        extractionResult?.data?.current_price &&
        extractionResult.data.current_price !== "0 DT" &&
        extractionResult.data.current_price !== "0"
      );

      // 2. If direct HTML didn't get image or price, trigger local Playwright browser
      if (!extractionResult?.success || !extractionResult.data || (!hasDirectImage && !hasDirectPrice)) {
        console.log(`[Local Rescue] Direct fetch incomplete. Launching local Playwright browser for: ${targetUrl}...`);
        extractionResult = await scrapeUrlWithLocalPlaywright(targetUrl);
      }

      // Check if Playwright confirmed a dead link / 404
      const isPlaywrightDead =
        extractionResult?.error?.includes("[Dead link]") ||
        extractionResult?.error?.includes("404") ||
        extractionResult?.error?.includes("ENOTFOUND") ||
        extractionResult?.error?.includes("ERR_NAME_NOT_RESOLVED") ||
        extractionResult?.error?.includes("ECONNREFUSED");

      if (isPlaywrightDead) {
        console.warn(`[Local Rescue] 🛑 Dead link confirmed by browser for ${targetUrl}. Flagging as ignored permanently.`);
        await db
          .update(scrapedProducts)
          .set({
            scrapeStatus: "ignored",
            failureReason: extractionResult?.error || "[Dead link] 404 Not Found",
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));
        continue;
      }

      // 3. User requirement: "if the product image exist thats enough, flagged as not a fail"
      const extracted = extractionResult?.data;
      const hasImage = Boolean(extracted?.main_image_url || item.mainImageUrl);
      const hasPrice = Boolean(
        extracted?.current_price &&
        extracted.current_price !== "0 DT" &&
        extracted.current_price !== "0"
      );
      const hasTitle = Boolean(extracted?.title || item.title);

      if (extractionResult?.success && extracted && hasTitle && (hasImage || hasPrice)) {
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
            title: extracted.title || item.title,
            currentPrice: extracted.current_price || item.currentPrice || "0 DT",
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
        console.log(`[Local Rescue] ✅ Successfully rescued: "${extracted.title || "Product"}" ➔ ${extracted.current_price || "Image Extracted"}`);
      } else {
        // Both Cloud and Local failed to extract details / image -> flag as [Impossible to scrape] so it's never rechecked!
        console.warn(`[Local Rescue] ⚠️ Could not rescue ${targetUrl}: ${extractionResult?.error || "Unknown"}`);
        await db
          .update(scrapedProducts)
          .set({
            scrapeStatus: "failed",
            failureReason: `[Impossible to scrape] ${extractionResult?.error || "Local and cloud extractors could not parse details"}`,
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
