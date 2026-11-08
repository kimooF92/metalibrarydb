"use client";

import { Flame, Video, TrendingUp, Tag, RefreshCw, Layers, ShoppingBag } from "lucide-react";
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

  const totalProducts = stats?.totalProducts ?? stats?.totalBreakouts ?? 0;
  const totalCreatives = stats?.totalActiveCreatives ?? 0;
  const avgCreatives = stats?.avgCreativesPerProduct ?? 0;
  const videoPercent = stats?.videoSharePercent ?? stats?.videoRatePercent ?? 0;

  return (
    <div className="space-y-3">
      {/* Header Row */}
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
            Recently launched e-commerce products gaining scale through active multi-creative testing.
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

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Fresh Scalers */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-rose-500" />
              <span>Scaling Products</span>
            </span>
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-md">
              {windowLabel}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {isLoading ? "--" : totalProducts}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              <strong className="text-slate-700 dark:text-slate-200">{avgCreatives}</strong> avg creatives/product
            </span>
          </div>
        </div>

        {/* KPI 2: Creative Volume */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>Creative Volume</span>
            </span>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md">
              Active Ads
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {isLoading ? "--" : totalCreatives}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Distinct scaling creatives</span>
          </div>
        </div>

        {/* KPI 3: Video Rate */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-amber-500" />
              <span>Video Share</span>
            </span>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
              Formats
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {videoPercent}%
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Video & UGC formats</span>
          </div>
        </div>

        {/* KPI 4: Average Winning Price */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 shadow-xs">
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
            <span>{stats?.topCategory ? `Top niche: ${stats.topCategory}` : "Average store offer"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
