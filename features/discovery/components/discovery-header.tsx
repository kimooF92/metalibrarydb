"use client";

import React from "react";
import { Globe, Play, RefreshCw, Sparkles, Layers, Loader2 } from "lucide-react";
import { getRunKeywordDisplay } from "@/features/discovery/hooks/use-discovery-runs";

export interface DiscoveryHeaderRun {
  id: string;
  country: string;
  searchUrl: string;
  query?: string;
  status: "pending" | "running" | "completed" | "partial" | "failed";
  totalAdsScanned: number;
  totalPagesDiscovered: number;
  outcomeDetails?: string;
  createdAt: string;
}

export interface DiscoveryHeaderProps {
  runsConfig: {
    runs: DiscoveryHeaderRun[];
    selectedRunId: string | null;
    activeRun?: DiscoveryHeaderRun;
    isLoading: boolean;
  };
  messageConfig: {
    message: string | null;
    onDismiss: () => void;
  };
  onSelectRunId: (id: string) => void;
  onOpenNewScan: () => void;
  onRefresh: () => void;
}

export function DiscoveryHeader({
  runsConfig,
  messageConfig,
  onSelectRunId,
  onOpenNewScan,
  onRefresh,
}: DiscoveryHeaderProps) {
  const { runs, selectedRunId, activeRun, isLoading } = runsConfig;
  const { message, onDismiss } = messageConfig;

  return (
    <div className="space-y-3 shrink-0">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/60">
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-xs">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              Country Brand Discovery
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                Tunisia & Global
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Scan Meta Ad Library to uncover active e-commerce brands & winning products
            </p>
          </div>

          {/* Integrated Run Selector */}
          {runs.length > 0 && (
            <div className="sm:ml-3 flex items-center space-x-2 bg-slate-100 dark:bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
              {activeRun?.status === "running" ? (
                <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin shrink-0" />
              ) : (
                <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              )}
              <select
                value={selectedRunId || ""}
                onChange={(e) => onSelectRunId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer max-w-[220px] sm:max-w-[320px] truncate pr-1"
                title="Switch active discovery run"
              >
                {runs.map((r) => {
                  const kw = getRunKeywordDisplay(r);
                  const dateStr = new Date(r.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
                  const isRunning = r.status === "running" || r.status === "pending";
                  const seqMatch = r.outcomeDetails?.match(/Sequence (\d+\/\d+)/);
                  const seqBadge = seqMatch ? `[Seq ${seqMatch[1]}] ` : "";
                  return (
                    <option key={r.id} value={r.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {isRunning ? `[${r.status === "running" ? "Active" : "Queued"}] ` : ""}{seqBadge}{r.country} · {kw} ({r.totalPagesDiscovered} brands, {r.totalAdsScanned} ads) — {dateStr}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={onOpenNewScan}
            className="flex items-center space-x-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>New Discovery Scan</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh Scans & Pages"
            className="flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-indigo-500" : ""}`} />
            <span className="hidden sm:inline">{isLoading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {message && (
        <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-500/40 text-indigo-900 dark:text-indigo-200 text-xs font-medium flex items-center justify-between animate-in fade-in duration-150 shadow-sm">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>{message}</span>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-xs font-bold cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Empty Runs State (if no runs created yet) */}
      {runs.length === 0 && !isLoading && (
        <div className="p-8 sm:p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/40 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Globe className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Discovery Scans Yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Harvest active Meta Ad Library ads in Tunisia or worldwide to automatically uncover e-commerce brands and candidate winning products.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenNewScan}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition inline-flex items-center space-x-2 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Your First Discovery Scan</span>
          </button>
        </div>
      )}
    </div>
  );
}

