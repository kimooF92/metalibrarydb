"use client";

import React, { useEffect, useCallback, useRef, useState, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, X } from "lucide-react";

export interface BrandOverlayMeta {
  displayName?: string;
  currentResults?: number;
}

interface BrandOverlayContextType {
  setOverlayMeta: (meta: BrandOverlayMeta) => void;
  onClose?: () => void;
  isModal?: boolean;
}

const BrandOverlayContext = createContext<BrandOverlayContextType>({
  setOverlayMeta: () => {},
  onClose: () => {},
  isModal: true,
});

export const useBrandOverlay = () => useContext(BrandOverlayContext);

interface BrandOverlaySheetProps {
  children: React.ReactNode;
  brandId?: string;
}

export function BrandOverlaySheet({ children, brandId }: BrandOverlaySheetProps) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [overlayMeta, setOverlayMeta] = useState<BrandOverlayMeta>({});
  const [currentSearch, setCurrentSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Trigger smooth enter slide-in transition on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setIsOpen(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Graceful animated close before routing back
  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      router.back();
    }, 220);
  }, [router, isClosing]);

  // Sync current query params (e.g. ?tab=products) for "Open Full Window"
  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentSearch(window.location.search);
      const handleStateChange = () => setCurrentSearch(window.location.search);
      window.addEventListener("popstate", handleStateChange);
      return () => window.removeEventListener("popstate", handleStateChange);
    }
  }, []);

  // Prevent background scroll bleed when wheeling directly on backdrop
  const handleBackdropWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      e.preventDefault();
    }
  };

  // Global ESC key listener (guards against closing if a child modal is active)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // If an input/textarea has focus, let the input handle ESC or blur
        const activeTag = document.activeElement?.tagName;
        if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

        // Check if any child modal or dialog is open
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

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
      handleClose();
    }
  };

  const fullWindowUrl = brandId
    ? `/spy/brand/${encodeURIComponent(brandId)}${currentSearch}`
    : "#";

  return (
    <BrandOverlayContext.Provider value={{ setOverlayMeta, onClose: handleClose, isModal: true }}>
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label="Brand Deep Dive Analytics Overlay"
        data-brand-overlay="true"
        onClick={handleBackdropClick}
        onWheel={handleBackdropWheel}
        className={`fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          isOpen && !isClosing ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          ref={sheetRef}
          className={`w-full max-w-[96vw] xl:max-w-[94vw] h-full bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 ease-out ${
            isOpen && !isClosing ? "translate-x-0" : "translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Floating Control Bar */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 shrink-0 z-20">
            {/* Left: Universal Back button + Brand Meta Badge */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer shrink-0"
                title="Return to previous view (Esc)"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
                <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.2 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-500">
                  Esc
                </kbd>
              </button>

              {overlayMeta.displayName && (
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <span className="text-slate-300 dark:text-slate-700 shrink-0">•</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {overlayMeta.displayName}
                  </span>
                  {overlayMeta.currentResults !== undefined && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{overlayMeta.currentResults} ads</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right: Full window link + Close [X] */}
            <div className="flex items-center gap-2 shrink-0">
              {brandId && (
                <a
                  href={fullWindowUrl}
                  onClick={(e) => {
                    if (brandId && typeof window !== "undefined") {
                      e.currentTarget.href = `/spy/brand/${encodeURIComponent(brandId)}${window.location.search}`;
                    }
                  }}
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
            className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
          >
            {children}
          </div>
        </div>
      </div>
    </BrandOverlayContext.Provider>
  );
}
