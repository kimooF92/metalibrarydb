import { db } from "../db";
import { scrapedProducts, ads, queue } from "../db/schema";
import { eq, or, and, sql, desc, isNull, inArray } from "drizzle-orm";
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
import { formatPrice, formatDelivery } from "../lib/format-price";
import { enhanceProductWithJev } from "../lib/product-enhancer";
import { validateAndGatekeepProduct, resolveEffectiveScrapeStatus } from "../lib/product-validator";
import { isCategoryUrl } from "../lib/url-parser";

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
    // Find products that failed or are pending and lack a product image or have 0 DT.
    // Never recheck 404s, dead links, or impossible-to-scrape items.
    const failedItems = await db
      .select({
        id: scrapedProducts.id,
        url: scrapedProducts.url,
        failureReason: scrapedProducts.failureReason,
        lastScrapedAt: scrapedProducts.lastScrapedAt,
        workspaceId: scrapedProducts.workspaceId,
      })
      .from(scrapedProducts)
      .where(
        and(
          // 1. Only rescue pending or failed items (never touch 'success', 'deleted', or 'ignored')
          sql`${scrapedProducts.scrapeStatus} IN ('failed', 'pending')`,
          // 2. If product image already exists, it's NOT a fail! (user requirement)
          isNull(scrapedProducts.mainImageUrl),
          // 3. Differentiated rescue window:
          // - Brand new pending items: eligible immediately
          // - Transient failures (timeouts, 502, 503, 429 rate limit): retry after 1 hour
          // - Other non-permanent errors: retry after 12 hours
          sql`(
            ${scrapedProducts.lastScrapedAt} IS NULL
            OR (
              (
                COALESCE(${scrapedProducts.failureReason}, '') ILIKE '%timeout%'
                OR COALESCE(${scrapedProducts.failureReason}, '') ILIKE '%502%'
                OR COALESCE(${scrapedProducts.failureReason}, '') ILIKE '%503%'
                OR COALESCE(${scrapedProducts.failureReason}, '') ILIKE '%rate%limit%'
                OR COALESCE(${scrapedProducts.failureReason}, '') ILIKE '%429%'
              )
              AND ${scrapedProducts.lastScrapedAt} < NOW() - INTERVAL '1 hour'
            )
            OR ${scrapedProducts.lastScrapedAt} < NOW() - INTERVAL '12 hours'
          )`,
          // 4. Do NOT recheck 404s, dead links, or impossible items
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%[Dead link%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%[Impossible%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%404%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%Dead link%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%ERR_NAME_NOT_RESOLVED%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%ENOTFOUND%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%ECONNREFUSED%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%ERR_CONNECTION_REFUSED%'`,
          // 4b. Never rescue or scrape category URLs
          sql`LOWER(${scrapedProducts.url}) NOT LIKE '%/category%'`,
          sql`LOWER(${scrapedProducts.url}) NOT LIKE '%/categories%'`
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

      if (isCategoryUrl(targetUrl)) {
        console.warn(`[Local Rescue] 🛑 Skipping category URL: ${targetUrl}. Flagging as ignored.`);
        await db
          .update(scrapedProducts)
          .set({
            rawExtract: null,
            scrapeStatus: "ignored",
            failureReason: "Category URL ignored",
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));
        continue;
      }

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
            rawExtract: null,
            scrapeStatus: "ignored",
            failureReason: extractionResult?.error || "[Dead link] HTTP 404 Not Found",
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));
        continue;
      }

      const hasDirectImage = Boolean(extractionResult?.data?.main_image_url);
      const directPriceNum = parseFloat(extractionResult?.data?.current_price?.replace(/[^0-9.]/g, "") || "0");
      const hasDirectPrice = Boolean(
        extractionResult?.data?.current_price &&
        extractionResult.data.current_price !== "0 DT" &&
        extractionResult.data.current_price !== "0" &&
        directPriceNum >= 1
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
            rawExtract: null,
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
      const hasImage = Boolean(extracted?.main_image_url);
      const hasPrice = Boolean(
        extracted?.current_price &&
        extracted.current_price !== "0 DT" &&
        extracted.current_price !== "0"
      );
      const hasTitle = Boolean(extracted?.title);

      if (extractionResult?.success && extracted && hasTitle && (hasImage || hasPrice)) {
        const rawHtml = extractionResult.rawHtml || "";
        const finalUrl = targetUrl;
        const resolvedDomain = getCleanDomain(finalUrl);
        const platform = detectStorePlatform(rawHtml, finalUrl);
        const phones = extractTunisianPhoneNumbers(rawHtml);
        const wa = extractWhatsAppNumbers(rawHtml);
        const pixels = extractMetaPixelIds(rawHtml);
        const delivery = extractDeliveryInfo(rawHtml, extracted.delivery_cost);

        const isMorocco = item.workspaceId === "00000000-0000-0000-0000-000000000002" || /\.ma(\/|$)/i.test(targetUrl);
        const itemCurrency = isMorocco ? "MAD" : "TND";
        const itemSym = isMorocco ? "DH" : "DT";

        const formattedOffers = (extracted.all_offers || []).map((o: any) => ({
          tierName: o.tier_name,
          price: o.price ? formatPrice(o.price, itemSym) : o.price,
          savings: o.savings,
        }));

        // Use TypeSafe Jev Decision Engine to resolve price doubt (e.g. 0 DT) and classify niche
        const enhanced = await enhanceProductWithJev({
          title: extracted.title,
          currentPrice: extracted.current_price,
          originalPrice: extracted.original_price,
          url: targetUrl,
          domain: resolvedDomain,
          html: rawHtml,
          markdown: extractionResult.raw?.markdown,
          fallbackCurrencySymbol: itemSym,
        });

        const finalTitle = enhanced.title || extracted.title || null;
        const finalImage = extracted.main_image_url || null;
        const gateCheck = await validateAndGatekeepProduct({
          url: targetUrl,
          title: finalTitle,
          rawPrice: enhanced.currentPrice || extracted.current_price,
          mainImageUrl: finalImage,
          html: rawHtml,
        });

        const { status: effectiveStatus, reason: effectiveReason } = resolveEffectiveScrapeStatus(
          gateCheck,
          enhanced
        );

        const finalPrice = enhanced.currentPrice;
        const finalOrigPrice = enhanced.originalPrice;
        const finalDelivery = delivery.label ? formatDelivery(delivery.label, itemSym) : null;

        await db
          .update(scrapedProducts)
          .set({
            domain: resolvedDomain || null,
            title: finalTitle || null,
            currentPrice: finalPrice,
            originalPrice: finalOrigPrice,
            category: enhanced.category,
            subCategory: enhanced.subCategory,
            targetAudience: enhanced.targetAudience,
            currency: extracted.currency || itemCurrency,
            discountOrOffer: extracted.discount_or_offer || null,
            mainImageUrl: finalImage || null,
            galleryImages: extracted.gallery_images || [],
            allOffers: formattedOffers.length > 0 ? formattedOffers : null,
            storePlatform: platform || "other",
            phoneNumbers: phones.length > 0 ? phones : null,
            whatsappNumbers: wa.length > 0 ? wa : null,
            metaPixelIds: pixels.length > 0 ? pixels : null,
            deliveryCost: finalDelivery,
            scrapeStatus: effectiveStatus,
            failureReason: effectiveReason,
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));

        // Relink unlinked ads for this product using canonical URL equality (Task 3.1)
        await db
          .update(ads)
          .set({ productId: item.id })
          .where(
            and(
              isNull(ads.productId),
              or(
                eq(ads.linkUrl, targetUrl),
                sql`LOWER(TRIM(TRAILING '/' FROM ${ads.linkUrl})) = LOWER(TRIM(TRAILING '/' FROM ${targetUrl}))`
              )
            )
          );

        rescuedCount++;
        console.log(`[Local Rescue] ✅ Successfully rescued: "${extracted.title || "Product"}" ➔ ${extracted.current_price || "Image Extracted"}`);
      } else {
        // Both Cloud and Local failed to extract details / image -> flag as [Impossible to scrape] so it's never rechecked!
        console.warn(`[Local Rescue] ⚠️ Could not rescue ${targetUrl}: ${extractionResult?.error || "Unknown"}`);
        await db
          .update(scrapedProducts)
          .set({
            rawExtract: null,
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

let isForeignValidationRunning = false;
let lastForeignValidationTime = 0;

/**
 * Rescans and validates products whose prices were captured in foreign currency ($ or € or USD or EUR)
 * due to cloud proxies/Vercel IP geo-switches.
 * Executes locally via residential Tunisian/Moroccan IP to recover the canonical local price (DT / DH).
 */
export async function validateForeignCurrencyProductsBatch(limit = 5, force = false): Promise<number> {
  if (isForeignValidationRunning) return 0;

  const now = Date.now();
  if (!force && now - lastForeignValidationTime < 45000) return 0;
  lastForeignValidationTime = now;

  isForeignValidationRunning = true;

  try {
    const foreignItems = await db
      .select({
        id: scrapedProducts.id,
        url: scrapedProducts.url,
        title: scrapedProducts.title,
        currentPrice: scrapedProducts.currentPrice,
        originalPrice: scrapedProducts.originalPrice,
        currency: scrapedProducts.currency,
        domain: scrapedProducts.domain,
        workspaceId: scrapedProducts.workspaceId,
        failureReason: scrapedProducts.failureReason,
      })
      .from(scrapedProducts)
      .where(
        and(
          sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`,
          sql`LOWER(${scrapedProducts.url}) NOT LIKE '%/category%'`,
          sql`LOWER(${scrapedProducts.url}) NOT LIKE '%/categories%'`,
          or(
            // Foreign currency symbol in price ($ or € or £ or USD or EUR)
            sql`${scrapedProducts.currentPrice} ~* '(\\$|€|£|\\b(USD|EUR|GBP)\\b)'`,
            sql`COALESCE(${scrapedProducts.failureReason}, '') ILIKE '%foreign currency%'`,
            sql`COALESCE(${scrapedProducts.failureReason}, '') ILIKE '%local worker%'`,
            // Fractional prices on local domains caused by cloud geo-conversion (e.g. 16.72 DT, 14.91 DT on .tn domain)
            sql`(
              (${scrapedProducts.domain} LIKE '%.tn' OR ${scrapedProducts.url} LIKE '%.tn/%' OR ${scrapedProducts.workspaceId} = '00000000-0000-0000-0000-000000000001')
              AND ${scrapedProducts.currentPrice} ~* '^[0-9]+\\.[0-9]{2}\\s*(dt|tnd)$'
              AND ${scrapedProducts.currentPrice} NOT LIKE '%.50%'
              AND ${scrapedProducts.currentPrice} NOT LIKE '%.90%'
              AND ${scrapedProducts.currentPrice} NOT LIKE '%.00%'
              AND ${scrapedProducts.currentPrice} NOT LIKE '%.99%'
            )`
          )
        )
      )
      .orderBy(sql`${scrapedProducts.updatedAt} ASC NULLS FIRST`)
      .limit(limit);

    if (foreignItems.length === 0) return 0;

    console.log(`\n[Local Validator] 💱 Found ${foreignItems.length} product(s) with foreign currency / cloud geo-switch. Validating via local residential IP...`);
    let validatedCount = 0;

    for (const item of foreignItems) {
      const targetUrl = item.url;
      if (!targetUrl || !targetUrl.startsWith("http")) continue;

      console.log(`[Local Validator] 🔍 Rescanning: "${item.title || "Product"}" (current: ${item.currentPrice}) -> ${targetUrl}`);

      const isMorocco = item.workspaceId === "00000000-0000-0000-0000-000000000002" || /\.ma(\/|$)/i.test(targetUrl);
      const itemSym = isMorocco ? "DH" : "DT";
      const itemCurr = isMorocco ? "MAD" : "TND";

      // 1. Fast local residential direct HTML scrape
      let res: any = await scrapeProductDirectHtml(targetUrl, 12000, 2, {
        defaultCurrency: itemCurr,
        defaultCurrencySymbol: itemSym,
      }).catch(() => null);

      const directPrice = res?.data?.current_price;
      const isDirectPriceValid = Boolean(
        directPrice &&
        !directPrice.startsWith("0") &&
        !/(?:\$|€|£|\b(?:USD|EUR|GBP)\b)/i.test(directPrice)
      );

      // 2. If direct HTML didn't get a valid local price, launch local Playwright browser
      if (!res?.success || !res.data || !isDirectPriceValid) {
        console.log(`[Local Validator] Launching local Playwright browser to validate price for: ${targetUrl}...`);
        res = await scrapeUrlWithLocalPlaywright(targetUrl);
      }

      const extractedPrice = res?.data?.current_price;
      const isValidExtractedPrice = Boolean(
        extractedPrice &&
        !extractedPrice.startsWith("0") &&
        !/(?:\$|€|£|\b(?:USD|EUR|GBP)\b)/i.test(extractedPrice)
      );

      if (res?.success && isValidExtractedPrice) {
        const newPrice = formatPrice(extractedPrice, itemSym);
        const newOrigPrice = res.data.original_price ? formatPrice(res.data.original_price, itemSym) : item.originalPrice;

        await db
          .update(scrapedProducts)
          .set({
            currentPrice: newPrice,
            originalPrice: newOrigPrice,
            currency: itemCurr,
            scrapeStatus: "success",
            failureReason: null,
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, item.id));

        // Mark any pending queue jobs for this product as completed
        await db
          .update(queue)
          .set({ status: "completed", finishedAt: new Date() })
          .where(
            and(
              eq(queue.jobType, "product_scrape"),
              eq(queue.status, "pending"),
              eq(queue.failureReason, `product:${item.id}`)
            )
          );

        validatedCount++;
        console.log(`[Local Validator] ✅ Validated: "${item.title || "Product"}" ➔ ${item.currentPrice} was updated to ${newPrice} (${itemCurr})!`);
      } else {
        console.warn(`[Local Validator] ⚠️ Could not validate local price for ${targetUrl}: ${res?.error || "Price still unresolvable"}`);
      }
    }

    return validatedCount;
  } catch (err: any) {
    console.error("[Local Validator] Unexpected error during foreign validation loop:", err.message);
    return 0;
  } finally {
    isForeignValidationRunning = false;
  }
}

