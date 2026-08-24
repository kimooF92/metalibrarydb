"use client";

import { useState, useEffect, useCallback } from "react";
import { Ad, AdSpyStats, AdFilterParams, PaginationMeta, BrandOption } from "@/types";

const VALID_SPY_STATUSES = ["all", "active", "inactive", "archived", "unknown"] as const;
const VALID_SPY_MEDIA = ["all", "video", "image", "carousel"] as const;
const VALID_SPY_SORTS = [
  "started_running_on",
  "duplication_count",
  "winner_score",
  "product_creatives",
  "first_seen_at",
  "oldest",
  "recently_observed",
  "first_seen",
  "last_seen",
  "page_name",
] as const;

async function parseJsonResponse<T = any>(res: Response, fallbackMessage: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";

  if (res.status === 401 || res.status === 403) {
    if (typeof window !== "undefined") {
      window.location.href = `/login?from=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new Error("Authentication required. Redirecting to login...");
  }

  if (contentType.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || data?.message || `${fallbackMessage} (Status ${res.status})`);
    }
    return data;
  }

  const text = await res.text();
  if (text.includes("<!DOCTYPE") || text.includes("<html")) {
    if (text.includes("login") || res.status === 401) {
      if (typeof window !== "undefined") {
        window.location.href = `/login?from=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      }
      throw new Error("Session expired. Redirecting to login...");
    }
    throw new Error(`Server returned HTML error (${res.status} ${res.statusText || ""}). Please reload the page.`);
  }

  throw new Error(`${fallbackMessage} (${res.status}): ${text.slice(0, 100)}`);
}

function getInitialSpyParams(initialParams?: AdFilterParams): AdFilterParams {
  const defaults: AdFilterParams = {
    page: 1,
    limit: 24,
    minDuplications: 1,
    minWinnerScore: 0,
    minProductCreatives: 0,
    mediaType: "all",
    status: "all",
    sortBy: "started_running_on",
    sortOrder: "desc",
    enabled: true,
    excludePageIds: [],
    ...initialParams,
  };

  if (typeof window === "undefined") return defaults;

  try {
    // 1. Load saved state from localStorage / sessionStorage
    let saved: Partial<AdFilterParams> = {};
    const rawSaved =
      localStorage.getItem("spy_feed_filters") ||
      sessionStorage.getItem("spy_feed_filters");

    if (rawSaved) {
      try {
        saved = JSON.parse(rawSaved);
      } catch {}
    }

    // 2. Read URL Search Parameters (URL takes highest priority)
    const url = new URL(window.location.href);
    const searchParams = url.searchParams;

    const trackedPageId = searchParams.get("trackedPageId") || searchParams.get("pageId") || saved.trackedPageId;
    const search = searchParams.get("search") || searchParams.get("q") || saved.search;
    const dateFrom = searchParams.get("dateFrom") || saved.dateFrom;
    const dateTo = searchParams.get("dateTo") || saved.dateTo;
    const minDays = searchParams.get("minDaysRunning")
      ? parseInt(searchParams.get("minDaysRunning")!, 10)
      : saved.minDaysRunning;
    const minDups = searchParams.get("minDuplications")
      ? parseInt(searchParams.get("minDuplications")!, 10)
      : saved.minDuplications;
    const minWinner = searchParams.get("minWinnerScore")
      ? parseInt(searchParams.get("minWinnerScore")!, 10)
      : saved.minWinnerScore;
    const minCreatives = searchParams.get("minProductCreatives")
      ? parseInt(searchParams.get("minProductCreatives")!, 10)
      : saved.minProductCreatives;
    const prodKey = searchParams.get("productKey") || saved.productKey;
    const prodId = searchParams.get("productId") || saved.productId;
    const rawMediaType = searchParams.get("mediaType") || saved.mediaType;
    const rawStatus = searchParams.get("status") || saved.status;
    const cta = searchParams.get("ctaText") || saved.ctaText;
    const watchlisted =
      searchParams.get("isWatchlisted") === "true" ||
      searchParams.get("watchlist") === "true" ||
      saved.isWatchlisted;
    const rawPreset = searchParams.get("smartPreset") || searchParams.get("preset") || saved.smartPreset;
    const rawSort = searchParams.get("sortBy") || saved.sortBy;
    const rawOrder = (searchParams.get("sortOrder") as "asc" | "desc") || saved.sortOrder;
    const rawGroupBy = searchParams.get("groupBy") as "none" | "creative" | undefined;
    const rawExclude = searchParams.get("excludePageIds");

    return {
      ...defaults,
      ...saved,
      page: searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : defaults.limit,
      trackedPageId: trackedPageId || undefined,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      minDaysRunning: typeof minDays === "number" && !isNaN(minDays) ? minDays : defaults.minDaysRunning,
      minDuplications: typeof minDups === "number" && !isNaN(minDups) ? minDups : defaults.minDuplications,
      minWinnerScore: typeof minWinner === "number" && !isNaN(minWinner) ? minWinner : defaults.minWinnerScore,
      minProductCreatives: typeof minCreatives === "number" && !isNaN(minCreatives) ? minCreatives : defaults.minProductCreatives,
      productKey: prodKey || undefined,
      productId: prodId || undefined,
      mediaType: VALID_SPY_MEDIA.includes(rawMediaType as any) ? (rawMediaType as any) : defaults.mediaType,
      status: VALID_SPY_STATUSES.includes(rawStatus as any) ? (rawStatus as any) : defaults.status,
      ctaText: cta || undefined,
      isWatchlisted: typeof watchlisted === "boolean" ? watchlisted : defaults.isWatchlisted,
      smartPreset: (rawPreset as any) || defaults.smartPreset,
      sortBy: VALID_SPY_SORTS.includes(rawSort as any) ? (rawSort as any) : defaults.sortBy,
      sortOrder: rawOrder === "asc" || rawOrder === "desc" ? rawOrder : defaults.sortOrder,
      groupBy: rawGroupBy || (saved.groupBy as any) || "none",
      excludePageIds: rawExclude ? rawExclude.split(",").map((s) => s.trim()).filter(Boolean) : (saved.excludePageIds || []),
    };
  } catch (e) {
    console.error("Failed to parse initial spy params:", e);
    return defaults;
  }
}

function syncSpyParamsToUrlAndStorage(params: AdFilterParams) {
  if (typeof window === "undefined") return;

  try {
    // Save to localStorage
    const toSave: Partial<AdFilterParams> = {
      trackedPageId: params.trackedPageId,
      search: params.search,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      minDaysRunning: params.minDaysRunning,
      minDuplications: params.minDuplications,
      minWinnerScore: params.minWinnerScore,
      minProductCreatives: params.minProductCreatives,
      productKey: params.productKey,
      productId: params.productId,
      mediaType: params.mediaType,
      status: params.status,
      ctaText: params.ctaText,
      isWatchlisted: params.isWatchlisted,
      smartPreset: params.smartPreset,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      groupBy: params.groupBy,
      excludePageIds: params.excludePageIds,
    };
    localStorage.setItem("spy_feed_filters", JSON.stringify(toSave));

    // Update URL query params smoothly without full reload
    const url = new URL(window.location.href);

    if (params.page && params.page > 1) {
      url.searchParams.set("page", params.page.toString());
    } else {
      url.searchParams.delete("page");
    }

    if (params.trackedPageId) url.searchParams.set("trackedPageId", params.trackedPageId);
    else url.searchParams.delete("trackedPageId");

    if (params.search) url.searchParams.set("search", params.search);
    else url.searchParams.delete("search");

    if (params.dateFrom) url.searchParams.set("dateFrom", params.dateFrom);
    else url.searchParams.delete("dateFrom");

    if (params.dateTo) url.searchParams.set("dateTo", params.dateTo);
    else url.searchParams.delete("dateTo");

    if (params.minDaysRunning && params.minDaysRunning > 0) {
      url.searchParams.set("minDaysRunning", params.minDaysRunning.toString());
    } else {
      url.searchParams.delete("minDaysRunning");
    }

    if (params.minDuplications && params.minDuplications > 1) {
      url.searchParams.set("minDuplications", params.minDuplications.toString());
    } else {
      url.searchParams.delete("minDuplications");
    }

    if (params.minWinnerScore && params.minWinnerScore > 0) {
      url.searchParams.set("minWinnerScore", params.minWinnerScore.toString());
    } else {
      url.searchParams.delete("minWinnerScore");
    }

    if (params.minProductCreatives && params.minProductCreatives > 0) {
      url.searchParams.set("minProductCreatives", params.minProductCreatives.toString());
    } else {
      url.searchParams.delete("minProductCreatives");
    }

    if (params.productKey) url.searchParams.set("productKey", params.productKey);
    else url.searchParams.delete("productKey");

    if (params.productId) url.searchParams.set("productId", params.productId);
    else url.searchParams.delete("productId");

    if (params.mediaType && params.mediaType !== "all") {
      url.searchParams.set("mediaType", params.mediaType);
    } else {
      url.searchParams.delete("mediaType");
    }

    if (params.status && params.status !== "all") {
      url.searchParams.set("status", params.status);
    } else {
      url.searchParams.delete("status");
    }

    if (params.ctaText && params.ctaText !== "all") {
      url.searchParams.set("ctaText", params.ctaText);
    } else {
      url.searchParams.delete("ctaText");
    }

    if (params.isWatchlisted) {
      url.searchParams.set("isWatchlisted", "true");
    } else {
      url.searchParams.delete("isWatchlisted");
    }

    if (params.excludePageIds && params.excludePageIds.length > 0) {
      url.searchParams.set("excludePageIds", params.excludePageIds.join(","));
    } else {
      url.searchParams.delete("excludePageIds");
    }

    if (params.smartPreset && params.smartPreset !== "all") {
      url.searchParams.set("smartPreset", params.smartPreset);
    } else {
      url.searchParams.delete("smartPreset");
    }

    if (params.sortBy && params.sortBy !== "started_running_on") {
      url.searchParams.set("sortBy", params.sortBy);
    } else {
      url.searchParams.delete("sortBy");
    }

    if (params.sortOrder && params.sortOrder !== "desc") {
      url.searchParams.set("sortOrder", params.sortOrder);
    } else {
      url.searchParams.delete("sortOrder");
    }

    if (params.groupBy && params.groupBy !== "none") {
      url.searchParams.set("groupBy", params.groupBy);
    } else {
      url.searchParams.delete("groupBy");
    }

    window.history.replaceState({}, "", url.toString());
  } catch (e) {
    console.error("Failed to sync spy params:", e);
  }
}

export function useSpy(initialParams?: AdFilterParams) {
  const [params, setParams] = useState<AdFilterParams>(() => getInitialSpyParams(initialParams));

  // Sync state if initialParams props explicitly update
  useEffect(() => {
    if (initialParams) {
      setParams((prev) => ({
        ...prev,
        ...initialParams,
      }));
    }
  }, [
    initialParams?.trackedPageId,
    initialParams?.search,
    initialParams?.mediaType,
    initialParams?.status,
    initialParams?.ctaText,
    initialParams?.sortBy,
    initialParams?.sortOrder,
    initialParams?.isWatchlisted,
    initialParams?.smartPreset,
    initialParams?.minWinnerScore,
    initialParams?.minProductCreatives,
    initialParams?.productKey,
    initialParams?.groupBy,
    initialParams?.excludePageIds,
  ]);

  const [ads, setAds] = useState<Ad[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 24,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async (isManualRefresh = false) => {
    if (params.enabled === false) {
      setIsLoading(false);
      setIsFetchingMore(false);
      setIsRefreshing(false);
      return;
    }

    const currentPage = isManualRefresh ? 1 : (params.page || 1);
    if (isManualRefresh) {
      setIsRefreshing(true);
      setIsLoading(true);
    } else if (currentPage === 1) {
      setIsLoading(true);
      setIsFetchingMore(false);
    } else {
      setIsFetchingMore(true);
    }
    setError(null);

    try {
      // If manual refresh, asynchronously trigger background Apify run check
      if (isManualRefresh) {
        fetch("/api/spy/scans/sync", { method: "POST" }).catch(() => {});
      }

      const query = new URLSearchParams();
      if (params.trackedPageId) query.set("trackedPageId", params.trackedPageId);
      if (params.search) query.set("search", params.search);
      if (params.dateFrom) query.set("dateFrom", params.dateFrom);
      if (params.dateTo) query.set("dateTo", params.dateTo);
      if (params.minDaysRunning && params.minDaysRunning > 0) {
        query.set("minDaysRunning", params.minDaysRunning.toString());
      }
      if (params.minDuplications && params.minDuplications > 1) {
        query.set("minDuplications", params.minDuplications.toString());
      }
      if (params.minWinnerScore && params.minWinnerScore > 0) {
        query.set("minWinnerScore", params.minWinnerScore.toString());
      }
      if (params.minProductCreatives && params.minProductCreatives > 0) {
        query.set("minProductCreatives", params.minProductCreatives.toString());
      }
      if (params.productKey) query.set("productKey", params.productKey);
      if (params.productId) query.set("productId", params.productId);
      if (params.groupBy && params.groupBy !== "none") query.set("groupBy", params.groupBy);
      if (params.mediaType && params.mediaType !== "all") query.set("mediaType", params.mediaType);
      if (params.status && params.status !== "all") query.set("status", params.status);
      if (params.ctaText && params.ctaText !== "all") query.set("ctaText", params.ctaText);
      if (params.isWatchlisted) query.set("isWatchlisted", "true");
      if (params.excludePageIds && params.excludePageIds.length > 0) {
        query.set("excludePageIds", params.excludePageIds.join(","));
      }
      if (params.smartPreset && params.smartPreset !== "all") query.set("smartPreset", params.smartPreset);
      if (params.sortBy) query.set("sortBy", params.sortBy);
      if (params.sortOrder) query.set("sortOrder", params.sortOrder);
      query.set("page", currentPage.toString());
      query.set("limit", (params.limit || 24).toString());
      query.set("_t", Date.now().toString()); // Cache buster

      const res = await fetch(`/api/spy/ads?${query.toString()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Accept: "application/json" },
      });
      const data = await parseJsonResponse(res, "Failed to fetch ad feed");

      const newItems = data.items || [];
      if (currentPage > 1 && !isManualRefresh) {
        setAds((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const filteredNew = newItems.filter((item: Ad) => !existingIds.has(item.id));
          return [...prev, ...filteredNew];
        });
      } else {
        setAds(newItems);
      }
      setPagination(data.pagination || { page: 1, limit: 24, total: 0, totalPages: 0 });
    } catch (err: any) {
      setError(err.message || "Failed to fetch ad feed");
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
      setIsRefreshing(false);
    }
  }, [params]);

  useEffect(() => {
    fetchFeed(false);
  }, [fetchFeed]);

  const updateFilters = useCallback((newParams: Partial<AdFilterParams>) => {
    setParams((prev) => {
      const next = {
        ...prev,
        ...newParams,
        page: newParams.page !== undefined ? newParams.page : 1, // Reset to page 1 on filter change
      };
      syncSpyParamsToUrlAndStorage(next);
      return next;
    });
  }, []);

  const updateAdInFeed = useCallback((updatedAd: Ad) => {
    setAds((prev) => prev.map((item) => (item.id === updatedAd.id ? { ...item, ...updatedAd } : item)));
  }, []);

  const refetch = useCallback(() => {
    return fetchFeed(true);
  }, [fetchFeed]);

  return {
    ads,
    pagination,
    isLoading,
    isFetchingMore,
    isRefreshing,
    error,
    params,
    updateFilters,
    updateAdInFeed,
    refetch,
  };
}

export function useAdStats() {
  const [stats, setStats] = useState<AdSpyStats>({
    totalAdsCaptured: 0,
    launchedLast7Days: 0,
    scaledAdsCount: 0,
    mediaDistribution: { image: 0, video: 0, carousel: 0, other: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/spy/stats?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Accept: "application/json" },
      });
      const data = await parseJsonResponse(res, "Failed to fetch ad stats");
      setStats(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch ad stats");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, error, refetch: fetchStats };
}

export function useEnqueueScan() {
  const [isEnqueueing, setIsEnqueueing] = useState(false);

  const enqueueScan = async (trackedPageIds: string[], onRefresh?: (ids: string[]) => void) => {
    setIsEnqueueing(true);
    try {
      const res = await fetch("/api/spy/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ trackedPageIds }),
      });
      const data = await parseJsonResponse(res, "Failed to enqueue scan");
      if (onRefresh) {
        onRefresh(trackedPageIds);
      }
      return data;
    } finally {
      setIsEnqueueing(false);
    }
  };

  return { enqueueScan, isEnqueueing };
}

export function useSpyBrands() {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBrands = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spy/brands", {
        headers: { Accept: "application/json" },
      });
      const data = await parseJsonResponse(res, "Failed to fetch brands");
      setBrands(data.brands || []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch brands");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  return { brands, isLoading, error, refetch: fetchBrands };
}

export const useAdFeed = useSpy;

