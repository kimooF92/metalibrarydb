import { detectExtractionDoubt, resolvePriceDoubtWithJev, harvestPriceCandidates } from "./doubt-detector";
import { classifyProductWithJev } from "./typesafe-jev";
import { classifyProductOffline } from "./product-classifier";
import { formatPrice } from "./format-price";
import { isUrgencyOrPromoBanner } from "./html-scraper";

export interface EnhanceProductInput {
  title?: string | null;
  currentPrice?: string | null;
  originalPrice?: string | null;
  url?: string | null;
  domain?: string | null;
  adText?: string | null;
  html?: string | null;
  markdown?: string | null;
  existingCategory?: string | null;
  existingSubCategory?: string | null;
  existingTargetAudience?: string | null;
  fallbackCurrencySymbol?: string;
}

export interface EnhanceProductResult {
  title: string;
  currentPrice: string;
  originalPrice: string | null;
  category: string;
  subCategory: string;
  targetAudience: "unisex" | "men" | "women" | "kids";
  priceResolvedByJev: boolean;
  categoryResolvedByJev: boolean;
  scrapeStatus?: "success" | "needs_review" | "ignored";
  statusReason?: string;
}

/**
 * Unified Jev Enhancement:
 * 1. Disambiguates and resolves real price using TypeSafe Jev when price has doubt (e.g. 0 DT or foreign currency).
 * 2. Remediates generic navigation titles using URL slugs.
 * 3. Classifies product into rich specific niches using TypeSafe Jev when uncategorized or General Merchandise.
 * 4. Gated by content-hash / title stability to avoid gratuitous LLM calls ($0 token rule).
 */
export async function enhanceProductWithJev(
  params: EnhanceProductInput
): Promise<EnhanceProductResult> {
  const sym = params.fallbackCurrencySymbol || "DT";
  const rawPrice = params.currentPrice ? String(params.currentPrice).trim() : "";
  let finalTitle = (params.title || "").trim();
  let priceResolvedByJev = false;
  let scrapeStatus: "success" | "needs_review" | "ignored" = "success";
  let statusReason: string | undefined;

  // 1. Title Remediation (Phase 1.2: Activate needsTitleReferee)
  const initialDoubt = detectExtractionDoubt({
    title: finalTitle,
    currentPrice: rawPrice,
    url: params.url,
  });

  if (initialDoubt.needsTitleReferee && params.url) {
    const isGenericNav =
      /^(?:accueil|boutique|panier|store|bienvenue|home)\b/i.test(finalTitle) ||
      isUrgencyOrPromoBanner(finalTitle) ||
      finalTitle.length < 8;

    if (isGenericNav) {
      // Attempt recovery from product URL slug
      const slugMatch = params.url.match(/\/(?:products?|produits?|items?|item|p|dp)\/([^/?#]+)/i);
      if (slugMatch && slugMatch[1]) {
        const decodedSlug = decodeURIComponent(slugMatch[1])
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim();
        if (decodedSlug.length >= 4 && !/^\d+$/.test(decodedSlug)) {
          console.log(`[Title Remediation] Recovered title from slug: "${finalTitle}" -> "${decodedSlug}"`);
          finalTitle = decodedSlug;
        } else {
          scrapeStatus = "needs_review";
          statusReason = `Generic navigation title ("${finalTitle}") with non-descriptive slug ("${decodedSlug}")`;
        }
      } else {
        // Generic title without product slug cannot be confirmed
        scrapeStatus = "needs_review";
        statusReason = `Generic navigation title ("${finalTitle}") without product slug`;
      }
    }
  }

  // 2. Price Doubt & Foreign Currency Resolution (Phase 1.1)
  let finalPrice = "";
  const isForeign = initialDoubt.isForeignCurrency;

  if (isForeign) {
    // Check if any local currency candidates exist in HTML/markdown
    const localCandidates = harvestPriceCandidates(params.html, params.markdown, sym);
    const hasLocalCandidates = localCandidates.some((c) => c.num > 0 && !c.isDelivery);

    if (hasLocalCandidates && (params.html || params.markdown)) {
      try {
        const resolved = await resolvePriceDoubtWithJev({
          productTitle: finalTitle || "Product",
          extractedPrice: rawPrice,
          html: params.html,
          markdown: params.markdown,
          fallbackCurrencySymbol: sym,
        });

        if (resolved?.resolvedPrice) {
          finalPrice = formatPrice(resolved.resolvedPrice, sym);
          priceResolvedByJev = true;
        } else {
          finalPrice = rawPrice;
          scrapeStatus = "needs_review";
          statusReason = `Foreign currency (${rawPrice}) detected; referee could not disambiguate local price`;
        }
      } catch (e: any) {
        finalPrice = rawPrice;
        scrapeStatus = "needs_review";
        statusReason = `Foreign currency (${rawPrice}) detected; referee error`;
      }
    } else {
      // International store with only foreign currency ($ or €) -> Preserve raw currency, do NOT coerce to DT/DH
      finalPrice = rawPrice;
      scrapeStatus = "needs_review";
      statusReason = `Foreign currency detected (${rawPrice}) with no local currency candidates`;
    }
  } else {
    // Standard price: format with local currency symbol
    finalPrice = rawPrice ? formatPrice(rawPrice, sym) : "";

    // Check for standard anomalies (0 DT, micro-prices < 10, conversion artifacts)
    const doubt = detectExtractionDoubt({
      title: finalTitle,
      currentPrice: finalPrice,
      url: params.url,
    });

    if (doubt.hasDoubt && doubt.needsPriceReferee && (params.html || params.markdown)) {
      try {
        const resolved = await resolvePriceDoubtWithJev({
          productTitle: finalTitle || "Product",
          extractedPrice: finalPrice || `0 ${sym}`,
          html: params.html,
          markdown: params.markdown,
          fallbackCurrencySymbol: sym,
        });

        if (resolved?.resolvedPrice) {
          finalPrice = formatPrice(resolved.resolvedPrice, sym);
          priceResolvedByJev = true;
        }
      } catch (e: any) {
        console.warn(`[Jev Price Resolution] Error for "${finalTitle}":`, e?.message || e);
      }
    }

    if (!finalPrice || finalPrice.startsWith("0")) {
      finalPrice = `0 ${sym}`;
    }
  }

  // 3. Classify Niche and Subcategory using TypeSafe Jev (Phase 4.1: Content-Hash Gated)
  const hasSpecificCategory =
    params.existingCategory &&
    params.existingCategory.trim() !== "" &&
    params.existingCategory !== "General & Other" &&
    params.existingCategory.toLowerCase() !== "uncategorized" &&
    params.existingSubCategory !== "General Merchandise" &&
    Boolean(params.existingSubCategory);

  let category = params.existingCategory || "General & Other";
  let subCategory = params.existingSubCategory || "General Merchandise";
  let targetAudience: "unisex" | "men" | "women" | "kids" =
    (params.existingTargetAudience as any) || "unisex";
  let categoryResolvedByJev = false;

  // If already specifically categorized and title is present, skip Jev ($0 tokens)
  if (!hasSpecificCategory && finalTitle && finalTitle.trim().length >= 2) {
    try {
      const jevResult = await classifyProductWithJev(finalTitle, {
        domain: params.domain,
        url: params.url,
        adText: params.adText,
        allowGeneral: false, // Strictly force classification into proper niches
      });

      if (jevResult && jevResult.category && jevResult.category !== "General & Other") {
        category = jevResult.category;
        subCategory = jevResult.subCategory;
        targetAudience = jevResult.targetAudience;
        categoryResolvedByJev = true;
      } else {
        const offline = classifyProductOffline(finalTitle);
        category = offline.category;
        subCategory = offline.subCategory;
        targetAudience = offline.targetAudience;
      }
    } catch (err: any) {
      console.warn(`[Decision Engine] Error classifying "${finalTitle}":`, err?.message || err);
      const offline = classifyProductOffline(finalTitle);
      category = offline.category;
      subCategory = offline.subCategory;
      targetAudience = offline.targetAudience;
    }
  }

  const rawOrigPrice = params.originalPrice ? String(params.originalPrice).trim() : null;
  let finalOrigPrice: string | null = null;
  if (rawOrigPrice) {
    if (isForeign) {
      finalOrigPrice = rawOrigPrice;
    } else {
      finalOrigPrice = formatPrice(rawOrigPrice, sym);
    }
  }

  return {
    title: finalTitle,
    currentPrice: finalPrice,
    originalPrice: finalOrigPrice,
    category,
    subCategory,
    targetAudience,
    priceResolvedByJev,
    categoryResolvedByJev,
    scrapeStatus,
    statusReason,
  };
}
