"use client";

import type { TrackedPage } from "@/types";
import type { AnalyticsSortField, AnalyticsSortOrder } from "../../types";
import { BrandAnalyticsRow } from "./brand-analytics-row";
import {
  Download,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export interface BrandTableSearchConfig {
  query: string;
  onChange: (query: string) => void;
}

export interface BrandTableSortConfig {
  field: AnalyticsSortField | null;
  order: AnalyticsSortOrder;
  onToggle: (field: AnalyticsSortField) => void;
}

export interface BrandTablePaginationConfig {
  page: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export interface BrandTableWatchlistConfig {
  updatingId: string | null;
  onToggle: (pageId: string, currentStatus?: boolean) => void;
}

export interface BrandAnalyticsTableProps {
  pages: TrackedPage[];
  maxResults: number;
  search: BrandTableSearchConfig;
  sorting: BrandTableSortConfig;
  pagination: BrandTablePaginationConfig;
  watchlist: BrandTableWatchlistConfig;
  onExportCsv: () => void;
}

export function BrandAnalyticsTable({
  pages,
  maxResults,
  search,
  sorting,
  pagination,
  watchlist,
  onExportCsv,
}: BrandAnalyticsTableProps) {
  const { query, onChange: onSearchChange } = search;
  const { field: sortField, order: sortOrder, onToggle: toggleSort } = sorting;
  const {
    page: tablePage,
    totalPages: totalTablePages,
    pageSize,
    totalCount,
    onPageChange,
    onPageSizeChange,
  } = pagination;

  return (
    <div className="space-y-4">
      {/* Search & Export Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={onExportCsv}
          disabled={totalCount === 0}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
          title="Export current filtered table view as CSV"
        >
          <Download className="w-3.5 h-3.5 text-indigo-500" />
          <span className="hidden sm:inline">Export Tab View (.csv)</span>
          <span className="sm:hidden">Export</span>
        </button>

        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter page or keyword..."
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/60">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider select-none">
              <th className="py-3 px-3.5 w-12 text-center">Rank</th>
              <th
                onClick={() => toggleSort("name")}
                className="py-3 px-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center space-x-1">
                  <span>Tracked Page Name</span>
                  {sortField === "name" ? (
                    sortOrder === "asc" ? (
                      <ArrowUp className="w-3 h-3 text-indigo-500" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-indigo-500" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </div>
              </th>
              <th
                onClick={() => toggleSort("searchType")}
                className="py-3 px-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center space-x-1">
                  <span>Search Type</span>
                  {sortField === "searchType" ? (
                    sortOrder === "asc" ? (
                      <ArrowUp className="w-3 h-3 text-indigo-500" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-indigo-500" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </div>
              </th>
              <th
                onClick={() => toggleSort("current")}
                className="py-3 px-3.5 text-right cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Current Ads</span>
                  {sortField === "current" ? (
                    sortOrder === "asc" ? (
                      <ArrowUp className="w-3 h-3 text-indigo-500" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-indigo-500" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </div>
              </th>
              <th
                onClick={() => toggleSort("previous")}
                className="py-3 px-3.5 text-right cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Previous Scan</span>
                  {sortField === "previous" ? (
                    sortOrder === "asc" ? (
                      <ArrowUp className="w-3 h-3 text-indigo-500" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-indigo-500" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </div>
              </th>
              <th
                onClick={() => toggleSort("growth")}
                className="py-3 px-3.5 text-right cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Ad Growth / Change</span>
                  {sortField === "growth" ? (
                    sortOrder === "asc" ? (
                      <ArrowUp className="w-3 h-3 text-indigo-500" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-indigo-500" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </div>
              </th>
              <th className="py-3 px-3.5 text-center">Relative Scale Bar</th>
              <th className="py-3 px-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {pages.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No pages match the selected tab filter or search query.
                </td>
              </tr>
            ) : (
              pages.map((p, idx) => {
                const rank = (tablePage - 1) * pageSize + idx + 1;
                return (
                  <BrandAnalyticsRow
                    key={p.id}
                    page={p}
                    rank={rank}
                    maxResults={maxResults}
                    isUpdatingWatchlist={watchlist.updatingId === p.id}
                    onToggleWatchlist={watchlist.onToggle}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing{" "}
              <strong className="text-slate-800 dark:text-slate-200">
                {(tablePage - 1) * pageSize + 1}
              </strong>{" "}
              to{" "}
              <strong className="text-slate-800 dark:text-slate-200">
                {Math.min(tablePage * pageSize, totalCount)}
              </strong>{" "}
              of{" "}
              <strong className="text-slate-800 dark:text-slate-200">
                {totalCount}
              </strong>{" "}
              pages
            </span>

            <div className="flex items-center space-x-1">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={tablePage <= 1}
              onClick={() => onPageChange(Math.max(1, tablePage - 1))}
              className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 px-1">
              {tablePage} / {totalTablePages}
            </span>

            <button
              type="button"
              disabled={tablePage >= totalTablePages}
              onClick={() => onPageChange(Math.min(totalTablePages, tablePage + 1))}
              className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

