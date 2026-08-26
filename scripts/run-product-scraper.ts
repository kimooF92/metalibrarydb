import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { eq, or, and, isNull, inArray, sql, desc } from "drizzle-orm";
import { extractProductFromUrl } from "../lib/firecrawl";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
  extractDeliveryInfo,
} from "../lib/network-extractor";
import { getCleanDomain } from "../lib/utils";
import { classifyProductWithAI } from "../lib/product-classifier";

import { normalizeProductUrl } from "../lib/firecrawl";
import { trackedPages, adObservations } from "../db/schema";

interface RunOptions {
  limit: number;
  forceAll: boolean;
  status?: string;
  page?: string;
  url?: string;
  targetProductsOverride?: any[];
  pageIdOverride?: string | null;
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const options: RunOptions = {
    limit: parseInt(process.env.SCRAPE_LIMIT || "100", 10) || 100,
    forceAll: process.env.SCRAPE_FORCE_ALL === "true",
    status: process.env.SCRAPE_STATUS || undefined,
  };

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--limit" || args[i] === "-l") && args[i + 1]) {
      const parsedLimit = parseInt(args[i + 1], 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        options.limit = parsedLimit;
      }
      i++;
    } else if (args[i] === "--force-all" || args[i] === "--force" || args[i] === "-f") {
      options.forceAll = true;
    } else if ((args[i] === "--status" || args[i] === "-s") && args[i + 1]) {
      options.status = args[i + 1];
      i++;
    } else if ((args[i] === "--page" || args[i] === "--brand" || args[i] === "-p") && args[i + 1]) {
      options.page = args[i + 1];
      i++;
    } else if ((args[i] === "--url" || args[i] === "-u") && args[i + 1]) {
      options.url = args[i + 1];
      i++;
    }
  }

  return options;
}

const isUuid = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

async function runProductScraperBatch() {
  const options = parseArgs();
  console.log("=================================================");
  console.log("   🛍️  Automated Product Pages Scraper Batch     ");
  console.log("=================================================");
  console.log(
    `Parameters: limit=${options.limit}, forceAll=${options.forceAll}, statusFilter=${
      options.status || "pending/failed"
    }${options.page ? `, pageFilter="${options.page}"` : ""}${
      options.url ? `, singleUrl="${options.url}"` : ""
    }\n`
  );

  // Mode A: Single URL Scrape
  if (options.url) {
    const targetUrl = normalizeProductUrl(options.url);
    if (!targetUrl) {
      console.error("❌ Invalid URL provided:", options.url);
      await client.end();
      process.exit(1);
    }

    console.log(`[Single URL Mode] Scraping product page: ${targetUrl}...`);
    const startTime = Date.now();
    const res = await extractProductFromUrl(targetUrl);
    const elapsed = Date.now() - startTime;

    if (res.success && res.data) {
      const rawHtml = res.raw?.html || "";
      const engine = res.raw?.engine || "direct_html";
      const finalEffectiveUrl = res.data.resolved_url || targetUrl;
      const resolvedDomain = getCleanDomain(finalEffectiveUrl);
      const platform = detectStorePlatform(rawHtml, finalEffectiveUrl);
      const phones = extractTunisianPhoneNumbers(rawHtml);
      const wa = extractWhatsAppNumbers(rawHtml);
      const pixels = extractMetaPixelIds(rawHtml);
      const delivery = extractDeliveryInfo(rawHtml, res.data.delivery_cost);

      const classification = await classifyProductWithAI(res.data.title || "", {
        domain: resolvedDomain,
      });

      const formattedOffers = (res.data.all_offers || []).map((o) => ({
        tierName: o.tier_name,
        price: o.price,
        savings: o.savings,
      }));

      const [saved] = await db
        .insert(scrapedProducts)
        .values({
          url: targetUrl,
          domain: resolvedDomain,
          title: res.data.title,
          currentPrice: res.data.current_price,
          originalPrice: res.data.original_price,
          currency: res.data.currency || "TND",
          discountOrOffer: res.data.discount_or_offer,
          mainImageUrl: res.data.main_image_url,
          galleryImages: res.data.gallery_images || [],
          allOffers: formattedOffers,
          storePlatform: platform,
          phoneNumbers: phones,
          whatsappNumbers: wa,
          metaPixelIds: pixels,
          deliveryCost: delivery.label,
          category: classification.category,
          subCategory: classification.subCategory,
          targetAudience: classification.targetAudience,
          scrapeStatus: "success",
          lastScrapedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: scrapedProducts.url,
          set: {
            title: res.data.title,
            currentPrice: res.data.current_price,
            originalPrice: res.data.original_price,
            currency: res.data.currency || "TND",
            discountOrOffer: res.data.discount_or_offer,
            mainImageUrl: res.data.main_image_url,
            galleryImages: res.data.gallery_images || [],
            allOffers: formattedOffers,
            storePlatform: platform,
            phoneNumbers: phones,
            whatsappNumbers: wa,
            metaPixelIds: pixels,
            deliveryCost: delivery.label,
            category: classification.category,
            subCategory: classification.subCategory,
            targetAudience: classification.targetAudience,
            scrapeStatus: "success",
            failureReason: null,
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();

      // Relink ads
      await db
        .update(ads)
        .set({ productId: saved.id })
        .where(sql`${ads.productId} IS NULL AND ${ads.linkUrl} LIKE ${`%${targetUrl}%`}`);

      console.log(`\n✅ [${engine} in ${elapsed}ms] Successfully Scraped & Saved!`);
      console.log(`Title:    "${res.data.title}"`);
      console.log(`Price:    ${res.data.current_price || "N/A"} (${res.data.currency || "TND"})`);
      console.log(`Offer:    ${res.data.discount_or_offer || "None"}`);
      console.log(`Platform: ${platform || "Unknown"}`);
      console.log(`Category: ${classification.category || "Unclassified"}`);
      console.log(`Image:    ${res.data.main_image_url || "No image"}`);
    } else {
      console.error(`\n❌ [${elapsed}ms] Extraction failed: ${res.error || "Unknown"}`);
    }

    await client.end();
    process.exit(0);
  }

  // Mode B: Target Specific Competitor Brand / Tracked Page
  if (options.page) {
    const pageArg = options.page.trim();
    let resolvedPageId: string | null = null;
    let trackedPage: any = null;

    if (isUuid(pageArg)) {
      trackedPage = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.id, pageArg),
      });
      if (trackedPage) resolvedPageId = trackedPage.pageId;
    }

    if (!trackedPage) {
      trackedPage = await db.query.trackedPages.findFirst({
        where: or(
          eq(trackedPages.pageId, pageArg),
          eq(trackedPages.displayName, pageArg)
        ),
      });
      if (trackedPage) resolvedPageId = trackedPage.pageId;
    }

    if (!resolvedPageId) {
      const sampleAd = await db.query.ads.findFirst({
        where: or(eq(ads.pageId, pageArg), eq(ads.pageName, pageArg)),
      });
      if (sampleAd) resolvedPageId = sampleAd.pageId;
      else resolvedPageId = pageArg;
    }

    console.log(`[Brand Scraper Mode] Targeting brand Page ID: ${resolvedPageId} (${trackedPage?.displayName || "Competitor"})...`);

    // Fetch all ads for this page
    const adConditions = [];
    if (trackedPage) {
      adConditions.push(
        or(
          eq(ads.pageId, resolvedPageId!),
          eq(adObservations.trackedPageId, trackedPage.id)
        )
      );
    } else {
      adConditions.push(eq(ads.pageId, resolvedPageId!));
    }

    const brandAds = await db
      .selectDistinctOn([ads.id], {
        id: ads.id,
        linkUrl: ads.linkUrl,
        productId: ads.productId,
        caption: ads.caption,
        title: ads.title,
      })
      .from(ads)
      .leftJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(or(...adConditions));

    console.log(`Found ${brandAds.length} captured ads for this brand.`);

    const uniqueProductUrls = new Set<string>();
    brandAds.forEach((a) => {
      if (a.linkUrl) {
        const norm = normalizeProductUrl(a.linkUrl);
        if (norm) uniqueProductUrls.add(norm);
      }
    });

    console.log(`Discovered ${uniqueProductUrls.size} unique product landing page URLs.`);

    if (uniqueProductUrls.size === 0) {
      console.log("⚠️ No external product landing URLs found in this brand's ads.");
      await client.end();
      process.exit(0);
    }

    const urlList = Array.from(uniqueProductUrls);
    let targetProducts = await db
      .select()
      .from(scrapedProducts)
      .where(inArray(scrapedProducts.url, urlList));

    const existingMap = new Map(targetProducts.map((p) => [p.url, p]));

    // Include URLs not yet inserted in scraped_products
    for (const url of urlList) {
      if (!existingMap.has(url)) {
        targetProducts.push({
          id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          url,
          domain: getCleanDomain(url),
          pageId: resolvedPageId,
          title: null,
          currentPrice: null,
          originalPrice: null,
          currency: null,
          discountOrOffer: null,
          mainImageUrl: null,
          galleryImages: [],
          allOffers: null,
          rawExtract: null,
          phoneNumbers: [],
          whatsappNumbers: [],
          metaPixelIds: [],
          storePlatform: "other",
          deliveryCost: null,
          category: null,
          subCategory: null,
          targetAudience: null,
          supplierUrls: [],
          isFavorite: false,
          scrapeStatus: "pending",
          failureReason: null,
          lastScrapedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    targetProducts = targetProducts.filter(
      (p) =>
        p.scrapeStatus !== "deleted" &&
        p.scrapeStatus !== "ignored" &&
        (options.forceAll ||
          p.scrapeStatus === "pending" ||
          p.scrapeStatus === "failed" ||
          !p.currentPrice ||
          p.currentPrice === "0 DT")
    );

    console.log(`Scraping ${targetProducts.length} product(s) for brand ${resolvedPageId}...\n`);
    // Proceeds to execution loop below
    options.targetProductsOverride = targetProducts;
    options.pageIdOverride = resolvedPageId;
  }

  // 1. Unlink & discover un-scraped product links from ads (for general batch mode)
  if (!options.page) {
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
  }

  // 2. Query target products to scrape
  let targetProducts: any[] = (options as any).targetProductsOverride;
  if (!targetProducts) {
    let query = db.select().from(scrapedProducts);

    if (options.forceAll) {
      targetProducts = await query
        .where(sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`)
        .orderBy(desc(scrapedProducts.createdAt))
        .limit(options.limit);
    } else if (options.status && options.status !== "all" && options.status !== "pending") {
      targetProducts = await query
        .where(eq(scrapedProducts.scrapeStatus, options.status))
        .orderBy(desc(scrapedProducts.createdAt))
        .limit(options.limit);
    } else {
      // Default or "pending": query any item that is pending, failed, or missing price
      targetProducts = await query
        .where(
          and(
            sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`,
            or(
              eq(scrapedProducts.scrapeStatus, "pending"),
              eq(scrapedProducts.scrapeStatus, "failed"),
              isNull(scrapedProducts.currentPrice)
            )
          )
        )
        .orderBy(desc(scrapedProducts.createdAt))
        .limit(options.limit);
    }
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
        const finalEffectiveUrl = res.data.resolved_url || targetUrl;
        const resolvedDomain = getCleanDomain(finalEffectiveUrl);
        const platform = detectStorePlatform(rawHtml, finalEffectiveUrl);
        const phones = extractTunisianPhoneNumbers(rawHtml);
        const wa = extractWhatsAppNumbers(rawHtml);
        const pixels = extractMetaPixelIds(rawHtml);
        const delivery = extractDeliveryInfo(rawHtml, res.data.delivery_cost);

        const classification = await classifyProductWithAI(res.data.title || item.title || "", {
          domain: resolvedDomain,
        });

        const formattedOffers = (res.data.all_offers || []).map((o) => ({
          tierName: o.tier_name,
          price: o.price,
          savings: o.savings,
        }));

        const [saved] = await db
          .insert(scrapedProducts)
          .values({
            url: targetUrl,
            domain: resolvedDomain || item.domain,
            pageId: (options as any).pageIdOverride || item.pageId,
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
            category: classification.category || item.category,
            subCategory: classification.subCategory || item.subCategory,
            targetAudience: classification.targetAudience || item.targetAudience,
            scrapeStatus: "success",
            lastScrapedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: scrapedProducts.url,
            set: {
              domain: resolvedDomain || item.domain,
              pageId: (options as any).pageIdOverride || item.pageId,
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
              category: classification.category || item.category,
              subCategory: classification.subCategory || item.subCategory,
              targetAudience: classification.targetAudience || item.targetAudience,
              scrapeStatus: "success",
              failureReason: null,
              lastScrapedAt: new Date(),
              updatedAt: new Date(),
            },
          })
          .returning();

        // Relink ads to this product
        if (saved) {
          await db
            .update(ads)
            .set({ productId: saved.id })
            .where(sql`${ads.productId} IS NULL AND ${ads.linkUrl} LIKE ${`%${item.url}%`}`);
        }

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
