import { resolveDestinationUrl } from "./utils";

export interface ProductClusterKeyInfo {
  productKey: string;
  productName: string;
  cleanProductUrl: string | null;
  isFromUrl: boolean;
}

export interface ProductClusterMetrics {
  productKey: string;
  productName: string;
  cleanProductUrl: string | null;
  productCreativeCount: number;
  productVideoCount: number;
  productImageCount: number;
  brandProductCount: number;
  brandTotalCreatives: number;
  productSharePercent: number;
  isFlagshipProduct: boolean;
}

/**
 * Normalizes ad caption text into a standardized content fingerprint.
 * Strips URLs, tracking codes, phone numbers, emojis, and excess whitespace.
 */
export function normalizeAdCopy(caption?: string | null): string {
  if (!caption) return "";

  let text = caption;

  // 1. Remove URLs and links
  text = text.replace(/https?:\/\/[^\s]+/gi, " ");

  // 2. Remove common phone number patterns
  text = text.replace(/(\+?\d{1,4}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g, " ");

  // 3. Remove emojis and non-alphanumeric characters (keeping standard Arabic and Latin letters)
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, " ");

  // 4. Remove special symbols and punctuation
  text = text.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // 5. Normalize whitespace and lowercase
  text = text.trim().toLowerCase().replace(/\s+/g, " ");

  // Return first 120 characters as fingerprint
  return text.slice(0, 120);
}

/**
 * Extracts and cleans the canonical product landing page URL and product slug.
 */
export function extractCleanProductUrl(linkUrl?: string | null): {
  cleanUrl: string;
  productSlug: string | null;
  isProductPage: boolean;
  domain: string;
} | null {
  if (!linkUrl) return null;

  try {
    // Resolve any Facebook redirection wrapper
    const resolvedUrl = resolveDestinationUrl(linkUrl);
    if (!resolvedUrl) return null;
    const parsed = new URL(resolvedUrl);

    // Skip non-HTTP links, social landing, or generic messenger
    if (!parsed.protocol.startsWith("http")) return null;
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    
    // Ignore social homepages
    if (
      hostname.includes("facebook.com") ||
      hostname.includes("instagram.com") ||
      hostname.includes("wa.me") ||
      hostname.includes("whatsapp.com") ||
      hostname.includes("tiktok.com") ||
      hostname.includes("youtube.com")
    ) {
      return null;
    }

    let pathname = parsed.pathname.replace(/\/+$/, ""); // Remove trailing slash
    if (!pathname) pathname = "/";

    // Strip common tracking and variant query parameters
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid", "ref", "variant", "_ga", "ttclid", "pixel_id"
    ];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));

    // Construct cleaned URL
    const searchString = parsed.searchParams.toString();
    const cleanUrl = `${parsed.protocol}//${hostname}${pathname}${searchString ? `?${searchString}` : ""}`;

    // Detect specific product URL slug patterns
    let productSlug: string | null = null;
    let isProductPage = false;

    // Pattern 1: /products/{slug} (Shopify / General)
    const productMatch = pathname.match(/(?:\/collections\/[^/]+)?\/products\/([^/?#]+)/i);
    if (productMatch) {
      productSlug = productMatch[1];
      isProductPage = true;
    }

    // Pattern 2: /p/{slug} or /product/{slug} or /item/{slug} or /shop/{slug}
    if (!productSlug) {
      const genericMatch = pathname.match(/\/(?:p|product|item|article|offer)\/([^/?#]+)/i);
      if (genericMatch) {
        productSlug = genericMatch[1];
        isProductPage = true;
      }
    }

    // Pattern 3: Funnel pages (e.g. /lp-1, /posture-corrector) where path is non-empty and not just generic words
    if (!productSlug && pathname.length > 2 && pathname !== "/") {
      const firstSegment = pathname.split("/").filter(Boolean)[0];
      const ignoredSegments = ["cart", "checkout", "contact", "about", "pages", "collections", "search", "blogs", "policies", "privacy-policy", "terms"];
      if (firstSegment && !ignoredSegments.includes(firstSegment.toLowerCase())) {
        productSlug = firstSegment;
        isProductPage = true;
      }
    }

    return {
      cleanUrl,
      productSlug,
      isProductPage,
      domain: hostname,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts a unique Product Cluster Key and human-readable product name for any ad.
 */
export function extractProductClusterKey(ad: {
  pageId: string;
  linkUrl?: string | null;
  caption?: string | null;
  title?: string | null;
}): ProductClusterKeyInfo {
  const urlInfo = extractCleanProductUrl(ad.linkUrl);

  // Method 1: Explicit Product Landing Page URL
  if (urlInfo && urlInfo.isProductPage && urlInfo.productSlug) {
    // Format human-friendly product name from slug
    const cleanSlug = decodeURIComponent(urlInfo.productSlug)
      .replace(/[-_]+/g, " ")
      .replace(/\.html?$/i, "")
      .trim();
    const productName = cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);

    return {
      productKey: `url:${ad.pageId}:${urlInfo.domain}:${urlInfo.productSlug.toLowerCase()}`,
      productName: productName || ad.title || "Featured Product",
      cleanProductUrl: urlInfo.cleanUrl,
      isFromUrl: true,
    };
  }

  // Method 2: Ad Copy Fingerprint Matching
  const copyFingerprint = normalizeAdCopy(ad.caption || ad.title);
  if (copyFingerprint.length >= 10) {
    // Extract first 4-5 words as clean product name
    const words = copyFingerprint.split(" ").slice(0, 5).join(" ");
    const productName = words.charAt(0).toUpperCase() + words.slice(1);

    return {
      productKey: `copy:${ad.pageId}:${copyFingerprint.slice(0, 60)}`,
      productName: ad.title || productName || "Advertised Offer",
      cleanProductUrl: urlInfo ? urlInfo.cleanUrl : null,
      isFromUrl: false,
    };
  }

  // Method 3: Fallback Title or Ad ID
  const titleFingerprint = normalizeAdCopy(ad.title);
  if (titleFingerprint.length >= 5) {
    return {
      productKey: `title:${ad.pageId}:${titleFingerprint.slice(0, 40)}`,
      productName: ad.title || "Product Offer",
      cleanProductUrl: urlInfo ? urlInfo.cleanUrl : null,
      isFromUrl: false,
    };
  }

  return {
    productKey: `ad:${ad.pageId}:${(ad as any).id || (ad as any).adArchiveId || "unknown"}`,
    productName: ad.title || "Single Ad Creative",
    cleanProductUrl: urlInfo ? urlInfo.cleanUrl : null,
    isFromUrl: false,
  };
}

/**
 * Enriches a list of ads with Product Cluster and Brand Portfolio Metrics.
 */
export function enrichAdsWithProductClusters<T extends {
  id: string;
  pageId: string;
  linkUrl?: string | null;
  caption?: string | null;
  title?: string | null;
  mediaType?: string | null;
}>(adsList: T[]): (T & ProductClusterMetrics)[] {
  // Step 1: Pre-calculate product cluster info for each ad
  const adKeys = new Map<string, ProductClusterKeyInfo>();
  adsList.forEach((ad) => {
    adKeys.set(ad.id, extractProductClusterKey(ad));
  });

  // Step 2: Group ads by brand (pageId) and by productKey
  const brandTotals = new Map<string, number>(); // pageId -> total ads
  const brandProducts = new Map<string, Set<string>>(); // pageId -> set of unique productKeys
  const clusterCounts = new Map<string, { total: number; videos: number; images: number }>();

  adsList.forEach((ad) => {
    const keyInfo = adKeys.get(ad.id)!;
    const pageId = ad.pageId;

    // Brand totals
    brandTotals.set(pageId, (brandTotals.get(pageId) || 0) + 1);

    // Brand distinct products set
    if (!brandProducts.has(pageId)) {
      brandProducts.set(pageId, new Set());
    }
    brandProducts.get(pageId)!.add(keyInfo.productKey);

    // Product cluster totals
    const current = clusterCounts.get(keyInfo.productKey) || { total: 0, videos: 0, images: 0 };
    current.total += 1;
    if (ad.mediaType === "video") {
      current.videos += 1;
    } else {
      current.images += 1;
    }
    clusterCounts.set(keyInfo.productKey, current);
  });

  // Step 3: Map enriched metrics back to each ad
  return adsList.map((ad) => {
    const keyInfo = adKeys.get(ad.id)!;
    const cluster = clusterCounts.get(keyInfo.productKey) || { total: 1, videos: 0, images: 1 };
    const brandTotal = brandTotals.get(ad.pageId) || 1;
    const brandProductCount = brandProducts.get(ad.pageId)?.size || 1;

    const productSharePercent = Math.min(100, Math.round((cluster.total / brandTotal) * 100));
    const isFlagshipProduct = cluster.total >= 3 && (productSharePercent >= 25 || cluster.total >= 5);

    return {
      ...ad,
      productKey: keyInfo.productKey,
      productName: keyInfo.productName,
      cleanProductUrl: keyInfo.cleanProductUrl,
      productCreativeCount: cluster.total,
      productVideoCount: cluster.videos,
      productImageCount: cluster.images,
      brandProductCount,
      brandTotalCreatives: brandTotal,
      productSharePercent,
      isFlagshipProduct,
    };
  });
}
