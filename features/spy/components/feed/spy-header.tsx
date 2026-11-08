"use client";

import { Eye, Layers, Calendar, Video, Image as ImageIcon, RefreshCw } from "lucide-react";
import { ApifyCreditBadge } from "@/components/apify-credit-badge";

export interface SpyHeaderProps {
  stats: {
    totalAdsCaptured: number;
    launchedLast7Days: number;
    scaledAdsCount: number;
    mediaDistribution: { image: number; video: number };
  };
  filteredTotal: number;
  autoStream: boolean;
  onToggleAutoStream: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function SpyHeader({
  stats,
  filteredTotal,
  autoStream,
  onToggleAutoStream,
  isRefreshing,
  onRefresh,
}: SpyHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800/40">
        <div className="flex items-center space-x-2">
          <Eye className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
            Ad Spy Feed
          </h1>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-2.5 py-0.5 rounded-full font-medium hidden md:inline-flex items-center gap-1.5">
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {filteredTotal.toLocaleString()} filtered ads
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span>{stats.totalAdsCaptured.toLocaleString()} total captured</span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span>{stats.launchedLast7Days.toLocaleString()} new this week</span>
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Live Auto-Stream Toggle */}
          <button
            type="button"
            onClick={onToggleAutoStream}
            className={`flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
              autoStream
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/30"
                : "bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            }`}
            title={
              autoStream
                ? "Auto-streaming is ON. New ads appear automatically."
                : "Click to auto-stream new ads to feed"
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${autoStream ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}
            />
            <span>Live Stream: {autoStream ? "ON" : "OFF"}</span>
          </button>

          <ApifyCreditBadge />

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shrink-0 disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`}
            />
            <span>{isRefreshing ? "Refreshing..." : "Refresh Feed"}</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-2.5 sm:p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Captured
            </span>
            <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
            {stats.totalAdsCaptured.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-2.5 sm:p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Launched (7 Days)
            </span>
            <Calendar className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.launchedLast7Days.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-2.5 sm:p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Scaled Ads (5+)
            </span>
            <Layers className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          </div>
          <p className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {stats.scaledAdsCount.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-2.5 sm:p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Media Formats
            </span>
            <Video className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs font-semibold flex-wrap">
            <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[11px]">
              <ImageIcon className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />{" "}
              {stats.mediaDistribution.image} img
            </span>
            <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[11px]">
              <Video className="w-3 h-3 text-purple-500 dark:text-purple-400" />{" "}
              {stats.mediaDistribution.video} vid
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

