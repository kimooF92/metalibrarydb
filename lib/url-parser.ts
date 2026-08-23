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

function isMetaAdLibraryUrl(url: string): boolean {
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
