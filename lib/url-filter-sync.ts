/**
 * Pure URL Query State Synchronization & Filter Serialization
 *
 * 100% deterministic, zero React / DOM dependencies.
 * Handles parsing, whitelist validation, and bidirectional URL serialization
 * for brand dashboard filters.
 */

export const VALID_STATUSES = [
  "all",
  "success",
  "pending",
  "scanning",
  "failed",
  "unclear",
] as const;

export const VALID_SEARCH_TYPES = [
  "all",
  "page",
  "keyword_exact_phrase",
  "keyword_unordered",
] as const;

export const VALID_TAGS = [
  "all",
  "breakout",
  "scaling",
  "burst",
  "stable",
  "heavy_tester",
  "descaling",
  "moderate",
  "emerging",
  "off_air",
  "inactive",
] as const;

export const VALID_TABS = [
  "active",
  "all",
  "watchlist",
  "high_volume",
  "attention",
  "zero_ads",
  "needs_review",
] as const;

export const VALID_SORT_COLS = [
  "createdAt",
  "displayName",
  "currentResults",
  "lastChecked",
  "lastCreativeScan",
  "status",
  "difference",
] as const;

export const VALID_PAGE_SIZES = [25, 50, 100] as const;

export type BrandStatusFilter = (typeof VALID_STATUSES)[number];
export type BrandSearchTypeFilter = (typeof VALID_SEARCH_TYPES)[number];
export type BrandTagFilter = (typeof VALID_TAGS)[number];
export type BrandTab = (typeof VALID_TABS)[number];
export type BrandSortCol = (typeof VALID_SORT_COLS)[number];
export type BrandSortOrder = "asc" | "desc";
export type BrandPageSize = (typeof VALID_PAGE_SIZES)[number];

export interface BrandDashboardState {
  search: string;
  statusFilter: BrandStatusFilter;
  searchTypeFilter: BrandSearchTypeFilter;
  tagFilter: BrandTagFilter;
  activeTab: BrandTab;
  sortBy: BrandSortCol;
  sortOrder: BrandSortOrder;
  page: number;
  pageSize: BrandPageSize;
}

/**
 * Returns canonical default filter state.
 */
export function getDefaultDashboardState(): BrandDashboardState {
  return {
    search: "",
    statusFilter: "all",
    searchTypeFilter: "all",
    tagFilter: "all",
    activeTab: "active",
    sortBy: "createdAt",
    sortOrder: "desc",
    page: 1,
    pageSize: 25,
  };
}

/**
 * Validates a partial state against strict whitelist enumerations.
 * Any invalid value is cleanly clamped to safe default.
 */
export function sanitizeDashboardState(
  partial: Partial<BrandDashboardState>
): Partial<BrandDashboardState> {
  const result: Partial<BrandDashboardState> = { ...partial };

  if (result.statusFilter && !VALID_STATUSES.includes(result.statusFilter as any)) {
    result.statusFilter = "all";
  }
  if (result.searchTypeFilter && !VALID_SEARCH_TYPES.includes(result.searchTypeFilter as any)) {
    result.searchTypeFilter = "all";
  }
  if (result.tagFilter && !VALID_TAGS.includes(result.tagFilter as any)) {
    result.tagFilter = "all";
  }
  if (result.activeTab && !VALID_TABS.includes(result.activeTab as any)) {
    result.activeTab = "active";
  }
  if (result.sortBy && !VALID_SORT_COLS.includes(result.sortBy as any)) {
    result.sortBy = "createdAt";
  }
  if (result.sortOrder && result.sortOrder !== "asc" && result.sortOrder !== "desc") {
    result.sortOrder = "desc";
  }
  if (result.pageSize && !VALID_PAGE_SIZES.includes(result.pageSize as any)) {
    result.pageSize = 25;
  }
  if (result.page !== undefined) {
    const num = Number(result.page);
    result.page = Number.isFinite(num) && num >= 1 ? Math.floor(num) : 1;
  }
  if (result.search !== undefined) {
    result.search = typeof result.search === "string" ? result.search : "";
  }

  return result;
}

/**
 * Parses URL query params (from string or URLSearchParams) and overlays
 * validated values onto a base state.
 */
export function parseUrlParamsToState(
  input: string | URLSearchParams,
  baseState: BrandDashboardState = getDefaultDashboardState()
): BrandDashboardState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const state: BrandDashboardState = { ...baseState };

  if (params.has("search")) {
    state.search = params.get("search") || "";
  }
  if (params.has("status")) {
    const s = params.get("status");
    if (s && VALID_STATUSES.includes(s as any)) {
      state.statusFilter = s as BrandStatusFilter;
    }
  }
  if (params.has("searchType")) {
    const st = params.get("searchType");
    if (st && VALID_SEARCH_TYPES.includes(st as any)) {
      state.searchTypeFilter = st as BrandSearchTypeFilter;
    }
  }
  if (params.has("tag")) {
    const tg = params.get("tag");
    if (tg && VALID_TAGS.includes(tg as any)) {
      state.tagFilter = tg as BrandTagFilter;
    }
  }
  if (params.has("tab")) {
    const t = params.get("tab");
    if (t && VALID_TABS.includes(t as any)) {
      state.activeTab = t as BrandTab;
    }
  }
  if (params.has("sortBy")) {
    const sb = params.get("sortBy");
    if (sb && VALID_SORT_COLS.includes(sb as any)) {
      state.sortBy = sb as BrandSortCol;
    }
  }
  if (params.has("sortOrder")) {
    const so = params.get("sortOrder");
    if (so === "asc" || so === "desc") {
      state.sortOrder = so;
    }
  }
  if (params.has("page")) {
    const p = Number(params.get("page"));
    state.page = Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
  }
  if (params.has("limit")) {
    const l = Number(params.get("limit"));
    if (VALID_PAGE_SIZES.includes(l as any)) {
      state.pageSize = l as BrandPageSize;
    }
  }

  return state;
}

/**
 * Serializes state into a minimal URLSearchParams instance, omitting
 * default values to keep URLs clean and bookmark-friendly.
 */
export function serializeStateToUrlParams(
  state: BrandDashboardState
): URLSearchParams {
  const query = new URLSearchParams();

  if (state.search && state.search.trim()) {
    query.set("search", state.search.trim());
  }
  if (state.statusFilter && state.statusFilter !== "all" && VALID_STATUSES.includes(state.statusFilter)) {
    query.set("status", state.statusFilter);
  }
  if (state.searchTypeFilter && state.searchTypeFilter !== "all" && VALID_SEARCH_TYPES.includes(state.searchTypeFilter)) {
    query.set("searchType", state.searchTypeFilter);
  }
  if (state.tagFilter && state.tagFilter !== "all" && VALID_TAGS.includes(state.tagFilter)) {
    query.set("tag", state.tagFilter);
  }
  if (state.activeTab && state.activeTab !== "active" && VALID_TABS.includes(state.activeTab)) {
    query.set("tab", state.activeTab);
  }
  if (state.sortBy && state.sortBy !== "createdAt" && VALID_SORT_COLS.includes(state.sortBy)) {
    query.set("sortBy", state.sortBy);
  }
  if (state.sortOrder && state.sortOrder !== "desc") {
    query.set("sortOrder", state.sortOrder);
  }
  if (state.page && state.page > 1) {
    query.set("page", String(state.page));
  }
  if (state.pageSize && state.pageSize !== 25 && VALID_PAGE_SIZES.includes(state.pageSize)) {
    query.set("limit", String(state.pageSize));
  }

  return query;
}

/**
 * Produces clean query string with or without leading '?'
 */
export function buildQueryString(
  state: BrandDashboardState,
  includeLeadingQuestionMark = false
): string {
  const params = serializeStateToUrlParams(state);
  const str = params.toString();
  if (!str) return "";
  return includeLeadingQuestionMark ? `?${str}` : str;
}

