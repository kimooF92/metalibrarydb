"use client";

import { Flame, RefreshCw } from "lucide-react";

interface FreshWinnersEmptyProps {
  onResetFilters: () => void;
  windowDays?: string;
}

export function FreshWinnersEmpty({ onResetFilters, windowDays = "7d" }: FreshWinnersEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center rounded-xl border border-border bg-card space-y-3.5 my-4">
      <div className="w-11 h-11 rounded-xl bg-muted text-muted-foreground border border-border flex items-center justify-center shadow-xs">
        <Flame className="w-5 h-5 text-rose-500" />
      </div>

      <div className="max-w-md space-y-1">
        <h3 className="text-sm font-bold text-foreground">
          No Fresh Winners Found
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          No ad campaigns match your scale and freshness criteria in the{" "}
          {windowDays === "3d" ? "last 72 hours" : windowDays === "14d" ? "past 14 days" : "past 7 days"}.
          Try switching to 14 days, lowering the copies threshold, or clearing your active filters.
        </p>
      </div>

      <div className="pt-1">
        <button
          onClick={onResetFilters}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Filters</span>
        </button>
      </div>
    </div>
  );
}
