import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages, scrapedProducts } from "@/db/schema";
import { eq, or, inArray, sql, and } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { normalizeProductUrl, extractProductFromUrl } from "@/lib/firecrawl";
import { getCleanDomain } from "@/lib/utils";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
  extractDeliveryInfo,
} from "@/lib/network-extractor";

export const maxDuration = 60; // Allow sufficient time for batch scraping if needed
export const dynamic = "force-dynamic";

const isUuid = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const SOCIAL_DOMAINS = new Set([
  "facebook.com",
  "fb.me",
  "m.facebook.com",
  "instagram.com",
  "wa.me",
  "api.whatsapp.com",
  "chat.whatsapp.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "pinterest.com",
  "t.me",
  "telegram.me",
]);

function isSocialOrInvalidUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (SOCIAL_DOMAINS.has(hostname)) return true;
    return false;
  } catch {
    return true;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Brand ID or Page ID is required" },
        { status: 400 }
      );
    }

    const decodedId = decodeURIComponent(id).trim();
    const body = await req.json().catch(() => ({}));
    const forceRefresh = Boolean(body.forceRefresh);

    // 1. Identify Brand & Page ID
    let trackedPage: any = null;
    let pageId: string | null = null;

    if (isUuid(decodedId)) {
      trackedPage = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.id, decodedId),
      });
      if (trackedPage) pageId = trackedPage.pageId;
    }

    if (!trackedPage) {
      trackedPage = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.pageId, decodedId),
      });
      if (trackedPage) pageId = trackedPage.pageId;
    }

    if (!pageId) {
      const sampleAd = await db.query.ads.findFirst({
        where: or(eq(ads.pageId, decodedId), eq(ads.pageName, decodedId)),
      });
      if (sampleAd) pageId = sampleAd.pageId;
      else pageId = decodedId;
    }

    // 2. Fetch all ads for this brand
    const adConditions = [];
    if (trackedPage) {
      adConditions.push(
        or(
          eq(ads.pageId, pageId!),
          eq(adObservations.trackedPageId, trackedPage.id)
        )
      );
    } else {
      adConditions.push(eq(ads.pageId, pageId!));
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

    if (brandAds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No ads found for this brand yet.",
        totalAdsScanned: 0,
        uniqueProductUrlsCount: 0,
        alreadyScrapedCount: 0,
        newlyScrapedCount: 0,
        failedCount: 0,
        products: [],
      });
    }

    // 3. Extract, unwrap and normalize all unique destination URLs
    const urlToAdIds = new Map<string, string[]>();
    const urlToAdCopy = new Map<string, string>();

    for (const ad of brandAds) {
      if (!ad.linkUrl || typeof ad.linkUrl !== "string") continue;
      const normalized = normalizeProductUrl(ad.linkUrl);
      if (!normalized) continue;

      // Filter out pure social media profile links
      if (isSocialOrInvalidUrl(normalized)) continue;

      const existingAds = urlToAdIds.get(normalized) || [];
      existingAds.push(ad.id);
      urlToAdIds.set(normalized, existingAds);

      if (!urlToAdCopy.has(normalized)) {
        urlToAdCopy.set(normalized, `${ad.title || ""} ${ad.caption || ""}`.trim());
      }
    }

    const uniqueNormalizedUrls = Array.from(urlToAdIds.keys());

    if (uniqueNormalizedUrls.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No external product landing page URLs detected in brand ads (e.g. direct social/messenger ads).",
        totalAdsScanned: brandAds.length,
        uniqueProductUrlsCount: 0,
        alreadyScrapedCount: 0,
        newlyScrapedCount: 0,
        failedCount: 0,
        products: [],
      });
    }

    // 4. Check existing products in DB
    const existingProducts = await db
      .select()
      .from(scrapedProducts)
      .where(inArray(scrapedProducts.url, uniqueNormalizedUrls));

    const existingUrlMap = new Map<string, typeof scrapedProducts.$inferSelect>();
    existingProducts.forEach((p) => existingUrlMap.set(p.url, p));

    let alreadyScrapedCount = 0;
    let newlyScrapedCount = 0;
    let failedCount = 0;

    const urlsToScrape: string[] = [];

    // 5. Handle already-scraped vs URLs requiring scraping
    for (const url of uniqueNormalizedUrls) {
      const existing = existingUrlMap.get(url);
      const matchingAdIds = urlToAdIds.get(url) || [];

      if (existing && existing.scrapeStatus === "success" && !forceRefresh) {
        alreadyScrapedCount++;

        // Ensure all matching ads are linked to this product
        if (matchingAdIds.length > 0) {
          await db
            .update(ads)
            .set({ productId: existing.id, updatedAt: new Date() })
            .where(
              and(
                inArray(ads.id, matchingAdIds),
                sql`(${ads.productId} IS NULL OR ${ads.productId} != ${existing.id})`
              )
            );
        }

        // Associate brand pageId if missing
        if (!existing.pageId && pageId) {
          await db
            .update(scrapedProducts)
            .set({ pageId: pageId, updatedAt: new Date() })
            .where(eq(scrapedProducts.id, existing.id));
        }
      } else {
        urlsToScrape.push(url);
      }
    }

    // 6. Batch scrape un-scraped / refresh-requested URLs with controlled concurrency
    const CONCURRENCY_LIMIT = 3;
    const scrapeQueue = [...urlsToScrape];

    async function processScrapeUrl(normalizedUrl: string) {
      const domain = getCleanDomain(normalizedUrl);
      const existingProduct = existingUrlMap.get(normalizedUrl);
      const matchingAdIds = urlToAdIds.get(normalizedUrl) || [];
      const adCopyText = urlToAdCopy.get(normalizedUrl) || "";

      try {
        const extractionResult = await extractProductFromUrl(normalizedUrl);

        if (!extractionResult.success || !extractionResult.data) {
          failedCount++;
          if (existingProduct) {
            await db
              .update(scrapedProducts)
              .set({
                scrapeStatus: "failed",
                failureReason: extractionResult.error || "Extraction failed",
                updatedAt: new Date(),
              })
              .where(eq(scrapedProducts.id, existingProduct.id));
          } else {
            const [failedRecord] = await db
              .insert(scrapedProducts)
              .values({
                url: normalizedUrl,
                domain: domain || null,
                pageId: pageId || null,
                scrapeStatus: "failed",
                failureReason: extractionResult.error || "Extraction failed",
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .returning();

            if (failedRecord && matchingAdIds.length > 0) {
              await db
                .update(ads)
                .set({ productId: failedRecord.id, updatedAt: new Date() })
                .where(inArray(ads.id, matchingAdIds));
            }
          }
          return;
        }

        const extracted = extractionResult.data;
        const rawHtml =
          extractionResult.raw?.html ||
          extractionResult.raw?.data?.html ||
          extractionResult.raw?.rawHtml ||
          "";

        const combinedText = `${rawHtml} ${adCopyText} ${JSON.stringify(extractionResult.raw || {})}`;

        const phoneNumbers = extractTunisianPhoneNumbers(combinedText);
        const whatsappNumbers = extractWhatsAppNumbers(combinedText);
        const metaPixelIds = extractMetaPixelIds(rawHtml);
        const storePlatform = detectStorePlatform(rawHtml, normalizedUrl);
        const deliveryInfo = extractDeliveryInfo(
          combinedText,
          extracted.delivery_cost,
          extracted.all_offers
        );

        let savedProduct;
        if (existingProduct) {
          const [updated] = await db
            .update(scrapedProducts)
            .set({
              domain: domain || existingProduct.domain,
              pageId: pageId || existingProduct.pageId,
              title: extracted.title || existingProduct.title,
              currentPrice: extracted.current_price || existingProduct.currentPrice,
              originalPrice: extracted.original_price || existingProduct.originalPrice,
              currency: extracted.currency || existingProduct.currency,
              discountOrOffer: extracted.discount_or_offer || existingProduct.discountOrOffer,
              mainImageUrl: extracted.main_image_url || existingProduct.mainImageUrl,
              galleryImages: extracted.gallery_images || existingProduct.galleryImages,
              allOffers: extracted.all_offers || existingProduct.allOffers,
              rawExtract: extractionResult.raw || existingProduct.rawExtract,
              phoneNumbers: phoneNumbers.length > 0 ? phoneNumbers : existingProduct.phoneNumbers,
              whatsappNumbers: whatsappNumbers.length > 0 ? whatsappNumbers : existingProduct.whatsappNumbers,
              metaPixelIds: metaPixelIds.length > 0 ? metaPixelIds : existingProduct.metaPixelIds,
              storePlatform: storePlatform !== "other" ? storePlatform : existingProduct.storePlatform,
              deliveryCost: deliveryInfo.label || existingProduct.deliveryCost,
              scrapeStatus: "success",
              failureReason: null,
              lastScrapedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(scrapedProducts.id, existingProduct.id))
            .returning();
          savedProduct = updated;
        } else {
          const [created] = await db
            .insert(scrapedProducts)
            .values({
              url: normalizedUrl,
              domain: domain || null,
              pageId: pageId || null,
              title: extracted.title || null,
              currentPrice: extracted.current_price || null,
              originalPrice: extracted.original_price || null,
              currency: extracted.currency || null,
              discountOrOffer: extracted.discount_or_offer || null,
              mainImageUrl: extracted.main_image_url || null,
              galleryImages: extracted.gallery_images || [],
              allOffers: extracted.all_offers || null,
              rawExtract: extractionResult.raw || null,
              phoneNumbers: phoneNumbers.length > 0 ? phoneNumbers : [],
              whatsappNumbers: whatsappNumbers.length > 0 ? whatsappNumbers : [],
              metaPixelIds: metaPixelIds.length > 0 ? metaPixelIds : [],
              storePlatform: storePlatform || "other",
              deliveryCost: deliveryInfo.label || null,
              scrapeStatus: "success",
              lastScrapedAt: new Date(),
            })
            .returning();
          savedProduct = created;
        }

        newlyScrapedCount++;

        // Link all matching ads
        if (savedProduct && matchingAdIds.length > 0) {
          await db
            .update(ads)
            .set({ productId: savedProduct.id, updatedAt: new Date() })
            .where(inArray(ads.id, matchingAdIds));
        }
      } catch (err: any) {
        console.error(`[processScrapeUrl] Error scraping ${normalizedUrl}:`, err);
        failedCount++;
      }
    }

    // Process in batches
    for (let i = 0; i < scrapeQueue.length; i += CONCURRENCY_LIMIT) {
      const chunk = scrapeQueue.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(chunk.map((url) => processScrapeUrl(url)));
    }

    // 7. Fetch final updated product list for this brand
    const finalProducts = await db
      .select()
      .from(scrapedProducts)
      .where(inArray(scrapedProducts.url, uniqueNormalizedUrls));

    return NextResponse.json({
      success: true,
      brandId: decodedId,
      pageId: pageId,
      totalAdsScanned: brandAds.length,
      uniqueProductUrlsCount: uniqueNormalizedUrls.length,
      alreadyScrapedCount,
      newlyScrapedCount,
      failedCount,
      products: finalProducts,
    });
  } catch (err: any) {
    console.error("[Brand Product Sync API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
