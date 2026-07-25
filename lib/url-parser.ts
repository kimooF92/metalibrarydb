export interface UrlMetadata {
  url: string;
  pageId: string | null;
  displayName: string | null;
  searchType: string;
}

/**
 * Extracts metadata from a Meta Ad Library URL (page_id, display_name, search_type).
 */
export function extractUrlMetadata(rawUrl: string): UrlMetadata {
  const url = rawUrl.trim();
  const fullUrl = url.match(/^https?:\/\//i) ? url : `https://${url}`;

  let pageId: string | null = null;
  let displayName: string | null = null;
  let searchType = "unknown";

  try {
    const parsed = new URL(fullUrl);
    const params = parsed.searchParams;

    // 1. Extract Page ID (view_all_page_id)
    if (params.has("view_all_page_id")) {
      pageId = params.get("view_all_page_id")?.trim() || null;
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
      displayName = pageId || "Meta Ad Search";
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
