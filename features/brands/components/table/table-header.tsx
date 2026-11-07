"use client";

import React from "react";
import { Star, Package, ChevronUp, ChevronDown, ChevronsUpDown, ArrowUpRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export interface TableHeaderProps {
  allVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  sortBy: string;
  sortOrder: "asc" | "desc";
  hasPendingReSort?: boolean;
  onSortChange: (col: string) => void;
}

export function TableHeader({
  allVisibleSelected,
  onToggleSelectAll,
  sortBy,
  sortOrder,
  hasPendingReSort,
  onSortChange,
}: TableHeaderProps) {
  const renderSortHeader = (col: string, label: string, className = "") => {
    const active = sortBy === col;
    return (
      <th
        className={`px-3 md:px-3.5 xl:px-4 py-3 whitespace-nowrap text-[11px] uppercase tracking-wider font-medium text-slate-500 dark:text-slate-400 ${className}`}
      >
        <button
          type="button"
          onClick={() => onSortChange(col)}
          className={`flex items-center gap-1 group transition-colors cursor-pointer uppercase tracking-wider ${
            active
              ? "text-indigo-600 dark:text-indigo-400 font-bold"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span className="uppercase tracking-wider">{label}</span>
          <span className="transition-transform flex items-center gap-1">
            {active ? (
              <>
                {sortOrder === "asc" ? (
                  <ChevronUp className="w-3.5 h-3.5 text-indigo-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
                )}
                {hasPendingReSort && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
                    title="Order frozen for updated rows. Click 'Apply Sort' or header to re-sort."
                  />
                )}
              </>
            ) : (
              <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
            )}
          </span>
        </button>
      </th>
    );
  };

  return (
    <thead className="bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs sticky top-0 z-20 text-[11px] uppercase tracking-wider font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800/80 select-none shadow-xs">
      <tr>
        <th className="px-2 md:px-2.5 py-3 w-10 text-center">
          <div className="flex items-center justify-center">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={onToggleSelectAll}
              aria-label="Select all visible pages"
            />
          </div>
        </th>
        <th className="px-1 md:px-1.5 py-3 w-8 text-center">
          <Star className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 mx-auto" />
        </th>
        {renderSortHeader("displayName", "Brand", "w-[30%] min-w-[170px]")}
        <th className="px-3 md:px-3.5 xl:px-4 py-3 whitespace-nowrap w-[20%] min-w-[155px]">
          <div className="flex items-center gap-2 font-medium text-[11px] uppercase tracking-wider select-none">
            <button
              type="button"
              onClick={() => onSortChange("currentResults")}
              className={`flex items-center gap-1 group transition-colors cursor-pointer uppercase tracking-wider ${
                sortBy === "currentResults"
                  ? "text-indigo-600 dark:text-indigo-400 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Sort by Total Active Ads volume"
            >
              <span className="uppercase tracking-wider">Active Ads</span>
              {sortBy === "currentResults" ? (
                <>
                  {sortOrder === "asc" ? (
                    <ChevronUp className="w-3.5 h-3.5 text-indigo-500" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
                  )}
                  {hasPendingReSort && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0"
                      title="Order frozen for updated rows. Click 'Apply Sort' to re-sort."
                    />
                  )}
                </>
              ) : (
                <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSortChange("difference")}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer uppercase ${
                sortBy === "difference"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold"
                  : "text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              title="Sort by Net New Creatives Added (Top Gainers & Scalers)"
            >
              <ArrowUpRight className="w-3 h-3" />
              <span>+Δ</span>
              {sortBy === "difference" && (
                <>
                  {sortOrder === "asc" ? (
                    <ChevronUp className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-emerald-500" />
                  )}
                  {hasPendingReSort && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0"
                      title="Order frozen for updated rows. Click 'Apply Sort' to re-sort."
                    />
                  )}
                </>
              )}
            </button>
          </div>
        </th>
        <th className="px-2 md:px-2.5 xl:px-3 py-3 text-center whitespace-nowrap text-slate-500 dark:text-slate-400 font-medium text-[11px] uppercase tracking-wider w-[9%] min-w-[65px]" title="Unique products catalog">
          <span className="inline-flex items-center justify-center gap-1 uppercase tracking-wider">
            <Package className="w-3.5 h-3.5 text-slate-400" />
            <span className="uppercase tracking-wider">Products</span>
          </span>
        </th>
        {renderSortHeader("status", "Pattern & Status", "hidden md:table-cell w-[17%] min-w-[135px] whitespace-nowrap")}
        {renderSortHeader("lastChecked", "Last Checked", "w-[13%] min-w-[100px] whitespace-nowrap")}
        <th className="px-3 md:px-3.5 xl:px-4 py-3 text-right whitespace-nowrap text-slate-500 dark:text-slate-400 font-medium text-[11px] uppercase tracking-wider w-[9%] min-w-[75px]">
          <span className="uppercase tracking-wider">Actions</span>
        </th>
      </tr>
    </thead>
  );
}
