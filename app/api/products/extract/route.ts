import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, scrapedProducts } from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { normalizeProductUrl, extractProductFromUrl } from "@/lib/firecrawl";
import { isPriceString } from "@/lib/html-scraper";
import { getCleanDomain } from "@/lib/utils";
import {
  extractTunisianPhoneNumbers,
  extractWhatsAppNumbers,
  extractMetaPixelIds,
  detectStorePlatform,
  extractDeliveryInfo,
} from "@/lib/network-extractor";
import { createNotification } from "@/lib/notifications";
import { buildProductExtractionNotification } from "@/lib/product-extraction";
import { PRODUCT_EXTRACTION_LOOKUP_PROJECTION } from "@/lib/product-projections";

export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  let notificationContext: {
    url: string;
    domain?: string | null;
    productId?: string | null;
  } | null = null;

  try {
    const body = await req.json();
    const { productId, url, adId, pageId, forceRefresh } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "A valid landing page URL is required." },
        { status: 400 }
      );
    }

    const normalizedUrl = normalizeProductUrl(url);
    if (!normalizedUrl) {
      return NextResponse.json(
        { success: false, error: "The provided URL is not a valid website destination." },
        { status: 400 }
      );
    }

    notificationContext = {
      url: normalizedUrl,
      domain: getCleanDomain(normalizedUrl),
      productId: typeof productId === "string" ? productId : null,
    };

    // 1. Check for existing product in DB (Deduplication)
    // Priority: 1) explicit productId if provided by product card / row, 2) normalized URL, 3) raw trimmed URL
    let existingProduct = null;
    if (productId && typeof productId === "string") {
      const existingById = await db
        .select(PRODUCT_EXTRACTION_LOOKUP_PROJECTION)
        .from(scrapedProducts)
        .where(eq(scrapedProducts.id, productId))
        .limit(1);
      existingProduct = existingById[0] || null;
    }

    if (!existingProduct) {
      const trimmedUrl = url.trim();
      const existing = await db
        .select(PRODUCT_EXTRACTION_LOOKUP_PROJECTION)
        .from(scrapedProducts)
        .where(
          or(
            eq(scrapedProducts.url, normalizedUrl),
            eq(scrapedProducts.url, trimmedUrl)
          )
        )
        .limit(1);
      existingProduct = existing[0] || null;
    }

    const wasExistingProduct = Boolean(existingProduct);
    if (existingProduct?.id) {
      notificationContext.productId = existingProduct.id;
    }

    // If already extracted successfully, valid, and not forcing a refresh, return cached data immediately (0 credits used)
    const isCorruptedCachedProduct =
      !existingProduct?.currentPrice ||
      /^0(\.0+)?\s*(dt|tnd|usd|eur|dinar)?$/i.test(existingProduct.currentPrice.trim()) ||
      existingProduct.currentPrice === "0" ||
      (existingProduct.title ? isPriceString(existingProduct.title) : false);

    if (existingProduct && existingProduct.scrapeStatus === "success" && !forceRefresh && !isCorruptedCachedProduct) {
      // Link the ad to this product if adId provided and not linked yet
      if (adId) {
        await db
          .update(ads)
          .set({ productId: existingProduct.id, updatedAt: new Date() })
          .where(eq(ads.id, adId));
      }

      // Also link any other ads with similar linkUrl in background
      linkMatchingAds(existingProduct.id, normalizedUrl).catch(console.error);

      const { rawExtract: _raw, ...cleanExisting } = existingProduct as any;
      return NextResponse.json({
        success: true,
        cached: true,
        product: cleanExisting,
      });
    }

    // 2. Perform live extraction with Firecrawl
    const domain = getCleanDomain(normalizedUrl);
    const extractionResult = await extractProductFromUrl(normalizedUrl);

    if (!extractionResult.success || !extractionResult.data) {
      // Record failure if product record exists or create failed record
      if (existingProduct) {
        await db
          .update(scrapedProducts)
          .set({
            scrapeStatus: "failed",
            failureReason: extractionResult.error || "Extraction failed",
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, existingProduct.id));
      }

      await createNotification(buildProductExtractionNotification({
        success: false,
        productId: existingProduct?.id,
        url: normalizedUrl,
        domain,
        error: extractionResult.error,
      }));

      return NextResponse.json(
        {
          success: false,
          error: extractionResult.error || "Failed to extract product details from landing page.",
        },
        { status: 422 }
      );
    }

    const extracted = extractionResult.data;

    // 2b. Extract Tunisian Network Fingerprints (Phone, WhatsApp, Pixel IDs, Platform, Delivery)
    const rawHtml =
      extractionResult.raw?.html ||
      extractionResult.raw?.data?.html ||
      extractionResult.raw?.rawHtml ||
      "";

    let adCaptionText = "";
    if (adId) {
      const [adRecord] = await db
        .select({ caption: ads.caption, title: ads.title })
        .from(ads)
        .where(eq(ads.id, adId));
      if (adRecord) {
        adCaptionText = `${adRecord.title || ""} ${adRecord.caption || ""}`;
      }
    }

    const combinedText = `${rawHtml} ${adCaptionText} ${JSON.stringify(extractionResult.raw || {})}`;

    const finalEffectiveUrl = extracted.resolved_url || normalizedUrl;
    const resolvedDomain = getCleanDomain(finalEffectiveUrl) || domain;

    const phoneNumbers = extractTunisianPhoneNumbers(combinedText);
    const whatsappNumbers = extractWhatsAppNumbers(combinedText);
    const metaPixelIds = extractMetaPixelIds(rawHtml);
    const storePlatform = detectStorePlatform(rawHtml, finalEffectiveUrl);
    const deliveryInfo = extractDeliveryInfo(
      combinedText,
      extracted.delivery_cost,
      extracted.all_offers
    );

    // 3. Save or update product in DB
    let savedProduct;
    if (existingProduct) {
      const [updated] = await db
        .update(scrapedProducts)
        .set({
          url: normalizedUrl,
          domain: resolvedDomain || existingProduct.domain,
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

    // 4. Link ad to this product
    if (adId && savedProduct) {
      await db
        .update(ads)
        .set({ productId: savedProduct.id, updatedAt: new Date() })
        .where(eq(ads.id, adId));
    }

    if (!savedProduct) {
      throw new Error("Product save returned no row.");
    }

    // Link any other ads that share this destination URL
    if (savedProduct) {
      linkMatchingAds(savedProduct.id, normalizedUrl).catch(console.error);

      await createNotification(buildProductExtractionNotification({
        success: true,
        wasExistingProduct,
        productId: savedProduct.id,
        title: savedProduct.title,
        url: normalizedUrl,
        domain: resolvedDomain,
      }));
    }

    const { rawExtract: _raw, ...cleanProduct } = savedProduct as any;
    return NextResponse.json({
      success: true,
      cached: false,
      product: cleanProduct,
    });
  } catch (err: unknown) {
    console.error("[Product Extract API] Error:", err);

    const errorMessage = err instanceof Error ? err.message : "Internal server error";

    if (notificationContext) {
      await createNotification(buildProductExtractionNotification({
        success: false,
        productId: notificationContext.productId,
        url: notificationContext.url,
        domain: notificationContext.domain,
        error: errorMessage,
      }));
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * Background helper to link all ads that share the same clean landing page URL to the product
 */
async function linkMatchingAds(productId: string, cleanUrl: string) {
  try {
    const urlPattern = `%${cleanUrl.replace(/^https?:\/\//, "")}%`;
    await db
      .update(ads)
      .set({ productId: productId })
      .where(
        sql`(${ads.productId} IS NULL OR ${ads.productId} != ${productId}) AND ${ads.linkUrl} ILIKE ${urlPattern}`
      );
  } catch (err) {
    console.error("[linkMatchingAds] Background error:", err);
  }
}
