"use client";

import { Flame, RefreshCw, SlidersHorizontal } from "lucide-react";

interface FreshWinnersEmptyProps {
  onResetFilters: () => void;
  windowDays?: string;
}

export function FreshWinnersEmpty({ onResetFilters, windowDays = "7d" }: FreshWinnersEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/30 backdrop-blur-sm space-y-4 my-6">
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center shadow-sm">
        <Flame className="w-7 h-7" />
      </div>

      <div className="max-w-md space-y-1">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          No Fresh Winners Detected in this Window
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          No newly launched ads reached the current scaling threshold ({windowDays === "3d" ? "last 72 hours" : "past 7 days"}).
          Try expanding to the 14-day window, lowering the minimum duplication count to 2+ copies, or clearing filters.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onResetFilters}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-600/30 transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Filters to Defaults</span>
        </button>
      </div>
    </div>
  );
}
