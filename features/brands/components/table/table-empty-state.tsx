"use client";

import React from "react";
import { SearchTabCounts } from "@/types";
import { Sparkles, ShieldAlert, CheckCircle2, Star, Flame, Filter, RotateCcw } from "lucide-react";

export interface TableEmptyStateProps {
  filters: {
    search: string;
    activeTab: string;
    statusFilter: string;
    searchTypeFilter: string;
    tagFilter?: string;
    page: number;
  };
  searchTabCounts?: SearchTabCounts | null;
  actions: {
    onTabChange: (tab: string) => void;
    onTagFilterChange?: (val: string) => void;
    onResetFilters?: () => void;
  };
}

export function TableEmptyState({
  filters,
  searchTabCounts,
  actions,
}: TableEmptyStateProps) {
  const { search, activeTab, statusFilter, searchTypeFilter, tagFilter, page } = filters;
  const { onTabChange, onTagFilterChange, onResetFilters } = actions;

  return (
    <tr>
      <td colSpan={8} className="px-4 py-16 text-center">
        <div className="flex flex-col items-center justify-center max-w-lg mx-auto space-y-4">
          {search && searchTabCounts && searchTabCounts.all > 0 ? (
            <div className="w-full p-5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/90 dark:border-indigo-800/80 shadow-sm space-y-3.5 text-left animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/10 dark:bg-indigo-400/20 flex items-center justify-center shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Found {searchTabCounts.all} {searchTabCounts.all === 1 ? "match" : "matches"} for &quot;{search}&quot; in other tabs
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    No records match in the current <strong>{activeTab === "all" ? "All Pages" : activeTab}</strong> tab, but matching pages exist in:
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-indigo-100 dark:border-indigo-900/50">
                {searchTabCounts.attention > 0 && activeTab !== "attention" && (
                  <button
                    type="button"
                    onClick={() => onTabChange("attention")}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                    <span>Switch to Attention ({searchTabCounts.attention})</span>
                  </button>
                )}
                {searchTabCounts.active > 0 && activeTab !== "active" && (
                  <button
                    type="button"
                    onClick={() => onTabChange("active")}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Switch to Active ({searchTabCounts.active})</span>
                  </button>
                )}
                {searchTabCounts.watchlist > 0 && activeTab !== "watchlist" && (
                  <button
                    type="button"
                    onClick={() => onTabChange("watchlist")}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    <span>Switch to Watchlist ({searchTabCounts.watchlist})</span>
                  </button>
                )}
                {searchTabCounts.high_volume > 0 && activeTab !== "high_volume" && (
                  <button
                    type="button"
                    onClick={() => onTabChange("high_volume")}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    <span>Switch to High Volume ({searchTabCounts.high_volume})</span>
                  </button>
                )}
                {activeTab !== "all" && (
                  <button
                    type="button"
                    onClick={() => onTabChange("all")}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  >
                    <span>View All Pages ({searchTabCounts.all})</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400">
                <Filter className="w-6 h-6 opacity-60" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  No matching tracked pages found
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {search || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "active" || page > 1
                    ? "Your active filters or smart tab narrowed down results to zero."
                    : "No active tracked Meta Ad Library pages found."}
                </p>
              </div>
            </>
          )}

          {/* Active Filter Chips */}
          {(search || statusFilter !== "all" || searchTypeFilter !== "all" || (tagFilter && tagFilter !== "all") || activeTab !== "active" || page > 1) && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
              {activeTab !== "active" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  Tab: {activeTab === "all" ? "All Pages" : activeTab}
                </span>
              )}
              {tagFilter && tagFilter !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  <span>Tag: {tagFilter.toUpperCase()}</span>
                  <button
                    type="button"
                    onClick={() => onTagFilterChange?.("all")}
                    className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-200 cursor-pointer ml-0.5"
                    aria-label="Clear tag filter"
                  >
                    ×
                  </button>
                </span>
              )}
              {statusFilter !== "all" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  Status: {statusFilter}
                </span>
              )}
              {searchTypeFilter !== "all" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                  Type: {searchTypeFilter}
                </span>
              )}
              {search && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Search: &quot;{search}&quot;
                </span>
              )}
              {page > 1 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Page {page}
                </span>
              )}
            </div>
          )}

          {/* Reset / Switch Actions */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            {activeTab === "active" && !search && statusFilter === "all" && searchTypeFilter === "all" && (
              <button
                type="button"
                onClick={() => onTabChange("all")}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 shadow-sm transition-all cursor-pointer"
              >
                <span>Switch to All Pages (View 0-Ad Pages)</span>
              </button>
            )}
            {(search || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "active" || page > 1) && onResetFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
