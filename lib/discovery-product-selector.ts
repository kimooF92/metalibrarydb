/**
 * lib/discovery-product-selector.ts
 *
 * Ephemeral candidate selector for Discovery brand products.
 * Evaluates candidate ad destination landing URLs, canonicalizes them,
 * rejects non-product / administrative paths, and selects the best product URL
 * or store homepage hero fallback.
 */

const EXCLUDED_HOSTS = new Set([
  "wa.me",
  "api.whatsapp.com",
  "bit.ly",
  "tinyurl.com",
  "facebook.com",
  "instagram.com",
  "m.me",
  "t.me",
  "linktr.ee",
  "bio.link",
  "cutt.ly",
  "shorturl.at",
]);

const HIGH_PROBABILITY_PATTERNS = [
  /\/products?\//i,
  /\/produit\//i,
  /\/item\//i,
  /\/p\//i,
  /-p-\d+/i,
  /\.html$/i,
  /[?&](product_id|prod_id|item_id)=/i,
];

const DISALLOWED_PATHS = /(blogs?|posts?|pages\/about|about-us|contact|policies|terms|privacy|refund|faq|cart|checkout|collections$|categories$)/i;

export interface ProductCandidateSelection {
  url: string;
  source: "product_page" | "homepage_fallback";
}

/**
 * Strips UTM parameters, tracking shims, trailing slashes and normalizes URL
 */
export function canonicalizeStoreUrl(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;

    // Lowercase host, strip hash
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";

    // Strip common tracking and attribution parameters
    const paramsToDelete: string[] = [];
    url.searchParams.forEach((_, key) => {
      if (/^(utm_|fbclid|gclid|ref|source|_ga|campaign_id|ad_id|adset_id)/i.test(key)) {
        paramsToDelete.push(key);
      }
    });
    paramsToDelete.forEach((key) => url.searchParams.delete(key));

    // Normalize trailing slash on paths (preserving root `/`)
    let cleaned = url.toString();
    if (cleaned.endsWith("/") && url.pathname !== "/") {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  } catch {
    return null;
  }
}

/**
 * Selects the best candidate URL from an array of sample URLs found in discovery ads
 */
export function selectBestProductCandidateUrl(
  sampleUrls: string[] | null | undefined
): ProductCandidateSelection | null {
  if (!sampleUrls || !Array.isArray(sampleUrls) || sampleUrls.length === 0) return null;

  const validUrls: { url: string; score: number }[] = [];
  let potentialHomepageUrl: string | null = null;

  for (const rawUrl of sampleUrls) {
    const cleanUrl = canonicalizeStoreUrl(rawUrl);
    if (!cleanUrl) continue;

    try {
      const parsed = new URL(cleanUrl);
      const hostname = parsed.hostname;

      if (
        EXCLUDED_HOSTS.has(hostname) ||
        hostname.endsWith(".whatsapp.com") ||
        hostname.endsWith(".facebook.com") ||
        hostname.endsWith(".instagram.com")
      ) {
        continue;
      }

      const pathname = parsed.pathname.toLowerCase();

      // Explicitly reject non-product administrative paths
      if (DISALLOWED_PATHS.test(pathname)) continue;

      let score = 0;

      // High confidence: Deep product path
      for (const pattern of HIGH_PROBABILITY_PATTERNS) {
        if (pattern.test(pathname) || pattern.test(parsed.search)) {
          score += 50;
          break;
        }
      }

      const segments = pathname.split("/").filter(Boolean);
      if (segments.length >= 2) {
        score += 20;
      } else if (segments.length === 1 && segments[0] !== "") {
        score += 10;
      } else if (segments.length === 0 || pathname === "/") {
        score -= 20; // Pure store homepage
        if (!potentialHomepageUrl) {
          potentialHomepageUrl = parsed.origin;
        }
      }

      if (score > 0) {
        validUrls.push({ url: cleanUrl, score });
      }
    } catch {
      // Ignore URL parse error
    }
  }

  // Pass 1: Genuine deep product link
  if (validUrls.length > 0) {
    validUrls.sort((a, b) => b.score - a.score);
    return { url: validUrls[0].url, source: "product_page" };
  }

  // Pass 2: Fallback to store homepage hero product (Visual identification only)
  if (potentialHomepageUrl) {
    return { url: potentialHomepageUrl, source: "homepage_fallback" };
  }

  return null;
}
