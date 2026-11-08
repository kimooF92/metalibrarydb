"use client";

import { ShoppingBag, Eye, TrendingUp } from "lucide-react";
import type { MainAnalyticsTab } from "../types";

export interface AnalyticsTabsCounts {
  products: number | string;
  ads: number | string;
  pages: number | string;
}

export interface AnalyticsTabsNavProps {
  activeTab: MainAnalyticsTab;
  onTabChange: (tab: MainAnalyticsTab) => void;
  counts: AnalyticsTabsCounts;
}

export function AnalyticsTabsNav({
  activeTab,
  onTabChange,
  counts,
}: AnalyticsTabsNavProps) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
      <div className="flex items-center flex-wrap gap-2">
        {/* Tab 1: Products & Winner Niches */}
        <button
          onClick={() => onTabChange("products")}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-extrabold rounded-2xl transition-all cursor-pointer ${
            activeTab === "products"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20 scale-[1.02]"
              : "text-slate-600 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800/80"
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>🛍️ Products & Winner Niches</span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              activeTab === "products"
                ? "bg-white/20 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            {counts.products}
          </span>
        </button>

        {/* Tab 2: Ad Creatives & Campaigns */}
        <button
          onClick={() => onTabChange("ads")}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-extrabold rounded-2xl transition-all cursor-pointer ${
            activeTab === "ads"
              ? "bg-purple-600 text-white shadow-md shadow-purple-500/20 scale-[1.02]"
              : "text-slate-600 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800/80"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>🎯 Ad Creatives & Campaigns</span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              activeTab === "ads"
                ? "bg-white/20 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            {counts.ads}
          </span>
        </button>

        {/* Tab 3: Page Velocity & Scaling */}
        <button
          onClick={() => onTabChange("pages")}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-extrabold rounded-2xl transition-all cursor-pointer ${
            activeTab === "pages"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20 scale-[1.02]"
              : "text-slate-600 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800/80"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>📈 Page Velocity & Scaling</span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              activeTab === "pages"
                ? "bg-white/20 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            {counts.pages}
          </span>
        </button>
      </div>
    </div>
  );
}

