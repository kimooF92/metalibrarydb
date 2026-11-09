"use client";

import { Suspense, useCallback } from "react";
import { useAdFeed, useIncomingAdsStream } from "@/hooks/use-spy";
import { useSpyFeedUi, useSpyLayout } from "@/features/spy/hooks";
import {
  SpyHeader,
  SpyIncomingAlert,
  SpyFeedGrid,
  SpyResultsBar,
} from "@/features/spy/components/feed";
import {
  SpySidebarFilters,
  SpyTopBar,
  MobileSpyFilterDrawer,
} from "@/features/spy/components/filters";
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

  const { incomingAds, incomingCount, clearIncoming, autoStream, setAutoStream } =
    useIncomingAdsStream();

  const layout = useSpyLayout(params);

  const { viewMode, manualRefreshing, handleViewModeChange, handleRefreshFeed } =
    useSpyFeedUi({
      incomingAds,
      autoStream,
      prependAds,
      clearIncoming,
      refetch,
    });

  const handleExcludeBrand = useCallback(
    (pageId: string) => {
      const current = params.excludePageIds || [];
      if (!current.includes(pageId)) {
        updateFilters({ excludePageIds: [...current, pageId] });
      }
    },
    [params.excludePageIds, updateFilters]
  );

  return (
    <div className="flex-1 h-full w-full flex flex-row overflow-hidden bg-background">
      {/* Desktop Docked Second Sidebar */}
      <div className="hidden lg:flex flex-col h-full shrink-0">
        <SpySidebarFilters
          filters={params}
          onFilterChange={updateFilters}
          onReset={resetFilters}
          activeFilterCount={layout.activeFilterCount}
          isCollapsed={layout.isSidebarCollapsed}
          onToggleCollapse={layout.handleToggleSecondSidebar}
        />
      </div>

      {/* Main Content Area */}
      <div
        ref={layout.contentScrollRef}
        className="flex-1 min-w-0 h-full overflow-y-auto p-4 md:px-6 md:py-5 flex flex-col space-y-3.5"
      >
        <SpyHeader
          autoStream={autoStream}
          onToggleAutoStream={() => setAutoStream(!autoStream)}
          isRefreshing={manualRefreshing || isRefreshing}
          onRefresh={handleRefreshFeed}
        />

        <SpyTopBar
          filters={params}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onFilterChange={updateFilters}
          onReset={resetFilters}
          activeFilterCount={layout.activeFilterCount}
          onOpenMobileDrawer={() => layout.setIsMobileDrawerOpen(true)}
          isSidebarCollapsed={layout.isSidebarCollapsed}
          onToggleSidebar={layout.handleToggleSecondSidebar}
        />

        <SpyResultsBar
          loading={isLoading}
          adsCount={ads.length}
          totalCount={pagination.total}
          isFetchingMore={isFetchingMore}
          sortBy={params.sortBy}
        />

        <SpyIncomingAlert
          incomingCount={incomingCount}
          autoStream={autoStream}
          latestPageName={incomingAds[0]?.pageName || undefined}
          onLoadIntoFeed={() => {
            prependAds(incomingAds);
            clearIncoming();
            layout.scrollToTop();
          }}
          onDismiss={clearIncoming}
        />

        <SpyFeedGrid
          ads={ads}
          viewMode={viewMode}
          status={{ isLoading, isFetchingMore, error }}
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

        {layout.showBackToTop && (
          <button
            type="button"
            onClick={layout.scrollToTop}
            aria-label="Back to top"
            title="Scroll to top"
            className="fixed bottom-6 right-6 z-40 p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/30 transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in-95 cursor-pointer"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mobile Slide-Over Filter Drawer */}
      <MobileSpyFilterDrawer
        isOpen={layout.isMobileDrawerOpen}
        onClose={() => layout.setIsMobileDrawerOpen(false)}
        filters={params}
        onFilterChange={updateFilters}
        onReset={resetFilters}
        activeFilterCount={layout.activeFilterCount}
      />
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
