import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { scrapeProductDirectHtml } from "../lib/html-scraper";
import { client, db } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { sql, isNotNull } from "drizzle-orm";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
} from "../lib/network-extractor";

async function testLocalScraper() {
  const customUrl = process.argv[2];

  console.log("=================================================");
  console.log("   🧪 Local Direct HTML Product Scraper Test    ");
  console.log("=================================================\n");

  let urlsToTest: string[] = [];

  if (customUrl) {
    urlsToTest = [customUrl.trim()];
    console.log(`Testing specified URL: ${customUrl}\n`);
  } else {
    console.log("Fetching 5 sample URLs from database...\n");
    try {
      const dbProducts = await db
        .select({ url: scrapedProducts.url })
        .from(scrapedProducts)
        .where(isNotNull(scrapedProducts.url))
        .limit(5);

      urlsToTest = dbProducts.map((p) => p.url).filter(Boolean) as string[];

      if (urlsToTest.length === 0) {
        const dbAds = await db
          .select({ url: ads.linkUrl })
          .from(ads)
          .where(isNotNull(ads.linkUrl))
          .limit(5);
        urlsToTest = dbAds.map((a) => a.url).filter(Boolean) as string[];
      }
    } catch (err: any) {
      console.warn("Could not fetch URLs from DB, testing with default fallback URL:", err.message);
      urlsToTest = ["https://tunideal.com"];
    }
  }

  if (urlsToTest.length === 0) {
    console.log("No URLs found to test. Provide a URL: npx tsx scripts/test-local-scraper.ts <url>");
    process.exit(0);
  }

  for (let i = 0; i < urlsToTest.length; i++) {
    const targetUrl = urlsToTest[i];
    console.log(`-------------------------------------------------`);
    console.log(`[Test ${i + 1}/${urlsToTest.length}] URL: ${targetUrl}`);
    console.log(`-------------------------------------------------`);

    const startTime = Date.now();
    try {
      const result = await scrapeProductDirectHtml(targetUrl);
      const elapsedMs = Date.now() - startTime;

      if (!result.success || !result.data) {
        console.log(`❌ Extraction Failed in ${elapsedMs}ms`);
        console.log(`   Error: ${result.error || "Unknown error"}\n`);
        continue;
      }

      const p = result.data;
      const rawHtml = result.rawHtml || "";

      // Additional network/meta extraction
      const phoneNumbers = extractTunisianPhoneNumbers(rawHtml);
      const whatsappNumbers = extractWhatsAppNumbers(rawHtml);
      const metaPixelIds = extractMetaPixelIds(rawHtml);
      const platform = p.store_platform || detectStorePlatform(rawHtml);

      console.log(`✅ Success in ${elapsedMs}ms!\n`);
      console.log(`📦 Product Title : ${p.title || "(None)"}`);
      console.log(`💰 Current Price : ${p.current_price || "(None)"}`);
      console.log(`🏷️  Original Price: ${p.original_price || "(None)"}`);
      console.log(`💵 Currency       : ${p.currency || "TND"}`);
      console.log(`🏪 Store Platform : ${platform || "Unknown / Custom"}`);
      console.log(`🖼️  Primary Image  : ${p.main_image_url || "(None)"}`);
      console.log(`📸 Gallery Images : ${p.gallery_images?.length || 0} image(s)`);
      if (p.discount_or_offer) {
        console.log(`🎁 Discount/Offer : ${p.discount_or_offer}`);
      }
      if (p.all_offers && p.all_offers.length > 0) {
        console.log(`📦 Bundle Offers  : ${JSON.stringify(p.all_offers)}`);
      }
      if (phoneNumbers.length > 0) {
        console.log(`📞 Phone Numbers  : ${phoneNumbers.join(", ")}`);
      }
      if (whatsappNumbers.length > 0) {
        console.log(`💬 WhatsApp       : ${whatsappNumbers.join(", ")}`);
      }
      if (metaPixelIds.length > 0) {
        console.log(`🎯 Meta Pixel IDs : ${metaPixelIds.join(", ")}`);
      }
      console.log("\n");
    } catch (err: any) {
      console.error(`❌ Unexpected Exception:`, err.message, "\n");
    }
  }

  console.log("=================================================");
  console.log("✨ Test Complete!");
  console.log("=================================================");
  process.exit(0);
}

testLocalScraper();
