import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { chromium } from "playwright";
import { db, client } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { parseProductHtmlContent } from "../lib/html-scraper";
import { normalizeProductUrl } from "../lib/firecrawl";
import { getCleanDomain } from "../lib/utils";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
  extractDeliveryInfo,
} from "../lib/network-extractor";

interface LocalBrowserOptions {
  url?: string;
  page?: string;
  status?: string;
  headless: boolean;
  limit: number;
}

function parseArgs(): LocalBrowserOptions {
  const args = process.argv.slice(2);
  const options: LocalBrowserOptions = {
    headless: !args.includes("--head") && !args.includes("--show"),
    limit: 50,
  };

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--url" || args[i] === "-u") && args[i + 1]) {
      options.url = args[i + 1];
      i++;
    } else if ((args[i] === "--page" || args[i] === "-p") && args[i + 1]) {
      options.page = args[i + 1];
      i++;
    } else if ((args[i] === "--status" || args[i] === "-s") && args[i + 1]) {
      options.status = args[i + 1];
      i++;
    } else if ((args[i] === "--limit" || args[i] === "-l") && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10) || 50;
      i++;
    }
  }

  return options;
}

async function scrapeSingleUrlWithBrowser(browser: any, url: string, existingRecord?: any) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "fr-FR",
  });

  const page = await context.newPage();

  try {
    console.log(`\n🌐 [Local Browser] Navigating to: ${url}`);
    
    // Navigate and wait for network or DOM
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).catch((e: any) => {
      console.warn(`  Notice: Initial navigation warning: ${e.message}`);
    });

    // Handle Cloudflare Waiting Room / Challenge (wait up to 5s if challenge detected)
    const initialContent = await page.content();
    if (
      initialContent.includes("cf-challenge") ||
      initialContent.includes("Checking your browser") ||
      initialContent.includes("Attention Required! | Cloudflare") ||
      initialContent.includes("Just a moment...")
    ) {
      console.log("  🛡️ Cloudflare challenge detected! Waiting 6s for challenge to resolve with local residential IP...");
      await page.waitForTimeout(6000);
    } else {
      // Allow dynamic price / SPA hydrate
      await page.waitForTimeout(1500);
    }

    const html = await page.content();
    const finalUrl = page.url();
    await context.close();

    const parsed = parseProductHtmlContent(html, finalUrl);
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.error || "Unable to parse product details from page DOM.");
    }

    const resolvedDomain = getCleanDomain(finalUrl);
    const platform = detectStorePlatform(html, finalUrl);
    const phones = extractTunisianPhoneNumbers(html);
    const wa = extractWhatsAppNumbers(html);
    const pixels = extractMetaPixelIds(html);
    const delivery = extractDeliveryInfo(html, parsed.data.delivery_cost);

    const formattedOffers = (parsed.data.all_offers || []).map((o) => ({
      tierName: o.tier_name,
      price: o.price,
      savings: o.savings,
    }));

    const [saved] = await db
      .insert(scrapedProducts)
      .values({
        url,
        domain: resolvedDomain || existingRecord?.domain,
        pageId: existingRecord?.pageId || null,
        title: parsed.data.title || existingRecord?.title,
        currentPrice: parsed.data.current_price || existingRecord?.currentPrice,
        originalPrice: parsed.data.original_price || existingRecord?.originalPrice,
        currency: parsed.data.currency || existingRecord?.currency || "TND",
        discountOrOffer: parsed.data.discount_or_offer || existingRecord?.discountOrOffer,
        mainImageUrl: parsed.data.main_image_url || existingRecord?.mainImageUrl,
        galleryImages: parsed.data.gallery_images || existingRecord?.galleryImages || [],
        allOffers: formattedOffers.length > 0 ? formattedOffers : existingRecord?.allOffers,
        storePlatform: platform || existingRecord?.storePlatform,
        phoneNumbers: phones.length > 0 ? phones : existingRecord?.phoneNumbers,
        whatsappNumbers: wa.length > 0 ? wa : existingRecord?.whatsappNumbers,
        metaPixelIds: pixels.length > 0 ? pixels : existingRecord?.metaPixelIds,
        deliveryCost: delivery.label || existingRecord?.deliveryCost,
        scrapeStatus: "success",
        failureReason: null,
        lastScrapedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: scrapedProducts.url,
        set: {
          domain: resolvedDomain || existingRecord?.domain,
          title: parsed.data.title || existingRecord?.title,
          currentPrice: parsed.data.current_price || existingRecord?.currentPrice,
          originalPrice: parsed.data.original_price || existingRecord?.originalPrice,
          currency: parsed.data.currency || existingRecord?.currency || "TND",
          discountOrOffer: parsed.data.discount_or_offer || existingRecord?.discountOrOffer,
          mainImageUrl: parsed.data.main_image_url || existingRecord?.mainImageUrl,
          galleryImages: parsed.data.gallery_images || existingRecord?.galleryImages || [],
          allOffers: formattedOffers.length > 0 ? formattedOffers : existingRecord?.allOffers,
          storePlatform: platform || existingRecord?.storePlatform,
          phoneNumbers: phones.length > 0 ? phones : existingRecord?.phoneNumbers,
          whatsappNumbers: wa.length > 0 ? wa : existingRecord?.whatsappNumbers,
          metaPixelIds: pixels.length > 0 ? pixels : existingRecord?.metaPixelIds,
          deliveryCost: delivery.label || existingRecord?.deliveryCost,
          scrapeStatus: "success",
          failureReason: null,
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    // Relink ads
    if (saved) {
      await db
        .update(ads)
        .set({ productId: saved.id })
        .where(sql`${ads.productId} IS NULL AND ${ads.linkUrl} LIKE ${`%${url}%`}`);
    }

    console.log(`  ✅ Extracted successfully via Local Browser:`);
    console.log(`     Title: "${parsed.data.title}"`);
    console.log(`     Price: ${parsed.data.current_price || "N/A"}`);
    console.log(`     Image: ${parsed.data.main_image_url ? "Found" : "None"}`);
    return true;
  } catch (err: any) {
    await context.close().catch(() => null);
    console.error(`  ❌ Failed local browser scrape for ${url}:`, err.message);
    if (existingRecord?.id) {
      await db
        .update(scrapedProducts)
        .set({
          scrapeStatus: "failed",
          failureReason: `Local browser error: ${err.message}`,
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scrapedProducts.id, existingRecord.id));
    }
    return false;
  }
}

async function main() {
  const options = parseArgs();
  console.log("=================================================");
  console.log(" 🖥️  Local Residential Browser Product Scraper    ");
  console.log("=================================================");
  console.log(`Mode: headless=${options.headless}, limit=${options.limit}`);

  const browser = await chromium.launch({
    headless: options.headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    // Mode 1: Single URL
    if (options.url) {
      const normalized = normalizeProductUrl(options.url) || options.url;
      const [existing] = await db
        .select()
        .from(scrapedProducts)
        .where(eq(scrapedProducts.url, normalized))
        .limit(1);

      await scrapeSingleUrlWithBrowser(browser, normalized, existing);
    }
    // Mode 2: By Brand Page ID or Status
    else {
      let query = db.select().from(scrapedProducts);
      let conditions = [];

      if (options.page) {
        conditions.push(eq(scrapedProducts.pageId, options.page));
      }

      if (options.status) {
        conditions.push(eq(scrapedProducts.scrapeStatus, options.status));
      } else {
        // Default: failed or pending
        conditions.push(
          sql`${scrapedProducts.scrapeStatus} IN ('failed', 'pending') OR ${scrapedProducts.currentPrice} IS NULL OR ${scrapedProducts.currentPrice} = '0 DT'`
        );
      }

      const targets = await query
        .where(sql.join(conditions, sql` AND `))
        .limit(options.limit);

      console.log(`Found ${targets.length} target product(s) to extract locally.\n`);

      let ok = 0;
      let fail = 0;
      for (const t of targets) {
        const res = await scrapeSingleUrlWithBrowser(browser, t.url, t);
        if (res) ok++;
        else fail++;
      }

      console.log(`\nFinished: ${ok} succeeded, ${fail} failed.`);
    }
  } finally {
    await browser.close();
    await client.end();
  }
}

main().catch(async (e) => {
  console.error("Local scraper error:", e);
  await client.end();
  process.exit(1);
});
