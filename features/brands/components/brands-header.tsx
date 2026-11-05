"use client";

import { DashboardStats } from "@/types";
import { RefreshCw, Plus } from "lucide-react";

interface BrandsHeaderProps {
  stats: DashboardStats | null;
  isManualRefreshing: boolean;
  pagesLoading: boolean;
  onTrackUrlClick: () => void;
  onRefreshClick: () => void;
}

export function BrandsHeader({
  stats,
  isManualRefreshing,
  pagesLoading,
  onTrackUrlClick,
  onRefreshClick,
}: BrandsHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800/40">
      <div className="flex items-center flex-wrap gap-2">
        <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
          Tracked Brands
        </h1>

        {stats && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-semibold">
              <span className="text-slate-400 font-normal">Monitored:</span>
              <span>{stats.totalPages}</span>
            </span>

            <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md font-semibold">
              <span className="text-emerald-600/70 dark:text-emerald-400/70 font-normal">Completed:</span>
              <span>{stats.completed}</span>
            </span>

            {stats.failed > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-md font-semibold">
                <span className="text-rose-600/70 dark:text-rose-400/70 font-normal">Failed:</span>
                <span>{stats.failed}</span>
              </span>
            )}

            {stats.scanning > 0 && (
              <span className="flex items-center space-x-1 text-[11px] bg-cyan-50 dark:bg-cyan-950/80 border border-cyan-200 dark:border-cyan-500/30 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-md font-semibold animate-pulse shrink-0">
                <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-500 dark:text-cyan-400" />
                <span>Scanning {stats.scanning}...</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onTrackUrlClick}
          className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Track URL</span>
        </button>

        <button
          onClick={onRefreshClick}
          disabled={isManualRefreshing || pagesLoading}
          title="Refresh dashboard data"
          className="group flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-95 disabled:opacity-60 shadow-xs hover:shadow-sm"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 transition-transform duration-300 ${
              isManualRefreshing || pagesLoading
                ? "animate-spin text-indigo-500"
                : "group-hover:rotate-90 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200"
            }`}
          />
          <span>{isManualRefreshing ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>
    </div>
  );
}

