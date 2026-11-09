"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  LayoutGrid,
  LayoutList,
  Sparkles,
  Flame,
  Rocket,
  Video,
  ChevronDown,
  Layers,
  ArrowUpDown,
  Check,
  PanelLeftOpen,
  RotateCcw,
} from "lucide-react";
import type { AdFilterParams } from "@/types";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export interface SpyTopBarProps {
  filters: AdFilterParams;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  onFilterChange: (newFilters: Partial<AdFilterParams>) => void;
  onReset: () => void;
  activeFilterCount: number;
  onOpenMobileDrawer: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

const SMART_PRESETS = [
  { id: "all", label: "All Ads", icon: Layers },
  { id: "breakout", label: "Breakout Ads", icon: Rocket, color: "text-rose-500" },
  { id: "scaled_5", label: "Scaled 5+", icon: Flame, color: "text-amber-500" },
  { id: "evergreen", label: "Evergreen", icon: Sparkles, color: "text-emerald-500" },
  { id: "video_only", label: "Video Only", icon: Video, color: "text-purple-500" },
];

const SORT_OPTIONS = [
  { value: "started_running_on", label: "Newest First" },
  { value: "duplication_count", label: "Most Scaled Copies" },
  { value: "winner_score", label: "Highest Winner Score" },
  { value: "first_seen_at", label: "Recently Discovered" },
  { value: "product_creatives", label: "Most Creative Angles" },
];

export function SpyTopBar({
  filters,
  viewMode,
  onViewModeChange,
  onFilterChange,
  onReset,
  activeFilterCount,
  onOpenMobileDrawer,
  isSidebarCollapsed,
  onToggleSidebar,
}: SpyTopBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search || "");

  // Debounce search input
  useEffect(() => {
    setSearchInput(filters.search || "");
  }, [filters.search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.search || "") !== searchInput) {
        onFilterChange({ search: searchInput || undefined });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, onFilterChange]);

  const activePreset = filters.smartPreset || "all";
  const currentSort = filters.sortBy || "started_running_on";
  const currentSortLabel =
    SORT_OPTIONS.find((s) => s.value === currentSort)?.label || "Newest First";

  const handleSelectPreset = (presetId: string) => {
    if (presetId === "all" || presetId === activePreset) {
      onFilterChange({
        smartPreset: undefined,
        minDuplications: undefined,
        minWinnerScore: undefined,
        minDaysRunning: undefined,
        mediaType: undefined,
      });
      return;
    }

    if (presetId === "breakout") {
      onFilterChange({
        smartPreset: "breakout",
        minWinnerScore: 75,
        minDuplications: undefined,
        minDaysRunning: undefined,
      });
    } else if (presetId === "scaled_5") {
      onFilterChange({
        smartPreset: "scaled_5",
        minDuplications: 5,
        minWinnerScore: undefined,
        minDaysRunning: undefined,
      });
    } else if (presetId === "evergreen") {
      onFilterChange({
        smartPreset: "evergreen",
        minDaysRunning: 30,
        minDuplications: undefined,
        minWinnerScore: undefined,
      });
    } else if (presetId === "video_only") {
      onFilterChange({
        smartPreset: "video_only",
        mediaType: "video",
      });
    }
  };

  return (
    <div className="flex flex-col gap-2.5 bg-card/60 backdrop-blur-sm border border-border/80 rounded-xl p-3 shadow-2xs">
      {/* ─── Row 1: Search, Sort Dropdown & View Mode Switcher ─── */}
      <div className="flex items-center justify-between gap-2.5">
        {/* Left: Sidebar Toggle + Mobile Filter Trigger + Full-Width Search Input */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isSidebarCollapsed && onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="hidden lg:flex items-center gap-1 p-2 rounded-lg border border-border bg-card hover:bg-accent text-foreground transition cursor-pointer shrink-0"
              title="Show Filters Sidebar"
            >
              <PanelLeftOpen className="w-4 h-4 text-indigo-500" />
            </button>
          )}

          {/* Mobile Filter Trigger Button */}
          <button
            type="button"
            onClick={onOpenMobileDrawer}
            className="flex lg:hidden items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground text-xs font-semibold shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Search Input */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search ad copy, headline, brand, or archive ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border/80 bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Sort Dropdown & View Mode Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground text-xs font-medium cursor-pointer transition shadow-2xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline text-muted-foreground">Sort:</span>
              <span className="font-semibold">{currentSortLabel}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => onFilterChange({ sortBy: opt.value as any })}
                  className="flex items-center justify-between text-xs cursor-pointer"
                >
                  <span className={currentSort === opt.value ? "font-bold text-indigo-600 dark:text-indigo-400" : ""}>
                    {opt.label}
                  </span>
                  {currentSort === opt.value && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              className={`p-1 rounded-md transition cursor-pointer ${
                viewMode === "grid"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`p-1 rounded-md transition cursor-pointer ${
                viewMode === "list"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="List view"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Row 2: Smart Presets Pills (Dedicated row with zero horizontal scrollbar) ─── */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1 border-t border-border/40">
        {SMART_PRESETS.map((p) => {
          const Icon = p.icon;
          const isSelected = activePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectPreset(p.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 ${
                isSelected
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                  : "bg-card hover:bg-accent text-foreground border-border/70"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-white" : p.color || "text-muted-foreground"}`} />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Row 3: Active Filter Badges Strip (Visible if any filter active) ─── */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-border/40 text-[11px]">
          <span className="text-muted-foreground font-semibold">Active:</span>

          {filters.mediaType && filters.mediaType !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              Format: {filters.mediaType}
              <button
                type="button"
                onClick={() => onFilterChange({ mediaType: undefined })}
                className="hover:text-indigo-800 dark:hover:text-indigo-200 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          {filters.minDuplications && filters.minDuplications > 1 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Scale: {filters.minDuplications}+ copies
              <button
                type="button"
                onClick={() => onFilterChange({ minDuplications: undefined })}
                className="hover:text-amber-800 dark:hover:text-amber-200 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          {filters.minWinnerScore && filters.minWinnerScore > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              Winner Score ≥ {filters.minWinnerScore}
              <button
                type="button"
                onClick={() => onFilterChange({ minWinnerScore: undefined })}
                className="hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          {filters.minDaysRunning && filters.minDaysRunning > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Running ≥ {filters.minDaysRunning}d
              <button
                type="button"
                onClick={() => onFilterChange({ minDaysRunning: undefined })}
                className="hover:text-emerald-800 dark:hover:text-emerald-200 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          {filters.status && filters.status !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20">
              Status: {filters.status}
              <button
                type="button"
                onClick={() => onFilterChange({ status: undefined })}
                className="hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          {Boolean(filters.dateFrom || filters.dateTo) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              Dates: {filters.dateFrom || "Start"} → {filters.dateTo || "Now"}
              <button
                type="button"
                onClick={() => onFilterChange({ dateFrom: undefined, dateTo: undefined })}
                className="hover:text-indigo-800 dark:hover:text-indigo-200 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-1"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Reset All</span>
          </button>
        </div>
      )}
    </div>
  );
}
