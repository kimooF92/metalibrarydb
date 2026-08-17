"use client";

import { useState, useEffect, useCallback } from "react";
import { Ad, AdSpyStats, AdFilterParams, PaginationMeta, BrandOption } from "@/types";

function getInitialSpyParams(initialParams?: AdFilterParams): AdFilterParams {
  const defaults: AdFilterParams = {
    page: 1,
    limit: 24,
    minDuplications: 1,
    mediaType: "all",
    status: "all",
    sortBy: "started_running_on",
    sortOrder: "desc",
    enabled: true,
    ...initialParams,
  };

  if (typeof window === "undefined") return defaults;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hasAnyUrlParam =
      urlParams.has("search") ||
      urlParams.has("smartPreset") ||
      urlParams.has("mediaType") ||
      urlParams.has("status") ||
      urlParams.has("ctaText") ||
      urlParams.has("minDaysRunning") ||
      urlParams.has("minDuplications") ||
      urlParams.has("isWatchlisted") ||
      urlParams.has("sortBy") ||
      urlParams.has("sortOrder") ||
      urlParams.has("dateFrom") ||
      urlParams.has("dateTo") ||
      urlParams.has("excludePageIds") ||
      urlParams.has("page");

    if (hasAnyUrlParam) {
      return {
        ...defaults,
        search: urlParams.get("search") || defaults.search || "",
        smartPreset: urlParams.get("smartPreset") || defaults.smartPreset,
        mediaType: (urlParams.get("mediaType") as any) || defaults.mediaType,
        status: (urlParams.get("status") as any) || defaults.status,
        ctaText: urlParams.get("ctaText") || defaults.ctaText,
        minDaysRunning: urlParams.has("minDaysRunning") ? Number(urlParams.get("minDaysRunning")) : defaults.minDaysRunning,
        minDuplications: urlParams.has("minDuplications") ? Number(urlParams.get("minDuplications")) : defaults.minDuplications,
        isWatchlisted: urlParams.get("isWatchlisted") === "true",
        sortBy: (urlParams.get("sortBy") as any) || defaults.sortBy,
        sortOrder: (urlParams.get("sortOrder") as any) || defaults.sortOrder,
        dateFrom: urlParams.get("dateFrom") || defaults.dateFrom,
        dateTo: urlParams.get("dateTo") || defaults.dateTo,
        excludePageIds: urlParams.get("excludePageIds") ? urlParams.get("excludePageIds")!.split(",").filter(Boolean) : defaults.excludePageIds,
        page: urlParams.has("page") ? Number(urlParams.get("page")) : defaults.page,
      };
    }

    const saved = sessionStorage.getItem("spy_feed_filters");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaults,
        ...parsed,
        page: parsed.page || defaults.page,
      };
    }
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
    if (params.isWatchlisted) query.set("isWatchlisted", "true");
    if (params.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params.dateTo) query.set("dateTo", params.dateTo);
    if (params.excludePageIds && params.excludePageIds.length > 0) query.set("excludePageIds", params.excludePageIds.join(","));
    if (params.sortBy && params.sortBy !== "started_running_on") query.set("sortBy", params.sortBy);
    if (params.sortOrder && params.sortOrder !== "desc") query.set("sortOrder", params.sortOrder);
    if (params.page && params.page > 1) query.set("page", String(params.page));

    const queryString = query.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);

    sessionStorage.setItem("spy_feed_filters", JSON.stringify({
      search: params.search,
      smartPreset: params.smartPreset,
      mediaType: params.mediaType,
      status: params.status,
      ctaText: params.ctaText,
      minDaysRunning: params.minDaysRunning,
      minDuplications: params.minDuplications,
      isWatchlisted: params.isWatchlisted,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      excludePageIds: params.excludePageIds,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      page: params.page,
    }));
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
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    if (params.enabled === false) {
      setIsLoading(false);
      setIsFetchingMore(false);
      return;
    }

    const currentPage = params.page || 1;
    if (ads.length === 0 || currentPage === 1) {
      setIsLoading(ads.length === 0);
      setIsFetchingMore(ads.length > 0);
    } else {
      setIsFetchingMore(true);
    }
    setError(null);

    try {
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

      const res = await fetch(`/api/spy/ads?${query.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch ad feed");
      }

      const newItems = data.items || [];
      if (currentPage > 1) {
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
    }
  }, [params]);

  useEffect(() => {
    fetchFeed();
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

  return {
    ads,
    pagination,
    isLoading,
    isFetchingMore,
    error,
    params,
    updateFilters,
    updateAdInFeed,
    refetch: fetchFeed,
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
      const res = await fetch("/api/spy/stats");
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

