"use client";

import { useState } from "react";
import Link from "next/link";
import type { BrandAnalyticsTabProps, BrandSubTab } from "../types";
import { useBrandSubtabTable } from "../hooks/use-brand-subtab-table";
import { BrandAnalyticsKPIs } from "./brand/brand-analytics-kpis";
import { BrandSubTabNav } from "./brand/brand-subtab-nav";
import { BrandAnalyticsTable } from "./brand/brand-analytics-table";
import { Layers } from "lucide-react";

export function BrandAnalyticsTab({
  pages,
  analytics,
  isLoading,
  onToggleWatchlist,
  updatingWatchlistId,
  subTab: propSubTab,
  onSubTabChange,
}: BrandAnalyticsTabProps) {
  const [internalSubTab, setInternalSubTab] = useState<BrandSubTab>("scaling");
  const subTab = propSubTab || internalSubTab;

  const handleSubTabSelect = (tab: BrandSubTab) => {
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setInternalSubTab(tab);
    }
  };

  const {
    searchQuery,
    setSearchQuery,
    tablePage,
    setTablePage,
    pageSize,
    setPageSize,
    sortField,
    sortOrder,
    toggleSort,
    paginatedTablePages,
    sortedTablePages,
    totalTablePages,
    exportToCsv,
  } = useBrandSubtabTable({ subTab, analytics });

  if (!isLoading && pages.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 p-12 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-500 flex items-center justify-center mx-auto">
          <Layers className="w-6 h-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            No Monitored Pages Found
          </h3>
          <p className="text-xs text-slate-500">
            You haven't tracked any competitor Facebook pages yet. Add pages in the Page Tracker or
            run a Discovery scan to populate live scaling velocity metrics.
          </p>
        </div>
        <Link
          href="/brands"
          className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all"
        >
          <span>Go to Tracked Brands</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1 & 2: Key Metrics Cards & Scaling Distribution Tiers */}
      <BrandAnalyticsKPIs
        analytics={analytics}
        isLoading={isLoading}
        pagesCount={pages.length}
      />

      {/* 3. Detailed Page Explorer Table Shell */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm p-5 space-y-4">
        {/* Subtabs Navigation */}
        <div className="pb-3 border-b border-slate-200 dark:border-slate-800/60">
          <BrandSubTabNav
            subTab={subTab}
            onSubTabChange={handleSubTabSelect}
            analytics={analytics}
          />
        </div>

        {/* Paginated Table with Search, Export, and Sorters */}
        <BrandAnalyticsTable
          pages={paginatedTablePages}
          maxResults={analytics.maxResults || 1}
          search={{
            query: searchQuery,
            onChange: setSearchQuery,
          }}
          sorting={{
            field: sortField,
            order: sortOrder,
            onToggle: toggleSort,
          }}
          pagination={{
            page: tablePage,
            totalPages: totalTablePages,
            pageSize,
            totalCount: sortedTablePages.length,
            onPageChange: setTablePage,
            onPageSizeChange: setPageSize,
          }}
          watchlist={{
            updatingId: updatingWatchlistId,
            onToggle: onToggleWatchlist,
          }}
          onExportCsv={exportToCsv}
        />
      </div>
    </div>
  );
}

