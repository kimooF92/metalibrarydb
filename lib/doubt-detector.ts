/**
 * Extraction Doubt Detector & TypeSafe Jev Referee
 *
 * $0 Token Rule: Evaluates extracted product titles and prices with deterministic heuristics.
 * If data looks standard and clean (90%+ of products), JEV IS NEVER CALLED.
 * Jev is invoked ONLY when a concrete anomaly is detected (e.g. micro-prices <= 10,
 * weird decimal conversion artifacts like 13.32, or non-product titles).
 */

import { callJevDecisions, JevChoiceAnswer } from "./typesafe-jev";

export interface ExtractionDoubtResult {
  hasDoubt: boolean;
  reasons: string[];
  needsPriceReferee: boolean;
  needsTitleReferee: boolean;
}

/**
 * Deterministically checks for extraction anomalies with zero token cost ($0).
 */
export function detectExtractionDoubt(data: {
  title?: string | null;
  currentPrice?: string | null;
  originalPrice?: string | null;
  url?: string | null;
}): ExtractionDoubtResult {
  const reasons: string[] = [];
  let needsPriceReferee = false;
  let needsTitleReferee = false;

  const rawPriceStr = String(data.currentPrice || "").trim();
  const priceClean = rawPriceStr.replace(/[^0-9.]/g, "");
  const priceNum = parseFloat(priceClean);

  // 1. Price Anomaly Check
  if (!rawPriceStr || isNaN(priceNum) || priceNum <= 0) {
    reasons.push("Price is 0, empty, or unparseable");
    needsPriceReferee = true;
  } else if (priceNum <= 10) {
    // In COD e-commerce (Tunisia/Morocco), <= 10 DT/DH is almost always a delivery fee or placeholder
    reasons.push(`Suspiciously low price (${priceNum}) - likely delivery fee or accessory`);
    needsPriceReferee = true;
  } else if (priceClean.includes(".")) {
    const decimalPart = priceClean.split(".")[1];
    // In North African COD, real prices are round or end in .5 / .9 / .50 / .90 (e.g. 39.9, 49, 89)
    // Fractional decimals like 13.32 or 24.18 are conversion artifacts (USD/EUR conversion or 3x installments)
    const isStandardDecimal =
      decimalPart.length === 1 ||
      decimalPart === "50" ||
      decimalPart === "90" ||
      decimalPart === "00" ||
      decimalPart === "99";

    if (!isStandardDecimal) {
      reasons.push(`Unusual fractional price (${priceNum}) - possible exchange rate or installment artifact`);
      needsPriceReferee = true;
    }
  }

  // 2. Title Anomaly Check
  const title = (data.title || "").trim();
  const titleLower = title.toLowerCase();

  if (title.length < 10) {
    reasons.push(`Suspiciously short title: "${title}"`);
    needsTitleReferee = true;
  } else if (
    /(?:accueil|boutique|livraison|promo|pack|panier|store|bienvenue|offre sp[eé]ciale|nos produits|menu)/i.test(
      titleLower
    )
  ) {
    // Only flag if generic word makes up a big chunk of the title or starts it
    if (/^(?:accueil|boutique|livraison|panier|store|bienvenue)\b/i.test(titleLower)) {
      reasons.push(`Title starts with generic site element: "${title}"`);
      needsTitleReferee = true;
    }
  }

  return {
    hasDoubt: reasons.length > 0,
    reasons,
    needsPriceReferee,
    needsTitleReferee,
  };
}

/**
 * Scans raw HTML/markdown to harvest competing candidate prices and context hints.
 */
export function harvestPriceCandidates(
  html?: string | null,
  markdown?: string | null,
  fallbackCurrencySymbol = "DT"
): Array<{ value: string; context: string }> {
  const content = `${markdown || ""} ${html || ""}`;
  if (!content || content.length < 10) return [];

  const candidatesMap = new Map<string, string>();

  // 1. Match prices with currency indicators
  const regex = /([0-9]+(?:\.[0-9]+)?)\s*(?:DT|TND|dt|د\.ت|دت|DH|MAD|dh|د\.م|درهم)/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const num = parseFloat(match[1]);
    if (isNaN(num) || num <= 0 || num > 5000) continue;

    // Grab surrounding 40 chars context
    const startIdx = Math.max(0, match.index - 30);
    const endIdx = Math.min(content.length, match.index + match[0].length + 30);
    const snippet = content.slice(startIdx, endIdx).replace(/\s+/g, " ").trim();

    const formattedValue = `${num} ${fallbackCurrencySymbol}`;
    if (!candidatesMap.has(formattedValue)) {
      candidatesMap.set(formattedValue, snippet.slice(0, 50));
    }
  }

  return Array.from(candidatesMap.entries()).map(([value, context]) => ({
    value,
    context,
  }));
}

/**
 * When doubt is detected, invokes TypeSafe Jev as a split-second referee to resolve the true price.
 * Micro-token cost (~50-80 tokens), called ONLY on doubtful items.
 */
export async function resolvePriceDoubtWithJev(params: {
  productTitle: string;
  extractedPrice: string;
  html?: string | null;
  markdown?: string | null;
  fallbackCurrencySymbol?: string;
}): Promise<{ resolvedPrice: string; modelUsed: string; confidence: number } | null> {
  const currencySymbol = params.fallbackCurrencySymbol || "DT";
  const candidates = harvestPriceCandidates(params.html, params.markdown, currencySymbol);

  // If no candidates or only 1 candidate, nothing to disambiguate
  if (candidates.length <= 1) {
    return null;
  }

  // Format compact criteria map for Jev
  const criteriaMap: Record<string, string> = {};
  for (const c of candidates.slice(0, 5)) {
    criteriaMap[c.value] = c.context.slice(0, 35);
  }

  const response = await callJevDecisions(
    {
      product: params.productTitle.slice(0, 80),
      current_extracted: params.extractedPrice,
    },
    {
      real_price: {
        type: "choice",
        instructions: "Pick the true single-unit retail selling price (ignore delivery fees or multi-pack sums).",
        criteria: criteriaMap,
      },
    },
    { timeoutMs: 3500 }
  );

  const answer = response?.answers?.real_price as JevChoiceAnswer | undefined;
  if (!answer || answer.type !== "choice" || !answer.choice) {
    return null;
  }

  return {
    resolvedPrice: answer.choice,
    modelUsed: response?.model || "typesafe/jev-1.13",
    confidence: answer.confidence ?? 1.0,
  };
}
