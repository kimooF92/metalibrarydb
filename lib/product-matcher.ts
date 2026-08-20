/**
 * Algorithmic Cross-Competitor Product Matcher
 * $0 LLM Cost — 100% deterministic keyword tokenization, slug matching & Jaccard similarity.
 */

import { ScrapedProduct } from "@/types";

// Common e-commerce stopwords and marketing fluff to strip before comparing
const STOPWORDS = new Set([
  "the", "and", "a", "an", "for", "with", "of", "in", "to", "on", "by", "from",
  "free", "shipping", "sale", "off", "discount", "hot", "new", "best", "deal",
  "pack", "set", "piece", "pieces", "pcs", "original", "pro", "plus", "max",
  "ultra", "portable", "2023", "2024", "2025", "2026", "upgrade", "upgraded",
  "premium", "high", "quality", "official", "store", "online", "shop", "buy",
  // URL structural path keywords
  "collections", "collection", "category", "categories", "products", "product",
  "items", "item", "pages", "page", "cart", "checkout", "catalog", "catalogue",
  "index", "default", "landing", "offers", "offer",
  // French / Arabic common marketing words
  "livraison", "gratuite", "promo", "pack", "offre", "speciale", "nouveau",
  "qualite", "superieur", "originale", "magasin", "boutique", "توصيل", "مجاني", "عرض"
]);

/**
 * Tokenizes and cleans a product title or slug into core descriptive keywords.
 */
export function extractProductTokens(title?: string | null, url?: string | null): Set<string> {
  const tokens = new Set<string>();

  // 1. Process title
  if (title) {
    const cleanedTitle = title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ") // Keep letters & numbers
      .replace(/\s+/g, " ")
      .trim();

    cleanedTitle.split(" ").forEach((word) => {
      const w = word.trim();
      if (w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) {
        tokens.add(w);
      }
    });
  }

  // 2. Process URL slug if available
  if (url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.toLowerCase();
      const slugMatch =
        pathname.match(/(?:\/collections\/[^/]+)?\/(?:products?|items?|p|dp)\/([^/?#]+)/i) ||
        pathname.match(/\/([^/?#]+)\/?$/i);

      if (slugMatch && slugMatch[1]) {
        const slugWords = decodeURIComponent(slugMatch[1])
          .replace(/[-_]+/g, " ")
          .replace(/\.html?$/i, "")
          .split(" ");

        slugWords.forEach((word) => {
          const w = word.trim();
          if (w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) {
            tokens.add(w);
          }
        });
      }
    } catch {
      // Ignore URL parse error
    }
  }

  return tokens;
}

/**
 * Computes Jaccard Similarity (0.0 - 1.0) between two token sets.
 * J(A, B) = |A ∩ B| / |A ∪ B|
 */
export function calculateJaccardSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) {
      intersection++;
    }
  });

  const union = new Set([...tokensA, ...tokensB]).size;
  if (union === 0) return 0;

  return intersection / union;
}

/**
 * Computes Sørensen–Dice Coefficient (0.0 - 1.0) which gives more weight to common tokens.
 * DSC(A, B) = 2 * |A ∩ B| / (|A| + |B|)
 */
export function calculateDiceSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) {
      intersection++;
    }
  });

  return (2 * intersection) / (tokensA.size + tokensB.size);
}

/**
 * Parses numeric price value from string (e.g. "$29.99" -> 29.99, "49.00 TND" -> 49.00).
 */
export function parseNumericPrice(priceStr?: string | null): number | null {
  if (!priceStr) return null;
  const match = priceStr.replace(/,/g, ".").match(/(\d+(?:\.\d{1,2})?)/);
  return match ? parseFloat(match[1]) : null;
}

export interface CompetitorMatch {
  product: ScrapedProduct;
  similarityScore: number;
  isSameDomain: boolean;
  numericPrice: number | null;
  linkedAdsCount: number;
}

export interface CompetitorBenchmarkSummary {
  targetProductId: string;
  totalCompetitors: number;
  uniqueDomainsCount: number;
  totalCrossBrandAds: number;
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
  currency: string;
  priceSpreadPercent: number | null;
  matches: CompetitorMatch[];
}

/**
 * Finds all competitor products matching the target product across different domains/pages.
 */
export function findCompetitorMatches(
  targetProduct: ScrapedProduct,
  allProducts: (ScrapedProduct & { linkedAdsCount?: number })[],
  threshold = 0.40
): CompetitorBenchmarkSummary {
  const targetTokens = extractProductTokens(targetProduct.title, targetProduct.url);
  const targetDomain = targetProduct.domain?.toLowerCase() || "";

  const matches: CompetitorMatch[] = [];
  const targetNumericPrice = parseNumericPrice(targetProduct.currentPrice);

  allProducts.forEach((candidate) => {
    // Skip self
    if (candidate.id === targetProduct.id) return;

    const candidateTokens = extractProductTokens(candidate.title, candidate.url);
    const jaccard = calculateJaccardSimilarity(targetTokens, candidateTokens);
    const dice = calculateDiceSimilarity(targetTokens, candidateTokens);

    // Combined score favoring overlap
    const score = Math.max(jaccard, dice);

    if (score >= threshold) {
      const candidateDomain = candidate.domain?.toLowerCase() || "";
      const isSameDomain = Boolean(targetDomain && candidateDomain && targetDomain === candidateDomain);

      matches.push({
        product: candidate,
        similarityScore: Math.round(score * 100) / 100,
        isSameDomain,
        numericPrice: parseNumericPrice(candidate.currentPrice),
        linkedAdsCount: candidate.linkedAdsCount || 0,
      });
    }
  });

  // Sort matches by similarity score descending, then by linked ads count
  matches.sort((a, b) => b.similarityScore - a.similarityScore || b.linkedAdsCount - a.linkedAdsCount);

  // Calculate pricing metrics across competitors
  const prices: number[] = [];
  if (targetNumericPrice !== null) prices.push(targetNumericPrice);

  const uniqueDomains = new Set<string>();
  if (targetDomain) uniqueDomains.add(targetDomain);

  let totalCrossBrandAds = (targetProduct as any).linkedAdsCount || 0;

  matches.forEach((m) => {
    if (m.numericPrice !== null) prices.push(m.numericPrice);
    if (m.product.domain) uniqueDomains.add(m.product.domain.toLowerCase());
    totalCrossBrandAds += m.linkedAdsCount;
  });

  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const avgPrice =
    prices.length > 0
      ? Math.round((prices.reduce((acc, curr) => acc + curr, 0) / prices.length) * 100) / 100
      : null;

  const priceSpreadPercent =
    minPrice !== null && maxPrice !== null && minPrice > 0
      ? Math.round(((maxPrice - minPrice) / minPrice) * 100)
      : null;

  return {
    targetProductId: targetProduct.id,
    totalCompetitors: matches.length,
    uniqueDomainsCount: uniqueDomains.size,
    totalCrossBrandAds,
    minPrice,
    maxPrice,
    avgPrice,
    currency: targetProduct.currency || "$",
    priceSpreadPercent,
    matches,
  };
}
