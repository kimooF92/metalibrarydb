"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Flame,
  CheckCircle2,
  Sparkles,
  ShoppingBag,
  Store,
  Layers,
  X,
} from "lucide-react";
import type { DiscoveryProductPreviewItem } from "./discovery-product-card";

interface DiscoverySecondSidebarProps {
  pages: DiscoveryProductPreviewItem[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string | null) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function DiscoverySecondSidebar({
  pages,
  selectedPageId,
  onSelectPage,
  isCollapsed,
  onToggleCollapse,
}: DiscoverySecondSidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPages = useMemo(() => {
    if (!searchTerm.trim()) return pages;
    const q = searchTerm.toLowerCase().trim();
    return pages.filter(
      (p) =>
        (p.displayName && p.displayName.toLowerCase().includes(q)) ||
        p.pageId.toLowerCase().includes(q) ||
        (p.previewProductTitle && p.previewProductTitle.toLowerCase().includes(q))
    );
  }, [pages, searchTerm]);

  const totalExtractedProducts = useMemo(() => {
    return pages.filter((p) => Boolean(p.previewProductImage)).length;
  }, [pages]);

  if (isCollapsed) {
    return (
      <div className="w-14 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-col items-center py-3 select-none">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition cursor-pointer"
          title="Expand Brands Panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-3 text-slate-400">
          <Layers className="w-4 h-4" />
          <span className="text-[10px] font-bold rotate-90 whitespace-nowrap tracking-wider uppercase mt-4">
            Brands ({pages.length})
          </span>
        </div>
      </div>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-col h-full select-none">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate">
            Discovered Brands ({pages.length})
          </h2>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition cursor-pointer"
          title="Collapse Panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Search Input */}
      <div className="p-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search brands or products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Pages Navigation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Sticky Top Item: "🌟 All Pages" */}
        <button
          onClick={() => onSelectPage(null)}
          className={`w-full text-left p-2.5 rounded-lg transition-all flex items-center justify-between cursor-pointer ${
            selectedPageId === null
              ? "bg-indigo-600 text-white font-bold shadow-sm"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className={`w-4 h-4 shrink-0 ${selectedPageId === null ? "text-amber-300" : "text-amber-500"}`} />
            <div className="min-w-0">
              <div className="text-xs truncate font-bold">All Brands</div>
              <div
                className={`text-[10px] truncate ${
                  selectedPageId === null ? "text-indigo-100" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {totalExtractedProducts} product{totalExtractedProducts === 1 ? "" : "s"} found
              </div>
            </div>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
              selectedPageId === null
                ? "bg-indigo-700 text-white"
                : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            {pages.length}
          </span>
        </button>

        <div className="h-[1px] bg-slate-200 dark:bg-slate-800/80 my-1" />

        {/* Individual Candidate Pages */}
        {filteredPages.map((page) => {
          const isSelected = selectedPageId === page.pageId || selectedPageId === page.id;
          const hasProduct = Boolean(page.previewProductImage);
          const isProcessing =
            page.previewScrapeStatus === "processing" || page.previewScrapeStatus === "pending";
          const isImported = page.status === "imported" || page.isTracked;
          const adCount = page.verifiedAdCount ?? page.matchingAdCount ?? 0;

          return (
            <button
              key={page.id}
              onClick={() => onSelectPage(page.pageId)}
              className={`w-full text-left p-2 rounded-lg transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                isSelected
                  ? "bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-400/80 text-indigo-950 dark:text-indigo-100 shadow-sm"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Visual Product Status Indicator Pill */}
                {isImported ? (
                  <span
                    className="w-2 h-2 rounded-full bg-purple-500 shrink-0"
                    title="Imported to dashboard"
                  />
                ) : hasProduct ? (
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                    title="Product preview extracted"
                  />
                ) : isProcessing ? (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0"
                    title="Extracting product preview..."
                  />
                ) : (
                  <span
                    className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"
                    title="No product landing page"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate leading-tight" title={page.displayName || `Page ${page.pageId}`}>
                    {page.displayName || `Page ${page.pageId}`}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 truncate">
                    <span>{page.country}</span>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Flame className="w-2.5 h-2.5 text-amber-500" />
                      {adCount} ads
                    </span>
                  </div>
                </div>
              </div>

              {/* Product Pill or Flag */}
              {hasProduct ? (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    isSelected
                      ? "bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200"
                      : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  Product ✓
                </span>
              ) : isImported ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                  Tracked
                </span>
              ) : null}
            </button>
          );
        })}

        {filteredPages.length === 0 && (
          <div className="p-4 text-center text-xs text-slate-400">
            No matching pages found
          </div>
        )}
      </div>
    </aside>
  );
}
