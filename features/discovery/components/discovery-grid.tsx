"use client";

import React from "react";
import { Loader2, ShoppingBag, Sparkles, X } from "lucide-react";
import { DiscoveryProductCard, type DiscoveryProductPreviewItem } from "@/components/discovery/discovery-product-card";
import type { DiscoveredPage } from "@/features/discovery/hooks/use-discovered-pages";

export interface DiscoveryGridState {
  isLoading: boolean;
  productGridFilter: "all" | "with_preview" | "no_preview";
  selectedPageFilter: string | null;
  totalFilteredCount: number;
  totalExtractedCount: number;
  hasSelectedRun: boolean;
  isEnriching: boolean;
  isActionPending: boolean;
}

export interface DiscoveryGridActions {
  onFilterChange: (filter: "all" | "with_preview" | "no_preview") => void;
  onClearPageFilter: () => void;
  onValidateAndMerge: (item: DiscoveryProductPreviewItem) => Promise<void>;
  onMergePageOnly: (item: DiscoveryProductPreviewItem) => Promise<void>;
  onIgnoreCard: (pageId: string) => Promise<void>;
  onExtractProducts?: () => void;
}

export interface DiscoveryGridProps {
  pages: DiscoveredPage[];
  gridState: DiscoveryGridState;
  actions: DiscoveryGridActions;
}

export function DiscoveryGrid({
  pages,
  gridState,
  actions,
}: DiscoveryGridProps) {
  const {
    isLoading,
    productGridFilter,
    selectedPageFilter,
    totalFilteredCount,
    totalExtractedCount,
    hasSelectedRun,
    isEnriching,
    isActionPending,
  } = gridState;

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-sm overflow-hidden">
      {/* Grid Sub-Filter Bar */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-2 bg-slate-50/40 dark:bg-slate-900/20 text-xs flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Preview Status:
          </span>
          <button
            type="button"
            onClick={() => actions.onFilterChange("all")}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition cursor-pointer ${
              productGridFilter === "all"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            All ({totalFilteredCount})
          </button>
          <button
            type="button"
            onClick={() => actions.onFilterChange("with_preview")}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
              productGridFilter === "with_preview"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Sparkles className="w-3 h-3 text-emerald-500" />
            <span>With Live Preview ({totalExtractedCount})</span>
          </button>
          <button
            type="button"
            onClick={() => actions.onFilterChange("no_preview")}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition cursor-pointer ${
              productGridFilter === "no_preview"
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Pending / Fallback ({totalFilteredCount - totalExtractedCount})
          </button>
        </div>

        {selectedPageFilter && (
          <button
            type="button"
            onClick={actions.onClearPageFilter}
            className="text-indigo-600 dark:text-indigo-400 hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>Page Filter Active</span>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Product Cards Grid Body */}
      {isLoading ? (
        <div className="p-16 text-center text-slate-500 dark:text-slate-400 space-y-2">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 dark:text-indigo-400" />
          <div>Loading discovered pages & products...</div>
        </div>
      ) : pages.length === 0 ? (
        <div className="p-16 text-center text-slate-500 dark:text-slate-400 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center mx-auto text-slate-400">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {productGridFilter === "with_preview"
              ? "No pages have extracted live product previews yet."
              : "No discovered pages match this filter."}
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {productGridFilter === "with_preview"
              ? "Click 'Extract Products' above to scrape live product candidates (title, image, price) for candidate brands in this run."
              : "Try adjusting your status or sidebar filter to view more pages."}
          </p>
          {hasSelectedRun && productGridFilter === "with_preview" && actions.onExtractProducts && (
            <button
              type="button"
              onClick={actions.onExtractProducts}
              disabled={isEnriching}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>Extract Live Products Now</span>
            </button>
          )}
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {pages.map((page) => (
            <DiscoveryProductCard
              key={page.id}
              item={page}
              onValidateAndMerge={actions.onValidateAndMerge}
              onMergePageOnly={actions.onMergePageOnly}
              onIgnore={actions.onIgnoreCard}
              isActionPending={isActionPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
