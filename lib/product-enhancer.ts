import { detectExtractionDoubt, resolvePriceDoubtWithJev } from "./doubt-detector";
import { classifyProductWithJev } from "./typesafe-jev";
import { classifyProductOffline } from "./product-classifier";
import { formatPrice } from "./format-price";

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
  currentPrice: string;
  originalPrice: string | null;
  category: string;
  subCategory: string;
  targetAudience: "unisex" | "men" | "women" | "kids";
  priceResolvedByJev: boolean;
  categoryResolvedByJev: boolean;
}

/**
 * Unified Jev Enhancement:
 * 1. Disambiguates and resolves real price using TypeSafe Jev when price has doubt (e.g. 0 DT).
 * 2. Classifies product into rich specific niches using TypeSafe Jev when uncategorized or General Merchandise.
 */
export async function enhanceProductWithJev(
  params: EnhanceProductInput
): Promise<EnhanceProductResult> {
  const sym = params.fallbackCurrencySymbol || "DT";
  let finalPrice = params.currentPrice ? formatPrice(params.currentPrice, sym) : "";
  let priceResolvedByJev = false;

  // 1. Resolve 0 DT or suspicious price anomalies via Jev Referee
  const doubt = detectExtractionDoubt({
    title: params.title,
    currentPrice: finalPrice,
    url: params.url,
  });

  if (doubt.hasDoubt && doubt.needsPriceReferee && (params.html || params.markdown)) {
    try {
      const resolved = await resolvePriceDoubtWithJev({
        productTitle: params.title || "Product",
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
      console.warn(`[Jev Price Resolution] Error for "${params.title}":`, e?.message || e);
    }
  }

  if (!finalPrice || finalPrice.startsWith("0")) {
    finalPrice = `0 ${sym}`;
  }

  // 2. Classify niche and subcategory using TypeSafe Jev
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

  if (!hasSpecificCategory && params.title && params.title.trim().length >= 2) {
    try {
      const jevResult = await classifyProductWithJev(params.title, {
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
        const offline = classifyProductOffline(params.title);
        category = offline.category;
        subCategory = offline.subCategory;
        targetAudience = offline.targetAudience;
      }
    } catch (err: any) {
      console.warn(`[Decision Engine] Error classifying "${params.title}":`, err?.message || err);
      const offline = classifyProductOffline(params.title);
      category = offline.category;
      subCategory = offline.subCategory;
      targetAudience = offline.targetAudience;
    }
  }

  const finalOrigPrice = params.originalPrice ? formatPrice(params.originalPrice, sym) : null;

  return {
    currentPrice: finalPrice,
    originalPrice: finalOrigPrice,
    category,
    subCategory,
    targetAudience,
    priceResolvedByJev,
    categoryResolvedByJev,
  };
}
