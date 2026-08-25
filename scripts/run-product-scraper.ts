import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { eq, or, isNull, inArray, sql, desc } from "drizzle-orm";
import { extractProductFromUrl } from "../lib/firecrawl";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
  extractDeliveryInfo,
} from "../lib/network-extractor";

interface RunOptions {
  limit: number;
  forceAll: boolean;
  status?: string;
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const options: RunOptions = {
    limit: parseInt(process.env.SCRAPE_LIMIT || "100", 10) || 100,
    forceAll: process.env.SCRAPE_FORCE_ALL === "true",
    status: process.env.SCRAPE_STATUS || undefined,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const parsedLimit = parseInt(args[i + 1], 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        options.limit = parsedLimit;
      }
      i++;
    } else if (args[i] === "--force-all") {
      options.forceAll = true;
    } else if (args[i] === "--status" && args[i + 1]) {
      options.status = args[i + 1];
      i++;
    }
  }

  return options;
}

async function runProductScraperBatch() {
  const options = parseArgs();
  console.log("=================================================");
  console.log("   🛍️  Automated Product Pages Scraper Batch     ");
  console.log("=================================================");
  console.log(`Parameters: limit=${options.limit}, forceAll=${options.forceAll}, statusFilter=${options.status || "pending/failed"}\n`);

  // 1. Unlink & discover un-scraped product links from ads
  try {
    const unlinkedAds = await db
      .select({
        id: ads.id,
        linkUrl: ads.linkUrl,
        pageId: ads.pageId,
        caption: ads.caption,
      })
      .from(ads)
      .where(sql`${ads.linkUrl} IS NOT NULL AND ${ads.linkUrl} != '' AND ${ads.productId} IS NULL`)
      .limit(options.limit);

    if (unlinkedAds.length > 0) {
      console.log(`Found ${unlinkedAds.length} unlinked ads with product URLs. Ingesting into product queue...`);
      const { linkAndAutoScrapeProduct } = await import("../lib/product-ingest");
      for (const ad of unlinkedAds) {
        if (ad.linkUrl) {
          await linkAndAutoScrapeProduct({
            adId: ad.id,
            linkUrl: ad.linkUrl,
            pageId: ad.pageId || "",
            adCopy: ad.caption,
          }).catch(() => null);
        }
      }
    }
  } catch (e: any) {
    console.warn("Notice: ad discovery linking skipped:", e.message);
  }

  // 2. Query target products to scrape
  let query = db.select().from(scrapedProducts);

  let targetProducts;
  if (options.forceAll) {
    targetProducts = await query.orderBy(desc(scrapedProducts.createdAt)).limit(options.limit);
  } else if (options.status && options.status !== "all" && options.status !== "pending") {
    targetProducts = await query
      .where(eq(scrapedProducts.scrapeStatus, options.status))
      .orderBy(desc(scrapedProducts.createdAt))
      .limit(options.limit);
  } else {
    // Default or "pending": query any item that is pending, failed, or missing price
    targetProducts = await query
      .where(
        or(
          eq(scrapedProducts.scrapeStatus, "pending"),
          eq(scrapedProducts.scrapeStatus, "failed"),
          isNull(scrapedProducts.currentPrice)
        )
      )
      .orderBy(desc(scrapedProducts.createdAt))
      .limit(options.limit);
  }

  console.log(`Found ${targetProducts.length} product(s) to scrape.\n`);

  if (targetProducts.length === 0) {
    console.log("✅ All product pages are already up-to-date with scraped prices and images!");
    await client.end();
    process.exit(0);
  }

  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < targetProducts.length; i++) {
    const item = targetProducts[i];
    const targetUrl = item.url;

    if (!targetUrl || !targetUrl.startsWith("http")) {
      console.log(`[${i + 1}/${targetProducts.length}] ⚠️ Skipping invalid URL: ${targetUrl}`);
      continue;
    }

    const startTime = Date.now();
    try {
      console.log(`[${i + 1}/${targetProducts.length}] Scraping: ${targetUrl}`);
      const res = await extractProductFromUrl(targetUrl);
      const elapsed = Date.now() - startTime;

      if (res.success && res.data) {
        const rawHtml = res.raw?.html || "";
        const engine = res.raw?.engine || "direct_html";
        const platform = detectStorePlatform(rawHtml, targetUrl);
        const phones = extractTunisianPhoneNumbers(rawHtml);
        const wa = extractWhatsAppNumbers(rawHtml);
        const pixels = extractMetaPixelIds(rawHtml);
        const delivery = extractDeliveryInfo(rawHtml, res.data.delivery_cost);

        const formattedOffers = (res.data.all_offers || []).map((o) => ({
          tierName: o.tier_name,
          price: o.price,
          savings: o.savings,
        }));

        await db
          .update(scrapedProducts)
          .set({
            title: res.data.title || item.title,
            currentPrice: res.data.current_price || item.currentPrice,
            originalPrice: res.data.original_price || item.originalPrice,
            currency: res.data.currency || item.currency || "TND",
            discountOrOffer: res.data.discount_or_offer || item.discountOrOffer,
            mainImageUrl: res.data.main_image_url || item.mainImageUrl,
            galleryImages: res.data.gallery_images && res.data.gallery_images.length > 0 ? res.data.gallery_images : item.galleryImages,
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

        // Relink ads to this product
        await db
          .update(ads)
          .set({ productId: item.id })
          .where(sql`${ads.productId} IS NULL AND ${ads.linkUrl} LIKE ${`%${item.url}%`}`);

        successCount++;
        console.log(`  ✅ [${engine} in ${elapsed}ms] "${res.data.title}" ➔ ${res.data.current_price || "Price N/A"}`);
      } else {
        failedCount++;
        console.warn(`  ❌ [${elapsed}ms] Extraction failed: ${res.error || "Unknown"}`);
        await db
          .update(scrapedProducts)
          .set({
            scrapeStatus: "failed",
            failureReason: res.error || "Scrape returned empty product details",
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));
      }
    } catch (err: any) {
      failedCount++;
      console.error(`  ❌ Error processing ${item.id}:`, err.message);
    }
  }

  console.log("\n=================================================");
  console.log(`🎉 Batch Finished: ${successCount} succeeded, ${failedCount} failed (${targetProducts.length} total)`);
  console.log("=================================================");

  await client.end();
  process.exit(0);
}

runProductScraperBatch().catch(async (e) => {
  console.error("Fatal scraper error:", e);
  await client.end();
  process.exit(1);
});
