"use client";

import type { AdFilterParams } from "@/types";
import { X } from "lucide-react";

interface ActiveFilterBadgesProps {
  filters: AdFilterParams;
  searchValue: string;
  activeBrandName?: string;
  datePreset: string;
  onFilterChange: (newFilters: Partial<AdFilterParams>) => void;
  onReset: () => void;
}

export function ActiveFilterBadges({
  filters,
  searchValue,
  activeBrandName,
  datePreset,
  onFilterChange,
  onReset,
}: ActiveFilterBadgesProps) {
  const excludedIds = filters.excludePageIds || [];
  const isWinnerScoreActive = Boolean(filters.minWinnerScore && filters.minWinnerScore > 0);
  const isScaleActive = Boolean(filters.minDuplications && filters.minDuplications > 1);
  const isMediaActive = Boolean(filters.mediaType && filters.mediaType !== "all");
  const isDateActive = Boolean(filters.dateFrom || filters.dateTo || (datePreset && datePreset !== "all"));
  const isExcludedActive = excludedIds.length > 0;
  const isTrackedPageActive = Boolean(filters.trackedPageId);
  const isGroupActive = Boolean(filters.groupBy && filters.groupBy !== "none");

  return (
    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-1.5 flex-wrap animate-in fade-in duration-100">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
        Active:
      </span>

      {/* Tracked Brand Chip */}
      {isTrackedPageActive && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
          <span>Brand: {activeBrandName || filters.trackedPageId}</span>
          <button
            type="button"
            onClick={() => onFilterChange({ trackedPageId: undefined })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Remove brand filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Search Chip */}
      {searchValue.trim() !== "" && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
          <span>Search: &ldquo;{searchValue}&rdquo;</span>
          <button
            type="button"
            onClick={() => onFilterChange({ search: undefined })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Smart Preset Chip */}
      {filters.smartPreset && filters.smartPreset !== "all" && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
          <span>Preset: {filters.smartPreset}</span>
          <button
            type="button"
            onClick={() => onFilterChange({ smartPreset: undefined })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Clear preset"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Status Chip */}
      {filters.status && filters.status !== "all" && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
          <span>Status: {filters.status}</span>
          <button
            type="button"
            onClick={() => onFilterChange({ status: "all" })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Clear status filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Min Duplications Chip */}
      {isScaleActive && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
          <span>{filters.minDuplications}+ copies</span>
          <button
            type="button"
            onClick={() => onFilterChange({ minDuplications: 1 })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Clear scale filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Winner Score Chip */}
      {isWinnerScoreActive && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
          <span>Winner Score: {filters.minWinnerScore}+</span>
          <button
            type="button"
            onClick={() => onFilterChange({ minWinnerScore: 0 })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Clear winner score filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Media Format Chip */}
      {isMediaActive && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
          <span>Format: {filters.mediaType}</span>
          <button
            type="button"
            onClick={() => onFilterChange({ mediaType: "all" })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Clear media format filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Date Filter Chip */}
      {isDateActive && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
          <span>Date: {datePreset !== "all" && datePreset !== "custom" ? datePreset : "Custom range"}</span>
          <button
            type="button"
            onClick={() => onFilterChange({ dateFrom: undefined, dateTo: undefined })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Clear date filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Excluded Brands Chip */}
      {isExcludedActive && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300">
          <span>{excludedIds.length} Brands Excluded</span>
          <button
            type="button"
            onClick={() => onFilterChange({ excludePageIds: [] })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Clear brand exclusions"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Creative Grouping Chip */}
      {isGroupActive && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
          <span>Unique Creatives Only</span>
          <button
            type="button"
            onClick={() => onFilterChange({ groupBy: "none" })}
            className="hover:text-rose-500 cursor-pointer p-0.5"
            title="Disable creative grouping"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* Quick Clear All Link */}
      <button
        type="button"
        onClick={onReset}
        className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-auto"
      >
        Clear all
      </button>
    </div>
  );
}

