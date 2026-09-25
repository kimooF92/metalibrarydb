"use client";

import React, { useState } from "react";
import {
  Zap,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  X,
  Layers,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { useSmallPagesScan } from "./small-pages-scan-context";
import { useToast } from "./toast-context";

export function SmallPagesScanBanner() {
  const {
    count,
    inQueueCount,
    pendingEnqueueCount,
    isDismissed,
    dismiss,
    openModal,
    enqueueAll,
    enqueuing,
  } = useSmallPagesScan();

  const { showToast } = useToast();
  const [copiedBatch, setCopiedBatch] = useState(false);

  // If there are no small pages needing scan, or if the user explicitly clicked "Dismiss", hide the banner
  if (count === 0 || isDismissed) {
    return null;
  }

  const handleEnqueue = async () => {
    const enqueued = await enqueueAll();
    showToast({
      type: "success",
      title: "Pages Enqueued",
      message: `Enqueued ${enqueued} small page(s) for local Playwright creative scan.`,
    });
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(".\\run-worker.bat");
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2000);
    showToast({
      type: "info",
      title: "Command Copied",
      message: "Copied '.\\run-worker.bat' to clipboard!",
    });
  };

  return (
    <>
      <div
        id="small-pages-scan-banner"
        className="relative w-full z-20 border-b border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-indigo-500/10 dark:from-amber-950/45 dark:via-slate-900/90 dark:to-indigo-950/35 backdrop-blur-md px-4 py-3 shadow-xs select-none transition-all duration-300"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          {/* Left: Icon & Noticeable Title/Description */}
          <div className="flex items-start sm:items-center space-x-3 min-w-0">
            {/* Glowing Icon Badge */}
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500 text-white dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.35)] shrink-0 mt-0.5 sm:mt-0">
              <Zap className="w-4 h-4 fill-current animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2.5 min-w-0">
              {/* Highlight Badge */}
              <div className="flex items-center space-x-1.5 shrink-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 shadow-xs">
                  {count} {count === 1 ? "Page" : "Pages"} to Scan
                </span>
                <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  Small Brands Ready for Local Worker
                </span>
              </div>

              <span className="hidden lg:inline text-slate-400 dark:text-slate-600">•</span>

              <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-1 sm:line-clamp-none">
                {count} small {count === 1 ? "page" : "pages"} (&lt; 50 ads) have detected new ads or first scans.
                {pendingEnqueueCount > 0 ? ` ${pendingEnqueueCount} waiting to enqueue.` : " All queued in local worker."}
              </p>
            </div>
          </div>

          {/* Right: Actions & Strict Dismiss Button */}
          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
            {/* Enqueue button if any not yet enqueued */}
            {pendingEnqueueCount > 0 ? (
              <button
                onClick={handleEnqueue}
                disabled={enqueuing}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                title="Enqueue all pending small pages into the worker queue"
              >
                {enqueuing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Enqueuing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Enqueue All ({pendingEnqueueCount})</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleCopyCommand}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer"
                title="Click to copy run-worker.bat command"
              >
                {copiedBatch ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Run Worker</span>
                  </>
                )}
              </button>
            )}

            {/* View Details Modal Button */}
            <button
              onClick={openModal}
              className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-xs transition-all cursor-pointer"
            >
              <span>View Pages</span>
              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* STRICT DISMISS BUTTON: The ONLY way the banner closes */}
            <button
              onClick={dismiss}
              title="Dismiss banner (stays dismissed until new small pages need scanning)"
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <SmallPagesScanModal />
    </>
  );
}

/**
 * Compact badge for TopBar to show the number of small pages needing a scan.
 * If the user dismissed the banner, clicking this badge immediately un-dismisses it!
 */
export function SmallPagesScanBadge() {
  const { count, isDismissed, unDismiss, openModal } = useSmallPagesScan();

  if (count === 0) return null;

  return (
    <button
      onClick={() => {
        if (isDismissed) {
          unDismiss();
        } else {
          openModal();
        }
      }}
      title={
        isDismissed
          ? `${count} small page(s) need creative scan. Click to show banner.`
          : `${count} small page(s) ready for local scan. Click to view.`
      }
      className={`relative flex items-center h-8 space-x-1.5 px-2.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
        isDismissed
          ? "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35 hover:bg-amber-500/25 shadow-xs"
      }`}
    >
      <Zap className={`w-3.5 h-3.5 fill-current ${isDismissed ? "text-amber-500" : "text-amber-500 animate-pulse"}`} />
      <span>{count}</span>
      <span className="hidden xl:inline text-[11px] font-medium opacity-85">
        {count === 1 ? "page" : "pages"} to scan
      </span>
      {!isDismissed && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping absolute top-0.5 right-0.5" />
      )}
    </button>
  );
}

/**
 * Modal to view and inspect all small pages waiting for local scan
 */
export function SmallPagesScanModal() {
  const {
    isModalOpen,
    closeModal,
    pages,
    count,
    inQueueCount,
    pendingEnqueueCount,
    enqueueAll,
    enqueuing,
    dismiss,
  } = useSmallPagesScan();

  const { showToast } = useToast();
  const [copiedBatch, setCopiedBatch] = useState(false);

  if (!isModalOpen) return null;

  const handleEnqueue = async () => {
    const enqueued = await enqueueAll();
    showToast({
      type: "success",
      title: "Pages Enqueued",
      message: `Enqueued ${enqueued} small page(s) for local Playwright creative scan.`,
    });
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(".\\run-worker.bat");
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2000);
    showToast({
      type: "info",
      title: "Command Copied",
      message: "Copied '.\\run-worker.bat' to clipboard!",
    });
  };

  const handleDismissAndClose = () => {
    dismiss();
    closeModal();
    showToast({
      type: "info",
      title: "Banner Dismissed",
      message: "Small pages scan banner dismissed. You can reopen it anytime from the top bar badge.",
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={closeModal}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Small Pages Needing Creative Scan
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  {count} Pages
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Brands with under 50 ads and new activity ready for local Playwright extraction
              </p>
            </div>
          </div>

          <button
            onClick={closeModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Instructions & Stats Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-100/50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">In Worker Queue</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{inQueueCount} pages</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Waiting to Enqueue</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{pendingEnqueueCount} pages</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Worker Command</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">run-worker.bat</span>
            </div>
          </div>
        </div>

        {/* List of Pages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-slate-100 dark:divide-slate-800/60">
          {pages.map((p) => {
            const isQueueActive = p.isInQueue;
            const isNewAds = p.reason === "new_ads";
            const isNeverScanned = p.reason === "never_scanned";

            return (
              <div
                key={p.id}
                className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="truncate">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {p.displayName}
                      </span>
                      {p.pageId && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({p.pageId})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{p.currentResults} active ads</span>
                      {p.lastCreativeScan && (
                        <>
                          <span>•</span>
                          <span>
                            Last scan: {new Date(p.lastCreativeScan).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {/* Status / Reason Badge */}
                  {isQueueActive ? (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <Zap className="w-3 h-3" />
                      <span>In Queue</span>
                    </span>
                  ) : isNewAds ? (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <TrendingUp className="w-3 h-3" />
                      <span>+{p.latestDifference} New Ads</span>
                    </span>
                  ) : isNeverScanned ? (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      <Sparkles className="w-3 h-3" />
                      <span>Initial Scan</span>
                    </span>
                  ) : null}

                  {/* Meta Ad Library link */}
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title="Open Meta Ad Library"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyCommand}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer"
            >
              {copiedBatch ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Copied .\\run-worker.bat</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Worker Command</span>
                </>
              )}
            </button>

            <button
              onClick={handleDismissAndClose}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Dismiss Banner
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {pendingEnqueueCount > 0 && (
              <button
                onClick={handleEnqueue}
                disabled={enqueuing}
                className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {enqueuing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Enqueuing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Enqueue {pendingEnqueueCount} Pages</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={closeModal}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
