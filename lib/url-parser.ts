import { isValidPageId, resolveDestinationUrl } from "./utils";

/**
 * Normalizes a URL for deduplication:
 * 1. Unwraps Facebook/Instagram redirect shims
 * 2. Strips tracking params (UTMs, fbclid, gclid, etc.)
 * 3. Normalizes protocol & removes trailing slash
 */
export function normalizeProductUrl(rawUrl: string | null | undefined): string | null {
  const unwrapped = resolveDestinationUrl(rawUrl);
  if (!unwrapped) return null;

  try {
    // Strip carriage returns, tabs, and invalid whitespace
    const sanitizedUrl = unwrapped.trim().replace(/[\r\n\t]+/g, "").replace(/\s+/g, "");
    const parsed = new URL(sanitizedUrl);

    // Comprehensive list of advertising, analytics, and affiliate tracking query parameters
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "utm_source_platform",
      "utm_creative",
      "fbclid",
      "gclid",
      "wbraid",
      "gbraid",
      "ttclid",
      "msclkid",
      "twclid",
      "yclid",
      "dclid",
      "sc_clickid",
      "s_kwcid",
      "ref",
      "ref_src",
      "source",
      "origin",
      "_ga",
      "_gl",
      "_kx",
      "_ke",
      "mc_cid",
      "mc_eid",
      "fbadid",
      "ad_id",
      "adset_id",
      "campaign_id",
      "ad_name",
      "adset_name",
      "campaign_name",
      "placement",
      "site_source_name",
      "cuid",
      "click_id",
      "clickid",
      "affiliateid",
      "aff_id",
      "affiliate_id",
      "pixel_id",
      "hsa_acc",
      "hsa_cam",
      "hsa_grp",
      "hsa_ad",
      "hsa_src",
      "hsa_net",
      "hsa_ver",
      // Shopify predictive search & theme session parameters
      "_pos",
      "_psq",
      "_psid",
      "_ss",
      "_v",
    ];

    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((val, key) => {
      const cleanKey = key.replace(/^[+\s]+/, "").toLowerCase();
      if (
        trackingParams.includes(cleanKey) ||
        key.startsWith("+") ||
        key.includes("\n") ||
        key.includes("\r") ||
        val.includes("{{") ||
        val.includes("%7B%7B") ||
        key.includes("{{") ||
        key.includes("%7B%7B")
      ) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => parsed.searchParams.delete(key));

    // Remove empty hash or trailing hash
    parsed.hash = "";

    // Normalize protocol & hostname to lowercase
    let cleaned = `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname}`;

    // Remove trailing slash if path is longer than 1 character
    if (cleaned.length > 1 && cleaned.endsWith("/")) {
      cleaned = cleaned.slice(0, -1);
    }

    // Append remaining query params if any
    const remainingQuery = parsed.searchParams.toString();
    if (remainingQuery) {
      cleaned += `?${remainingQuery}`;
    }

    return cleaned;
  } catch {
    return unwrapped.trim();
  }
}

export interface UrlMetadata {
  url: string;
  pageId: string | null;
  displayName: string | null;
  searchType: string;
}

const META_AD_LIBRARY_HOST = "www.facebook.com";
const META_AD_LIBRARY_PATH = "/ads/library/";
export const META_AD_LIBRARY_URL_PREFIX = `https://${META_AD_LIBRARY_HOST}${META_AD_LIBRARY_PATH}`;

// Multi-tenant e-commerce platform domains where merchant subdomains must be preserved
const SAAS_STORE_DOMAINS = [
  "youcan.shop",
  "myshopify.com",
  "storeino.com",
  "lightfunnels.com",
  "dropify.site",
  "woocommerce.com",
];

// Common store / technical subdomains to strip on custom brand domains
const COMMON_STORE_PREFIXES = new Set([
  "www",
  "store",
  "shop",
  "checkout",
  "catalog",
  "boutique",
  "app",
  "m",
]);

// Non-store social media domains to reject
export const SOCIAL_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "wa.me",
  "whatsapp.com",
  "t.me",
  "telegram.org",
  "linkedin.com",
  "pinterest.com",
  "meta.com",
  "fb.me",
];

export function isSocialDomain(hostnameOrUrl: string): boolean {
  if (!hostnameOrUrl) return false;
  let host = hostnameOrUrl.trim().toLowerCase();
  try {
    if (host.startsWith("http://") || host.startsWith("https://")) {
      host = new URL(host).hostname.toLowerCase();
    }
  } catch {
    host = host.replace(/^https?:\/\//i, "").split("/")[0].split("?")[0].split(":")[0];
  }
  const cleanHost = host.replace(/^\.+|\.+$/g, "");
  return SOCIAL_DOMAINS.some((d) => cleanHost === d || cleanHost.endsWith(`.${d}`));
}


// Two-part top level domains (ccTLD second-level domains)
const MULTI_PART_TLDS = new Set([
  "com.tn",
  "org.tn",
  "net.tn",
  "gov.tn",
  "ed.tn",
  "co.uk",
  "com.fr",
  "org.uk",
  "com.au",
  "co.nz",
  "co.za",
  "com.br",
  "co.jp",
  "com.eg",
  "com.sa",
  "com.ae",
]);

/**
 * Resolves a hostname into a clean search target domain.
 * - For SaaS platforms (e.g. boutique.youcan.shop), preserves the full tenant subdomain.
 * - For custom domains (e.g. store.nike.com, shop.brand.com.tn), strips store prefixes down to apex domain.
 */
export function resolveTrackableDomain(hostname: string): string {
  let raw = hostname.trim().toLowerCase();
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      raw = new URL(raw).hostname.toLowerCase();
    }
  } catch {
    raw = raw.replace(/^https?:\/\//i, "").split("/")[0].split("?")[0].split(":")[0];
  }
  const cleanHost = raw.replace(/^\.+|\.+$/g, "");
  if (!cleanHost) return "";

  // 1. Multi-tenant SaaS platform preservation
  for (const saasDomain of SAAS_STORE_DOMAINS) {
    if (cleanHost === saasDomain) return cleanHost;
    if (cleanHost.endsWith(`.${saasDomain}`)) {
      return cleanHost;
    }
  }

  // 2. Custom domain root reduction
  const parts = cleanHost.split(".");
  if (parts.length <= 2) {
    return cleanHost.replace(/^www\./, "");
  }

  // Check if ending with a known multi-part TLD (e.g. .com.tn)
  const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  const isMultiPart = MULTI_PART_TLDS.has(lastTwo);

  // Determine root apex parts count:
  // e.g., for "com.tn", root needs 3 parts (brand.com.tn)
  // for standard TLDs (e.g. "com"), root needs 2 parts (brand.com)
  const rootPartCount = isMultiPart ? 3 : 2;

  if (parts.length > rootPartCount) {
    const prefix = parts[0];
    if (COMMON_STORE_PREFIXES.has(prefix)) {
      // Strip common store prefix (e.g. "store.nike.com" -> "nike.com")
      return parts.slice(1).join(".");
    }
  }

  return cleanHost.replace(/^www\./, "");
}

export function isMetaAdLibraryUrl(url: string): boolean {
  try {
    const trimmed = url.trim();
    const urlToTest = trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(urlToTest);

    const isFacebookDomain = /(^|\.)facebook\.com$/i.test(parsed.hostname);
    const isAdLibraryPath = /^\/ads\/library(\/|\?|$)/i.test(parsed.pathname);

    return isFacebookDomain && isAdLibraryPath;
  } catch {
    return false;
  }
}

/**
 * Safely extracts an external e-commerce brand store domain from a candidate string
 * (landing page URL, Meta Ad Library search URL, apex domain, etc.).
 * Strips out Facebook/Meta Ad Library wrappers and rejects pure social media domains.
 */
export function extractStoreDomain(rawInput: string | null | undefined): string | null {
  if (!rawInput || typeof rawInput !== "string") return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Check if it's a Meta Ad Library URL:
  if (isMetaAdLibraryUrl(trimmed) || trimmed.includes("facebook.com/ads/library")) {
    try {
      const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      const q = parsed.searchParams.get("q")?.trim();
      if (q) {
        const decoded = decodeURIComponent(q).replace(/^"|"$/g, "").trim();
        if (decoded && decoded.includes(".") && !isSocialDomain(decoded)) {
          const dom = resolveTrackableDomain(decoded);
          if (dom && dom.includes(".") && !isSocialDomain(dom)) return dom;
        }
      }
    } catch {}
    // If it's a Meta Ad Library URL without a domain search query, it's NOT a brand store domain
    return null;
  }

  // Reject pure social media profiles/links
  if (isSocialDomain(trimmed)) {
    return null;
  }

  // General URL or domain resolution
  const resolved = resolveTrackableDomain(trimmed);
  if (!resolved || !resolved.includes(".") || isSocialDomain(resolved)) {
    return null;
  }

  return resolved;
}


export interface ParsedMetaAdUrl {
  isValid: boolean;
  cleanUrl: string;
  country: string;
  query: string;
  mediaType: string;
  startDateMin: string | null;
  startDateMax: string | null;
  pageId: string | null;
  languages: string[];
  platforms: string[];
  error?: string;
}

export function parseMetaAdLibraryDiscoveryUrl(rawUrl: string): ParsedMetaAdUrl {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      isValid: false,
      cleanUrl: "",
      country: "ALL",
      query: "\u200D",
      mediaType: "all",
      startDateMin: null,
      startDateMax: null,
      pageId: null,
      languages: [],
      platforms: [],
      error: "URL is empty",
    };
  }

  const trimmed = rawUrl.trim();
  const urlToTest = trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(urlToTest);
    const isFacebookDomain = /(^|\.)facebook\.com$/i.test(parsed.hostname);
    const isAdLibraryPath = /^\/ads\/library(\/|\?|$)/i.test(parsed.pathname);

    if (!isFacebookDomain || !isAdLibraryPath) {
      return {
        isValid: false,
        cleanUrl: urlToTest,
        country: "ALL",
        query: "\u200D",
        mediaType: "all",
        startDateMin: null,
        startDateMax: null,
        pageId: null,
        languages: [],
        platforms: [],
        error: "Not a valid Facebook Ad Library URL (must start with https://www.facebook.com/ads/library/...)",
      };
    }

    // Force hostname to www.facebook.com and https
    parsed.protocol = "https:";
    parsed.hostname = "www.facebook.com";

    const params = parsed.searchParams;

    // Extract country
    const rawCountry = params.get("country");
    const country = rawCountry ? rawCountry.toUpperCase().trim() : "ALL";

    // Extract query / keyword
    const rawQuery = params.get("q");
    let query = "\u200D";
    if (rawQuery !== null && rawQuery !== undefined && rawQuery.trim() !== "") {
      query = rawQuery.trim();
    }

    // Extract Page ID if present
    const rawPageId = params.get("view_all_page_id")?.trim() || null;
    const pageId = rawPageId && isValidPageId(rawPageId) ? rawPageId : null;

    if ((query === "\u200D" || !query) && pageId) {
      query = `page:${pageId}`;
    }

    // Extract Media Type
    const mediaType = params.get("media_type") || "all";

    // Extract Date Filters
    const startDateMin = params.get("start_date[min]") || null;
    const startDateMax = params.get("start_date[max]") || null;

    // Extract Languages
    const languages: string[] = [];
    params.forEach((val, key) => {
      if (key.startsWith("content_languages") && !languages.includes(val)) {
        languages.push(val);
      }
    });

    // Extract Platforms
    const platforms: string[] = [];
    params.forEach((val, key) => {
      if (key.startsWith("publisher_platforms") && !platforms.includes(val)) {
        platforms.push(val);
      }
    });

    // Ensure active_status is set if missing
    if (!params.has("active_status")) {
      params.set("active_status", "active");
    }

    return {
      isValid: true,
      cleanUrl: parsed.toString(),
      country,
      query,
      mediaType,
      startDateMin,
      startDateMax,
      pageId,
      languages,
      platforms,
    };
  } catch (e: any) {
    return {
      isValid: false,
      cleanUrl: urlToTest,
      country: "ALL",
      query: "\u200D",
      mediaType: "all",
      startDateMin: null,
      startDateMax: null,
      pageId: null,
      languages: [],
      platforms: [],
      error: e.message || "Invalid URL syntax",
    };
  }
}

/**
 * Builds the canonical Meta Ad Library exact keyword phrase search URL for a domain.
 */
export function buildMetaAdLibrarySearchUrl(domain: string): string {
  const quotedDomain = encodeURIComponent(`"${domain.trim()}"`);

  return (
    `${META_AD_LIBRARY_URL_PREFIX}` +
    `?active_status=active` +
    `&ad_type=all` +
    `&country=ALL` +
    `&is_targeted_country=false` +
    `&media_type=all` +
    `&q=${quotedDomain}` +
    `&search_type=keyword_exact_phrase` +
    `&sort_data[direction]=desc` +
    `&sort_data[mode]=relevancy_monthly_grouped`
  );
}

export type TrackableUrlType = "meta_ad_library" | "product_url" | "domain";

export interface ParsedTrackableUrl {
  type: TrackableUrlType;
  originalInput: string;
  normalizedUrl: string;
  targetDomain: string;
  productUrl?: string;
  metaAdLibraryUrl: string;
}

/**
 * Universal trackable URL parser.
 * Supports:
 * 1. Meta Ad Library search URLs
 * 2. E-commerce product landing pages (with paths/queries)
 * 3. Pure website domains (e.g. brand.com, wixi.com.tn, mystore.youcan.shop)
 */
export function parseTrackableUrl(rawInput: string): ParsedTrackableUrl | null {
  if (!rawInput || typeof rawInput !== "string") return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // 1. Is it a Meta Ad Library URL?
  if (isMetaAdLibraryUrl(trimmed)) {
    const fullUrl = trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
    let targetDomain = "Meta Ad Search";
    try {
      const parsed = new URL(fullUrl);
      const q = parsed.searchParams.get("q")?.trim();
      const pageId = parsed.searchParams.get("view_all_page_id")?.trim();
      if (q) {
        targetDomain = decodeURIComponent(q).replace(/^"|"$/g, "");
      } else if (pageId) {
        targetDomain = pageId;
      }
    } catch {}

    return {
      type: "meta_ad_library",
      originalInput: rawInput,
      normalizedUrl: fullUrl,
      targetDomain,
      metaAdLibraryUrl: fullUrl,
    };
  }

  // 2. Parse general website or product link
  const urlToParse = trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlToParse);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname || !hostname.includes(".")) return null;

  // 3. Reject pure social media profile links
  if (SOCIAL_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return null;
  }

  const targetDomain = resolveTrackableDomain(hostname);
  if (!targetDomain) return null;

  const canonicalAdLibraryUrl = buildMetaAdLibrarySearchUrl(targetDomain);

  // 4. Distinguish pure domain vs product / subpath URL
  const hasSubpath = Boolean(
    parsedUrl.pathname &&
    parsedUrl.pathname !== "/" &&
    parsedUrl.pathname.trim().length > 1
  );
  const hasQuery = Boolean(parsedUrl.search && parsedUrl.search.trim().length > 1);

  if (hasSubpath || hasQuery) {
    const cleanProductUrl = normalizeProductUrl(urlToParse) || urlToParse;
    return {
      type: "product_url",
      originalInput: rawInput,
      normalizedUrl: cleanProductUrl,
      targetDomain,
      productUrl: cleanProductUrl,
      metaAdLibraryUrl: canonicalAdLibraryUrl,
    };
  }

  // 5. Pure domain
  return {
    type: "domain",
    originalInput: rawInput,
    normalizedUrl: `https://${targetDomain}`,
    targetDomain,
    metaAdLibraryUrl: canonicalAdLibraryUrl,
  };
}

export function normalizeAddUrlInput(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  const parsed = parseTrackableUrl(rawUrl);
  if (!parsed) return null;

  return parsed.metaAdLibraryUrl;
}

/**
 * Extracts metadata from a Meta Ad Library URL (page_id, display_name, search_type).
 */
export function extractUrlMetadata(rawUrl: string): UrlMetadata {
  const trimmed = rawUrl.trim();
  const normalizedUrl = isMetaAdLibraryUrl(trimmed)
    ? trimmed
    : (normalizeAddUrlInput(trimmed) ?? trimmed);
  let fullUrl = normalizedUrl.match(/^https?:\/\//i)
    ? normalizedUrl
    : `https://${normalizedUrl}`;

  let pageId: string | null = null;
  let displayName: string | null = null;
  let searchType = "unknown";

  try {
    const parsed = new URL(fullUrl);
    if (isMetaAdLibraryUrl(fullUrl)) {
      parsed.searchParams.set("country", "ALL");
      parsed.searchParams.set("is_targeted_country", "false");
      fullUrl = parsed.toString();
    }
    const params = parsed.searchParams;

    // 1. Extract Page ID (view_all_page_id)
    if (params.has("view_all_page_id")) {
      const rawId = params.get("view_all_page_id")?.trim() || "";
      if (isValidPageId(rawId)) {
        pageId = rawId;
      }
    }

    // 2. Extract Query (q)
    const rawQuery = params.get("q")?.trim();

    // 3. Determine Search Type & Display Name
    if (pageId) {
      searchType = "page";
      displayName = rawQuery ? decodeURIComponent(rawQuery) : pageId;
    } else if (rawQuery) {
      const decodedQuery = decodeURIComponent(rawQuery);
      if (
        (decodedQuery.startsWith('"') && decodedQuery.endsWith('"')) ||
        rawQuery.includes("%22")
      ) {
        searchType = "keyword_exact_phrase";
        displayName = decodedQuery.replace(/^"|"$/g, "");
      } else {
        searchType = "keyword_unordered";
        displayName = decodedQuery;
      }
    } else if (params.has("id")) {
      searchType = "ad_id";
      displayName = params.get("id") || "Ad ID";
    }

    if (!displayName) {
      displayName = pageId || resolveTrackableDomain(parsed.hostname) || "Meta Ad Search";
    }
  } catch {
    // If parsing fails, return default metadata
  }

  return {
    url: fullUrl,
    pageId,
    displayName,
    searchType,
  };
}
