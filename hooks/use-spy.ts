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

    if (saved.status && !VALID_SPY_STATUSES.includes(saved.status as any)) {
      delete saved.status;
    }
    if (saved.mediaType && !VALID_SPY_MEDIA.includes(saved.mediaType as any)) {
      delete saved.mediaType;
    }
    if (saved.sortBy && !VALID_SPY_SORTS.includes(saved.sortBy as any)) {
      delete saved.sortBy;
    }
    if (saved.sortOrder && saved.sortOrder !== "asc" && saved.sortOrder !== "desc") {
      delete saved.sortOrder;
    }

    // Check dedicated brand exclusions storage for robust cross-tab persistence
    const savedExcluded = localStorage.getItem("spy_excluded_brands");
    if (savedExcluded) {
      try {
        const parsed = JSON.parse(savedExcluded);
        if (Array.isArray(parsed) && parsed.length > 0) {
          saved.excludePageIds = parsed;
        }
      } catch {}
    }

    // Merge defaults + saved
    const state: AdFilterParams = {
      ...defaults,
      ...saved,
      ...initialParams,
    };

    // 2. Overlay individual URL query parameters if present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("search")) state.search = urlParams.get("search") || "";
    if (urlParams.has("smartPreset")) state.smartPreset = urlParams.get("smartPreset") || undefined;
    if (urlParams.has("mediaType")) {
      const mt = urlParams.get("mediaType");
      state.mediaType = mt && VALID_SPY_MEDIA.includes(mt as any) ? (mt as any) : "all";
    }
    if (urlParams.has("status")) {
      const s = urlParams.get("status");
      state.status = s && VALID_SPY_STATUSES.includes(s as any) ? (s as any) : "all";
    }
    if (urlParams.has("ctaText")) state.ctaText = urlParams.get("ctaText") || undefined;
    if (urlParams.has("minDaysRunning")) state.minDaysRunning = Number(urlParams.get("minDaysRunning")) || 0;
    if (urlParams.has("minDuplications")) state.minDuplications = Number(urlParams.get("minDuplications")) || 1;
    if (urlParams.has("minWinnerScore")) state.minWinnerScore = Number(urlParams.get("minWinnerScore")) || 0;
    if (urlParams.has("minProductCreatives")) state.minProductCreatives = Number(urlParams.get("minProductCreatives")) || 0;
    if (urlParams.has("productKey")) state.productKey = urlParams.get("productKey") || undefined;
    if (urlParams.has("groupBy")) {
      const gb = urlParams.get("groupBy");
      state.groupBy = gb === "creative" ? "creative" : "none";
    }
    if (urlParams.has("isWatchlisted")) state.isWatchlisted = urlParams.get("isWatchlisted") === "true";
    if (urlParams.has("sortBy")) {
      const sb = urlParams.get("sortBy");
      state.sortBy = sb && VALID_SPY_SORTS.includes(sb as any) ? (sb as any) : "started_running_on";
    }
    if (urlParams.has("sortOrder")) {
      const so = urlParams.get("sortOrder");
      state.sortOrder = so === "asc" ? "asc" : "desc";
    }
    if (urlParams.has("dateFrom")) state.dateFrom = urlParams.get("dateFrom") || undefined;
    if (urlParams.has("dateTo")) state.dateTo = urlParams.get("dateTo") || undefined;
    if (urlParams.has("excludePageIds")) {
      state.excludePageIds = urlParams
        .get("excludePageIds")!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (urlParams.has("page")) state.page = Math.max(1, Number(urlParams.get("page")) || 1);

    return state;
  } catch (e) {
    console.error("Error reading initial spy params:", e);
  }

  return defaults;
}

function syncSpyParamsToUrlAndStorage(params: AdFilterParams) {
  if (typeof window === "undefined") return;
  try {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.smartPreset && params.smartPreset !== "all") query.set("smartPreset", params.smartPreset);
    if (params.mediaType && params.mediaType !== "all") query.set("mediaType", params.mediaType);
    if (params.status && params.status !== "all") query.set("status", params.status);
    if (params.ctaText && params.ctaText !== "all") query.set("ctaText", params.ctaText);
    if (params.minDaysRunning && params.minDaysRunning > 0) query.set("minDaysRunning", String(params.minDaysRunning));
    if (params.minDuplications && params.minDuplications > 1) query.set("minDuplications", String(params.minDuplications));
    if (params.minWinnerScore && params.minWinnerScore > 0) query.set("minWinnerScore", String(params.minWinnerScore));
    if (params.minProductCreatives && params.minProductCreatives > 0) query.set("minProductCreatives", String(params.minProductCreatives));
    if (params.productKey) query.set("productKey", params.productKey);
    if (params.groupBy && params.groupBy !== "none") query.set("groupBy", params.groupBy);
    if (params.isWatchlisted) query.set("isWatchlisted", "true");
    if (params.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params.dateTo) query.set("dateTo", params.dateTo);
    if (params.excludePageIds && params.excludePageIds.length > 0) query.set("excludePageIds", params.excludePageIds.join(","));
    if (params.sortBy) query.set("sortBy", params.sortBy);
    if (params.sortOrder) query.set("sortOrder", params.sortOrder);
    if (params.page && params.page > 1) query.set("page", String(params.page));

    const queryString = query.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);

    const payload = JSON.stringify({
      search: params.search,
      smartPreset: params.smartPreset,
      mediaType: params.mediaType,
      status: params.status,
      ctaText: params.ctaText,
      minDaysRunning: params.minDaysRunning,
      minDuplications: params.minDuplications,
      minWinnerScore: params.minWinnerScore,
      groupBy: params.groupBy,
      isWatchlisted: params.isWatchlisted,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      excludePageIds: params.excludePageIds || [],
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      page: params.page,
    });

    sessionStorage.setItem("spy_feed_filters", payload);
    localStorage.setItem("spy_feed_filters", payload);

    // Save dedicated excluded brands list into localStorage
    localStorage.setItem("spy_excluded_brands", JSON.stringify(params.excludePageIds || []));
  } catch (e) {
    console.error("Error syncing spy params:", e);
  }
}

export function useAdFeed(initialParams?: AdFilterParams) {
  const [params, setParams] = useState<AdFilterParams>(() => getInitialSpyParams(initialParams));

  // Sync on browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setParams(getInitialSpyParams(initialParams));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialParams]);

  useEffect(() => {
    if (initialParams) {
      setParams((prev) => {
        const hasChanged =
          prev.trackedPageId !== initialParams.trackedPageId ||
          prev.limit !== initialParams.limit ||
          prev.enabled !== initialParams.enabled ||
          prev.search !== initialParams.search ||
          prev.status !== initialParams.status ||
          prev.mediaType !== initialParams.mediaType ||
          prev.ctaText !== initialParams.ctaText ||
          prev.isWatchlisted !== initialParams.isWatchlisted ||
          prev.smartPreset !== initialParams.smartPreset ||
          prev.minWinnerScore !== initialParams.minWinnerScore ||
          prev.minProductCreatives !== initialParams.minProductCreatives ||
          prev.productKey !== initialParams.productKey ||
          prev.groupBy !== initialParams.groupBy ||
          JSON.stringify(prev.excludePageIds) !== JSON.stringify(initialParams.excludePageIds);

        if (hasChanged) {
          const next = {
            ...prev,
            ...initialParams,
            page: initialParams.page !== undefined ? initialParams.page : 1,
          };
          syncSpyParamsToUrlAndStorage(next);
          return next;
        }
        return prev;
      });
    }
  }, [
    initialParams?.trackedPageId,
    initialParams?.limit,
    initialParams?.enabled,
    initialParams?.search,
    initialParams?.status,
    initialParams?.mediaType,
    initialParams?.ctaText,
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
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch ad feed");
      }

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
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch ad stats");
      }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackedPageIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to enqueue scan");
      }
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
      const res = await fetch("/api/spy/brands");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch brands");
      }
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

