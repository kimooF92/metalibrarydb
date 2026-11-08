"use client";

import type { SpyFiltersProps } from "../types";
import { useSpyBrands } from "@/hooks/use-spy";
import { useSpyFilters } from "../hooks/use-spy-filters";
import {
  QuickFiltersRow,
  SmartPillsBar,
  ActiveFilterBadges,
  AdvancedFiltersDrawer,
  BrandFilterModal,
  DateRangePopover,
} from "./filters";
import { SlidersHorizontal, ChevronUp, ChevronDown, RefreshCw } from "lucide-react";

export function SpyFilters({
  filters,
  viewMode,
  filteredCount,
  totalCount,
  onViewModeChange,
  onFilterChange,
  onReset,
}: SpyFiltersProps) {
  const { brands } = useSpyBrands();
  const {
    searchValue,
    setSearchValue,
    showBrandModal,
    setShowBrandModal,
    showCustomDates,
    setShowCustomDates,
    datePreset,
    setDatePreset,
    showAdvancedFilters,
    setShowAdvancedFilters,
    excludedIds,
    activePreset,
    totalActiveAdvancedCount,
    hasAnyActiveFilter,
    handlePillClick,
    handleToggleExcludeBrand,
    handleClearAllExcluded,
    handleDatePreset,
  } = useSpyFilters({ filters, onFilterChange });

  const activeTrackedBrand = brands.find(
    (b) => b.id === filters.trackedPageId || b.pageId === filters.trackedPageId
  );

  const handleReset = () => {
    setShowCustomDates(false);
    setDatePreset("all");
    setSearchValue("");
    onReset();
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/60 backdrop-blur-md p-4 mb-4 shadow-sm">
      {/* ─── ROW 1: Search Bar & Global Controls ─── */}
      <QuickFiltersRow
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filteredCount={filteredCount}
        totalCount={totalCount}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        filters={filters}
        onFilterChange={onFilterChange}
      />

      {/* ─── ROW 2: Smart Presets + More Filters Toggle ─── */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <SmartPillsBar
          activePreset={activePreset}
          onPillClick={handlePillClick}
        />

        {/* Actions Cluster: Reset Filters Button + More Filters Toggle */}
        <div className="shrink-0 ml-auto flex items-center gap-2">
          {hasAnyActiveFilter && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition cursor-pointer shadow-2xs"
              title="Reset all search queries, quick presets, and custom filters"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-sm ${
              showAdvancedFilters || totalActiveAdvancedCount > 0
                ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800"
                : "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
            <span>More Filters</span>
            {totalActiveAdvancedCount > 0 && (
              <span className="bg-indigo-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {totalActiveAdvancedCount}
              </span>
            )}
            {showAdvancedFilters ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* ─── Active Filter Badges Bar ─── */}
      {hasAnyActiveFilter && (
        <ActiveFilterBadges
          filters={filters}
          searchValue={searchValue}
          activeBrandName={activeTrackedBrand?.displayName}
          datePreset={datePreset}
          onFilterChange={onFilterChange}
          onReset={handleReset}
        />
      )}

      {/* ─── ROW 3: Categorized 3-Column Advanced Drawer ─── */}
      <AdvancedFiltersDrawer
        isOpen={showAdvancedFilters}
        filters={filters}
        datePreset={datePreset}
        onFilterChange={onFilterChange}
        onDatePresetChange={handleDatePreset}
        onOpenBrandModal={() => setShowBrandModal(true)}
        onClose={() => setShowAdvancedFilters(false)}
        onReset={handleReset}
      />

      {/* ─── Brand Exclusion Modal ─── */}
      <BrandFilterModal
        isOpen={showBrandModal}
        brands={brands}
        excludedIds={excludedIds}
        onToggleExclude={handleToggleExcludeBrand}
        onClearAllExcluded={handleClearAllExcluded}
        onClose={() => setShowBrandModal(false)}
      />

      {/* ─── Custom Date Range Popover ─── */}
      <DateRangePopover
        isOpen={showCustomDates}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onClose={() => setShowCustomDates(false)}
        onFilterChange={onFilterChange}
        onClear={() => {
          onFilterChange({ dateFrom: undefined, dateTo: undefined });
          setShowCustomDates(false);
          setDatePreset("all");
        }}
      />
    </div>
  );
}
