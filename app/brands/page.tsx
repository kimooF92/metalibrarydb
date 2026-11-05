"use client";

import { useState, useCallback, useMemo, Suspense } from "react";
import { PagesTable } from "@/components/pages-table";
import { ScanProgressWidget } from "@/components/scan-progress-widget";
import { useBrandsFilters } from "@/features/brands/hooks/use-brands-filters";
import { useTrackedPagesData } from "@/features/brands/hooks/use-tracked-pages-data";
import { usePagesRealtime } from "@/features/brands/hooks/use-pages-realtime";
import { BrandsHeader } from "@/features/brands/components/brands-header";
import { TrackUrlModal } from "@/features/brands/components/track-url-modal";

function DashboardContent() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const {
    filters,
    hasPendingReSort,
    setHasPendingReSort,
    setSearch,
    setStatusFilter,
    setSearchTypeFilter,
    setTagFilter,
    setActiveTab,
    setPage,
    setPageSize,
    handleSortChange,
    handleResetFilters,
  } = useBrandsFilters();

  const handleSortApplied = useCallback(() => {
    setHasPendingReSort(false);
  }, [setHasPendingReSort]);

  const {
    pages,
    setPages,
    pagesLoading,
    stats,
    totalPages,
    totalCount,
    searchTabCounts,
    isManualRefreshing,
    fetchStats,
    loadData,
    handleManualRefresh,
    handleApplySort,
    actions,
  } = useTrackedPagesData({
    filters,
    showToast,
    onSortApplied: handleSortApplied,
  });

  usePagesRealtime({
    stats,
    sortBy: filters.sortBy,
    activeTab: filters.activeTab,
    setPages,
    fetchStats,
    onPendingReSortChange: setHasPendingReSort,
  });

  const scanningPageIds = useMemo(
    () => pages.filter((p) => p.status === "scanning").map((p) => p.id),
    [pages]
  );

  return (
    <div className="h-full flex flex-col space-y-4 overflow-y-auto md:overflow-hidden min-w-0">
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center space-x-3 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold animate-in slide-in-from-top-5 duration-200 ${
            toast.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/95 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40"
              : toast.type === "error"
              ? "bg-rose-50 dark:bg-rose-950/95 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/40"
              : "bg-indigo-50 dark:bg-indigo-950/95 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40"
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}

      <BrandsHeader
        stats={stats}
        isManualRefreshing={isManualRefreshing}
        pagesLoading={pagesLoading}
        onTrackUrlClick={() => setShowAddModal(true)}
        onRefreshClick={handleManualRefresh}
      />

      <PagesTable
        pages={pages}
        loading={pagesLoading}
        stats={stats}
        onRefresh={actions.handleRefresh}
        onRetry={actions.handleRetry}
        onDelete={actions.handleDelete}
        onBulkDelete={actions.handleBulkDelete}
        search={filters.search}
        searchTabCounts={searchTabCounts}
        onSearchChange={setSearch}
        statusFilter={filters.statusFilter}
        onStatusFilterChange={(val) => setStatusFilter(val as any)}
        searchTypeFilter={filters.searchTypeFilter}
        onSearchTypeFilterChange={(val) => setSearchTypeFilter(val as any)}
        tagFilter={filters.tagFilter}
        onTagFilterChange={(val) => setTagFilter(val as any)}
        activeTab={filters.activeTab}
        onTabChange={(tab) => setActiveTab(tab as any)}
        page={filters.page}
        pageSize={filters.pageSize}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => setPageSize(newSize as any)}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        onSortChange={handleSortChange}
        onWatchlistToggle={() => loadData(true, true)}
        onResetFilters={handleResetFilters}
        hasPendingReSort={hasPendingReSort}
        onApplySort={handleApplySort}
      />

      <TrackUrlModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => loadData(false, true)}
      />

      <ScanProgressWidget
        scanningPageIds={scanningPageIds}
        onScanFinished={() => {
          fetchStats(true, true);
          setHasPendingReSort(true);
        }}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
