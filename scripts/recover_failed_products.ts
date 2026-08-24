import { db, client } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { extractProductFromUrl } from "../lib/firecrawl";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
  extractDeliveryInfo,
} from "../lib/network-extractor";

async function main() {
  const failed = await db
    .select()
    .from(scrapedProducts)
    .where(eq(scrapedProducts.scrapeStatus, "failed"));

  console.log(`Found ${failed.length} products to recover & scrape with new Direct HTML engine...`);

  let recovered = 0;
  for (let i = 0; i < failed.length; i++) {
    const item = failed[i];
    try {
      console.log(`[Recovering ${i + 1}/${failed.length}] ${item.url}`);
      const res = await extractProductFromUrl(item.url);

      if (res.success && res.data) {
        const rawHtml = res.raw?.html || "";
        const platform = detectStorePlatform(rawHtml, item.url);
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
            title: res.data.title,
            currentPrice: res.data.current_price,
            originalPrice: res.data.original_price || null,
            currency: res.data.currency || "TND",
            discountOrOffer: res.data.discount_or_offer || null,
            mainImageUrl: res.data.main_image_url || null,
            galleryImages: res.data.gallery_images || [],
            allOffers: formattedOffers.length > 0 ? formattedOffers : null,
            storePlatform: platform,
            phoneNumbers: phones.length > 0 ? phones : null,
            whatsappNumbers: wa.length > 0 ? wa : null,
            metaPixelIds: pixels.length > 0 ? pixels : null,
            deliveryCost: delivery.label || null,
            scrapeStatus: "success",
            failureReason: null,
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));

        // Relink matching ads
        await db
          .update(ads)
          .set({ productId: item.id })
          .where(sql`${ads.productId} IS NULL AND ${ads.linkUrl} LIKE ${`%${item.url}%`}`);

        recovered++;
        console.log(`  ✓ Successfully scraped "${res.data.title}" (${res.data.current_price})`);
      } else {
        console.warn(`  ✗ Could not scrape: ${res.error}`);
      }
    } catch (e: any) {
      console.error(`  ✗ Error recovering ${item.id}:`, e.message);
    }
  }

  console.log(`\nRecovery finished: ${recovered}/${failed.length} products successfully scraped and restored!`);
  await client.end();
}

main().catch(console.error);
