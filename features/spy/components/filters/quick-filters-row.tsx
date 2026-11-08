"use client";

import type { AdFilterParams } from "@/types";
import { Search, X, Zap, Archive, LayoutGrid, LayoutList } from "lucide-react";

interface QuickFiltersRowProps {
  searchValue: string;
  onSearchChange: (val: string) => void;
  filteredCount?: number;
  totalCount?: number;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  filters: AdFilterParams;
  onFilterChange: (newFilters: Partial<AdFilterParams>) => void;
}

export function QuickFiltersRow({
  searchValue,
  onSearchChange,
  filteredCount,
  totalCount,
  viewMode,
  onViewModeChange,
  filters,
  onFilterChange,
}: QuickFiltersRowProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
      {/* Search Bar & Result Count Badge */}
      <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1 max-w-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search copy, title, brand name, link URL, or ad ID..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900/90 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-10 pr-8 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all font-medium"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtered Count Badge */}
        {filteredCount !== undefined && (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 whitespace-nowrap shadow-sm"
            title={`${filteredCount} ads match your active filters`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50 shrink-0" />
            <span>
              <strong className="text-slate-900 dark:text-white font-bold">
                {filteredCount.toLocaleString()}
              </strong>{" "}
              {filteredCount === 1 ? "ad" : "ads"}
            </span>
            {totalCount !== undefined && totalCount > 0 && filteredCount !== totalCount && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                of {totalCount.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Global Toolbar: Group Creatives + Vault + View Switcher + Sort Selector */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
        {/* Group Duplicate Creatives Toggle Button */}
        <button
          type="button"
          onClick={() => {
            const isCurrentlyGrouped = filters.groupBy === "creative";
            onFilterChange({
              groupBy: isCurrentlyGrouped ? "none" : "creative",
            });
          }}
          title="Combine duplicate copies into single ads"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
            filters.groupBy === "creative"
              ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-400 shadow-md shadow-amber-500/20 font-bold"
              : "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-amber-400/60 dark:hover:border-amber-500/40"
          }`}
        >
          <Zap className={`w-3.5 h-3.5 ${filters.groupBy === "creative" ? "fill-white text-white" : "text-amber-500"}`} />
          <span>{filters.groupBy === "creative" ? "Unique Creatives" : "Group Creatives"}</span>
        </button>

        {/* Quick Archive Vault Toggle Button */}
        <button
          type="button"
          onClick={() => {
            const newStatus = filters.status === "archived" ? "all" : "archived";
            onFilterChange({
              status: newStatus,
              smartPreset: undefined,
            });
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
            filters.status === "archived"
              ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30 font-bold"
              : "bg-slate-50 dark:bg-slate-900 text-purple-600 dark:text-purple-400 border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-900/60"
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>{filters.status === "archived" ? "Exit Archive" : "Archived Ads"}</span>
        </button>

        {/* View Mode Switcher: Grid vs List */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === "grid"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
            title="Grid View (Cards)"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("list")}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === "list"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
            title="List View (Line by Line)"
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Sort Selector */}
        <select
          value={filters.sortBy || "started_running_on"}
          onChange={(e) => onFilterChange({ sortBy: e.target.value as any })}
          className="bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
        >
          <option value="winner_score" className="bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 font-bold">
            🏆 Winner Score (Highest First)
          </option>
          <option value="duplication_count" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
            🔥 Most Scaled (Active Copies)
          </option>
          <option value="started_running_on" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
            ⚡ Newest Launched (Meta Date)
          </option>
          <option value="oldest" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
            ⏳ Longest Running (Evergreen)
          </option>
          <option value="product_creatives" className="bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 font-bold">
            🎯 Most Creative Angles (Product Depth)
          </option>
          <option value="recently_observed" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
            👁️ Recently Active (Last Verified)
          </option>
          <option value="first_seen_at" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
            📅 Newly Indexed (First Found)
          </option>
        </select>
      </div>
    </div>
  );
}

