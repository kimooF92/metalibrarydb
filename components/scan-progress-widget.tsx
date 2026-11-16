"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import {
  SCAN_TELEMETRY_CHANNEL,
  SCAN_STEP_EVENT,
  type ScanStepBroadcastPayload,
  type ScanProgressStep,
} from "@/lib/realtime-scan-types";

interface ScanProgressWidgetProps {
  scanningPageIds: string[];
  onScanFinished?: () => void;
}

const DISMISSED_STORAGE_KEY = "meta_brand_scan_progress_dismissed";
const MINIMIZED_STORAGE_KEY = "meta_brand_scan_progress_minimized";
const DISMISSED_EXPIRY_MS = 60 * 60 * 1000; // 1 hour expiry protection

function getDismissedState(): { ids: Set<string>; dismissedAt: number } {
  if (typeof window === "undefined") return { ids: new Set(), dismissedAt: 0 };
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return { ids: new Set(), dismissedAt: 0 };
    const parsed = JSON.parse(raw);
    if (Date.now() - (parsed.dismissedAt || 0) > DISMISSED_EXPIRY_MS) {
      localStorage.removeItem(DISMISSED_STORAGE_KEY);
      return { ids: new Set(), dismissedAt: 0 };
    }
    return {
      ids: new Set(Array.isArray(parsed.ids) ? parsed.ids : []),
      dismissedAt: Number(parsed.dismissedAt) || 0,
    };
  } catch {
    return { ids: new Set(), dismissedAt: 0 };
  }
}

function saveDismissedIds(newIds: string[]) {
  if (typeof window === "undefined") return;
  try {
    const state = getDismissedState();
    newIds.forEach((id) => {
      if (id) state.ids.add(id);
    });
    localStorage.setItem(
      DISMISSED_STORAGE_KEY,
      JSON.stringify({
        ids: Array.from(state.ids),
        dismissedAt: Date.now(),
      })
    );
  } catch {}
}

function clearDismissedIds() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DISMISSED_STORAGE_KEY);
  } catch {}
}

export function ScanProgressWidget({
  scanningPageIds,
  onScanFinished,
}: ScanProgressWidgetProps) {
  const [stepsMap, setStepsMap] = useState<Record<string, ScanProgressStep>>({});
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(MINIMIZED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const { ids: dismissedIds } = getDismissedState();
    if (scanningPageIds.length > 0 && scanningPageIds.every((id) => dismissedIds.has(id))) {
      return true;
    }
    return false;
  });

  const completedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onScanFinishedRef = useRef(onScanFinished);
  onScanFinishedRef.current = onScanFinished;

  const handleToggleMinimize = (minimized: boolean) => {
    setIsMinimized(minimized);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(MINIMIZED_STORAGE_KEY, String(minimized));
      } catch {}
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);

    const idsToDismiss = Array.from(
      new Set([
        ...scanningPageIds,
        ...Object.keys(stepsMap),
        ...Object.values(stepsMap).map((s) => s.pageId),
      ])
    ).filter(Boolean);

    saveDismissedIds(idsToDismiss);

    if (completedTimeoutRef.current) {
      clearTimeout(completedTimeoutRef.current);
      completedTimeoutRef.current = null;
    }

    // If all scans in stepsMap are already finished, clean up immediately
    const allDone =
      Object.keys(stepsMap).length > 0 &&
      Object.values(stepsMap).every((s) => s.step === "completed" || s.step === "failed");
    if (allDone) {
      setStepsMap({});
      onScanFinishedRef.current?.();
    }
  };

  const scanningIdsKey = useMemo(() => {
    return [...scanningPageIds].sort().join(",");
  }, [scanningPageIds]);

  // Poll Upstash Redis progress endpoint when active pages exist
  useEffect(() => {
    if (scanningPageIds.length === 0) {
      // If user had dismissed it, clean up silently without popping open
      if (isDismissed) {
        setStepsMap({});
        clearDismissedIds();
        return;
      }

      // Check if all existing steps are completed/failed
      const allDone =
        Object.keys(stepsMap).length > 0 &&
        Object.values(stepsMap).every((s) => s.step === "completed" || s.step === "failed");

      if (allDone && !completedTimeoutRef.current) {
        completedTimeoutRef.current = setTimeout(() => {
          setStepsMap({});
          clearDismissedIds();
          onScanFinishedRef.current?.();
        }, 5000);
      } else if (Object.keys(stepsMap).length === 0) {
        clearDismissedIds();
      }
      return;
    }

    if (completedTimeoutRef.current) {
      clearTimeout(completedTimeoutRef.current);
      completedTimeoutRef.current = null;
    }

    // Check if there is ANY new active scan that hasn't been dismissed
    const { ids: dismissedIds } = getDismissedState();
    const hasNewScan = scanningPageIds.some((id) => !dismissedIds.has(id));

    if (hasNewScan) {
      setIsDismissed(false);
    }

    const fetchProgress = async () => {
      // If widget is currently dismissed and no new scan appeared, skip poll to save quota
      if (isDismissed && !hasNewScan) return;

      try {
        const query = `pageIds=${encodeURIComponent(scanningPageIds.join(","))}`;
        const res = await fetch(`/api/scan-progress?${query}`);
        if (res.ok) {
          const data = await res.json();
          if (data.progress) {
            setStepsMap((prev) => ({
              ...prev,
              ...data.progress,
            }));
          }
        }
      } catch {
        // Silent network retry
      }
    };

    fetchProgress();
    // Throttled 3.5s polling loop pauses when tab is in background or widget is dismissed
    const interval = setInterval(() => {
      if (!document.hidden) fetchProgress();
    }, 3500);

    const handleVisibility = () => {
      if (!document.hidden) fetchProgress();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [scanningIdsKey, isDismissed]);

  // Real-time instant updates via Supabase Broadcast messages
  useEffect(() => {
    let channel: any = null;
    try {
      const supabase = getSupabase();
      channel = supabase
        .channel(SCAN_TELEMETRY_CHANNEL)
        .on("broadcast", { event: SCAN_STEP_EVENT }, (msg: { payload: ScanStepBroadcastPayload }) => {
          if (!msg?.payload) return;
          const step = msg.payload;
          setStepsMap((prev) => ({
            ...prev,
            [step.pageId]: {
              pageId: step.pageId,
              displayName: step.displayName,
              step: step.step,
              label: step.label,
              percent: step.percent,
              activeAds: step.activeAds,
              timestamp: step.timestamp,
            },
          }));

          // If a new active scan arrives that was not dismissed, un-dismiss
          const { ids: dismissed } = getDismissedState();
          if (!dismissed.has(step.pageId) && step.step !== "completed" && step.step !== "failed") {
            setIsDismissed(false);
          }
        })
        .subscribe();
    } catch {}

    return () => {
      if (channel) {
        try {
          const supabase = getSupabase();
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, []);

  const activeEntries = Object.values(stepsMap);
  const { ids: dismissedIds } = getDismissedState();
  const allEntriesDismissed =
    activeEntries.length > 0 &&
    activeEntries.every((s) => dismissedIds.has(s.pageId));

  if (activeEntries.length === 0 || isDismissed || allEntriesDismissed) return null;

  // Primary active step to display
  const primaryStep =
    activeEntries.find((s) => s.step !== "completed" && s.step !== "failed") ||
    activeEntries[0];

  const totalCount = activeEntries.length;
  const completedCount = activeEntries.filter(
    (s) => s.step === "completed" || s.step === "failed"
  ).length;
  const overallPercent = Math.round((completedCount / totalCount) * 100);

  const getStepStatusIcon = (step: string) => {
    switch (step) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />;
      case "locked":
        return <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />;
      default:
        return <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm w-full animate-in slide-in-from-bottom-3 duration-200">
      {/* Minimized Pill */}
      {isMinimized ? (
        <div className="flex items-center justify-between gap-3 p-3 bg-slate-900/90 dark:bg-slate-950/95 border border-indigo-500/30 rounded-2xl shadow-xl shadow-indigo-500/10 backdrop-blur-md text-white text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-600/30 text-indigo-400">
              <Zap className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="truncate">
              <span className="font-semibold">{primaryStep?.displayName || "Active Scrape"}</span>
              <span className="text-[10px] text-slate-400 ml-1.5 font-mono">
                {primaryStep?.percent ?? overallPercent}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleToggleMinimize(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
              title="Expand Details"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Expanded Floating Card */
        <div className="p-4 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-2xl shadow-slate-950/20 backdrop-blur-md space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                <Zap className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  Live Scraper Progress
                </h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  {completedCount} of {totalCount} completed ({overallPercent}%)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handleToggleMinimize(true)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Minimize"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={handleDismiss}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Items List */}
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {activeEntries.map((step) => {
              const isDone = step.step === "completed" || step.step === "failed";
              return (
                <div
                  key={step.pageId}
                  className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/50 bg-slate-50/70 dark:bg-slate-950/40 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {step.displayName || "Meta Page"}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      {step.percent}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        step.step === "failed"
                          ? "bg-rose-500"
                          : step.step === "completed"
                          ? "bg-emerald-500"
                          : "bg-indigo-600"
                      }`}
                      style={{ width: `${Math.max(5, Math.min(100, step.percent))}%` }}
                    />
                  </div>

                  {/* Active Step Ticker */}
                  <div className="flex items-center space-x-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                    {getStepStatusIcon(step.step)}
                    <span className="truncate">{step.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
