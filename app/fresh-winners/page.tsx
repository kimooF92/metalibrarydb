"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FreshWinnersHeader } from "@/components/fresh-winners/fresh-winners-header";
import { FreshWinnersToolbar } from "@/components/fresh-winners/fresh-winners-toolbar";
import { FreshWinnerCard } from "@/components/fresh-winners/fresh-winner-card";
import { FreshWinnerRow } from "@/components/fresh-winners/fresh-winner-row";
import { FreshWinnersEmpty } from "@/components/fresh-winners/fresh-winners-empty";
import { useToast } from "@/components/toast-context";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import type { FreshWinnerItem, FreshWinnersStats } from "@/types";

function FreshWinnersContent() {
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
        if (isManualRefresh) params.set("refresh", "true");

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
    const productTotalCopiesMap = new Map<string, number>();

    for (const item of winners) {
      const key = item.product?.id || item.linkUrl || item.id;
      const existing = productGroups.get(key);

      productTotalCopiesMap.set(key, (productTotalCopiesMap.get(key) || 0) + item.duplicationCount);

      if (
        !existing ||
        item.duplicationCount > existing.duplicationCount ||
        item.winnerScore > existing.winnerScore
      ) {
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
    <div className="flex-1 min-w-0 h-full overflow-y-auto p-4 md:px-6 md:py-5 flex flex-col space-y-4">
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
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 animate-pulse">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-80 rounded-xl bg-muted/50 border border-border"
            />
          ))}
        </div>
      ) : displayedItems.length === 0 ? (
        /* 5. Empty State */
        <FreshWinnersEmpty onResetFilters={handleResetFilters} windowDays={windowFilter} />
      ) : (
        /* 6. Winners Grid / List Display */
        <div className="space-y-4">
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
            <div className="space-y-2">
              {displayedItems.map((winner) => (
                <div key={winner.id} id={`winner-${winner.id}`}>
                  <FreshWinnerRow winner={winner} />
                </div>
              ))}
            </div>
          )}

          {/* 7. Pagination Bar */}
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card shadow-xs">
              <span className="text-xs text-muted-foreground">
                Showing page <strong className="text-foreground">{page}</strong> of{" "}
                <strong className="text-foreground">{pagination.totalPages}</strong> (
                {pagination.total} total fresh winners)
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-1">
                  {(() => {
                    const totalPages = pagination.totalPages;
                    const getPageNumbers = () => {
                      if (totalPages <= 7) {
                        return Array.from({ length: totalPages }, (_, i) => i + 1);
                      }
                      if (page <= 4) {
                        return [1, 2, 3, 4, 5, "...", totalPages];
                      }
                      if (page >= totalPages - 3) {
                        return [
                          1,
                          "...",
                          totalPages - 4,
                          totalPages - 3,
                          totalPages - 2,
                          totalPages - 1,
                          totalPages,
                        ];
                      }
                      return [1, "...", page - 1, page, page + 1, "...", totalPages];
                    };

                    return getPageNumbers().map((p, idx) => {
                      if (p === "...") {
                        return (
                          <span
                            key={`ellipsis-${idx}`}
                            className="px-1.5 py-1 text-muted-foreground text-xs select-none"
                          >
                            ...
                          </span>
                        );
                      }
                      const pageNum = p as number;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-7 h-7 rounded-md text-xs font-bold transition-all cursor-pointer ${page === pageNum
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                        >
                          {pageNum}
                        </button>
                      );
                    });
                  })()}
                </div>

                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages || isLoading}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer"
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

function FreshWinnersSkeleton() {
  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto p-4 md:px-6 md:py-5 flex flex-col space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="h-16 bg-muted rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-80 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function FreshWinnersPage() {
  return (
    <Suspense fallback={<FreshWinnersSkeleton />}>
      <FreshWinnersContent />
    </Suspense>
  );
}
