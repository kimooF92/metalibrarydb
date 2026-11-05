"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  type BrandDashboardState,
  type BrandStatusFilter,
  type BrandSearchTypeFilter,
  type BrandTagFilter,
  type BrandTab,
  type BrandSortCol,
  type BrandSortOrder,
  type BrandPageSize,
  VALID_STATUSES,
  VALID_SEARCH_TYPES,
  VALID_TAGS,
  VALID_TABS,
  VALID_SORT_COLS,
  VALID_PAGE_SIZES,
  getDefaultDashboardState,
  sanitizeDashboardState,
  parseUrlParamsToState,
  serializeStateToUrlParams,
} from "@/lib/url-filter-sync";
import {
  readStoredFilterState,
  writeStoredFilterState,
  clearStoredFilterState,
} from "@/lib/filter-storage";

export function getInitialDashboardState(): BrandDashboardState {
  const defaults = getDefaultDashboardState();
  if (typeof window === "undefined") return defaults;

  try {
    const saved = readStoredFilterState<BrandDashboardState>() || {};
    const sanitized = sanitizeDashboardState(saved);
    const base = { ...defaults, ...sanitized };
    return parseUrlParamsToState(window.location.search, base);
  } catch (e) {
    console.error("Error reading dashboard params:", e);
  }

  return defaults;
}

export function syncDashboardStateToUrl(state: BrandDashboardState) {
  if (typeof window === "undefined") return;
  try {
    const queryString = serializeStateToUrlParams(state).toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);

    writeStoredFilterState(state);
  } catch (e) {
    console.error("Error syncing dashboard state:", e);
  }
}

export function useBrandsFilters() {
  const searchParams = useSearchParams();
  const [initialLoaded] = useState(() => getInitialDashboardState());

  const [search, setSearchState] = useState(initialLoaded.search);
  const [statusFilter, setStatusFilterState] = useState<BrandStatusFilter>(initialLoaded.statusFilter);
  const [searchTypeFilter, setSearchTypeFilterState] = useState<BrandSearchTypeFilter>(initialLoaded.searchTypeFilter);
  const [tagFilter, setTagFilterState] = useState<BrandTagFilter>(initialLoaded.tagFilter);
  const [activeTab, setActiveTabState] = useState<BrandTab>(initialLoaded.activeTab);
  const [sortBy, setSortByState] = useState<BrandSortCol>(initialLoaded.sortBy);
  const [sortOrder, setSortOrderState] = useState<BrandSortOrder>(initialLoaded.sortOrder);
  const [page, setPageState] = useState<number>(initialLoaded.page);
  const [pageSize, setPageSizeState] = useState<BrandPageSize>(initialLoaded.pageSize);
  const [hasPendingReSort, setHasPendingReSort] = useState(false);

  // Sync state when URL query params change (router navigation, back/forward, deep links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("search")) {
      setSearchState(urlParams.get("search") || "");
    }
    if (urlParams.has("status")) {
      const s = urlParams.get("status");
      if (s && VALID_STATUSES.includes(s as any)) setStatusFilterState(s as BrandStatusFilter);
    }
    if (urlParams.has("searchType")) {
      const st = urlParams.get("searchType");
      if (st && VALID_SEARCH_TYPES.includes(st as any)) setSearchTypeFilterState(st as BrandSearchTypeFilter);
    }
    if (urlParams.has("tag")) {
      const tg = urlParams.get("tag");
      if (tg && VALID_TAGS.includes(tg as any)) setTagFilterState(tg as BrandTagFilter);
    }
    if (urlParams.has("tab")) {
      const t = urlParams.get("tab");
      if (t && VALID_TABS.includes(t as any)) setActiveTabState(t as BrandTab);
    }
    if (urlParams.has("sortBy")) {
      const sb = urlParams.get("sortBy");
      if (sb && VALID_SORT_COLS.includes(sb as any)) setSortByState(sb as BrandSortCol);
    }
    if (urlParams.has("sortOrder")) {
      const so = urlParams.get("sortOrder");
      if (so === "asc" || so === "desc") setSortOrderState(so);
    }
    if (urlParams.has("page")) {
      setPageState(Math.max(1, Number(urlParams.get("page")) || 1));
    }
    if (urlParams.has("limit")) {
      const l = Number(urlParams.get("limit"));
      if (VALID_PAGE_SIZES.includes(l as any)) setPageSizeState(l as BrandPageSize);
    }
  }, [searchParams]);

  // Sync state to URL and session storage
  useEffect(() => {
    syncDashboardStateToUrl({
      search,
      statusFilter,
      searchTypeFilter,
      tagFilter,
      activeTab,
      sortBy,
      sortOrder,
      page,
      pageSize,
    });
  }, [search, statusFilter, searchTypeFilter, tagFilter, activeTab, sortBy, sortOrder, page, pageSize]);

  // Sync on browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const init = getInitialDashboardState();
      setSearchState(init.search);
      setStatusFilterState(init.statusFilter);
      setSearchTypeFilterState(init.searchTypeFilter);
      setTagFilterState(init.tagFilter);
      setActiveTabState(init.activeTab);
      setSortByState(init.sortBy);
      setSortOrderState(init.sortOrder);
      setPageState(init.page);
      setPageSizeState(init.pageSize);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleSortChange = useCallback((col: string) => {
    setHasPendingReSort(false);
    if (col === sortBy) {
      setSortOrderState((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortByState(col as BrandSortCol);
      setSortOrderState("desc");
    }
    setPageState(1);
  }, [sortBy]);

  const handleResetFilters = useCallback(() => {
    setHasPendingReSort(false);
    setSearchState("");
    setStatusFilterState("all");
    setSearchTypeFilterState("all");
    setTagFilterState("all");
    setActiveTabState("active");
    setSortByState("createdAt");
    setSortOrderState("desc");
    setPageState(1);
    clearStoredFilterState();
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const setSearch = useCallback((val: string) => {
    setSearchState(val);
    setPageState(1);
  }, []);

  const setStatusFilter = useCallback((val: BrandStatusFilter) => {
    setStatusFilterState(val);
    setPageState(1);
  }, []);

  const setSearchTypeFilter = useCallback((val: BrandSearchTypeFilter) => {
    setSearchTypeFilterState(val);
    setPageState(1);
  }, []);

  const setTagFilter = useCallback((val: BrandTagFilter) => {
    setTagFilterState(val);
    setPageState(1);
  }, []);

  const setActiveTab = useCallback((val: BrandTab) => {
    setActiveTabState(val);
    setPageState(1);
  }, []);

  const setPage = useCallback((p: number) => {
    setPageState(p);
  }, []);

  const setPageSize = useCallback((size: BrandPageSize) => {
    setPageSizeState(size);
    setPageState(1);
  }, []);

  const filters = useMemo(
    () => ({
      search,
      statusFilter,
      searchTypeFilter,
      tagFilter,
      activeTab,
      sortBy,
      sortOrder,
      page,
      pageSize,
    }),
    [search, statusFilter, searchTypeFilter, tagFilter, activeTab, sortBy, sortOrder, page, pageSize]
  );

  return {
    filters,
    hasPendingReSort,
    setHasPendingReSort,
    setSearch,
    setStatusFilter,
    setSearchTypeFilter,
    setTagFilter,
    setActiveTab,
    setSortBy: setSortByState,
    setSortOrder: setSortOrderState,
    setPage,
    setPageSize,
    handleSortChange,
    handleResetFilters,
  };
}

