"use client";

import { useEffect, useRef } from "react";
import { TrackedPage, DashboardStats } from "@/types";
import { getSupabase } from "@/lib/supabase";
import { appendLiveHistoryPoint, computeDeltaDifference } from "@/lib/sparkline-utils";
import { BrandSortCol, BrandTab } from "@/lib/url-filter-sync";

interface UsePagesRealtimeOptions {
  stats: DashboardStats | null;
  sortBy: BrandSortCol;
  activeTab: BrandTab;
  setPages: React.Dispatch<React.SetStateAction<TrackedPage[]>>;
  fetchStats: (silent?: boolean, forceRefresh?: boolean) => Promise<void>;
  onPendingReSortChange?: (pending: boolean) => void;
}

export function usePagesRealtime({
  stats,
  sortBy,
  activeTab,
  setPages,
  fetchStats,
  onPendingReSortChange,
}: UsePagesRealtimeOptions) {
  const realtimeStatsDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time row status & ad-count updates via Supabase WebSockets
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel("realtime-tracked-pages")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tracked_pages",
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;

          // In-place row patch: only the updated row reference changes, preventing whole-table re-render or flicker
          setPages((prevPages) => {
            const hasTargetRow = prevPages.some((p) => p.id === updated.id);
            if (hasTargetRow) {
              const countUpdated =
                updated.current_results !== undefined || updated.currentResults !== undefined;
              const dateUpdated =
                updated.last_checked !== undefined || updated.lastChecked !== undefined;
              const rawCount = updated.current_results ?? updated.currentResults;
              const countIsZero = rawCount !== null && rawCount !== undefined && Number(rawCount) === 0;

              if (
                (sortBy === "lastChecked" && dateUpdated) ||
                (sortBy === "currentResults" && countUpdated) ||
                (sortBy === "difference" && countUpdated) ||
                (activeTab === "active" && countIsZero)
              ) {
                onPendingReSortChange?.(true);
              }
            }

            return prevPages.map((page) => {
              if (page.id !== updated.id) return page;

              const rawResults =
                updated.current_results !== undefined && updated.current_results !== null
                  ? updated.current_results
                  : updated.currentResults !== undefined && updated.currentResults !== null
                    ? updated.currentResults
                    : page.currentResults;
              const newResults = rawResults !== null && rawResults !== undefined ? Number(rawResults) : null;

              const oldResults = page.currentResults;
              const hasCountChanged = newResults !== null && oldResults !== null && newResults !== oldResults;
              const difference = hasCountChanged
                ? computeDeltaDifference(newResults, oldResults, page.difference)
                : page.difference;
              const previousResults = hasCountChanged ? oldResults : page.previousResults;

              // Dynamically append new point to live sparkline history points
              const historyPoints = hasCountChanged && newResults !== null
                ? appendLiveHistoryPoint(page.historyPoints, newResults)
                : page.historyPoints;

              return {
                ...page,
                status: updated.status ?? page.status,
                currentResults: newResults,
                previousResults,
                difference,
                historyPoints,
                lastChecked: updated.last_checked || updated.lastChecked || page.lastChecked,
                lastSuccessAt: updated.last_success_at || updated.lastSuccessAt || page.lastSuccessAt,
                updatedAt: updated.updated_at || updated.updatedAt || page.updatedAt,
                holdStatus: updated.hold_status || updated.holdStatus || page.holdStatus,
              };
            });
          });

          // Debounced silent stats refresh: coalesces rapid batch updates (e.g. 20 rows in a scan)
          // into a single cached stats fetch after 3 seconds instead of 20 parallel queries.
          if (realtimeStatsDebounceRef.current) {
            clearTimeout(realtimeStatsDebounceRef.current);
          }
          realtimeStatsDebounceRef.current = setTimeout(() => {
            fetchStats(true, false);
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (realtimeStatsDebounceRef.current) {
        clearTimeout(realtimeStatsDebounceRef.current);
      }
    };
  }, [fetchStats, sortBy, activeTab, setPages, onPendingReSortChange]);

  // Active scan sync loop: while scans are in progress, poll stats at a relaxed 12s interval
  // strictly pausing when the tab is hidden.
  useEffect(() => {
    if (!stats || (stats.scanning === 0 && stats.pending === 0)) return;
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchStats(true, false);
      }
    }, 12000);

    const handleVisibility = () => {
      if (!document.hidden) fetchStats(true, false);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [stats?.scanning, stats?.pending, fetchStats]);
}

