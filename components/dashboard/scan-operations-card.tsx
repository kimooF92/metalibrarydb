"use client";

import { useState } from "react";
import {
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Play,
  RefreshCw,
  Sparkles,
  Moon,
  Clock,
  Timer,
  Loader2,
  ShieldAlert,
  ArrowUpRight,
} from "lucide-react";
import { useScanStatus } from "@/hooks/use-scan-status";
import { useToast } from "@/components/toast-context";

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
  darkCount?: number;
  revivedCount?: number;
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
  const { showToast } = useToast();
  const {
    scheduleStatus,
    activeScan,
    lastBatchSummary,
    formattedCountdown,
    secondsRemaining,
    isTriggering,
    triggerScanNow,
    refreshStatus,
  } = useScanStatus();

  // Combine initial server props with live realtime telemetry
  const isPaused = scheduleStatus?.workerState?.isPaused ?? data?.isPaused ?? false;
  const circuitBreaker = scheduleStatus?.workerState?.circuitBreakerTripped ?? data?.circuitBreakerTripped ?? false;
  const scansToday = scheduleStatus?.workerState?.scansToday ?? data?.scansToday ?? 0;
  const scansThisHour = scheduleStatus?.workerState?.scansThisHour ?? data?.scansThisHour ?? 0;

  const successRate = data?.successRate ?? 100;
  const completed = data?.completedCount ?? 0;
  const totalBrands = data?.totalBrands ?? 0;
  const pending = scheduleStatus?.pendingJobsCount ?? data?.queuePending ?? 0;
  const running = scheduleStatus?.runningJobsCount ?? data?.queueRunning ?? 0;
  const darkCount = data?.darkCount ?? ((data?.failedCount ?? 0) + (data?.onHoldCount ?? 0));
  const revivedCount = data?.revivedCount ?? 0;
  const attentionCount = darkCount;

  const isActivelyScanning =
    Boolean(activeScan && activeScan.step !== "completed" && activeScan.step !== "failed") ||
    running > 0 ||
    scheduleStatus?.isQueueRunning;

  // Engine Status Badges
  const statusBadge = isActivelyScanning
    ? { text: "Scanning", class: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30", pulse: true }
    : isPaused
    ? { text: "Paused", class: "bg-amber-500/10 text-amber-500 border-amber-500/20", pulse: false }
    : circuitBreaker
    ? { text: "Tripped", class: "bg-rose-500/10 text-rose-500 border-rose-500/20", pulse: false }
    : { text: "Active", class: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", pulse: false };

  const handleTriggerNow = async () => {
    const res = await triggerScanNow(false);
    if (res.success) {
      showToast({
        title: "⚡ Batch Scan Enqueued",
        message: `${res.count ?? 0} eligible brand page(s) queued for refresh.`,
        type: "success",
      });
      onRefresh?.();
    } else {
      showToast({
        title: "Scan Trigger Failed",
        message: res.error || "Could not enqueue scan batch.",
        type: "error",
      });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs p-4 flex flex-col space-y-3.5">
      {/* 1. Header & Live Engine Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500/10 text-blue-500">
            <Zap className="w-3.5 h-3.5" />
          </span>
          <div>
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Scan Operations & Mission Center
            </h2>
          </div>
        </div>

        {/* Engine Status Badge */}
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusBadge.class}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full bg-current ${statusBadge.pulse ? "animate-ping" : ""}`}></span>
          <span>{statusBadge.text}</span>
        </span>
      </div>

      {/* 2. Next Scan Countdown Timer Bar & Action */}
      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            {isActivelyScanning ? (
              <Activity className="w-4 h-4 animate-spin" />
            ) : (
              <Timer className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {isActivelyScanning
                  ? "Scan in Progress"
                  : scheduleStatus?.nextScanReason === "stale_page_eligible"
                  ? "Stale Pages Due"
                  : "Next Scheduled Scan"}
              </span>
              {scheduleStatus?.nextScanReason === "cron_schedule" && (
                <span className="text-[9px] font-mono font-medium px-1 py-0.2 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  UTC Window
                </span>
              )}
            </div>
            <div className="text-xs font-extrabold text-slate-900 dark:text-white font-mono truncate">
              {isActivelyScanning ? (
                <span className="text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                  Streaming Real-time
                </span>
              ) : secondsRemaining <= 0 ? (
                <span className="text-amber-600 dark:text-amber-400 font-bold">
                  Eligible for scan now
                </span>
              ) : (
                <span>in {formattedCountdown}</span>
              )}
            </div>
          </div>
        </div>

        {/* Trigger Scan Now CTA */}
        <button
          onClick={handleTriggerNow}
          disabled={isTriggering || isActivelyScanning}
          title="Enqueue stale pages immediately and trigger scan runner"
          className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white disabled:text-slate-400 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
        >
          {isTriggering ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isTriggering ? "Queuing..." : "Scan Now"}</span>
        </button>
      </div>

      {/* 3. Live Scan Progression Visualizer (Rendered when actively scanning or recently completed) */}
      {activeScan && (
        <div className="p-3 rounded-lg bg-cyan-50/60 dark:bg-cyan-950/20 border border-cyan-200/80 dark:border-cyan-800/60 space-y-2 animate-in fade-in duration-300">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              {activeScan.profilePicUrl ? (
                <img
                  src={activeScan.profilePicUrl}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-cyan-300 dark:border-cyan-700"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-cyan-200 dark:bg-cyan-800 flex items-center justify-center text-[10px] font-bold text-cyan-900 dark:text-cyan-100 shrink-0">
                  {activeScan.displayName?.charAt(0) || "B"}
                </div>
              )}
              <span className="font-bold text-slate-900 dark:text-white truncate">
                {activeScan.displayName}
              </span>
              {activeScan.country && (
                <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300">
                  {activeScan.country}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {activeScan.activeAds !== undefined && activeScan.activeAds !== null && (
                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  {activeScan.activeAds} ads
                </span>
              )}
              <span className="text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-400">
                {activeScan.percent}%
              </span>
            </div>
          </div>

          {/* Animated Gradient Progress Bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-500 h-1.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(5, activeScan.percent)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="truncate">{activeScan.label}</span>
            {activeScan.batchIndex && (
              <span className="font-mono text-[10px] font-semibold text-slate-400 shrink-0 ml-2">
                Job #{activeScan.batchIndex}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 4. Operational 4-Metric Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Metric 1: Scraper Runs Today */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Scraper Runs Today
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-base font-black text-slate-900 dark:text-white">
              {loading ? "--" : scansToday}
            </span>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400" title="Scraper executions per hour">
              +{scansThisHour}/hr
            </span>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
            Page and discovery checks
          </span>
        </div>

        {/* Metric 2: Scan Health */}
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
          <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
            Error-free execution
          </span>
        </div>

        {/* Metric 3: In-Flight Queue */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            In-Flight Queue
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
          <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
            Jobs awaiting worker
          </span>
        </div>

        {/* Metric 4: Active Brand Coverage */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Active Brand Coverage
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-base font-black text-slate-900 dark:text-white">
              {loading ? "--" : `${completed}/${totalBrands}`}
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              healthy
            </span>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
            Brands with active ads
          </span>
        </div>
      </div>

      {/* 5. Last Completed Batch Summary (Rendered when idle and summary is available) */}
      {!activeScan && lastBatchSummary && (
        <div className="p-2 rounded-lg bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-1.5 truncate">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="truncate">
              Last batch: <strong>{lastBatchSummary.totalScanned}</strong> brands in {lastBatchSummary.durationSeconds}s
            </span>
          </div>
          {lastBatchSummary.newAdsCount > 0 && (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded shrink-0">
              +{lastBatchSummary.newAdsCount} new ads
            </span>
          )}
        </div>
      )}

      {/* 6. Coverage Drift: Went Dark vs. Revived Pages */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Went Dark */}
        <div className="p-2 rounded-lg bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 flex items-center justify-between">
          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-bold text-[11px]">
              <Moon className="w-3.5 h-3.5 shrink-0" />
              <span>Went Dark</span>
              <span className="text-[9px] font-normal px-1 py-0.2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                Current
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">On hold / 0 active ads</p>
          </div>
          <span className="text-sm font-black text-rose-600 dark:text-rose-400 font-mono shrink-0">
            {loading ? "--" : darkCount}
          </span>
        </div>

        {/* Revived */}
        <div className="p-2 rounded-lg bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-between">
          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              <span>Revived</span>
              <span className="text-[9px] font-normal px-1 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                Last 7d
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Relaunched campaigns</p>
          </div>
          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono shrink-0">
            {loading ? "--" : revivedCount}
          </span>
        </div>
      </div>

      {/* 8. Attention Required Banner */}
      {attentionCount > 0 ? (
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs">
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
        <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-semibold">
            All active competitor brand pages are healthy and scanning normally.
          </span>
        </div>
      )}
    </div>
  );
}
