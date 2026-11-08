"use client";

import type { AdFilterParams } from "@/types";
import { Award, Target, Clock, Ban, RefreshCw } from "lucide-react";

interface AdvancedFiltersDrawerProps {
  isOpen: boolean;
  filters: AdFilterParams;
  datePreset: string;
  onFilterChange: (newFilters: Partial<AdFilterParams>) => void;
  onDatePresetChange: (preset: string) => void;
  onOpenBrandModal: () => void;
  onClose: () => void;
  onReset: () => void;
}

export function AdvancedFiltersDrawer({
  isOpen,
  filters,
  datePreset,
  onFilterChange,
  onDatePresetChange,
  onOpenBrandModal,
  onClose,
  onReset,
}: AdvancedFiltersDrawerProps) {
  if (!isOpen) return null;

  const excludedIds = filters.excludePageIds || [];
  const isWinnerScoreActive = Boolean(filters.minWinnerScore && filters.minWinnerScore > 0);
  const isScaleActive = Boolean(filters.minDuplications && filters.minDuplications > 1);
  const isAnglesActive = Boolean(filters.minProductCreatives && filters.minProductCreatives > 0);
  const isDaysRunningActive = Boolean(filters.minDaysRunning && filters.minDaysRunning > 0);
  const isMediaActive = Boolean(filters.mediaType && filters.mediaType !== "all");
  const isCtaActive = Boolean(filters.ctaText && filters.ctaText !== "all");
  const isDateActive = Boolean(filters.dateFrom || filters.dateTo || (datePreset && datePreset !== "all"));
  const isStatusActive = Boolean(filters.status && filters.status !== "all" && filters.status !== "archived");
  const isExcludedActive = excludedIds.length > 0;
  const isTrackedPageActive = Boolean(filters.trackedPageId);
  const isProductFilterActive = Boolean(filters.productId || filters.productKey);

  const totalActiveAdvancedCount =
    (isWinnerScoreActive ? 1 : 0) +
    (isScaleActive ? 1 : 0) +
    (isAnglesActive ? 1 : 0) +
    (isDaysRunningActive ? 1 : 0) +
    (isMediaActive ? 1 : 0) +
    (isCtaActive ? 1 : 0) +
    (isDateActive ? 1 : 0) +
    (isStatusActive ? 1 : 0) +
    (isExcludedActive ? 1 : 0) +
    (isTrackedPageActive ? 1 : 0) +
    (isProductFilterActive ? 1 : 0);

  return (
    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in slide-in-from-top-2 duration-150 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* COLUMN 1: Performance & Scale */}
        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/70 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              Performance & Scale
            </span>
            {(isWinnerScoreActive || isScaleActive || isStatusActive) && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            )}
          </div>

          {/* Winner Score */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
              Winner Score
            </label>
            <select
              value={filters.minWinnerScore || 0}
              onChange={(e) =>
                onFilterChange({ minWinnerScore: Number(e.target.value), smartPreset: undefined })
              }
              className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                isWinnerScoreActive
                  ? "bg-amber-50/50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              <option value={0}>All Scores (Any)</option>
              <option value={85}>🏆 85+ (Super Winners Only)</option>
              <option value={70}>🔥 70+ (High Potential)</option>
              <option value={50}>⚡ 50+ (Promising Tests)</option>
            </select>
          </div>

          {/* Scale / Copies */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
              Active Duplicate Copies
            </label>
            <select
              value={filters.minDuplications || 1}
              onChange={(e) =>
                onFilterChange({ minDuplications: Number(e.target.value), smartPreset: undefined })
              }
              className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                isScaleActive
                  ? "bg-amber-50/50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              <option value={1}>All ads (1+ copies)</option>
              <option value={3}>3+ copies running</option>
              <option value={5}>🔥 5+ copies (Scaling)</option>
              <option value={10}>🚀 10+ copies (Heavy Scale)</option>
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
              Ad Status
            </label>
            <select
              value={filters.status || "all"}
              onChange={(e) =>
                onFilterChange({ status: e.target.value as any, smartPreset: undefined })
              }
              className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                isStatusActive
                  ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
              <option value="archived">Archived (Vault)</option>
            </select>
          </div>
        </div>

        {/* COLUMN 2: Creative & Format */}
        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/70 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-cyan-500" />
              Creative & Format
            </span>
            {(isAnglesActive || isMediaActive || isCtaActive) && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
            )}
          </div>

          {/* Creative Angles */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
              Creative Angles (Depth)
            </label>
            <select
              value={filters.minProductCreatives || 0}
              onChange={(e) =>
                onFilterChange({ minProductCreatives: Number(e.target.value), smartPreset: undefined })
              }
              className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                isAnglesActive
                  ? "bg-cyan-50/50 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              <option value={0}>All Products</option>
              <option value={2}>🎯 2+ Angles (Multi-Angle)</option>
              <option value={3}>🎯 3+ Angles (Proven Iteration)</option>
              <option value={5}>🎯 5+ Angles (Heavy Scale)</option>
            </select>
          </div>

          {/* Media Type */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
              Media Format
            </label>
            <select
              value={filters.mediaType || "all"}
              onChange={(e) =>
                onFilterChange({ mediaType: e.target.value as any, smartPreset: undefined })
              }
              className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                isMediaActive
                  ? "bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              <option value="all">All Media</option>
              <option value="video">Videos Only</option>
              <option value="image">Images Only</option>
              <option value="carousel">Carousel Only</option>
            </select>
          </div>

          {/* CTA Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
              Call to Action (CTA)
            </label>
            <select
              value={filters.ctaText || "all"}
              onChange={(e) =>
                onFilterChange({ ctaText: e.target.value as any, smartPreset: undefined })
              }
              className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                isCtaActive
                  ? "bg-blue-50/50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-200"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              <option value="all">All CTAs</option>
              <option value="ecom_any">🛍️ Any Shop / Buy CTA</option>
              <option value="Shop Now">Shop Now</option>
              <option value="Order Now">Order Now / Commander</option>
              <option value="Learn More">Learn More</option>
              <option value="Send Message">Send Message / WhatsApp</option>
              <option value="Get Offer">Get Offer</option>
              <option value="Sign Up">Sign Up</option>
              <option value="Contact Us">Contact Us</option>
            </select>
          </div>
        </div>

        {/* COLUMN 3: Timeline & Brands */}
        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/70 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              Timeline & Brands
            </span>
            {(isDaysRunningActive || isDateActive || isExcludedActive) && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            )}
          </div>

          {/* Running Duration */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
              Running Duration
            </label>
            <select
              value={filters.minDaysRunning || 0}
              onChange={(e) =>
                onFilterChange({ minDaysRunning: Number(e.target.value), smartPreset: undefined })
              }
              className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                isDaysRunningActive
                  ? "bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              <option value={0}>Any duration</option>
              <option value={1}>Running 1+ days</option>
              <option value={7}>Running 7+ days</option>
              <option value={14}>Running 14+ days</option>
              <option value={30}>Running 30+ days (Evergreen)</option>
              <option value={60}>Running 60+ days</option>
            </select>
          </div>

          {/* Launch Date */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
              Launch Date (Meta Date)
            </label>
            <select
              value={Boolean(filters.dateFrom || filters.dateTo) ? "custom" : datePreset}
              onChange={(e) => {
                onFilterChange({ smartPreset: undefined });
                onDatePresetChange(e.target.value);
              }}
              className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                isDateActive
                  ? "bg-emerald-50/50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="custom">📅 Custom Range...</option>
            </select>
          </div>

          {/* Exclude Brands Button */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
              Brand Filtering
            </label>
            <button
              type="button"
              onClick={onOpenBrandModal}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                isExcludedActive
                  ? "bg-rose-50/60 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-sm"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-rose-300 dark:hover:border-rose-800"
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="truncate">
                  {isExcludedActive ? `${excludedIds.length} Brands Excluded` : "Exclude Brands..."}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-normal">Manage</span>
            </button>
          </div>
        </div>
      </div>

      {/* Drawer Footer Actions */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {totalActiveAdvancedCount > 0 ? (
            <span>
              <strong className="text-slate-900 dark:text-white font-bold">{totalActiveAdvancedCount}</strong> custom{" "}
              {totalActiveAdvancedCount === 1 ? "filter" : "filters"} applied
            </span>
          ) : (
            <span>No custom filters active (showing default preset)</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {totalActiveAdvancedCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="px-3 py-1 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Reset all
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1 rounded-lg text-xs font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition cursor-pointer shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

