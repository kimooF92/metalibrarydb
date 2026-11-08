"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Ad } from "@/types";
import { AdCard } from "../ad-card";
import { AdRow } from "@/components/spy/ad-row";
import { RefreshCw, Layers } from "lucide-react";

export interface SpyFeedGridStatus {
  isLoading: boolean;
  isFetchingMore: boolean;
  error?: string | null;
}

export interface SpyFeedGridPagination {
  page: number;
  totalPages: number;
  total: number;
}

export interface SpyFeedGridActions {
  onLoadMore: () => void;
  onRetry: () => void;
  onResetFilters: () => void;
  onExcludeBrand: (pageId: string) => void;
  onUpdateAd: (ad: Ad) => void;
}

export interface SpyFeedGridProps {
  ads: Ad[];
  viewMode: "grid" | "list";
  status: SpyFeedGridStatus;
  pagination: SpyFeedGridPagination;
  actions: SpyFeedGridActions;
}

export function SpyFeedGrid({
  ads,
  viewMode,
  status,
  pagination,
  actions,
}: SpyFeedGridProps) {
  const { isLoading, isFetchingMore, error } = status;
  const { onLoadMore, onRetry, onResetFilters, onExcludeBrand, onUpdateAd } = actions;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // BUG-09 fix: ref-stabilized IntersectionObserver attached to stable sentinel outside view conditional
  useEffect(() => {
    if (isLoading || isFetchingMore || pagination.page >= pagination.totalPages) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isLoading, isFetchingMore, pagination.page, pagination.totalPages, onLoadMore]);

  if (isLoading && ads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400 gap-2.5">
        <RefreshCw className="w-7 h-7 animate-spin text-indigo-500" />
        <span className="text-xs font-semibold">Loading ad creatives feed...</span>
      </div>
    );
  }

  if (error && ads.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-bold">Error loading ad feed:</span>
          <span>{error}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs cursor-pointer transition-colors"
          >
            Retry
          </button>
          {error.toLowerCase().includes("session") || error.toLowerCase().includes("auth") ? (
            <Link
              href="/login"
              className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-lg font-bold text-xs cursor-pointer"
            >
              Log In
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  if (ads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
        <Layers className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-2.5" />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          No ad creatives match your filters
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-3">
          Try resetting your filters or run an Ad Spy extraction scan on your tracked brand pages from
          the main dashboard.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
        >
          Reset Filters
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Non-destructive error notice if background refetch fails but ads are already displayed */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold">Error updating ad feed:</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs cursor-pointer transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Conditional Layout: Grid Cards vs List / Line by Line */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {ads.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              onArchiveToggle={onRetry}
              onExcludeBrand={onExcludeBrand}
              onMediaRefreshed={onUpdateAd}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ads.map((ad) => (
            <AdRow
              key={ad.id}
              ad={ad}
              onArchiveToggle={onRetry}
              onExcludeBrand={onExcludeBrand}
              onMediaRefreshed={onUpdateAd}
            />
          ))}
        </div>
      )}

      {/* Sentinel element for infinite scroll (BUG-09 fix: persistent DOM node) */}
      <div ref={sentinelRef} className="h-4 w-full" />

      {/* Inline Loading Footer when fetching next page */}
      {isFetchingMore && (
        <div className="flex items-center justify-center py-4 text-xs font-medium text-slate-500 dark:text-slate-400 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
          <span>Loading more ad creatives...</span>
        </div>
      )}

      {/* Clean Streamlined Feed Summary Footer */}
      <div className="flex items-center justify-between pt-4 pb-8 border-t border-slate-200 dark:border-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
        <span>
          Showing <strong className="text-slate-900 dark:text-slate-100">{ads.length}</strong> of{" "}
          <strong className="text-slate-900 dark:text-slate-100">{pagination.total}</strong> total ads
        </span>

        {ads.length >= pagination.total && pagination.total > 0 && (
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900 px-2.5 py-0.5 rounded-full">
            All captured ads loaded
          </span>
        )}
      </div>
    </>
  );
}

