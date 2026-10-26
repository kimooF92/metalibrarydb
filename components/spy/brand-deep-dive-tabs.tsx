"use client";

import React, { memo } from "react";
import { BarChart3, ShoppingBag, Layers } from "lucide-react";

export interface BrandDeepDiveTabsProps {
  activeTab: "analytics" | "products" | "creatives";
  onTabChange: (nextTab: "analytics" | "products" | "creatives") => void;
  totalAdsCaptured: number;
  productCount: number;
  pendingProductCount: number;
  hasFilteredProductForCreatives: boolean;
}

const TAB_ORDER: Array<"analytics" | "products" | "creatives"> = ["analytics", "products", "creatives"];

export const BrandDeepDiveTabs = memo(function BrandDeepDiveTabs({
  activeTab,
  onTabChange,
  totalAdsCaptured,
  productCount,
  pendingProductCount,
  hasFilteredProductForCreatives,
}: BrandDeepDiveTabsProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    let nextIndex = -1;

    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % TAB_ORDER.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = TAB_ORDER.length - 1;
    }

    if (nextIndex !== -1) {
      e.preventDefault();
      const nextTab = TAB_ORDER[nextIndex];
      onTabChange(nextTab);
      const nextBtn = document.getElementById(`tab-${nextTab}`);
      nextBtn?.focus();
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3 flex-wrap">
      <div
        role="tablist"
        aria-label="Brand Deep Dive Navigation Tabs"
        onKeyDown={handleKeyDown}
        className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 w-fit max-w-full overflow-x-auto gap-1"
      >
        <button
          type="button"
          id="tab-analytics"
          role="tab"
          tabIndex={activeTab === "analytics" ? 0 : -1}
          aria-selected={activeTab === "analytics"}
          aria-controls="tabpanel-analytics"
          onClick={() => onTabChange("analytics")}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === "analytics"
              ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Strategy &amp; Overview</span>
        </button>

        <button
          type="button"
          id="tab-products"
          role="tab"
          tabIndex={activeTab === "products" ? 0 : -1}
          aria-selected={activeTab === "products"}
          aria-controls="tabpanel-products"
          onClick={() => onTabChange("products")}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === "products"
              ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Products ({productCount})</span>
          {pendingProductCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-black bg-amber-400 text-slate-950">
              {pendingProductCount} new
            </span>
          )}
        </button>

        <button
          type="button"
          id="tab-creatives"
          role="tab"
          tabIndex={activeTab === "creatives" ? 0 : -1}
          aria-selected={activeTab === "creatives"}
          aria-controls="tabpanel-creatives"
          onClick={() => onTabChange("creatives")}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === "creatives"
              ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Creatives ({totalAdsCaptured})</span>
          {hasFilteredProductForCreatives && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>
      </div>
    </div>
  );
});
