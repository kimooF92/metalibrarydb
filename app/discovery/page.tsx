"use client";

import { useState, useCallback } from "react";
import { DiscoverySecondSidebar } from "@/components/discovery/discovery-second-sidebar";
import { NewScanModal } from "@/components/discovery/new-scan-modal";
import {
  useDiscoveryFilters,
  useDiscoveryRuns,
  useDiscoveredPages,
  DiscoveryHeader,
  DiscoveryToolbar,
  DiscoveryGrid,
  DiscoveryTable,
} from "@/features/discovery";

export default function DiscoveryPage() {
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const handleNotify = useCallback((msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage((curr) => (curr === msg ? null : curr)), 4500);
  }, []);

  const filters = useDiscoveryFilters();
  const runs = useDiscoveryRuns({
    selectedRunId: filters.selectedRunId,
    onSelectRunId: filters.setSelectedRunId,
    country: filters.country,
    onCountryChange: filters.setCountry,
    mediaType: filters.mediaType,
    onMediaTypeChange: filters.setMediaType,
    onNotify: handleNotify,
  });

  const pages = useDiscoveredPages({
    selectedRunId: filters.selectedRunId,
    searchFilter: filters.searchFilter,
    statusFilter: filters.statusFilter,
    productGridFilter: filters.productGridFilter,
    selectedPageFilter: filters.selectedPageFilter,
    viewMode: filters.viewMode,
    onNotify: handleNotify,
  });

  const handleRefresh = useCallback(async () => {
    await runs.fetchRuns();
    if (filters.selectedRunId) await pages.fetchPages(filters.selectedRunId);
  }, [runs.fetchRuns, pages.fetchPages, filters.selectedRunId]);

  return (
    <div className="flex-1 h-full w-full flex flex-row overflow-hidden bg-background">
      <DiscoverySecondSidebar
        pages={pages.pages}
        selectedPageId={filters.selectedPageFilter}
        onSelectPage={filters.setSelectedPageFilter}
        isCollapsed={filters.isSidebarCollapsed}
        onToggleCollapse={filters.handleToggleSidebar}
      />

      <div className="flex-1 min-w-0 h-full overflow-y-auto p-4 md:px-6 md:py-5 flex flex-col space-y-4">
        <DiscoveryHeader
          runsConfig={{
            runs: runs.runs,
            selectedRunId: filters.selectedRunId,
            activeRun: runs.activeRun ?? undefined,
            isLoading: runs.isLoadingRuns,
          }}
          messageConfig={{
            message: actionMessage,
            onDismiss: () => setActionMessage(null),
          }}
          onSelectRunId={filters.setSelectedRunId}
          onOpenNewScan={() => runs.setIsNewScanModalOpen(true)}
          onRefresh={handleRefresh}
        />

        <DiscoveryToolbar
          activeRun={runs.activeRun ?? undefined}
          hasSelectedRun={Boolean(filters.selectedRunId)}
          isEnriching={pages.isEnriching}
          stats={{
            verifiedHighCount: pages.verifiedHighCount,
            newDiscoveredCount: pages.newDiscoveredCount,
            verifiedCount: pages.verifiedCount,
            ignoredCount: pages.ignoredCount,
            dismissableRemainingCount: pages.dismissableRemainingCount,
            totalExtractedProductsCount: pages.totalExtractedProductsCount,
            totalCount: pages.pages.length,
            displayedCount: pages.displayedPages.length,
          }}
          filters={{
            searchFilter: filters.searchFilter,
            statusFilter: filters.statusFilter,
            viewMode: filters.viewMode,
          }}
          selection={{
            selectedCount: pages.selectedPageIds.size,
            unmergedSelectedCount: Array.from(pages.selectedPageIds).filter(
              (id) => !pages.pages.find((p) => p.id === id)?.isTracked
            ).length,
            mergeConfirmPending: pages.mergeConfirmPending,
            isActionPending: pages.isActionPending,
          }}
          actions={{
            onSearchChange: filters.setSearchFilter,
            onStatusFilterChange: filters.setStatusFilter,
            onViewModeChange: filters.handleToggleViewMode,
            onVerifySelected: pages.handleVerifySelected,
            onIgnoreSelected: () => pages.handleIgnoreSelected(),
            onStartMergeConfirm: () => pages.setMergeConfirmPending(true),
            onConfirmMerge: () => pages.handleMergeSelected(),
            onCancelMergeConfirm: () => pages.setMergeConfirmPending(false),
            onDismissRemaining: pages.handleDismissRemainingRun,
            onExtractProducts: () => pages.handleEnrichRun(),
          }}
        />

        {filters.viewMode === "grid" ? (
          <DiscoveryGrid
            pages={pages.displayedPages}
            gridState={{
              isLoading: pages.isLoadingPages,
              productGridFilter: filters.productGridFilter,
              selectedPageFilter: filters.selectedPageFilter,
              totalFilteredCount: pages.filteredPages.length,
              totalExtractedCount: pages.totalExtractedProductsCount,
              hasSelectedRun: Boolean(filters.selectedRunId),
              isEnriching: pages.isEnriching,
              isActionPending: pages.isActionPending,
            }}
            actions={{
              onFilterChange: filters.setProductGridFilter,
              onClearPageFilter: () => filters.setSelectedPageFilter(null),
              onValidateAndMerge: pages.handleValidateAndAutoMerge,
              onMergePageOnly: pages.handleMergePageOnly,
              onIgnoreCard: pages.handleIgnoreCard,
              onExtractProducts: () => pages.handleEnrichRun(),
            }}
          />
        ) : (
          <DiscoveryTable
            pages={pages.displayedPages}
            stateConfig={{
              isLoading: pages.isLoadingPages,
              isActionPending: pages.isActionPending,
              totalRunPagesCount: pages.pages.length,
              statusFilter: filters.statusFilter,
              country: filters.country,
            }}
            sortConfig={{
              sortBy: pages.sortBy,
              sortOrder: pages.sortOrder,
              onSortChange: pages.handleSortChange,
            }}
            selectionConfig={{
              selectedPageIds: pages.selectedPageIds,
              onToggleSelectAll: pages.toggleSelectAll,
              onToggleSelectPage: pages.toggleSelectPage,
            }}
            actions={{
              onVerifyPage: pages.handleVerifyPage,
              onIgnorePage: (id, restore) => pages.handleIgnoreSelected([id], restore),
              onMergeSinglePage: pages.handleMergeSinglePage,
              onValidateAndMerge: pages.handleValidateAndAutoMerge,
            }}
          />
        )}

        <NewScanModal {...runs.modalProps} />
      </div>
    </div>
  );
}
