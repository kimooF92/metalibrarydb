"use client";

import { useState, useRef, useEffect } from "react";
import {
  Search,
  Filter,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  X,
  Loader2,
  CheckCircle2,
  Star,
  Flame,
  ShieldAlert,
  RotateCcw,
  ArrowUpDown,
} from "lucide-react";
import { SearchTabCounts } from "@/types";

export interface TableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchTabCounts?: SearchTabCounts | null;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  searchTypeFilter: string;
  onSearchTypeFilterChange: (value: string) => void;
  tagFilter?: string;
  onTagFilterChange?: (value: string) => void;
  pageSize: number;
  onPageSizeChange: (newPageSize: number) => void;
  page: number;
  onResetFilters?: () => void;
  failedCount?: number;
  hasFailedPages?: boolean;
  onRetryFailed?: () => void;
  isRetryingAll?: boolean;
  hasPendingReSort?: boolean;
  onApplySort?: () => void;
}

export function TableToolbar({
  search,
  onSearchChange,
  loading,
  activeTab,
  onTabChange,
  searchTabCounts,
  statusFilter,
  onStatusFilterChange,
  searchTypeFilter,
  onSearchTypeFilterChange,
  tagFilter,
  onTagFilterChange,
  pageSize,
  onPageSizeChange,
  page,
  onResetFilters,
  failedCount = 0,
  hasFailedPages = false,
  onRetryFailed,
  isRetryingAll = false,
  hasPendingReSort = false,
  onApplySort,
}: TableToolbarProps) {
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [localSearch, setLocalSearch] = useState(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  // Sync external search updates into localSearch
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  // Debounced search handler
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [localSearch, search, onSearchChange]);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Click outside to dismiss filter popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(e.target as Node)
      ) {
        setShowFilterPopover(false);
      }
    };
    if (showFilterPopover) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFilterPopover]);

  const hasActiveFilters =
    statusFilter !== "all" ||
    searchTypeFilter !== "all" ||
    (tagFilter && tagFilter !== "all");

  const filterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (searchTypeFilter !== "all" ? 1 : 0) +
    (tagFilter && tagFilter !== "all" ? 1 : 0);

  return (
    <>
      {/* Mobile Toggle Button for Filters */}
      <div className="flex lg:hidden items-center justify-between gap-2 p-1.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/80">
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="flex items-center space-x-2 text-xs font-semibold px-3 py-2 rounded-lg bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer w-full justify-between"
        >
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-indigo-500" />
            <span>Filters & Smart Tabs</span>
            {(statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "active" || search !== "") && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            )}
          </div>
          {showMobileFilters ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
      </div>

      {/* Search, Tabs, & Filters Combined Toolbar */}
      <div className={`${showMobileFilters ? "flex" : "hidden lg:flex"} flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/40`}>
        {/* Left Side: Global Search Bar */}
        <div className="relative w-full sm:w-64 md:w-72">
          {loading && localSearch ? (
            <Loader2 className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-indigo-500 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500 dark:text-slate-400" />
          )}
          <input
            ref={searchInputRef}
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setLocalSearch("");
                onSearchChange("");
                searchInputRef.current?.blur();
              }
            }}
            placeholder="Search brand, page ID, or domain..."
            className="w-full bg-white dark:bg-slate-950/80 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg pl-8 pr-12 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-all font-medium"
          />
          <div className="absolute right-2.5 top-2 flex items-center space-x-1">
            {localSearch ? (
              <button
                type="button"
                onClick={() => {
                  setLocalSearch("");
                  onSearchChange("");
                  searchInputRef.current?.focus();
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
                title="Clear search (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 rounded border border-slate-200 dark:border-slate-700/60 select-none pointer-events-none">
                /
              </kbd>
            )}
          </div>
        </div>

        {/* Right Side: 1-Click Smart Tabs & Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Smart Tabs */}
          {[
            {
              id: "active",
              label: "Active",
              icon: CheckCircle2,
              iconColor: "text-emerald-500 dark:text-emerald-400 fill-emerald-500/10 dark:fill-emerald-400/20",
            },
            { id: "all", label: "All Pages", icon: null },
            { id: "watchlist", label: "Watchlist", icon: Star, iconColor: "text-yellow-500 dark:text-yellow-400 fill-yellow-500/10 dark:fill-yellow-400/20" },
            { id: "high_volume", label: "High Volume", icon: Flame, iconColor: "text-amber-500 dark:text-amber-400 fill-amber-500/10 dark:fill-amber-400/20" },
            { id: "attention", label: "Attention", icon: ShieldAlert, iconColor: "text-rose-500 dark:text-rose-400" },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id || (tab.id === "attention" && (activeTab === "zero_ads" || activeTab === "needs_review"));
            const tabCount = searchTabCounts && search ? searchTabCounts[tab.id as keyof SearchTabCounts] : undefined;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                  active
                    ? "bg-indigo-600/10 dark:bg-indigo-600/20 border-indigo-400/40 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-300 shadow-md shadow-indigo-600/10"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {Icon && <Icon className={`w-3 h-3 ${tab.iconColor || ""}`} />}
                <span>{tab.label}</span>
                {tabCount !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      tabCount > 0
                        ? tab.id === "attention"
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                          : active
                            ? "bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30"
                            : "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {tabCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Consolidated ⚙ Filters Popover */}
          <div className="relative" ref={filterPopoverRef}>
            <button
              type="button"
              onClick={() => setShowFilterPopover((prev) => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                hasActiveFilters
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shadow-sm"
                  : "bg-white dark:bg-slate-950/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
              }`}
              title="Table filters & options"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="bg-indigo-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {filterCount}
                </span>
              )}
              {showFilterPopover ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {showFilterPopover && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3.5 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Table Filters</span>
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        onStatusFilterChange("all");
                        onSearchTypeFilterChange("all");
                        onTagFilterChange?.("all");
                      }}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Archetype Tag Filter */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Archetype Tag</label>
                  <select
                    value={tagFilter || "all"}
                    onChange={(e) => onTagFilterChange?.(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Tags (Any Archetype)</option>
                    <option value="breakout">⚡ Breakout (+12+ impulse launch)</option>
                    <option value="scaling">🚀 Scaling (Multi-day expansion)</option>
                    <option value="burst">🔄 Burst (Sawtooth cycler)</option>
                    <option value="stable">🟢 Stable (Evergreen baseline)</option>
                    <option value="heavy_tester">🧪 Heavy Tester (Creative lab)</option>
                    <option value="descaling">⚠️ Descaling (Budget contraction)</option>
                    <option value="moderate">📊 Moderate (Steady activity)</option>
                    <option value="emerging">🆕 Emerging (&lt; 3 scans)</option>
                    <option value="off_air">⛔ Off-Air (Dropped to 0)</option>
                    <option value="inactive">⚫ Inactive (0 Ads)</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Scan Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => onStatusFilterChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="success">Success</option>
                    <option value="pending">Pending</option>
                    <option value="scanning">Scanning</option>
                    <option value="failed">Failed</option>
                    <option value="unclear">Unclear</option>
                  </select>
                </div>

                {/* Search Type Filter */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Search Type</label>
                  <select
                    value={searchTypeFilter}
                    onChange={(e) => onSearchTypeFilterChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    <option value="page">Page ID</option>
                    <option value="keyword_exact_phrase">Exact Phrase</option>
                    <option value="keyword_unordered">Unordered Keyword</option>
                  </select>
                </div>

                {/* Rows Limit Select Menu */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Rows per Page</label>
                  <select
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    aria-label="Select rows per page"
                  >
                    <option value={25}>25 rows</option>
                    <option value={50}>50 rows</option>
                    <option value={100}>100 rows</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Reset Filters Toolbar Button */}
          {(search !== "" || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "active" || page > 1) && onResetFilters && (
            <button
              onClick={onResetFilters}
              className="flex items-center space-x-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer whitespace-nowrap shrink-0"
              title="Reset all filters and search to default"
            >
              <X className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>Reset</span>
            </button>
          )}

          {/* Retry Failed Button */}
          {(failedCount > 0 || hasFailedPages) && onRetryFailed && (
            <button
              onClick={onRetryFailed}
              disabled={isRetryingAll}
              className="group flex items-center space-x-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 transition-all cursor-pointer whitespace-nowrap shrink-0 animate-in fade-in active:scale-95 disabled:opacity-60"
              title="Retry failed scan jobs"
            >
              <RotateCcw
                className={`w-3 h-3 text-amber-600 dark:text-amber-400 transition-transform duration-300 ${
                  isRetryingAll ? "animate-spin" : "group-hover:-rotate-90"
                }`}
              />
              <span>{isRetryingAll ? "Retrying..." : `Retry Failed ${failedCount > 0 ? `(${failedCount})` : ""}`}</span>
            </button>
          )}

          {/* Apply Sort Pill */}
          {hasPendingReSort && onApplySort && (
            <button
              onClick={onApplySort}
              className="group flex items-center space-x-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 transition-all cursor-pointer whitespace-nowrap shrink-0 animate-in fade-in active:scale-95 shadow-xs"
              title="Rows updated in place without shifting. Click to re-sort the table."
            >
              <ArrowUpDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400 group-hover:rotate-180 transition-transform duration-300" />
              <span>Apply Sort</span>
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
