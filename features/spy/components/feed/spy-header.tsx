"use client";

import { Eye, RefreshCw } from "lucide-react";
import { ApifyCreditBadge } from "@/components/apify-credit-badge";

export interface SpyHeaderProps {
  stats?: {
    totalAdsCaptured?: number;
    launchedLast7Days?: number;
    scaledAdsCount?: number;
    mediaDistribution?: { image: number; video: number; carousel?: number };
  };
  filteredTotal?: number;
  autoStream: boolean;
  onToggleAutoStream: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function SpyHeader({
  autoStream,
  onToggleAutoStream,
  isRefreshing,
  onRefresh,
}: SpyHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border">
      {/* Title & Subtitle */}
      <div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Eye className="w-4 h-4" />
          </div>
          <h1 className="text-lg font-black text-foreground tracking-tight">
            Ad Spy Feed
          </h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Live stream and filter competitor Meta ads, track creative angles, and spot breakout campaigns.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Live Auto-Stream Toggle */}
        <button
          type="button"
          onClick={onToggleAutoStream}
          className={`flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
            autoStream
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/30"
              : "bg-card hover:bg-accent text-foreground border-border shadow-xs"
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
          className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-card hover:bg-accent text-foreground border border-border transition-all cursor-pointer shadow-xs disabled:opacity-60"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`}
          />
          <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>
    </div>
  );
}
