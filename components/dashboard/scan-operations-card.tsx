"use client";

import { Zap, Activity, CheckCircle2, AlertTriangle, Play, RefreshCw } from "lucide-react";

export interface ScanOperationsData {
  scansToday: number;
  scansThisHour: number;
  isPaused: boolean;
  circuitBreakerTripped: boolean;
  totalBrands: number;
  completedCount: number;
  scanningCount: number;
  failedCount: number;
  onHoldCount: number;
  successRate: number;
  queuePending: number;
  queueRunning: number;
}

interface ScanOperationsCardProps {
  data?: ScanOperationsData;
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function ScanOperationsCard({
  data,
  loading = false,
  onRefresh,
  refreshing = false,
}: ScanOperationsCardProps) {
  const scansToday = data?.scansToday ?? 0;
  const scansThisHour = data?.scansThisHour ?? 0;
  const isPaused = data?.isPaused ?? false;
  const circuitBreaker = data?.circuitBreakerTripped ?? false;
  const successRate = data?.successRate ?? 100;
  const completed = data?.completedCount ?? 0;
  const totalBrands = data?.totalBrands ?? 0;
  const pending = data?.queuePending ?? 0;
  const running = data?.queueRunning ?? 0;
  const attentionCount = (data?.failedCount ?? 0) + (data?.onHoldCount ?? 0);

  const statusBadge = isPaused
    ? { text: "Paused", class: "bg-amber-500/10 text-amber-500 border-amber-500/20" }
    : circuitBreaker
    ? { text: "Tripped", class: "bg-rose-500/10 text-rose-500 border-rose-500/20" }
    : { text: "Active", class: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500/10 text-blue-500">
            <Zap className="w-3.5 h-3.5" />
          </span>
          <div>
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Scan Operations & Coverage
            </h2>
          </div>
        </div>

        {/* Engine Status Badge */}
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusBadge.class}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          <span>{statusBadge.text}</span>
        </span>
      </div>

      {/* Operational 4-Metric Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Metric 1: Scans Today */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Scans Today
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-base font-black text-slate-900 dark:text-white">
              {loading ? "--" : scansToday}
            </span>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
              +{scansThisHour}/hr
            </span>
          </div>
        </div>

        {/* Metric 2: Success Rate */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Scan Health
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
              {loading ? "--" : `${successRate}%`}
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              success
            </span>
          </div>
        </div>

        {/* Metric 3: Active Queue */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Pending Queue
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-base font-black text-slate-900 dark:text-white">
              {loading ? "--" : pending}
            </span>
            {running > 0 ? (
              <span className="text-[10px] font-extrabold text-cyan-500 animate-pulse">
                {running} active
              </span>
            ) : (
              <span className="text-[10px] font-medium text-slate-400">idle</span>
            )}
          </div>
        </div>

        {/* Metric 4: Brand Coverage */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Brands Scanned
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-base font-black text-slate-900 dark:text-white">
              {loading ? "--" : `${completed}/${totalBrands}`}
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              active
            </span>
          </div>
        </div>
      </div>

      {/* Attention Required Banner (if any brands failed or are on hold) */}
      {attentionCount > 0 ? (
        <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-bold">
              {attentionCount} brands on hold or with consecutive 0 scans
            </span>
          </div>
          <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-300">
            Check
          </span>
        </div>
      ) : (
        <div className="mt-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-semibold">
            All active competitor brand pages are healthy & scanning normally.
          </span>
        </div>
      )}
    </div>
  );
}
