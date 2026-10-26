"use client";

import React, { memo, useState, useRef, useEffect } from "react";
import { useAdFeed } from "@/hooks/use-spy";
import { AdCard } from "@/components/spy/ad-card";
import { AdRow } from "@/components/spy/ad-row";
import { Ad } from "@/types";
import {
  Search,
  X,
  LayoutGrid,
  LayoutList,
  RefreshCw,
  Layers,
} from "lucide-react";

export interface CreativesTabProps {
  trackedPageId?: string;
  brandDomainId?: string;
  sisterPageId?: string;
  feedRevision?: number;
  filteredProductForCreatives: {
    id: string;
    title: string;
    url: string;
  } | null;
  onClearProductFilter: () => void;
  isActive: boolean;
}

export const CreativesTab = memo(function CreativesTab({
  trackedPageId,
  brandDomainId,
  sisterPageId,
  feedRevision,
  filteredProductForCreatives,
  onClearProductFilter,
  isActive,
}: CreativesTabProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [feedSearch, setFeedSearch] = useState("");
  const [feedMediaType, setFeedMediaType] = useState<string>("all");
  const [feedStatus, setFeedStatus] = useState<string>("all");
  const [feedSortBy, setFeedSortBy] = useState<string>("winner_score");

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Creative feed hook with monotonic ID guards and parameter snapshot checks
  const {
    ads,
    pagination,
    isLoading: isLoadingFeed,
    isFetchingMore,
    refetch: refetchFeed,
    updateFilters,
    updateAdInFeed,
  } = useAdFeed({
    trackedPageId,
    brandDomainId,
    sisterPageId,
    search: feedSearch,
    productId: filteredProductForCreatives?.id,
    mediaType: feedMediaType as any,
    status: feedStatus as any,
    sortBy: feedSortBy as any,
    limit: 24,
    enabled: isActive,
  });

  // Watch feedRevision: when incremented by parent product sync, trigger feed refresh
  // If Creatives is currently hidden (isActive=false), defer refresh until isActive becomes true
  const lastAppliedRevisionRef = useRef(feedRevision || 0);
  useEffect(() => {
    if (feedRevision !== undefined && feedRevision > lastAppliedRevisionRef.current) {
      if (isActive) {
        lastAppliedRevisionRef.current = feedRevision;
        refetchFeed();
      }
    }
  }, [feedRevision, isActive, refetchFeed]);

  // Clear search input when a product filter is selected from outside
  useEffect(() => {
    if (filteredProductForCreatives?.id) {
      setFeedSearch("");
    }
  }, [filteredProductForCreatives?.id]);

  const handleClearProductFilter = () => {
    onClearProductFilter();
  };

  // Infinite scroll listener
  useEffect(() => {
    if (!isActive) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (
          first.isIntersecting &&
          !isLoadingFeed &&
          !isFetchingMore &&
          pagination.page < pagination.totalPages
        ) {
          updateFilters({ page: pagination.page + 1 });
        }
      },
      { threshold: 0.1 }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) observer.observe(currentSentinel);
    return () => {
      if (currentSentinel) observer.unobserve(currentSentinel);
    };
  }, [isActive, isLoadingFeed, isFetchingMore, pagination.page, pagination.totalPages, updateFilters]);

  return (
    <div className="space-y-4">
      {/* Filter banner if filtered by product */}
      {filteredProductForCreatives && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse shrink-0" />
            <span className="text-slate-600 dark:text-slate-300 truncate">
              Filtered by Product: <strong className="text-slate-900 dark:text-white font-bold">{filteredProductForCreatives.title}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={handleClearProductFilter}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold cursor-pointer transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" /> Clear Filter
          </button>
        </div>
      )}

      {/* Feed Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 justify-between bg-white dark:bg-slate-950/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search ad copy, title, ID..."
            value={feedSearch}
            onChange={(e) => {
              setFeedSearch(e.target.value);
              updateFilters({ search: e.target.value, page: 1 });
            }}
            className="w-full bg-slate-50 dark:bg-slate-900 text-xs rounded-lg pl-9 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500"
          />
          {feedSearch && (
            <button
              type="button"
              onClick={() => {
                setFeedSearch("");
                updateFilters({ search: "", page: 1 });
              }}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Media Filter */}
          <select
            value={feedMediaType}
            onChange={(e) => {
              setFeedMediaType(e.target.value);
              updateFilters({ mediaType: e.target.value as any, page: 1 });
            }}
            className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
          >
            <option value="all">All Media</option>
            <option value="video">Videos Only</option>
            <option value="image">Images Only</option>
            <option value="carousel">Carousel Only</option>
          </select>

          {/* Status Filter */}
          <select
            value={feedStatus}
            onChange={(e) => {
              setFeedStatus(e.target.value);
              updateFilters({ status: e.target.value as any, page: 1 });
            }}
            className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
            <option value="archived">Archived</option>
          </select>

          {/* Sort By */}
          <select
            value={feedSortBy}
            onChange={(e) => {
              setFeedSortBy(e.target.value);
              updateFilters({ sortBy: e.target.value as any, page: 1 });
            }}
            className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
          >
            <option value="winner_score">🏆 Winner Score (Highest First)</option>
            <option value="duplication_count">🔥 Most Scaled (Active Copies)</option>
            <option value="started_running_on">⚡ Newest Launched (Meta Date)</option>
            <option value="oldest">⏳ Longest Running (Evergreen)</option>
            <option value="recently_observed">👁️ Recently Active (Last Verified)</option>
            <option value="first_seen_at">📅 Newly Indexed (First Found)</option>
          </select>

          {/* Grid / List Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "grid" ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-sm" : "text-slate-500"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "list" ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-sm" : "text-slate-500"
              }`}
              title="List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Creatives Grid / List */}
      {isLoadingFeed && ads.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="text-xs font-semibold">Loading brand creatives...</span>
        </div>
      ) : ads.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
          <Layers className="w-8 h-8 text-slate-400 mb-2" />
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">No creatives match your filter criteria</h4>
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {ads.map((ad: Ad) => (
                <AdCard
                  key={ad.id}
                  ad={ad}
                  onArchiveToggle={() => refetchFeed()}
                  onMediaRefreshed={updateAdInFeed}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {ads.map((ad: Ad) => (
                <AdRow
                  key={ad.id}
                  ad={ad}
                  onArchiveToggle={() => refetchFeed()}
                  onMediaRefreshed={updateAdInFeed}
                />
              ))}
            </div>
          )}

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-4 w-full" />

          {isFetchingMore && (
            <div className="flex items-center justify-center py-4 text-xs font-medium text-slate-500 gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              <span>Loading more creatives...</span>
            </div>
          )}
        </>
      )}
    </div>
  );
});
