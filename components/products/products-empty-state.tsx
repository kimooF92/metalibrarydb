"use client";

import Link from "next/link";
import {
  ShoppingBag,
  Star,
  Search,
  Building2,
  Tag,
  Globe,
  SlidersHorizontal,
  Calendar,
  EyeOff,
  Eye,
  Sparkles,
  X,
} from "lucide-react";
import type { SmartPreset } from "./products-kpi-bar";

interface ProductsEmptyStateProps {
  smartPreset: SmartPreset;

  // Active filter values — used for contextual chips
  debouncedSearch: string;
  debouncedBrand: string;
  platform: string;
  categoryFilter: string;
  statusFilter: string;
  hideInactive: boolean;
  discoveryFilter: string;

  // 1-click clear callbacks
  onClearSearch: () => void;
  onClearBrand: () => void;
  onClearPlatform: () => void;
  onClearCategory: () => void;
  onClearStatus: () => void;
  onClearDiscovery: () => void;
  onClearHideInactive: () => void;
  onClearPreset: () => void;
  onResetAll: () => void;
}

export function ProductsEmptyState({
  smartPreset,
  debouncedSearch,
  debouncedBrand,
  platform,
  categoryFilter,
  statusFilter,
  hideInactive,
  discoveryFilter,
  onClearSearch,
  onClearBrand,
  onClearPlatform,
  onClearCategory,
  onClearStatus,
  onClearDiscovery,
  onClearHideInactive,
  onClearPreset,
  onResetAll,
}: ProductsEmptyStateProps) {
  const hasActiveFilters =
    debouncedSearch.trim() ||
    debouncedBrand.trim() ||
    platform !== "all" ||
    categoryFilter !== "all" ||
    statusFilter !== "all" ||
    hideInactive ||
    (smartPreset !== "all" && smartPreset !== "favorites") ||
    discoveryFilter !== "all";

  const isFavoriteMode = smartPreset === "favorites";

  return (
    <div className="py-16 text-center bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/80 p-8 flex flex-col items-center justify-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
        {isFavoriteMode ? (
          <Star className="w-8 h-8 text-amber-500" />
        ) : (
          <ShoppingBag className="w-8 h-8" />
        )}
      </div>

      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          {isFavoriteMode ? "No Starred Favorite Products Yet" : "No Matching Products Found"}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mt-1">
          {isFavoriteMode
            ? "Click the star (⭐) button on any product card to add it to your starred favorites watchlist."
            : hasActiveFilters
            ? "Your active filters narrowed down results to 0. Use 1-click recovery below or reset all."
            : "Run ad spy scans to automatically extract, deduplicate, and scrape product landing pages."}
        </p>
      </div>

      {/* Contextual 1-Click Targeted Filter Recovery Chips */}
      {hasActiveFilters && (
        <div className="flex flex-col items-center gap-2 max-w-md w-full pt-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            1-Click Recovery Options:
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {debouncedSearch.trim() && (
              <button
                type="button"
                onClick={onClearSearch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer transition-colors"
              >
                <Search className="w-3 h-3 text-indigo-500" />
                <span>Clear Search &ldquo;{debouncedSearch}&rdquo;</span>
              </button>
            )}

            {debouncedBrand.trim() && (
              <button
                type="button"
                onClick={onClearBrand}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer transition-colors"
              >
                <Building2 className="w-3 h-3 text-indigo-500" />
                <span>Clear Brand &ldquo;{debouncedBrand}&rdquo;</span>
              </button>
            )}

            {hideInactive && (
              <button
                type="button"
                onClick={onClearHideInactive}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/60 cursor-pointer transition-colors"
              >
                <EyeOff className="w-3 h-3 text-emerald-500" />
                <span>Include Inactive (Off-Air)</span>
              </button>
            )}

            {categoryFilter !== "all" && (
              <button
                type="button"
                onClick={onClearCategory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-semibold text-xs hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer transition-colors"
              >
                <Tag className="w-3 h-3 text-amber-500" />
                <span>Clear Category ({categoryFilter})</span>
              </button>
            )}

            {platform !== "all" && (
              <button
                type="button"
                onClick={onClearPlatform}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              >
                <Globe className="w-3 h-3 text-slate-500" />
                <span>Clear Platform ({platform})</span>
              </button>
            )}

            {statusFilter !== "all" && (
              <button
                type="button"
                onClick={onClearStatus}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              >
                <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                <span>Reset Scrape Status</span>
              </button>
            )}

            {discoveryFilter !== "all" && (
              <button
                type="button"
                onClick={onClearDiscovery}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              >
                <Calendar className="w-3 h-3 text-slate-500" />
                <span>Reset Discovery Date</span>
              </button>
            )}

            {smartPreset !== "all" && smartPreset !== "favorites" && (
              <button
                type="button"
                onClick={onClearPreset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-semibold text-xs hover:bg-purple-100 dark:hover:bg-purple-900/60 cursor-pointer transition-colors"
              >
                <Sparkles className="w-3 h-3 text-purple-500" />
                <span>Switch to All Products</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onResetAll}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Reset All Filters
        </button>
        <Link
          href="/spy"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm cursor-pointer transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Explore Ad Spy Feed</span>
        </Link>
      </div>
    </div>
  );
}
