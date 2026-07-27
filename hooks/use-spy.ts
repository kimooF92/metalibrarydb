"use client";

import { useState, useEffect, useCallback } from "react";
import { Ad, AdSpyStats, AdFilterParams, PaginationMeta } from "@/types";

export function useAdFeed(initialParams?: AdFilterParams) {
  const [params, setParams] = useState<AdFilterParams>(
    initialParams || {
      page: 1,
      limit: 24,
      minDuplications: 1,
      mediaType: "all",
      status: "all",
      sortBy: "started_running_on",
      sortOrder: "desc",
    }
  );

  const [ads, setAds] = useState<Ad[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 24,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setIsLoading(true);
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
      if (params.sortBy) query.set("sortBy", params.sortBy);
      if (params.sortOrder) query.set("sortOrder", params.sortOrder);
      query.set("page", (params.page || 1).toString());
      query.set("limit", (params.limit || 24).toString());

      const res = await fetch(`/api/spy/ads?${query.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch ad feed");
      }

      setAds(data.items || []);
      setPagination(data.pagination || { page: 1, limit: 24, total: 0, totalPages: 0 });
    } catch (err: any) {
      setError(err.message || "Failed to fetch ad feed");
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const updateFilters = useCallback((newParams: Partial<AdFilterParams>) => {
    setParams((prev) => ({
      ...prev,
      ...newParams,
      page: newParams.page !== undefined ? newParams.page : 1, // Reset to page 1 on filter change
    }));
  }, []);

  return {
    ads,
    pagination,
    isLoading,
    error,
    params,
    updateFilters,
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

  const enqueueScan = async (trackedPageIds: string[]) => {
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
      return data;
    } finally {
      setIsEnqueueing(false);
    }
  };

  return { enqueueScan, isEnqueueing };
}
