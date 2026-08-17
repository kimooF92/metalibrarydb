"use client";

import { useState, useRef, useEffect } from "react";
import { useAdFeed, useAdStats } from "@/hooks/use-spy";
import { AdCard } from "@/components/spy/ad-card";
import { AdRow } from "@/components/spy/ad-row";
import { SpyFilters } from "@/components/spy/spy-filters";
import { ApifyCreditBadge } from "@/components/apify-credit-badge";
import { Layers, Calendar, Video, Image as ImageIcon, RefreshCw, Eye, ArrowUp } from "lucide-react";

export default function AdSpyPage() {
  const { ads, pagination, isLoading, isFetchingMore, error, params, updateFilters, updateAdInFeed, refetch } = useAdFeed();
  const { stats } = useAdStats();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Scroll listener for back to top button
  useEffect(() => {
    const container = document.querySelector("main") || window;
    const handleScroll = () => {
      const scrollPos = window.scrollY || document.documentElement.scrollTop;
      setShowBackToTop(scrollPos > 300);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Load viewMode preference from localStorage on mount
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("ad_spy_view_mode");
      if (savedMode === "grid" || savedMode === "list") {
        setViewMode(savedMode);
      }
    } catch (e) {
      console.error("Error reading viewMode preference:", e);
    }
  }, []);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("ad_spy_view_mode", mode);
    } catch (e) {
      console.error("Error saving viewMode preference:", e);
    }
  };

  const handleResetFilters = () => {
    try {
      sessionStorage.removeItem("spy_feed_filters");
      localStorage.removeItem("spy_feed_filters");
      localStorage.removeItem("spy_excluded_brands");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch (e) {
      console.error("Error clearing spy filter storage:", e);
    }

    updateFilters({
      search: "",
      dateFrom: undefined,
      dateTo: undefined,
      minDaysRunning: 0,
      minDuplications: 1,
      mediaType: "all",
      status: "all",
      ctaText: "all",
      isWatchlisted: false,
      excludePageIds: [],
      smartPreset: undefined,
      sortBy: "started_running_on",
      sortOrder: "desc",
      page: 1,
    });
  };

  const handleExcludeBrand = (pageId: string) => {
    const currentExcluded = params.excludePageIds || [];
    if (!currentExcluded.includes(pageId)) {
      updateFilters({ excludePageIds: [...currentExcluded, pageId] });
    }
  };

  // IntersectionObserver for continuous infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (
          first.isIntersecting &&
          !isLoading &&
          !isFetchingMore &&
          pagination.page < pagination.totalPages
        ) {
          updateFilters({ page: pagination.page + 1 });
        }
      },
      { threshold: 0.1 }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [isLoading, isFetchingMore, pagination.page, pagination.totalPages, updateFilters]);

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800/40">
        <div className="flex items-center space-x-2">
          <Eye className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
            Ad Spy Feed
          </h1>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium hidden md:inline-block">
            {stats.totalAdsCaptured} ads captured • {stats.launchedLast7Days} new this week
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <ApifyCreditBadge />
          <button
            onClick={() => refetch()}
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isFetchingMore ? "animate-spin text-indigo-500" : ""}`} />
            <span>Refresh Feed</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-2.5 sm:p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Captured
            </span>
            <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
            {stats.totalAdsCaptured}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-2.5 sm:p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Launched (7 Days)
            </span>
            <Calendar className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.launchedLast7Days}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-2.5 sm:p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Scaled Ads (5+)
            </span>
            <Layers className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          </div>
          <p className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {stats.scaledAdsCount}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-2.5 sm:p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Media Breakdown
            </span>
            <Video className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
          </div>
          <div className="flex items-center gap-2.5 mt-1 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
              <ImageIcon className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> {stats.mediaDistribution.image}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
              <Video className="w-3 h-3 text-purple-500 dark:text-purple-400" /> {stats.mediaDistribution.video}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar & View Switcher */}
      <SpyFilters
        filters={params}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onFilterChange={updateFilters}
        onReset={handleResetFilters}
      />

      {/* Main Feed Content */}
      {isLoading && ads.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400 gap-2.5">
          <RefreshCw className="w-7 h-7 animate-spin text-indigo-500" />
          <span className="text-xs font-semibold">Loading ad creatives feed...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
          Error loading ad feed: {error}
        </div>
      ) : ads.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
          <Layers className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-2.5" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No ad creatives match your filters</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-3">
            Try resetting your filters or run an Ad Spy extraction scan on your tracked brand pages from the main dashboard.
          </p>
          <button
            onClick={handleResetFilters}
            className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          {/* Conditional Layout: Grid Cards vs List / Line by Line */}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {ads.map((ad) => (
                <AdCard
                  key={ad.id}
                  ad={ad}
                  onArchiveToggle={() => refetch()}
                  onExcludeBrand={handleExcludeBrand}
                  onMediaRefreshed={updateAdInFeed}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {ads.map((ad) => (
                <AdRow
                  key={ad.id}
                  ad={ad}
                  onArchiveToggle={() => refetch()}
                  onExcludeBrand={handleExcludeBrand}
                  onMediaRefreshed={updateAdInFeed}
                />
              ))}
            </div>
          )}

          {/* Sentinel element for infinite scroll */}
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
      )}

      {/* Floating Back-to-Top Button */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          title="Scroll to top"
          className="fixed bottom-6 right-6 z-40 p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/30 transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in-95 cursor-pointer"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
