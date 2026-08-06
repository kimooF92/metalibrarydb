"use client";

import { useState, useEffect } from "react";
import { AdFilterParams } from "@/types";
import { Search, Filter, Calendar, Layers, SlidersHorizontal, RefreshCw, LayoutGrid, LayoutList, Clock, Archive } from "lucide-react";

interface SpyFiltersProps {
  filters: AdFilterParams;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  onFilterChange: (newFilters: Partial<AdFilterParams>) => void;
  onReset: () => void;
}

export function SpyFilters({ filters, viewMode, onViewModeChange, onFilterChange, onReset }: SpyFiltersProps) {
  const [showCustomDates, setShowCustomDates] = useState(Boolean(filters.dateFrom || filters.dateTo));
  const [datePreset, setDatePreset] = useState<string>("all");
  const [searchValue, setSearchValue] = useState<string>(filters.search || "");

  // Sync search input with 350ms debounce
  useEffect(() => {
    setSearchValue(filters.search || "");
  }, [filters.search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.search || "") !== searchValue) {
        onFilterChange({ search: searchValue });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchValue, filters.search, onFilterChange]);

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "all") {
      setShowCustomDates(false);
      onFilterChange({ dateFrom: undefined, dateTo: undefined });
    } else if (preset === "today") {
      setShowCustomDates(false);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      onFilterChange({ dateFrom: startOfDay.toISOString(), dateTo: undefined });
    } else if (preset === "yesterday") {
      setShowCustomDates(false);
      const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
      onFilterChange({ dateFrom: startOfYesterday.toISOString(), dateTo: endOfYesterday.toISOString() });
    } else if (preset === "7days") {
      setShowCustomDates(false);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      onFilterChange({ dateFrom: sevenDaysAgo.toISOString(), dateTo: undefined });
    } else if (preset === "30days") {
      setShowCustomDates(false);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      onFilterChange({ dateFrom: thirtyDaysAgo.toISOString(), dateTo: undefined });
    } else if (preset === "custom") {
      setShowCustomDates(true);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-4 mb-4">
      {/* Top Bar: Search Input & Quick Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
        {/* Keyword Search Bar */}
        <div className="relative w-full sm:w-80 md:w-96">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-600 dark:text-slate-400" />
          <input
            type="text"
            placeholder="Search ad copy, title, brand name, or ad ID..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full bg-white dark:bg-slate-950/80 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 rounded-lg pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        {/* View Mode Toggle & Sort By Dropdown & Vault Shortcut */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Quick Archive Vault Toggle Button */}
          <button
            type="button"
            onClick={() => onFilterChange({ status: filters.status === "archived" ? "all" : "archived" })}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              filters.status === "archived"
                ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30"
                : "bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/50 hover:bg-purple-50 dark:hover:bg-purple-950/30"
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{filters.status === "archived" ? "Exit Vault" : "Archive Vault"}</span>
          </button>

          {/* View Mode Switcher: Grid vs Line / List */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              title="Grid View (4 Cards Per Row)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              title="List View (Line by Line)"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>

          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 ml-1" />
          <select
            value={filters.sortBy || "started_running_on"}
            onChange={(e) => onFilterChange({ sortBy: e.target.value as any })}
            className="bg-white dark:bg-slate-950/80 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="started_running_on" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: Newest Launched</option>
            <option value="oldest" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: Oldest / Longest Running</option>
            <option value="duplication_count" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: Most Scaled (Copies)</option>
            <option value="recently_observed" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: Recently Observed</option>
            <option value="first_seen_at" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: First Discovered</option>
          </select>
        </div>
      </div>

      {/* Filter Options Row */}
      <div className="flex flex-wrap items-center gap-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800/40 text-[11px]">
        {/* Running For (List of Days) Filter */}
        <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          <span className="text-slate-600 dark:text-slate-400 font-semibold">Running For:</span>
          <select
            value={filters.minDaysRunning || 0}
            onChange={(e) => onFilterChange({ minDaysRunning: Number(e.target.value) })}
            className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
          >
            <option value={0} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Any duration</option>
            <option value={1} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Running 1+ days</option>
            <option value={7} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Running 7+ days</option>
            <option value={14} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Running 14+ days</option>
            <option value={30} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Running 30+ days</option>
            <option value={60} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Running 60+ days (Evergreen)</option>
          </select>
        </div>

        {/* Added / Launched Date Presets */}
        <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <Calendar className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span className="text-slate-600 dark:text-slate-400 font-semibold">Launched:</span>
          <select
            value={showCustomDates ? "custom" : datePreset}
            onChange={(e) => handleDatePreset(e.target.value)}
            className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Time</option>
            <option value="today" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Today</option>
            <option value="yesterday" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Yesterday</option>
            <option value="7days" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Last 7 Days</option>
            <option value="30days" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Last 30 Days</option>
            <option value="custom" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">📅 Custom Range...</option>
          </select>
        </div>

        {/* Scale Filter (Min Duplications) */}
        <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <Layers className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span className="text-slate-600 dark:text-slate-400 font-semibold">Scale:</span>
          <select
            value={filters.minDuplications || 1}
            onChange={(e) => onFilterChange({ minDuplications: Number(e.target.value) })}
            className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
          >
            <option value={1} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All ads (1+ copies)</option>
            <option value={3} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">3+ copies running</option>
            <option value={5} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🔥 5+ copies (Scaling)</option>
            <option value={10} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🚀 10+ copies (Heavy Scale)</option>
          </select>
        </div>

        {/* Media Type Filter */}
        <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <Filter className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          <span className="text-slate-600 dark:text-slate-400 font-semibold">Media:</span>
          <select
            value={filters.mediaType || "all"}
            onChange={(e) => onFilterChange({ mediaType: e.target.value as any })}
            className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Media</option>
            <option value="image" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Images Only</option>
            <option value="video" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Videos Only</option>
            <option value="carousel" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Carousel Only</option>
          </select>
        </div>

        {/* Active Status Filter */}
        <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-slate-600 dark:text-slate-400 font-semibold">Status:</span>
          <select
            value={filters.status || "all"}
            onChange={(e) => onFilterChange({ status: e.target.value as any })}
            className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Statuses</option>
            <option value="active" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Active Only</option>
            <option value="inactive" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Inactive Only</option>
            <option value="archived" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Archived (Vault)</option>
          </select>
        </div>

        {/* Reset Button */}
        <button
          type="button"
          onClick={() => {
            setShowCustomDates(false);
            setDatePreset("all");
            setSearchValue("");
            onReset();
          }}
          className="ml-auto text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" /> Reset Filters
        </button>
      </div>

      {/* Custom Date Range Pickers (Rendered when Custom Range option is selected) */}
      {showCustomDates && (
        <div className="flex flex-wrap items-center gap-3 pt-2.5 border-t border-slate-200 dark:border-slate-800/40 text-xs">
          <span className="text-slate-600 dark:text-slate-400 font-semibold">Select Date Range:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 dark:text-slate-400 text-[11px] font-medium">From:</span>
            <input
              type="date"
              value={filters.dateFrom ? filters.dateFrom.substring(0, 10) : ""}
              onChange={(e) =>
                onFilterChange({
                  dateFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                })
              }
              className="bg-white dark:bg-slate-950/80 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1 focus:outline-none focus:border-indigo-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 dark:text-slate-400 text-[11px] font-medium">To:</span>
            <input
              type="date"
              value={filters.dateTo ? filters.dateTo.substring(0, 10) : ""}
              onChange={(e) =>
                onFilterChange({
                  dateTo: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : undefined,
                })
              }
              className="bg-white dark:bg-slate-950/80 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1 focus:outline-none focus:border-indigo-500 cursor-pointer"
            />
          </div>

          {(filters.dateFrom || filters.dateTo) && (
            <button
              type="button"
              onClick={() => onFilterChange({ dateFrom: undefined, dateTo: undefined })}
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold ml-2 cursor-pointer"
            >
              Clear Range
            </button>
          )}
        </div>
      )}
    </div>
  );
}
