"use client";

import React from "react";
import {
  Search,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Download,
  EyeOff,
  LayoutGrid,
  Table as TableIcon,
  X,
} from "lucide-react";

import {
  VALID_DISCOVERY_STATUSES,
  type DiscoveryStatusFilter,
} from "@/features/discovery/hooks/use-discovery-filters";

export { VALID_DISCOVERY_STATUSES, type DiscoveryStatusFilter };

export interface ActiveRunInfo {
  status: "pending" | "running" | "completed" | "partial" | "failed";
  totalAdsScanned: number;
  targetMaxAds?: number | null;
  totalPagesDiscovered: number;
  searchUrl?: string;
}

export interface DiscoveryStats {
  verifiedHighCount: number;
  newDiscoveredCount: number;
  verifiedCount: number;
  ignoredCount: number;
  dismissableRemainingCount: number;
  totalExtractedProductsCount: number;
  totalCount: number;
  displayedCount: number;
}

export interface DiscoveryToolbarFilterConfig {
  searchFilter: string;
  statusFilter: DiscoveryStatusFilter;
  viewMode: "grid" | "table";
}

export interface DiscoverySelectionConfig {
  selectedCount: number;
  unmergedSelectedCount: number;
  mergeConfirmPending: boolean;
  isActionPending: boolean;
}

export interface DiscoveryToolbarActions {
  onSearchChange: (search: string) => void;
  onStatusFilterChange: (status: DiscoveryStatusFilter) => void;
  onViewModeChange: (mode: "grid" | "table") => void;
  onVerifySelected: () => void;
  onIgnoreSelected: () => void;
  onStartMergeConfirm: () => void;
  onConfirmMerge: () => void;
  onCancelMergeConfirm: () => void;
  onDismissRemaining: () => void;
  onExtractProducts?: () => void;
}

export interface DiscoveryToolbarProps {
  activeRun?: ActiveRunInfo;
  stats: DiscoveryStats;
  filters: DiscoveryToolbarFilterConfig;
  selection: DiscoverySelectionConfig;
  actions: DiscoveryToolbarActions;
  isEnriching?: boolean;
  hasSelectedRun: boolean;
}

export function DiscoveryToolbar({
  activeRun,
  stats,
  filters,
  selection,
  actions,
  isEnriching = false,
  hasSelectedRun,
}: DiscoveryToolbarProps) {
  const {
    verifiedHighCount,
    newDiscoveredCount,
    verifiedCount,
    ignoredCount,
    dismissableRemainingCount,
    totalExtractedProductsCount,
    totalCount,
    displayedCount,
  } = stats;

  const { searchFilter, statusFilter, viewMode } = filters;
  const { selectedCount, unmergedSelectedCount, mergeConfirmPending, isActionPending } = selection;

  return (
    <div className="space-y-3 shrink-0">
      {/* Active Run Stats & Batch Actions Bar */}
      {activeRun && (
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center space-x-4">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">Status</span>
              <span className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                {activeRun.status === "running" && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                )}
                {activeRun.status}
              </span>
            </div>
            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">Ads Scanned</span>
              <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">
                {activeRun.totalAdsScanned.toLocaleString()}
                {activeRun.targetMaxAds ? (
                  <span className="text-[11px] font-normal text-slate-400 ml-1">/ {activeRun.targetMaxAds.toLocaleString()} max</span>
                ) : null}
              </span>
            </div>
            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">Discovered Pages</span>
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                {activeRun.totalPagesDiscovered.toLocaleString()}
              </span>
            </div>
            {verifiedHighCount > 0 && (
              <>
                <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
                <button
                  type="button"
                  onClick={() => actions.onStatusFilterChange("verified_high")}
                  className="text-left group cursor-pointer transition hover:opacity-80"
                  title="Click to filter 10+ verified ads"
                >
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500 fill-amber-400" />
                    High Potential (10+)
                  </span>
                  <span className="font-extrabold text-amber-600 dark:text-amber-400 text-sm">
                    {verifiedHighCount.toLocaleString()}
                  </span>
                </button>
              </>
            )}
            {activeRun.searchUrl && (
              <>
                <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
                <a
                  href={activeRun.searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open search on Meta Ad Library (new tab)"
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 transition"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Meta Link ↗</span>
                </a>
              </>
            )}
          </div>

          {/* Batch Selection & Action Buttons */}
          <div className="flex items-center gap-2 animate-in fade-in duration-150 flex-wrap">
            {/* Step indicator */}
            <div className="hidden md:flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 mr-2 border-r border-slate-200 dark:border-slate-700 pr-3">
              <span className={`px-1.5 py-0.5 rounded ${selectedCount > 0 ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300" : "opacity-40"}`}>① Select</span>
              <span className="opacity-30">›</span>
              <span className="px-1.5 py-0.5 rounded opacity-40">② Verify</span>
              <span className="opacity-30">›</span>
              <span className="px-1.5 py-0.5 rounded opacity-40">③ Merge</span>
            </div>

            {selectedCount > 0 && (
              <>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {selectedCount} selected
                </span>
                <button
                  type="button"
                  onClick={actions.onVerifySelected}
                  disabled={isActionPending}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Verify Ad Counts</span>
                </button>

                {/* Ignore Selected */}
                <button
                  type="button"
                  onClick={actions.onIgnoreSelected}
                  disabled={isActionPending}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-800 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Ignore Selected ({selectedCount})</span>
                </button>

                {/* Merge Selected — with confirmation guard */}
                {mergeConfirmPending ? (
                  <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-500/40 rounded-lg px-2.5 py-1">
                    <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                      Merge {unmergedSelectedCount} new pages?
                    </span>
                    <button
                      type="button"
                      onClick={actions.onConfirmMerge}
                      disabled={isActionPending}
                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={actions.onCancelMergeConfirm}
                      className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={actions.onStartMergeConfirm}
                    disabled={isActionPending || unmergedSelectedCount === 0}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Merge New Selected ({unmergedSelectedCount})</span>
                  </button>
                )}
              </>
            )}

            {/* Dismiss Remaining button for active run */}
            {hasSelectedRun && dismissableRemainingCount > 0 && selectedCount === 0 && (
              <button
                type="button"
                onClick={actions.onDismissRemaining}
                disabled={isActionPending}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                title="Mark all remaining unselected pages in this run as ignored"
              >
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Dismiss Remaining ({dismissableRemainingCount})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table & Grid Header Controls Bar */}
      <div className="p-3 border border-slate-200 dark:border-slate-800/80 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by page name..."
              value={searchFilter}
              onChange={(e) => actions.onSearchChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => actions.onSearchChange("")}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
                title="Clear filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status filter tabs */}
          <div className="flex items-center gap-1 shrink-0 flex-wrap">
            {VALID_DISCOVERY_STATUSES.map((f) => {
              const isSelected = statusFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => actions.onStatusFilterChange(f)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? f === "verified_high"
                        ? "bg-amber-600 dark:bg-amber-500 text-white border-amber-600 dark:border-amber-500 shadow-sm"
                        : "bg-indigo-600 text-white border-indigo-600"
                      : f === "verified_high" && verifiedHighCount > 0
                        ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {f === "all" ? (
                    `All (${totalCount})`
                  ) : f === "discovered" ? (
                    `New (${newDiscoveredCount})`
                  ) : f === "verified" ? (
                    `Verified (${verifiedCount})`
                  ) : f === "verified_high" ? (
                    <>
                      <Sparkles className={`w-3 h-3 ${isSelected ? "text-amber-200 fill-amber-200" : "text-amber-500 fill-amber-400"}`} />
                      <span>Verified 10+ ({verifiedHighCount})</span>
                    </>
                  ) : f === "verifying" ? (
                    "Verifying"
                  ) : f === "imported" ? (
                    "Merged"
                  ) : (
                    `Ignored (${ignoredCount})`
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Extract Products button */}
          {hasSelectedRun && actions.onExtractProducts && (
            <button
              type="button"
              onClick={actions.onExtractProducts}
              disabled={isEnriching || isActionPending}
              className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Extract live candidate products from landing pages"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isEnriching ? "animate-spin text-amber-500" : "text-amber-500 fill-amber-400"}`} />
              <span>{isEnriching ? "Extracting Products..." : "Extract Products"}</span>
            </button>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => actions.onViewModeChange("grid")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
              title="Product Previews Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
              {totalExtractedProductsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-[10px] text-indigo-700 dark:text-indigo-300 font-extrabold">
                  {totalExtractedProductsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => actions.onViewModeChange("table")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
              title="Classic Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
            Showing <span className="font-bold text-slate-900 dark:text-white">{displayedCount}</span> of {totalCount}
          </div>
        </div>
      </div>
    </div>
  );
}
