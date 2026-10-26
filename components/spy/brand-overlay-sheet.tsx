"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, X } from "lucide-react";

interface BrandOverlaySheetProps {
  children: React.ReactNode;
  brandId?: string;
}

export function BrandOverlaySheet({ children, brandId }: BrandOverlaySheetProps) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // 1. Lock background <main> element scroll while overlay is active
  useEffect(() => {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;
    const originalOverflow = mainEl.style.overflow;
    mainEl.style.overflow = "hidden";

    return () => {
      mainEl.style.overflow = originalOverflow;
    };
  }, []);

  // 2. Global ESC key listener (guards against closing if a child modal is active)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // If an input/textarea has focus, don't close immediately
        const activeTag = document.activeElement?.tagName;
        if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

        // Check if any child modal or dropdown is open
        const childModals = document.querySelectorAll(
          "[role='dialog']:not([data-brand-overlay='true']), [data-child-modal-open='true']"
        );
        if (childModals.length > 0) return;

        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // 3. Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
      handleClose();
    }
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Brand Deep Dive Analytics Overlay"
      data-brand-overlay="true"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        ref={sheetRef}
        className="w-full max-w-[96vw] xl:max-w-[94vw] h-full bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-6 duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Floating Control Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 shrink-0 z-20">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
              title="Return to Meta Ad Tracker (Esc)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Tracker</span>
              <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.2 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-500">
                Esc
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {brandId && (
              <a
                href={`/spy/brand/${encodeURIComponent(brandId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Open brand deep dive in a full standalone window"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open Full Window</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close overlay (Esc)"
              aria-label="Close brand deep dive"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Workspace Container */}
        <div
          id="brand-overlay-scroll-container"
          className="flex-1 overflow-y-auto p-4 sm:p-6"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
