"use client";

import { useState } from "react";
import { Zap, Monitor, Sparkles, X, Loader2 } from "lucide-react";
import { TrackedPage } from "@/types";

interface ScanRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackedPages: TrackedPage[];
  onConfirm: (runner: "local" | "apify") => Promise<void>;
}

export function ScanRunnerModal({
  isOpen,
  onClose,
  trackedPages,
  onConfirm,
}: ScanRunnerModalProps) {
  const [selectedRunner, setSelectedRunner] = useState<"local" | "apify">("apify");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || trackedPages.length === 0) return null;

  const count = trackedPages.length;
  const targetLabel =
    count === 1
      ? trackedPages[0].displayName || trackedPages[0].pageId || "Tracked Page"
      : `${count} selected pages`;

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
              Choose Extraction Engine
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Select how you want to extract ad creatives for{" "}
          <strong className="text-slate-800 dark:text-slate-200">{targetLabel}</strong>:
        </p>

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
            disabled={isSubmitting}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Launching...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Launch Scan ({selectedRunner === "apify" ? "Apify Cloud" : "Local"})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
