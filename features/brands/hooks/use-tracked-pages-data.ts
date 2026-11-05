"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { TrackedPage, DashboardStats, SearchTabCounts } from "@/types";
import { useWorkspace } from "@/components/workspace-context";
import { BrandDashboardState } from "@/lib/url-filter-sync";

interface UseTrackedPagesDataOptions {
  filters: BrandDashboardState;
  showToast: (type: "success" | "error" | "info", message: string) => void;
  onSortApplied?: () => void;
}

export function useTrackedPagesData({
  filters,
  showToast,
  onSortApplied,
}: UseTrackedPagesDataOptions) {
  const { activeWorkspace } = useWorkspace();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTabCounts, setSearchTabCounts] = useState<SearchTabCounts | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const prevWorkspaceIdRef = useRef<string | null>(null);

  const fetchStats = useCallback(async (silent = false, forceRefresh = false) => {
    if (!silent) setStatsLoading(true);
    try {
      const cacheBust = forceRefresh ? `?refresh=true&_t=${Date.now()}` : "";
      const res = await fetch(`/api/stats${cacheBust}`, {
        cache: forceRefresh ? "no-store" : "default",
        headers: forceRefresh ? { "Cache-Control": "no-cache" } : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats", err);
    } finally {
      if (!silent) setStatsLoading(false);
    }
  }, []);

  const fetchPages = useCallback(
    async (silent = false, forceRefresh = false) => {
      // Abort previous in-flight request so stale search/filter responses never overwrite latest state
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (!silent) setPagesLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(filters.page));
        params.set("limit", String(filters.pageSize));
        if (filters.search) params.set("search", filters.search);
        if (filters.statusFilter !== "all") params.set("status", filters.statusFilter);
        if (filters.searchTypeFilter !== "all") params.set("searchType", filters.searchTypeFilter);
        if (filters.tagFilter !== "all") params.set("tag", filters.tagFilter);
        if (filters.activeTab) params.set("tab", filters.activeTab);
        params.set("sortBy", filters.sortBy);
        params.set("sortOrder", filters.sortOrder);
        if (forceRefresh) params.set("_t", String(Date.now()));

        const res = await fetch(`/api/pages?${params.toString()}`, {
          signal: controller.signal,
          cache: forceRefresh ? "no-store" : "default",
          headers: forceRefresh ? { "Cache-Control": "no-cache" } : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          setPages(data.data || []);
          setTotalPages(data.pagination?.totalPages || 1);
          setTotalCount(data.pagination?.total || 0);
          setSearchTabCounts(data.searchTabCounts || null);
          onSortApplied?.();
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast("error", errData.error || "Failed to load table pages.");
        }
      } catch (err: any) {
        if (err.name === "AbortError" || err.name === "DOMException") {
          return;
        }
        console.error("Failed to fetch pages", err);
        showToast("error", "Network error loading table pages.");
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          if (!silent) setPagesLoading(false);
        }
      }
    },
    [filters, showToast, onSortApplied]
  );

  const loadData = useCallback(
    async (silent = false, forceRefresh = false) => {
      return Promise.all([
        fetchStats(silent, forceRefresh),
        fetchPages(silent, forceRefresh),
      ]);
    },
    [fetchStats, fetchPages]
  );

  // Manual refresh button handler
  const handleManualRefresh = async () => {
    if (isManualRefreshing || pagesLoading) return;
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        loadData(false, true),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
      onSortApplied?.();
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const handleApplySort = useCallback(() => {
    fetchPages(true, true);
    onSortApplied?.();
  }, [fetchPages, onSortApplied]);

  // Initial load on mount and when filters/pagination change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-fetch dashboard data ONLY when the active workspace actually switches
  useEffect(() => {
    if (!activeWorkspace?.id) return;

    if (prevWorkspaceIdRef.current === null) {
      prevWorkspaceIdRef.current = activeWorkspace.id;
      return;
    }

    if (prevWorkspaceIdRef.current !== activeWorkspace.id) {
      prevWorkspaceIdRef.current = activeWorkspace.id;
      loadData(false, false);
    }
  }, [activeWorkspace?.id, loadData]);

  // Actions
  const handleRefresh = async (ids: string[]) => {
    try {
      setPages((prev) =>
        prev.map((p) => (ids.includes(p.id) ? { ...p, status: "pending" } : p))
      );

      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        showToast("info", "Scan refresh queued successfully.");
        fetchStats(true);
      } else {
        showToast("error", "Failed to queue refresh.");
      }
    } catch (err) {
      console.error("Refresh action failed", err);
      showToast("error", "Failed to queue refresh.");
    }
  };

  const handleRetry = async (ids?: string[]) => {
    try {
      setPages((prev) =>
        prev.map((p) => (!ids || ids.includes(p.id) ? { ...p, status: "pending" } : p))
      );

      const res = await fetch("/api/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        showToast("info", "Failed scans queued for retry.");
        fetchStats(true);
      } else {
        showToast("error", "Failed to queue retry.");
      }
    } catch (err) {
      console.error("Retry action failed", err);
      showToast("error", "Failed to queue retry.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/page/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("success", "Tracked page deleted successfully.");
        loadData(false, true);
      } else {
        showToast("error", "Failed to delete tracked page.");
      }
    } catch (err) {
      console.error("Delete action failed", err);
      showToast("error", "Network error while deleting page.");
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => fetch(`/api/page/${id}`, { method: "DELETE" })));
      showToast("success", `Deleted ${ids.length} page(s) successfully.`);
      loadData(false, true);
    } catch (err) {
      console.error("Bulk delete failed", err);
      showToast("error", "Failed to delete some pages.");
    }
  };

  return {
    pages,
    setPages,
    pagesLoading,
    stats,
    statsLoading,
    totalPages,
    totalCount,
    searchTabCounts,
    isManualRefreshing,
    fetchStats,
    fetchPages,
    loadData,
    handleManualRefresh,
    handleApplySort,
    actions: {
      handleRefresh,
      handleRetry,
      handleDelete,
      handleBulkDelete,
    },
  };
}
