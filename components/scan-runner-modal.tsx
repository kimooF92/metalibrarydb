"use client";

import { useState, useEffect } from "react";
import { Zap, Monitor, Sparkles, X, Loader2, Pause, Play, CheckCircle2 } from "lucide-react";
import { TrackedPage } from "@/types";

interface ScanRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackedPages: TrackedPage[];
  onConfirm: (runner: "local" | "apify") => Promise<void>;
  onAutoScanChanged?: (pageIds: string[], enabled: boolean) => void;
}

export function ScanRunnerModal({
  isOpen,
  onClose,
  trackedPages,
  onConfirm,
  onAutoScanChanged,
}: ScanRunnerModalProps) {
  const [selectedRunner, setSelectedRunner] = useState<"local" | "apify">("apify");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingAutoScan, setIsTogglingAutoScan] = useState(false);
  const [localAutoScanState, setLocalAutoScanState] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && trackedPages.length > 0) {
      const initial: Record<string, boolean> = {};
      trackedPages.forEach((p) => {
        initial[p.id] = p.autoCreativeScan !== false;
      });
      setLocalAutoScanState(initial);
      setFeedback(null);
      const allSmall = trackedPages.every((p) => (p.currentResults || 0) < 20);
      setSelectedRunner(allSmall ? "local" : "apify");
    }
  }, [isOpen, trackedPages]);

  if (!isOpen || trackedPages.length === 0) return null;

  const count = trackedPages.length;
  const isSingle = count === 1;
  const targetLabel = isSingle
    ? trackedPages[0].displayName || trackedPages[0].pageId || "Tracked Page"
    : `${count} selected pages`;

  const singlePage = trackedPages[0];
  const isSingleActive = isSingle
    ? (localAutoScanState[singlePage.id] ?? (singlePage.autoCreativeScan !== false))
    : true;

  // Multi-page counts
  const activeCount = trackedPages.filter(
    (p) => (localAutoScanState[p.id] ?? (p.autoCreativeScan !== false))
  ).length;
  const pausedCount = count - activeCount;

  const handleToggleAutoScan = async (enable: boolean) => {
    setIsTogglingAutoScan(true);
    setFeedback(null);
    try {
      const pageIds = trackedPages.map((p) => p.id);
      let res: Response;
      if (isSingle) {
        res = await fetch(`/api/page/${pageIds[0]}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoCreativeScan: enable }),
        });
      } else {
        res = await fetch("/api/pages/auto-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageIds, autoCreativeScan: enable }),
        });
      }

      if (res.ok) {
        const nextState = { ...localAutoScanState };
        pageIds.forEach((id) => {
          nextState[id] = enable;
        });
        setLocalAutoScanState(nextState);
        onAutoScanChanged?.(pageIds, enable);
        setFeedback(
          enable
            ? isSingle
              ? "⚡ Automatic creative scans enabled"
              : `⚡ Enabled auto-scan for ${pageIds.length} pages`
            : isSingle
            ? "⏸️ Automatic creative scans paused (Apify credits saved)"
            : `⏸️ Paused auto-scan for ${pageIds.length} pages`
        );
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback(errData.error || "Failed to update auto-scan settings");
      }
    } catch {
      setFeedback("Network error updating auto-scan");
    } finally {
      setIsTogglingAutoScan(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(selectedRunner);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/60 pb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Creative Scan & Auto-Scan Control
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting || isTogglingAutoScan}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Label */}
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Target: <strong className="text-slate-800 dark:text-slate-200">{targetLabel}</strong>
        </div>

        {/* Auto-Scan Status & Quick Toggle Card */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Automatic Creative Scanning
              </span>
            </div>

            {isSingle ? (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isSingleActive
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                }`}
              >
                {isSingleActive ? (
                  <>
                    <Zap className="w-3 h-3 fill-emerald-500/30 text-emerald-500" />
                    Active
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3 text-amber-500" />
                    Paused
                  </>
                )}
              </span>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {activeCount} Active
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {pausedCount} Paused
                </span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {isSingle ? (
              isSingleActive ? (
                "Routine count scans & Apify crons automatically extract newly added ads. Pause to prevent Apify credit consumption."
              ) : (
                "Automatic scans are paused. Apify credits saved. Manual scans triggered below will still run on-demand anytime."
              )
            ) : (
              "Control whether background sweeps and cron jobs automatically extract newly detected ads for all selected brands."
            )}
          </p>

          {/* Toggle Action Buttons */}
          <div className="pt-1 flex items-center gap-2">
            {isSingle ? (
              <button
                type="button"
                onClick={() => handleToggleAutoScan(!isSingleActive)}
                disabled={isTogglingAutoScan || isSubmitting}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSingleActive
                    ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {isTogglingAutoScan ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : isSingleActive ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause Auto-Scan</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume Auto-Scan</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleToggleAutoScan(false)}
                  disabled={isTogglingAutoScan || isSubmitting}
                  className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isTogglingAutoScan ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Pause className="w-3.5 h-3.5" />
                  )}
                  <span>Pause All</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleAutoScan(true)}
                  disabled={isTogglingAutoScan || isSubmitting}
                  className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isTogglingAutoScan ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>Enable All</span>
                </button>
              </>
            )}
          </div>

          {feedback && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}
        </div>

        {/* Section Divider & Manual Trigger Title */}
        <div className="space-y-1 pt-1">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Manual Extraction Engine
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Select an engine to launch an immediate creative scan:
          </p>
        </div>

        {/* Runner Options Grid */}
        <div className="grid grid-cols-1 gap-3">
          {/* Apify Delta Option */}
          <button
            type="button"
            onClick={() => setSelectedRunner("apify")}
            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              selectedRunner === "apify"
                ? "bg-amber-500/10 border-amber-500 dark:border-amber-400 ring-2 ring-amber-500/20"
                : "bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-500 shrink-0 mt-0.5">
              <Zap className="w-5 h-5 fill-amber-500/30" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  ⚡ Apify Delta Cloud
                </span>
                <span className="text-[9px] bg-amber-500/20 text-amber-600 dark:text-amber-300 px-1.5 py-0.2 rounded font-bold">
                  Fastest & Recommended
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                Cloud-based incremental scraping. Scrapes only newly added ads (Delta + Safety Buffer) using your Apify credit balance. Bypasses IP limits.
              </p>
            </div>
          </button>

          {/* Local Playwright Option */}
          <button
            type="button"
            onClick={() => setSelectedRunner("local")}
            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              selectedRunner === "local"
                ? "bg-indigo-500/10 border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/20"
                : "bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-500 shrink-0 mt-0.5">
              <Monitor className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  🖥️ Local Playwright Worker
                </span>
                <span className="text-[9px] bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.2 rounded font-bold">
                  Free ($0)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                Enqueues a job for your local desktop Playwright worker (`run-worker.bat`). Full infinite scroll extraction.
              </p>
            </div>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isTogglingAutoScan}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || isTogglingAutoScan}
            className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Launching...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Launch Manual Scan ({selectedRunner === "apify" ? "Apify Cloud" : "Local"})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
