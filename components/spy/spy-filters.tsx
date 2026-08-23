"use client";

import { useState, useEffect, useRef } from "react";
import { AdFilterParams, BrandOption } from "@/types";
import { useSpyBrands } from "@/hooks/use-spy";
import {
  Search,
  Filter,
  Calendar,
  Layers,
  SlidersHorizontal,
  RefreshCw,
  LayoutGrid,
  LayoutList,
  Clock,
  Archive,
  Trophy,
  Video,
  Star,
  Tag,
  Ban,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Rocket,
  Award,
  Target,
  Sparkles,
  Flame,
} from "lucide-react";

interface SpyFiltersProps {
  filters: AdFilterParams;
  viewMode: "grid" | "list";
  filteredCount?: number;
  totalCount?: number;
  isLoading?: boolean;
  onViewModeChange: (mode: "grid" | "list") => void;
  onFilterChange: (newFilters: Partial<AdFilterParams>) => void;
  onReset: () => void;
}

interface SmartPill {
  id: string;
  label: string;
  icon: any;
  colorClass: string;
  activeColorClass: string;
  description: string;
}

const SMART_PILLS: SmartPill[] = [
  {
    id: "all",
    label: "All Ads",
    icon: Layers,
    colorClass: "hover:border-slate-400 dark:hover:border-slate-600",
    activeColorClass:
      "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm",
    description: "Browse all captured ad creatives",
  },
  {
    id: "top_winners",
    label: "Top Winners",
    icon: Trophy,
    colorClass: "hover:border-amber-400 dark:hover:border-amber-600 text-amber-600 dark:text-amber-400",
    activeColorClass:
      "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold border-amber-400 shadow-sm shadow-amber-500/25",
    description: "Highest Winner Scores (80+) combining scale and longevity",
  },
  {
    id: "breakout",
    label: "Breakout",
    icon: Rocket,
    colorClass: "hover:border-pink-400 dark:hover:border-pink-600 text-pink-600 dark:text-pink-400",
    activeColorClass:
      "bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 text-white border-pink-500 shadow-sm shadow-pink-500/25",
    description: "New ads launched in last 7 days scaling fast with 3+ copies",
  },
  {
    id: "multi_angle",
    label: "Multi-Angle",
    icon: Target,
    colorClass: "hover:border-cyan-400 dark:hover:border-cyan-600 text-cyan-600 dark:text-cyan-400",
    activeColorClass:
      "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-500 shadow-sm shadow-cyan-500/25",
    description: "High-conviction products with 3+ creative angles tested by the brand",
  },
  {
    id: "evergreen",
    label: "Evergreen",
    icon: Sparkles,
    colorClass: "hover:border-emerald-400 dark:hover:border-emerald-600 text-emerald-600 dark:text-emerald-400",
    activeColorClass:
      "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-sm shadow-emerald-500/25",
    description: "Active profitable ads running 30+ days",
  },
  {
    id: "viral_videos",
    label: "Videos",
    icon: Video,
    colorClass: "hover:border-purple-400 dark:hover:border-purple-600 text-purple-600 dark:text-purple-400",
    activeColorClass:
      "bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-500 shadow-sm shadow-purple-500/25",
    description: "High-duplication video & UGC creatives",
  },
  {
    id: "watchlist",
    label: "Watchlist",
    icon: Star,
    colorClass: "hover:border-yellow-400 dark:hover:border-yellow-600 text-yellow-600 dark:text-yellow-400",
    activeColorClass:
      "bg-gradient-to-r from-amber-500 to-yellow-600 text-white border-yellow-500 shadow-sm shadow-yellow-500/25",
    description: "Ads from your starred competitor pages",
  },
];

export function SpyFilters({
  filters,
  viewMode,
  filteredCount,
  totalCount,
  isLoading,
  onViewModeChange,
  onFilterChange,
  onReset,
}: SpyFiltersProps) {
  const { brands } = useSpyBrands();
  const [searchValue, setSearchValue] = useState<string>(filters.search || "");
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showCustomDates, setShowCustomDates] = useState(Boolean(filters.dateFrom || filters.dateTo));
  const [datePreset, setDatePreset] = useState<string>("all");
  const [brandSearch, setBrandSearch] = useState("");

  const brandModalRef = useRef<HTMLDivElement | null>(null);
  const customDateRef = useRef<HTMLDivElement | null>(null);

  const excludedIds = filters.excludePageIds || [];

  // Active filter state detection
  const isWinnerScoreActive = Boolean(filters.minWinnerScore && filters.minWinnerScore > 0);
  const isScaleActive = Boolean(filters.minDuplications && filters.minDuplications > 1);
  const isAnglesActive = Boolean(filters.minProductCreatives && filters.minProductCreatives > 0);
  const isDaysRunningActive = Boolean(filters.minDaysRunning && filters.minDaysRunning > 0);
  const isMediaActive = Boolean(filters.mediaType && filters.mediaType !== "all");
  const isCtaActive = Boolean(filters.ctaText && filters.ctaText !== "all");
  const isDateActive = Boolean(filters.dateFrom || filters.dateTo || (datePreset && datePreset !== "all"));
  const isStatusActive = Boolean(filters.status && filters.status !== "all" && filters.status !== "archived");
  const isExcludedActive = excludedIds.length > 0;

  const totalActiveAdvancedCount =
    (isWinnerScoreActive ? 1 : 0) +
    (isScaleActive ? 1 : 0) +
    (isAnglesActive ? 1 : 0) +
    (isDaysRunningActive ? 1 : 0) +
    (isMediaActive ? 1 : 0) +
    (isCtaActive ? 1 : 0) +
    (isDateActive ? 1 : 0) +
    (isStatusActive ? 1 : 0) +
    (isExcludedActive ? 1 : 0);

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(totalActiveAdvancedCount > 0);

  // Close modals on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (brandModalRef.current && !brandModalRef.current.contains(e.target as Node)) {
        setShowBrandModal(false);
      }
      if (customDateRef.current && !customDateRef.current.contains(e.target as Node)) {
        setShowCustomDates(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const activePreset = filters.smartPreset || "all";

  const handlePillClick = (pillId: string) => {
    if (pillId === "all" || pillId === activePreset) {
      onFilterChange({
        smartPreset: undefined,
        status: filters.status === "archived" ? "archived" : "all",
      });
      return;
    }

    onFilterChange({
      smartPreset: pillId,
      status: "all",
    });
  };

  const handleToggleExcludeBrand = (pageId: string) => {
    const next = excludedIds.includes(pageId)
      ? excludedIds.filter((id) => id !== pageId)
      : [...excludedIds, pageId];
    onFilterChange({ excludePageIds: next });
  };

  const handleClearAllExcluded = () => {
    onFilterChange({ excludePageIds: [] });
  };

  const filteredBrandList = brands.filter(
    (b) =>
      b.displayName.toLowerCase().includes(brandSearch.toLowerCase()) ||
      b.pageId.toLowerCase().includes(brandSearch.toLowerCase())
  );

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
      const endOfYesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
        23,
        59,
        59
      );
      onFilterChange({
        dateFrom: startOfYesterday.toISOString(),
        dateTo: endOfYesterday.toISOString(),
      });
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
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/60 backdrop-blur-md p-4 mb-4 shadow-sm">
      {/* ─── ROW 1: Search Bar & Global Controls ─── */}
      <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
        {/* Search Bar & Result Count Badge */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search copy, title, brand name, link URL, or ad ID..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900/90 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-10 pr-8 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all font-medium"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => setSearchValue("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtered Count Badge */}
          {filteredCount !== undefined && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 whitespace-nowrap shadow-sm"
              title={`${filteredCount} ads match your active filters`}
            >
              <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50 shrink-0" />
              <span>
                <strong className="text-slate-900 dark:text-white font-bold">
                  {filteredCount.toLocaleString()}
                </strong>{" "}
                {filteredCount === 1 ? "ad" : "ads"}
              </span>
              {totalCount !== undefined && totalCount > 0 && filteredCount !== totalCount && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                  of {totalCount.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Global Toolbar: Vault + View Switcher + Sort Selector */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Quick Archive Vault Toggle Button */}
          <button
            type="button"
            onClick={() => {
              const newStatus = filters.status === "archived" ? "all" : "archived";
              onFilterChange({
                status: newStatus,
                smartPreset: undefined,
              });
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              filters.status === "archived"
                ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30 font-bold"
                : "bg-slate-50 dark:bg-slate-900 text-purple-600 dark:text-purple-400 border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-900/60"
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{filters.status === "archived" ? "Exit Vault" : "Archive Vault"}</span>
          </button>

          {/* View Mode Switcher: Grid vs List */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Grid View (Cards)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="List View (Line by Line)"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Sort Selector */}
          <select
            value={filters.sortBy || "started_running_on"}
            onChange={(e) => onFilterChange({ sortBy: e.target.value as any })}
            className="bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
          >
            <option value="winner_score" className="bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 font-bold">
              🏆 Winner Score (Highest First)
            </option>
            <option value="duplication_count" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
              🔥 Most Scaled (Active Copies)
            </option>
            <option value="started_running_on" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
              ⚡ Newest Launched (Meta Date)
            </option>
            <option value="oldest" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
              ⏳ Longest Running (Evergreen)
            </option>
            <option value="product_creatives" className="bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 font-bold">
              🎯 Most Creative Angles (Product Depth)
            </option>
            <option value="recently_observed" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
              👁️ Recently Active (Last Verified)
            </option>
            <option value="first_seen_at" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
              📅 Newly Indexed (First Found)
            </option>
          </select>
        </div>
      </div>

      {/* ─── ROW 2: Smart Presets + More Filters Toggle ─── */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1 hidden md:inline-block">
            Quick Filters:
          </span>
          {SMART_PILLS.map((pill) => {
            const Icon = pill.icon;
            const isActive =
              (pill.id === "all" && (!filters.smartPreset || filters.smartPreset === "all")) ||
              filters.smartPreset === pill.id;

            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => handlePillClick(pill.id)}
                title={pill.description}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? pill.activeColorClass
                    : `bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 ${pill.colorClass}`
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-current" : ""}`} />
                <span>{pill.label}</span>
              </button>
            );
          })}
        </div>

        {/* More Filters Button */}
        <div className="shrink-0 ml-auto flex items-center gap-2">
          {totalActiveAdvancedCount > 0 && !showAdvancedFilters && (
            <button
              type="button"
              onClick={() => {
                setShowCustomDates(false);
                setDatePreset("all");
                setSearchValue("");
                onReset();
              }}
              className="text-xs text-rose-500 hover:underline font-semibold cursor-pointer"
            >
              Reset all ({totalActiveAdvancedCount})
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-sm ${
              showAdvancedFilters || totalActiveAdvancedCount > 0
                ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800"
                : "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
            <span>More Filters</span>
            {totalActiveAdvancedCount > 0 && (
              <span className="bg-indigo-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {totalActiveAdvancedCount}
              </span>
            )}
            {showAdvancedFilters ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* ─── ROW 3: Categorized 3-Column Pro Grid Drawer ─── */}
      {showAdvancedFilters && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in slide-in-from-top-2 duration-150 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* COLUMN 1: Performance & Scale */}
            <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  Performance & Scale
                </span>
                {(isWinnerScoreActive || isScaleActive || isStatusActive) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                )}
              </div>

              {/* Winner Score */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                  Winner Score
                </label>
                <select
                  value={filters.minWinnerScore || 0}
                  onChange={(e) =>
                    onFilterChange({ minWinnerScore: Number(e.target.value), smartPreset: undefined })
                  }
                  className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                    isWinnerScoreActive
                      ? "bg-amber-50/50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <option value={0}>All Scores (Any)</option>
                  <option value={85}>🏆 85+ (Super Winners Only)</option>
                  <option value={70}>🔥 70+ (High Potential)</option>
                  <option value={50}>⚡ 50+ (Promising Tests)</option>
                </select>
              </div>

              {/* Scale / Copies */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                  Active Duplicate Copies
                </label>
                <select
                  value={filters.minDuplications || 1}
                  onChange={(e) =>
                    onFilterChange({ minDuplications: Number(e.target.value), smartPreset: undefined })
                  }
                  className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                    isScaleActive
                      ? "bg-amber-50/50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <option value={1}>All ads (1+ copies)</option>
                  <option value={3}>3+ copies running</option>
                  <option value={5}>🔥 5+ copies (Scaling)</option>
                  <option value={10}>🚀 10+ copies (Heavy Scale)</option>
                </select>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                  Ad Status
                </label>
                <select
                  value={filters.status || "all"}
                  onChange={(e) =>
                    onFilterChange({ status: e.target.value as any, smartPreset: undefined })
                  }
                  className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                    isStatusActive
                      ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                  <option value="archived">Archived (Vault)</option>
                </select>
              </div>
            </div>

            {/* COLUMN 2: Creative & Format */}
            <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-cyan-500" />
                  Creative & Format
                </span>
                {(isAnglesActive || isMediaActive || isCtaActive) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                )}
              </div>

              {/* Creative Angles */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                  Creative Angles (Depth)
                </label>
                <select
                  value={filters.minProductCreatives || 0}
                  onChange={(e) =>
                    onFilterChange({ minProductCreatives: Number(e.target.value), smartPreset: undefined })
                  }
                  className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                    isAnglesActive
                      ? "bg-cyan-50/50 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <option value={0}>All Products</option>
                  <option value={2}>🎯 2+ Angles (Multi-Angle)</option>
                  <option value={3}>🎯 3+ Angles (Proven Iteration)</option>
                  <option value={5}>🎯 5+ Angles (Heavy Scale)</option>
                </select>
              </div>

              {/* Media Type */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                  Media Format
                </label>
                <select
                  value={filters.mediaType || "all"}
                  onChange={(e) =>
                    onFilterChange({ mediaType: e.target.value as any, smartPreset: undefined })
                  }
                  className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                    isMediaActive
                      ? "bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <option value="all">All Media</option>
                  <option value="video">Videos Only</option>
                  <option value="image">Images Only</option>
                  <option value="carousel">Carousel Only</option>
                </select>
              </div>

              {/* CTA Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                  Call to Action (CTA)
                </label>
                <select
                  value={filters.ctaText || "all"}
                  onChange={(e) =>
                    onFilterChange({ ctaText: e.target.value as any, smartPreset: undefined })
                  }
                  className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                    isCtaActive
                      ? "bg-blue-50/50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-200"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <option value="all">All CTAs</option>
                  <option value="ecom_any">🛍️ Any Shop / Buy CTA</option>
                  <option value="Shop Now">Shop Now</option>
                  <option value="Order Now">Order Now / Commander</option>
                  <option value="Learn More">Learn More</option>
                  <option value="Send Message">Send Message / WhatsApp</option>
                  <option value="Get Offer">Get Offer</option>
                  <option value="Sign Up">Sign Up</option>
                  <option value="Contact Us">Contact Us</option>
                </select>
              </div>
            </div>

            {/* COLUMN 3: Timeline & Brands */}
            <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  Timeline & Brands
                </span>
                {(isDaysRunningActive || isDateActive || isExcludedActive) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                )}
              </div>

              {/* Running Duration */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                  Running Duration
                </label>
                <select
                  value={filters.minDaysRunning || 0}
                  onChange={(e) =>
                    onFilterChange({ minDaysRunning: Number(e.target.value), smartPreset: undefined })
                  }
                  className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                    isDaysRunningActive
                      ? "bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <option value={0}>Any duration</option>
                  <option value={1}>Running 1+ days</option>
                  <option value={7}>Running 7+ days</option>
                  <option value={14}>Running 14+ days</option>
                  <option value={30}>Running 30+ days (Evergreen)</option>
                  <option value={60}>Running 60+ days</option>
                </select>
              </div>

              {/* Launch Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                  Launch Date (Meta Date)
                </label>
                <select
                  value={showCustomDates ? "custom" : datePreset}
                  onChange={(e) => {
                    onFilterChange({ smartPreset: undefined });
                    handleDatePreset(e.target.value);
                  }}
                  className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition cursor-pointer ${
                    isDateActive
                      ? "bg-emerald-50/50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="custom">📅 Custom Range...</option>
                </select>
              </div>

              {/* Exclude Brands Button */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                  Brand Filtering
                </label>
                <button
                  type="button"
                  onClick={() => setShowBrandModal(true)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                    isExcludedActive
                      ? "bg-rose-50/60 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-sm"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-rose-300 dark:hover:border-rose-800"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span className="truncate">
                      {isExcludedActive ? `${excludedIds.length} Brands Excluded` : "Exclude Brands..."}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">Manage</span>
                </button>
              </div>
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {totalActiveAdvancedCount > 0 ? (
                <span>
                  <strong className="text-slate-900 dark:text-white font-bold">{totalActiveAdvancedCount}</strong> custom{" "}
                  {totalActiveAdvancedCount === 1 ? "filter" : "filters"} applied
                </span>
              ) : (
                <span>No custom filters active (showing default preset)</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {totalActiveAdvancedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomDates(false);
                    setDatePreset("all");
                    setSearchValue("");
                    onReset();
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Reset all
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="px-3.5 py-1 rounded-lg text-xs font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition cursor-pointer shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Brand Exclusion Modal ─── */}
      {showBrandModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div
            ref={brandModalRef}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-500">
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Exclude Brands from Feed
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Hide creatives from specific competitor pages
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBrandModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search input in modal */}
            <div className="relative my-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search brands to exclude..."
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 text-xs rounded-xl pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-rose-500 text-slate-900 dark:text-slate-100 font-medium"
              />
            </div>

            {/* Scrollable brand list */}
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
              {filteredBrandList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No matching brands found
                </div>
              ) : (
                filteredBrandList.map((brand) => {
                  const isExcluded = excludedIds.includes(brand.pageId);
                  return (
                    <button
                      key={brand.id}
                      type="button"
                      onClick={() => handleToggleExcludeBrand(brand.pageId)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                        isExcluded
                          ? "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        <div
                          className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border ${
                            isExcluded
                              ? "bg-rose-600 border-rose-600 text-white"
                              : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                          }`}
                        >
                          {isExcluded && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="truncate">{brand.displayName}</span>
                      </div>
                      {brand.adCount !== undefined && (
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {brand.adCount} ads
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              {excludedIds.length > 0 ? (
                <button
                  type="button"
                  onClick={handleClearAllExcluded}
                  className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Clear All ({excludedIds.length})
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setShowBrandModal(false)}
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer hover:opacity-90 transition shadow-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Custom Date Range Modal/Popover ─── */}
      {showCustomDates && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div
            ref={customDateRef}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-emerald-500">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Custom Date Range
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Filter by ad launch date
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomDates(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 my-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  From Date:
                </label>
                <input
                  type="date"
                  value={filters.dateFrom ? filters.dateFrom.substring(0, 10) : ""}
                  onChange={(e) =>
                    onFilterChange({
                      dateFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                      smartPreset: undefined,
                    })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  To Date:
                </label>
                <input
                  type="date"
                  value={filters.dateTo ? filters.dateTo.substring(0, 10) : ""}
                  onChange={(e) =>
                    onFilterChange({
                      dateTo: e.target.value
                        ? new Date(e.target.value + "T23:59:59").toISOString()
                        : undefined,
                      smartPreset: undefined,
                    })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              {(filters.dateFrom || filters.dateTo) ? (
                <button
                  type="button"
                  onClick={() => {
                    onFilterChange({ dateFrom: undefined, dateTo: undefined, smartPreset: undefined });
                    setShowCustomDates(false);
                    setDatePreset("all");
                  }}
                  className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Clear Range
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setShowCustomDates(false)}
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer hover:opacity-90 transition shadow-sm"
              >
                Apply Range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
