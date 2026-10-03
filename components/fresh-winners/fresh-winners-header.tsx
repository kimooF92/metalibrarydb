"use client";

import { Flame, Video, TrendingUp, Tag, Sparkles, RefreshCw } from "lucide-react";
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
  const windowLabel = windowDays === "3d" ? "Last 72 Hours" : windowDays === "14d" ? "Past 14 Days" : "Past 7 Days";

  return (
    <div className="space-y-6">
      {/* Top Banner Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-500/25 ring-2 ring-rose-500/30">
              <Flame className="w-5 h-5 text-white fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Fresh Winners Radar
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-xs">
                  Live Velocity
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Surfacing newly launched ad creatives & products showing verified scaling signals in Tunisia.
              </p>
            </div>
          </div>
        </div>

        {/* Refresh button */}
        {onRefresh && (
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-rose-500" : ""}`} />
              <span>Refresh Feed</span>
            </button>
          </div>
        )}
      </div>

      {/* 4 Market Pulse Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Fresh Scalers */}
        <div className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-500/[0.04] via-pink-500/[0.02] to-amber-500/[0.04] p-4 dark:border-rose-500/25 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Fresh Scalers</span>
            <div className="w-7 h-7 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Flame className="w-4 h-4 fill-rose-500/20" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {stats?.totalBreakouts ?? (isLoading ? "..." : 0)}
            </span>
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              {windowLabel}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {stats?.activeBrandsCount ?? 0} active brands scaling
          </p>
        </div>

        {/* Card 2: Video Rate */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Video Dominance</span>
            <div className="w-7 h-7 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Video className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {stats?.videoRatePercent ?? 0}%
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              of winners
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            High-production video ads
          </p>
        </div>

        {/* Card 3: Top Scaling Niche */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Hottest Niche</span>
            <div className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white truncate">
              {stats?.topCategory || "General & Other"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Fastest scaling product category
          </p>
        </div>

        {/* Card 4: Median Winning Price */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Median Price</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {stats?.medianPrice || "—"}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              avg checkout
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Sweet spot for Tunisian COD
          </p>
        </div>
      </div>
    </div>
  );
}
