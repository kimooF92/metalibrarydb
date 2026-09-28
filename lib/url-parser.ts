import { isValidPageId } from "./utils";

export interface UrlMetadata {
  url: string;
  pageId: string | null;
  displayName: string | null;
  searchType: string;
}

const META_AD_LIBRARY_HOST = "www.facebook.com";
const META_AD_LIBRARY_PATH = "/ads/library/";
const WEBSITE_DOMAIN_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/?$/i;

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
      country: "TN",
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
        country: "TN",
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
      country: "TN",
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

function normalizeWebsiteDomain(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  const match = trimmed.match(WEBSITE_DOMAIN_REGEX);
  if (!match) return null;

  return match[1].toLowerCase();
}

function buildMetaAdLibrarySearchUrl(domain: string): string {
  const quotedDomain = encodeURIComponent(`"${domain}"`);

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

export function normalizeAddUrlInput(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (isMetaAdLibraryUrl(trimmed)) {
    return trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
  }

  const domain = normalizeWebsiteDomain(trimmed);
  if (!domain) return null;

  return buildMetaAdLibrarySearchUrl(domain);
}

const META_AD_LIBRARY_URL_PREFIX = `https://${META_AD_LIBRARY_HOST}${META_AD_LIBRARY_PATH}`;

/**
 * Extracts metadata from a Meta Ad Library URL (page_id, display_name, search_type).
 */
export function extractUrlMetadata(rawUrl: string): UrlMetadata {
  const normalizedUrl = normalizeAddUrlInput(rawUrl) ?? rawUrl.trim();
  const fullUrl = normalizedUrl.match(/^https?:\/\//i)
    ? normalizedUrl
    : `https://${normalizedUrl}`;

  let pageId: string | null = null;
  let displayName: string | null = null;
  let searchType = "unknown";

  try {
    const parsed = new URL(fullUrl);
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
      displayName = pageId || normalizeWebsiteDomain(rawUrl) || "Meta Ad Search";
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
