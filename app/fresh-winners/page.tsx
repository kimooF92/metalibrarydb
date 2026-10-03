"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FreshWinnersHeader } from "@/components/fresh-winners/fresh-winners-header";
import { FreshWinnersToolbar } from "@/components/fresh-winners/fresh-winners-toolbar";
import { FreshWinnerCard } from "@/components/fresh-winners/fresh-winner-card";
import { FreshWinnerRow } from "@/components/fresh-winners/fresh-winner-row";
import { FreshWinnersEmpty } from "@/components/fresh-winners/fresh-winners-empty";
import { useToast } from "@/components/toast-context";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Flame, Layers } from "lucide-react";
import type { FreshWinnerItem, FreshWinnersStats } from "@/types";

export default function FreshWinnersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const highlightId = searchParams.get("highlight");

  // State
  const [winners, setWinners] = useState<FreshWinnerItem[]>([]);
  const [stats, setStats] = useState<FreshWinnersStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [windowFilter, setWindowFilter] = useState<"3d" | "7d" | "14d">("7d");
  const [minCopies, setMinCopies] = useState<number>(2);
  const [mediaType, setMediaType] = useState<"all" | "video" | "image">("all");
  const [hasProduct, setHasProduct] = useState(false);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("velocity");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [groupMode, setGroupMode] = useState<"creative" | "product">("creative");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 24,
    total: 0,
    totalPages: 1,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Winners from API
  const fetchWinners = useCallback(
    async (isManualRefresh = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          window: windowFilter,
          minCopies: minCopies.toString(),
          sortBy,
          page: page.toString(),
          limit: "24",
        });

        if (mediaType !== "all") params.set("mediaType", mediaType);
        if (hasProduct) params.set("hasProduct", "true");
        if (category !== "all") params.set("category", category);
        if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

        const res = await fetch(`/api/fresh-winners?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`API returned HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data.success) {
          setWinners(data.winners || []);
          setStats(data.stats || null);
          setPagination(data.pagination || { page: 1, limit: 24, total: 0, totalPages: 1 });
        } else {
          throw new Error(data.error || "Failed to load fresh winners");
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("[Fresh Winners Page] Error fetching data:", err);
          setError(err.message || "Failed to load fresh winners.");
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [windowFilter, minCopies, mediaType, hasProduct, category, debouncedSearch, sortBy, page]
  );

  useEffect(() => {
    fetchWinners();
  }, [fetchWinners]);

  // Scroll to highlighted ad if requested via URL
  useEffect(() => {
    if (highlightId && !isLoading && winners.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`winner-${highlightId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 250);
    }
  }, [highlightId, isLoading, winners]);

  // Reset filters helper
  const handleResetFilters = () => {
    setWindowFilter("7d");
    setMinCopies(2);
    setMediaType("all");
    setHasProduct(false);
    setCategory("all");
    setSearch("");
    setDebouncedSearch("");
    setSortBy("velocity");
    setPage(1);
  };

  // Group winners by product landing page if in "product" groupMode
  const displayedItems = useMemo(() => {
    if (groupMode === "creative") return winners;

    // Group items by product ID or clean destination URL
    const productGroups = new Map<string, FreshWinnerItem>();
    const productCountMap = new Map<string, number>();
    const productTotalCopiesMap = new Map<string, number>();

    for (const item of winners) {
      const key = item.product?.id || item.linkUrl || item.id;
      const existing = productGroups.get(key);

      productCountMap.set(key, (productCountMap.get(key) || 0) + 1);
      productTotalCopiesMap.set(key, (productTotalCopiesMap.get(key) || 0) + item.duplicationCount);

      if (!existing || item.duplicationCount > existing.duplicationCount || item.winnerScore > existing.winnerScore) {
        productGroups.set(key, item);
      }
    }

    // Return the hero items enriched with combined total copies
    return Array.from(productGroups.entries()).map(([key, hero]) => {
      const totalCopies = productTotalCopiesMap.get(key) || hero.duplicationCount;
      return {
        ...hero,
        duplicationCount: totalCopies,
      };
    });
  }, [winners, groupMode]);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto px-3 sm:px-6 pt-2">
      {/* 1. Header with Live Velocity KPIs */}
      <FreshWinnersHeader
        stats={stats}
        isLoading={isLoading || isRefreshing}
        onRefresh={() => fetchWinners(true)}
        windowDays={windowFilter}
      />

      {/* 2. Interactive Filter Toolbar */}
      <FreshWinnersToolbar
        window={windowFilter}
        onChangeWindow={(w) => {
          setWindowFilter(w);
          setPage(1);
        }}
        minCopies={minCopies}
        onChangeMinCopies={(c) => {
          setMinCopies(c);
          setPage(1);
        }}
        mediaType={mediaType}
        onChangeMediaType={(m) => {
          setMediaType(m);
          setPage(1);
        }}
        hasProduct={hasProduct}
        onToggleHasProduct={() => {
          setHasProduct(!hasProduct);
          setPage(1);
        }}
        category={category}
        onChangeCategory={(cat) => {
          setCategory(cat);
          setPage(1);
        }}
        search={search}
        onChangeSearch={setSearch}
        sortBy={sortBy}
        onChangeSortBy={(s) => {
          setSortBy(s);
          setPage(1);
        }}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        groupMode={groupMode}
        onChangeGroupMode={setGroupMode}
        onResetFilters={handleResetFilters}
        totalResults={pagination.total}
      />

      {/* 3. Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => fetchWinners(true)}
            className="font-bold underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 4. Loading Skeleton */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 animate-pulse">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-96 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800"
            />
          ))}
        </div>
      ) : displayedItems.length === 0 ? (
        /* 5. Empty State */
        <FreshWinnersEmpty onResetFilters={handleResetFilters} windowDays={windowFilter} />
      ) : (
        /* 6. Winners Grid / List Display */
        <div>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {displayedItems.map((winner) => (
                <div key={winner.id} id={`winner-${winner.id}`}>
                  <FreshWinnerCard
                    winner={winner}
                    isHighlighted={highlightId === winner.id || highlightId === winner.adArchiveId}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedItems.map((winner) => (
                <div key={winner.id} id={`winner-${winner.id}`}>
                  <FreshWinnerRow winner={winner} />
                </div>
              ))}
            </div>
          )}

          {/* 7. Pagination Bar */}
          {pagination.totalPages > 1 && (
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Showing page <strong className="text-slate-900 dark:text-white">{page}</strong> of{" "}
                <strong className="text-slate-900 dark:text-white">{pagination.totalPages}</strong> (
                {pagination.total} total fresh winners)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }).map((_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          page === pageNum
                            ? "bg-rose-600 text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages || isLoading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
