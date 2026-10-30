"use client";

import { Flame, Video, TrendingUp, Tag, RefreshCw } from "lucide-react";
import type { FreshWinnersStats } from "@/types";

interface FreshWinnersHeaderProps {
  stats?: FreshWinnersStats | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  windowDays?: string;
}

export function FreshWinnersHeader({
  stats,
  isLoading,
  onRefresh,
  windowDays = "7d",
}: FreshWinnersHeaderProps) {
  const windowLabel =
    windowDays === "3d" ? "Last 72 Hours" : windowDays === "14d" ? "Past 14 Days" : "Past 7 Days";

  return (
    <div className="space-y-3">
      {/* Header Row: Matching /products & /dashboard style */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Flame className="w-4 h-4 fill-rose-500/20" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-foreground tracking-tight">
                Fresh Winners
              </h1>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recently launched ad creatives and products gaining rapid scale across competitor stores.
          </p>
        </div>

        {/* Refresh button */}
        {onRefresh && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh winners feed"
              className="flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-rose-500" : "text-slate-400"}`} />
              <span className="text-[11px]">{isLoading ? "Updating..." : "Refresh Feed"}</span>
            </button>
          </div>
        )}
      </div>

      {/* 4 Executive KPI Cards (Matching /dashboard and /products theme) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Fresh Scalers */}
        <div className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-500" />
              <span>Scaling Ads</span>
            </span>
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-md">
              {windowLabel}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {stats?.totalBreakouts ?? (isLoading ? "--" : 0)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              <strong className="text-slate-700 dark:text-slate-200">{stats?.activeBrandsCount ?? 0}</strong> brands scaling
            </span>
          </div>
        </div>

        {/* KPI 2: Video Rate */}
        <div className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-indigo-500" />
              <span>Video Share</span>
            </span>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md">
              Creatives
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {stats?.videoRatePercent ?? 0}%
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Video ad formats</span>
          </div>
        </div>

        {/* KPI 3: Top Category */}
        <div className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
              <span>Top Category</span>
            </span>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
              Niche
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-base md:text-lg font-black text-slate-900 dark:text-white tracking-tight truncate max-w-[180px]">
              {stats?.topCategory || "—"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Most duplicated niche</span>
          </div>
        </div>

        {/* KPI 4: Average Winning Price */}
        <div className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-emerald-500" />
              <span>Average Price</span>
            </span>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
              Offer
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {stats?.medianPrice || "—"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Average store price</span>
          </div>
        </div>
      </div>
    </div>
  );
}
