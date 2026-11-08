"use client";

import type { BrandAnalyticsCalculations } from "@/types";
import type { BrandSubTab } from "../../types";
import { TrendingUp, TrendingDown, Flame, Star, AlertCircle } from "lucide-react";

interface BrandSubTabNavProps {
  subTab: BrandSubTab;
  onSubTabChange: (tab: BrandSubTab) => void;
  analytics: BrandAnalyticsCalculations;
}

export function BrandSubTabNav({
  subTab,
  onSubTabChange,
  analytics,
}: BrandSubTabNavProps) {
  const attentionCount =
    (analytics.zeroAds?.length || 0) +
    (analytics.failed?.length || 0) +
    (analytics.unclear?.length || 0);

  return (
    <div className="flex items-center flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onSubTabChange("scaling")}
        className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
          subTab === "scaling"
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
        }`}
      >
        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
        <span>Scaling ({analytics.scalingPages?.length || 0})</span>
      </button>

      <button
        type="button"
        onClick={() => onSubTabChange("descaling")}
        className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
          subTab === "descaling"
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
        }`}
      >
        <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
        <span>Descaling ({analytics.descalingPages?.length || 0})</span>
      </button>

      <button
        type="button"
        onClick={() => onSubTabChange("top")}
        className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
          subTab === "top"
            ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
        }`}
      >
        <Flame className="w-3.5 h-3.5 text-amber-500" />
        <span>Top Active ({analytics.withResults?.length || 0})</span>
      </button>

      <button
        type="button"
        onClick={() => onSubTabChange("watchlist")}
        className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
          subTab === "watchlist"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
        }`}
      >
        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
        <span>Watchlist ({analytics.watchlistedPages?.length || 0})</span>
      </button>

      <button
        type="button"
        onClick={() => onSubTabChange("attention")}
        className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
          subTab === "attention"
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
        }`}
      >
        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
        <span>Attention ({attentionCount})</span>
      </button>
    </div>
  );
}

