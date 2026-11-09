import { db } from "@/db";
import { scrapedProducts } from "@/db/schema";
import { inArray, desc } from "drizzle-orm";
import { canonicalizeStoreUrl } from "@/lib/discovery-product-selector";
import { normalizeProductUrl as normalizeUrlParser } from "@/lib/url-parser";

/**
 * Normalizes a URL for product matching:
 * 1. Strips Facebook/Instagram redirect shims
 * 2. Lowercases protocol and host
 * 3. Strips advertising and tracking parameters
 * 4. Removes trailing slashes
 */
export function normalizeProductUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const parserNormalized = normalizeUrlParser(trimmed);
  if (parserNormalized) {
    return parserNormalized.replace(/\/+$/, "");
  }

  const canonical = canonicalizeStoreUrl(trimmed);
  if (canonical) {
    return canonical.replace(/\/+$/, "");
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    let str = url.toString();
    if (str.endsWith("/") && url.pathname !== "/") {
      str = str.slice(0, -1);
    }
    return str;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/**
 * Generates all search variants for a given URL so an SQL `IN (...)`
 * query will match whether the database row contains a trailing slash,
 * raw URL, or canonicalized URL.
 */
export function generateUrlSearchVariants(rawUrl?: string | null): string[] {
  if (!rawUrl || typeof rawUrl !== "string") return [];
  const trimmed = rawUrl.trim();
  if (!trimmed) return [];

  const variants = new Set<string>();
  variants.add(trimmed);

  const noSlash = trimmed.replace(/\/+$/, "");
  variants.add(noSlash);
  variants.add(noSlash + "/");

  const normalized = normalizeProductUrl(trimmed);
  if (normalized) {
    variants.add(normalized);
    variants.add(normalized + "/");
  }

  const canonical = canonicalizeStoreUrl(trimmed);
  if (canonical) {
    variants.add(canonical);
    const canonNoSlash = canonical.replace(/\/+$/, "");
    variants.add(canonNoSlash);
    variants.add(canonNoSlash + "/");
  }

  return Array.from(variants);
}

export interface ProductIdLookup {
  getProductId: (url?: string | null) => string | null;
  urlToProductIdMap: Map<string, string>;
}

/**
 * Efficiently matches a batch of candidate ad landing URLs to known `scraped_products`
 * in a single indexed SQL query with zero external API calls.
 */
export async function batchFindProductIdsByUrls(
  urls: (string | null | undefined)[]
): Promise<ProductIdLookup> {
  const allVariants = new Set<string>();

  for (const u of urls) {
    if (!u) continue;
    for (const v of generateUrlSearchVariants(u)) {
      allVariants.add(v);
    }
  }

  const lookupMap = new Map<string, string>();

  const emptyResult: ProductIdLookup = {
    getProductId: () => null,
    urlToProductIdMap: lookupMap,
  };

  if (allVariants.size === 0) {
    return emptyResult;
  }

  try {
    const variantArray = Array.from(allVariants);
    // Explicit lean projection per AGENTS.md egress rules
    const matched = await db
      .select({
        id: scrapedProducts.id,
        url: scrapedProducts.url,
        createdAt: scrapedProducts.createdAt,
      })
      .from(scrapedProducts)
      .where(inArray(scrapedProducts.url, variantArray))
      .orderBy(desc(scrapedProducts.createdAt));

    for (const prod of matched) {
      if (!prod.url) continue;
      const variants = generateUrlSearchVariants(prod.url);
      for (const v of variants) {
        const key = v.toLowerCase();
        if (!lookupMap.has(key)) {
          lookupMap.set(key, prod.id);
        }
      }
    }

    return {
      getProductId: (rawUrl?: string | null): string | null => {
        if (!rawUrl) return null;
        const variants = generateUrlSearchVariants(rawUrl);
        for (const v of variants) {
          const matchedId = lookupMap.get(v.toLowerCase());
          if (matchedId) return matchedId;
        }
        return null;
      },
      urlToProductIdMap: lookupMap,
    };
  } catch (error) {
    console.warn("[Product URL Matcher] Failed to query product IDs by URL:", error);
    return emptyResult;
  }
}

export interface LeanProductFeedItem {
  id: string;
  url: string | null;
  domain: string | null;
  pageId: string | null;
  title: string | null;
  currentPrice: string | null;
  originalPrice: string | null;
  currency: string | null;
  discountOrOffer: string | null;
  mainImageUrl: string | null;
  storePlatform: string | null;
  deliveryCost: string | null;
  category: string | null;
  subCategory: string | null;
  targetAudience: string | null;
  isFavorite: boolean | null;
  scrapeStatus: string | null;
  failureReason: string | null;
  lastScrapedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ProductFeedLookup {
  getProduct: (url?: string | null) => LeanProductFeedItem | null;
  matchedProducts: LeanProductFeedItem[];
}

/**
 * Batch resolves unlinked ad URLs to full lean product records for the Spy feed.
 */
export async function batchFindProductsByUrls(
  urls: (string | null | undefined)[]
): Promise<ProductFeedLookup> {
  const allVariants = new Set<string>();

  for (const u of urls) {
    if (!u) continue;
    for (const v of generateUrlSearchVariants(u)) {
      allVariants.add(v);
    }
  }

  const lookupMap = new Map<string, LeanProductFeedItem>();

  const emptyResult: ProductFeedLookup = {
    getProduct: () => null,
    matchedProducts: [],
  };

  if (allVariants.size === 0) {
    return emptyResult;
  }

  try {
    const variantArray = Array.from(allVariants);
    const fetched = await db
      .select({
        id: scrapedProducts.id,
        url: scrapedProducts.url,
        domain: scrapedProducts.domain,
        pageId: scrapedProducts.pageId,
        title: scrapedProducts.title,
        currentPrice: scrapedProducts.currentPrice,
        originalPrice: scrapedProducts.originalPrice,
        currency: scrapedProducts.currency,
        discountOrOffer: scrapedProducts.discountOrOffer,
        mainImageUrl: scrapedProducts.mainImageUrl,
        storePlatform: scrapedProducts.storePlatform,
        deliveryCost: scrapedProducts.deliveryCost,
        category: scrapedProducts.category,
        subCategory: scrapedProducts.subCategory,
        targetAudience: scrapedProducts.targetAudience,
        isFavorite: scrapedProducts.isFavorite,
        scrapeStatus: scrapedProducts.scrapeStatus,
        failureReason: scrapedProducts.failureReason,
        lastScrapedAt: scrapedProducts.lastScrapedAt,
        createdAt: scrapedProducts.createdAt,
        updatedAt: scrapedProducts.updatedAt,
      })
      .from(scrapedProducts)
      .where(inArray(scrapedProducts.url, variantArray))
      .orderBy(desc(scrapedProducts.createdAt));

    for (const prod of fetched) {
      if (!prod.url) continue;
      const variants = generateUrlSearchVariants(prod.url);
      for (const v of variants) {
        const key = v.toLowerCase();
        if (!lookupMap.has(key)) {
          lookupMap.set(key, prod);
        }
      }
    }

    return {
      getProduct: (rawUrl?: string | null): LeanProductFeedItem | null => {
        if (!rawUrl) return null;
        const variants = generateUrlSearchVariants(rawUrl);
        for (const v of variants) {
          const matchedProd = lookupMap.get(v.toLowerCase());
          if (matchedProd) return matchedProd;
        }
        return null;
      },
      matchedProducts: fetched,
    };
  } catch (error) {
    console.warn("[Product URL Matcher] Failed to query product records by URL:", error);
    return emptyResult;
  }
}
