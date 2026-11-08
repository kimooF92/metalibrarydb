"use client";

import { Suspense } from "react";
import { useAdFeed, useAdStats, useIncomingAdsStream } from "@/hooks/use-spy";
import { useSpyFeedUi } from "@/features/spy/hooks/use-spy-feed-ui";
import { SpyHeader, SpyIncomingAlert, SpyFeedGrid } from "@/features/spy/components/feed";
import { SpyFilters } from "@/features/spy/components/spy-filters";
import { ArrowUp } from "lucide-react";

function AdSpyContent() {
  const {
    ads,
    pagination,
    isLoading,
    isFetchingMore,
    isRefreshing,
    error,
    params,
    updateFilters,
    resetFilters,
    updateAdInFeed,
    prependAds,
    refetch,
  } = useAdFeed();

  const { stats, refetch: refetchStats } = useAdStats();

  const {
    incomingAds,
    incomingCount,
    clearIncoming,
    autoStream,
    setAutoStream,
  } = useIncomingAdsStream();

  const {
    viewMode,
    showBackToTop,
    manualRefreshing,
    handleViewModeChange,
    handleRefreshFeed,
  } = useSpyFeedUi({
    incomingAds,
    autoStream,
    prependAds,
    clearIncoming,
    refetch,
    refetchStats,
  });

  const handleExcludeBrand = (pageId: string) => {
    const currentExcluded = params.excludePageIds || [];
    if (!currentExcluded.includes(pageId)) {
      updateFilters({ excludePageIds: [...currentExcluded, pageId] });
    }
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-background text-foreground space-y-4">
      {/* Header & Metrics Banner */}
      <SpyHeader
        stats={stats}
        filteredTotal={pagination.total}
        autoStream={autoStream}
        onToggleAutoStream={() => setAutoStream(!autoStream)}
        isRefreshing={manualRefreshing || isRefreshing}
        onRefresh={handleRefreshFeed}
      />

      {/* Filter Toolbar & View Switcher */}
      <SpyFilters
        filters={params}
        viewMode={viewMode}
        filteredCount={pagination.total}
        totalCount={stats.totalAdsCaptured}
        isLoading={isLoading || isFetchingMore}
        onViewModeChange={handleViewModeChange}
        onFilterChange={updateFilters}
        onReset={resetFilters}
      />

      {/* Realtime Alert for Incoming Ads */}
      <SpyIncomingAlert
        incomingCount={incomingCount}
        autoStream={autoStream}
        latestPageName={incomingAds[0]?.pageName || undefined}
        onLoadIntoFeed={() => {
          prependAds(incomingAds);
          clearIncoming();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onDismiss={clearIncoming}
      />

      {/* Main Feed Content (Grid vs List, Infinite Scroll, Empty State) */}
      <SpyFeedGrid
        ads={ads}
        viewMode={viewMode}
        status={{
          isLoading,
          isFetchingMore,
          error,
        }}
        pagination={{
          page: pagination.page,
          totalPages: pagination.totalPages,
          total: pagination.total,
        }}
        actions={{
          onLoadMore: () => updateFilters({ page: pagination.page + 1 }),
          onRetry: () => refetch(),
          onResetFilters: resetFilters,
          onExcludeBrand: handleExcludeBrand,
          onUpdateAd: updateAdInFeed,
        }}
      />

      {/* Floating Back-to-Top Button */}
      {showBackToTop && (
        <button
          type="button"
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

export default function AdSpyPage() {
  return (
    <Suspense fallback={null}>
      <AdSpyContent />
    </Suspense>
  );
}
