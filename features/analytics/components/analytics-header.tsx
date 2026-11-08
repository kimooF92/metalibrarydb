"use client";

import { BarChart3, RefreshCw } from "lucide-react";
import { DateRangeFilter, DateRange } from "@/components/analytics/date-range-filter";
import { ExportDropdown } from "@/components/analytics/export-dropdown";

export interface AnalyticsHeaderCounts {
  totalProducts: number;
  totalAds: number;
  totalPages: number;
}

export interface AnalyticsHeaderProps {
  counts: AnalyticsHeaderCounts;
  lastRefreshed: Date | null;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  isLoading: boolean;
  isStale: boolean;
  onRefresh: () => void;
}

export function AnalyticsHeader({
  counts,
  lastRefreshed,
  dateRange,
  onDateRangeChange,
  isLoading,
  isStale,
  onRefresh,
}: AnalyticsHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800/40">
      <div className="flex items-center flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
            Competitor & Market Intelligence
          </h1>
        </div>
        <span className="text-[10px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium hidden md:inline-block">
          {counts.totalProducts} products • {counts.totalAds} creatives • {counts.totalPages} monitored pages
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {lastRefreshed && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline-block">
            Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <DateRangeFilter value={dateRange} onChange={onDateRangeChange} />
        <ExportDropdown dateRange={dateRange} />
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border transition-all cursor-pointer disabled:opacity-50 ${
            isStale
              ? "border-amber-400 dark:border-amber-500/60 ring-1 ring-amber-400/40"
              : "border-slate-200 dark:border-slate-700"
          }`}
          title={isStale ? "Data is older than 30 minutes. Click to refresh." : "Refresh active tab"}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isStale ? "text-amber-500" : "text-indigo-500"} ${
              isLoading ? "animate-spin" : ""
            }`}
          />
          <span>Refresh Analytics</span>
          {isStale && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          )}
        </button>
      </div>
    </div>
  );
}

