/**
 * Extraction Doubt Detector & TypeSafe Jev Referee
 *
 * $0 Token Rule: Evaluates extracted product titles and prices with deterministic heuristics.
 * If data looks standard and clean (90%+ of products), JEV IS NEVER CALLED.
 * Jev is invoked ONLY when a concrete anomaly is detected (e.g. micro-prices <= 10,
 * weird decimal conversion artifacts like 13.32, or non-product titles).
 */

import { callJevDecisions, JevChoiceAnswer, DEFAULT_DECISION_MODEL } from "./typesafe-jev";

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
  } else if (rawPriceStr.includes("$") || /\bUSD\b/i.test(rawPriceStr)) {
    reasons.push(`USD / foreign currency detected (${rawPriceStr}) - cloud proxy geo-switch artifact`);
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

export interface PriceCandidate {
  value: string;
  context: string;
  num: number;
  isDelivery?: boolean;
  isTotal?: boolean;
  isOriginal?: boolean;
  isDiscount?: boolean;
  isHighConfidence?: boolean;
}

/**
 * Scans raw HTML/markdown to harvest competing candidate prices and context hints.
 * Handles Tunisian millimes (e.g. 20.000 or 20,000 DT), Moroccan DH, and Arabic indicators.
 */
export function harvestPriceCandidates(
  html?: string | null,
  markdown?: string | null,
  fallbackCurrencySymbol = "DT"
): PriceCandidate[] {
  const content = `${markdown || ""} ${html || ""}`;
  if (!content || content.length < 10) return [];

  const candidatesMap = new Map<string, PriceCandidate>();

  const recordCandidate = (
    rawNumStr: string,
    matchIndex: number,
    matchLength: number,
    isHighConfidence = false
  ) => {
    // Standardize commas to dots for parsing
    const cleanNumStr = rawNumStr.replace(/,/g, ".");
    let num = parseFloat(cleanNumStr);
    if (isNaN(num) || num <= 0 || num > 50000) return;

    // In Tunisia (TND/DT), numbers like 20.000 or 20,000 are thousands of millimes = 20 DT.
    // However, numbers like 22.900 = 22.9 DT.
    if (cleanNumStr.includes(".")) {
      const parts = cleanNumStr.split(".");
      if (parts[1] === "000" || parts[1] === "00") {
        num = parseInt(parts[0], 10);
      }
    }

    // Grab surrounding 50 chars context
    const startIdx = Math.max(0, matchIndex - 45);
    const endIdx = Math.min(content.length, matchIndex + matchLength + 45);
    const snippet = content.slice(startIdx, endIdx).replace(/\s+/g, " ").trim();

    const isFreeShippingThreshold = /(?:livraison\s+gratuite\s+d[eè]s|gratuit[e]?\s+d[eè]s|free\s+shipping\s+over|توصيل\s+مجاني\s+عند|شحن\s+مجاني\s+عند|d&#39;achat|d['']achat|d[eè]s\s+\d+\s*(?:dt|dh))/i.test(snippet);
    const isDelivery = isFreeShippingThreshold || (/(?:livraison|delivery|توصيل|شحن|frais|exp[eé]dition)/i.test(snippet) && num <= 25);
    const isDiscount = /(?:تخفيض|r[eé]duction|remise|rabais|discount|économie|économisez|save)\b/i.test(snippet);
    const isTotal = /(?:total|المجموع|sous-total|net [aà] payer|somme)/i.test(snippet);
    const isOriginal = /(?:ancien|barr[eé]|original|prix initial|avant|regular|avant r[eé]duction|قبل الخصم|old|compare|was|del|strike|line-through)/i.test(snippet);
    const isQuantity = /(?:pack\s*(?:de)?|quantit[eé]|اشتري|احصل\s*على|قطعة|pi[eè]ce|lot\s*(?:de)?)\s*[0-9]/i.test(snippet) && num <= 5;

    const formattedValue = `${num} ${fallbackCurrencySymbol}`;
    if (!candidatesMap.has(formattedValue)) {
      candidatesMap.set(formattedValue, {
        value: formattedValue,
        context: snippet.slice(0, 80),
        num,
        isDelivery,
        isTotal,
        isOriginal,
        isDiscount,
        isHighConfidence,
      });
    }
  };

  // 1. Structured JSON-LD Product Offer (highest confidence)
  if (html) {
    const jsonLdRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jMatch: RegExpExecArray | null;
    while ((jMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(jMatch[1].trim());
        const matchIdx = jMatch.index;
        const checkOffer = (obj: any) => {
          if (!obj) return;
          const offer = obj.offers
            ? (Array.isArray(obj.offers) ? obj.offers[0] : obj.offers)
            : (obj["@type"] === "Offer" ? obj : null);
          if (offer?.price) {
            recordCandidate(String(offer.price), matchIdx, 10, true);
          }
        };
        if (Array.isArray(parsed)) parsed.forEach(checkOffer);
        else checkOffer(parsed);
      } catch {}
    }
  }

  // 2. Suffix currency match (e.g. "20 DT", "20.000 دت", "20,000 DT", "9.00 د.ت", "30 DH")
  const regexSuffix = /([0-9]+(?:[.,][0-9]+)?)\s*(?:DT|TND|dt|د\.ت|دت|DH|MAD|dh|د\.م|درهم)/gi;
  let match;
  while ((match = regexSuffix.exec(content)) !== null) {
    recordCandidate(match[1], match.index, match[0].length);
  }

  // 3. Prefix currency match (e.g. "DT 20", "د.ت 20", "DH 250")
  const regexPrefix = /(?:DT|TND|dt|د\.ت|دت|DH|MAD|dh|د\.م|درهم)\s*([0-9]+(?:[.,][0-9]+)?)/gi;
  while ((match = regexPrefix.exec(content)) !== null) {
    recordCandidate(match[1], match.index, match[0].length);
  }

  // 4. Structured DOM price patterns with strict inner text (avoiding class names like text-gray-700)
  if (html) {
    // Hidden inputs in COD funnels
    const inputRegex = /<input[^>]+(?:name|id)=["'](?:price|prix|unit_price|amount)["'][^>]+value=["']([0-9]+(?:[.,][0-9]+)?)["']/gi;
    while ((match = inputRegex.exec(html)) !== null) {
      recordCandidate(match[1], match.index, match[0].length, true);
    }
    const inputValRegex = /<input[^>]+value=["']([0-9]+(?:[.,][0-9]+)?)["'][^>]+(?:name|id)=["'](?:price|prix|unit_price|amount)["']/gi;
    while ((match = inputValRegex.exec(html)) !== null) {
      recordCandidate(match[1], match.index, match[0].length, true);
    }

    // Meta tags
    const metaRegex = /<meta\s+[^>]*content=["']([0-9]+(?:[.,][0-9]+)?)["'][^>]*property=["'](?:product:price:amount|og:price:amount)["']/gi;
    while ((match = metaRegex.exec(html)) !== null) {
      recordCandidate(match[1], match.index, match[0].length, true);
    }

    // Spans with price / amount classes (strictly matching inner text between > and <)
    const spanTextRegex = /<(?:span|bdi|p|div)[^>]*class=["'][^"']*(?:price|amount|valeur|current|regular|sale|prix)[^"']*["'][^>]*>([^<]+)<\/(?:span|bdi|p|div)>/gi;
    while ((match = spanTextRegex.exec(html)) !== null) {
      const text = match[1].trim();
      const numMatch = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:DT|TND|dt|د\.ت|دت|DH|MAD|dh|د\.م|درهم)?/i);
      if (numMatch && numMatch[1]) {
        recordCandidate(numMatch[1], match.index, match[0].length);
      }
    }
  }

  return Array.from(candidatesMap.values());
}

/**
 * When doubt is detected (e.g. price is 0 DT or suspicious micro-price < 10),
 * invokes TypeSafe Jev as a split-second referee or uses candidate heuristics.
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
  
  // Combine HTML, markdown, and product title so title price mentions (e.g. "الثمن 49 دت") are harvested
  const combinedContent = `${params.productTitle} ${params.markdown || ""} ${params.html || ""}`;
  const allCandidates = harvestPriceCandidates(params.html, combinedContent, currencySymbol);

  if (allCandidates.length === 0) {
    return null;
  }

  // 1. Fast-path: If high-confidence structured metadata exists (JSON-LD offer / form price), resolve immediately
  const structuredCandidate = allCandidates.find((c) => c.isHighConfidence && !c.isOriginal);
  if (structuredCandidate) {
    return {
      resolvedPrice: structuredCandidate.value,
      modelUsed: "high_confidence_structured",
      confidence: 0.98,
    };
  }

  // Filter out pure delivery fees, free shipping thresholds, totals, and discounts
  const nonDeliveryCandidates = allCandidates.filter((c) => !c.isDelivery && !c.isTotal && !c.isDiscount);
  const baseCandidates = nonDeliveryCandidates.length > 0 ? nonDeliveryCandidates : allCandidates;

  // Single candidate heuristic: if only 1 viable price candidate exists on page, it is the real price!
  if (baseCandidates.length === 1) {
    const single = baseCandidates[0];
    if (single.num > 0 && !single.isDelivery) {
      return {
        resolvedPrice: single.value,
        modelUsed: "single_candidate_heuristic",
        confidence: 0.95,
      };
    }
  }

  const pool = baseCandidates.filter((c) => !c.isOriginal);
  const candidates = pool.length > 0 ? pool : baseCandidates;

  // Format compact criteria map for Jev
  const criteriaMap: Record<string, string> = {};
  for (const c of candidates.slice(0, 5)) {
    const tag = c.isOriginal ? "Original/Regular price" : "Retail selling price";
    criteriaMap[c.value] = `${tag}: ${c.context.slice(0, 45)}`;
  }

  const response = await callJevDecisions(
    {
      product: params.productTitle.slice(0, 80),
      current_extracted: params.extractedPrice,
    },
    {
      real_price: {
        type: "choice",
        instructions:
          "Pick the active single-unit retail selling price (choose discounted single-unit selling price over regular/crossed-out price, pack bundle prices, discounts, or delivery fees).",
        criteria: criteriaMap,
      },
    },
    { timeoutMs: 4000 }
  );

  const answer = response?.answers?.real_price as JevChoiceAnswer | undefined;
  if (!answer || answer.type !== "choice" || !answer.choice) {
    // If Jev was unreachable, take the best candidate heuristic:
    // Filter non-original candidates >= 1, and pick the lowest retail price (discounted single-unit sale price)
    const valid = candidates.filter((c) => c.num >= 1 && !c.isDelivery && !c.isTotal);
    if (valid.length > 0) {
      const nonOriginal = valid.filter((c) => !c.isOriginal && !c.isDiscount);
      const sorted = (nonOriginal.length > 0 ? nonOriginal : valid).sort((a, b) => a.num - b.num);
      const best = sorted[0];
      return {
        resolvedPrice: best.value,
        modelUsed: "price_heuristic_fallback",
        confidence: 0.7,
      };
    }
    return null;
  }

  return {
    resolvedPrice: answer.choice,
    modelUsed: response?.model || DEFAULT_DECISION_MODEL,
    confidence: answer.confidence ?? 1.0,
  };
}

