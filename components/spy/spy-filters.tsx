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
  Flame,
  Trophy,
  Video,
  Star,
  Zap,
  Tag,
  Ban,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Rocket,
  Award,
  Target,
  Crown,
  Sparkles,
} from "lucide-react";

interface SpyFiltersProps {
  filters: AdFilterParams;
  viewMode: "grid" | "list";
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
  badge?: string;
  description: string;
}

const SMART_PILLS: SmartPill[] = [
  {
    id: "all",
    label: "All Ads",
    icon: Layers,
    colorClass: "hover:border-slate-400 dark:hover:border-slate-600",
    activeColorClass: "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm",
    description: "Browse all captured ad creatives",
  },
  {
    id: "top_winners",
    label: "Top Winners",
    icon: Trophy,
    colorClass: "hover:border-amber-400 dark:hover:border-amber-600 text-amber-600 dark:text-amber-400",
    activeColorClass: "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold border-amber-400 shadow-sm shadow-amber-500/25",
    description: "Highest Winner Scores (80+) combining scale and longevity",
  },
  {
    id: "breakout",
    label: "Breakout",
    icon: Rocket,
    colorClass: "hover:border-pink-400 dark:hover:border-pink-600 text-pink-600 dark:text-pink-400",
    activeColorClass: "bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 text-white border-pink-500 shadow-sm shadow-pink-500/25",
    description: "New ads launched in last 7 days scaling fast with 3+ copies",
  },
  {
    id: "multi_angle",
    label: "Multi-Angle",
    icon: Target,
    colorClass: "hover:border-cyan-400 dark:hover:border-cyan-600 text-cyan-600 dark:text-cyan-400",
    activeColorClass: "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-500 shadow-sm shadow-cyan-500/25",
    description: "High-conviction products with 3+ creative angles tested by the brand",
  },
  {
    id: "evergreen",
    label: "Evergreen",
    icon: Sparkles,
    colorClass: "hover:border-emerald-400 dark:hover:border-emerald-600 text-emerald-600 dark:text-emerald-400",
    activeColorClass: "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-sm shadow-emerald-500/25",
    description: "Active profitable ads running 30+ days",
  },
  {
    id: "viral_videos",
    label: "Videos",
    icon: Video,
    colorClass: "hover:border-purple-400 dark:hover:border-purple-600 text-purple-600 dark:text-purple-400",
    activeColorClass: "bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-500 shadow-sm shadow-purple-500/25",
    description: "High-duplication video & UGC creatives",
  },
  {
    id: "watchlist",
    label: "Watchlist",
    icon: Star,
    colorClass: "hover:border-yellow-400 dark:hover:border-yellow-600 text-yellow-600 dark:text-yellow-400",
    activeColorClass: "bg-gradient-to-r from-amber-500 to-yellow-600 text-white border-yellow-500 shadow-sm shadow-yellow-500/25",
    description: "Ads from your starred competitor pages",
  },
];

export function SpyFilters({ filters, viewMode, onViewModeChange, onFilterChange, onReset }: SpyFiltersProps) {
  const { brands } = useSpyBrands();
  const [showCustomDates, setShowCustomDates] = useState(Boolean(filters.dateFrom || filters.dateTo));
  const [datePreset, setDatePreset] = useState<string>("all");
  const [searchValue, setSearchValue] = useState<string>(filters.search || "");
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const brandModalRef = useRef<HTMLDivElement | null>(null);
  const excludedIds = filters.excludePageIds || [];

  const activeAdvancedCount =
    (filters.minWinnerScore && filters.minWinnerScore > 0 ? 1 : 0) +
    (filters.minProductCreatives && filters.minProductCreatives > 0 ? 1 : 0) +
    (filters.minDaysRunning && filters.minDaysRunning > 0 ? 1 : 0) +
    (filters.minDuplications && filters.minDuplications > 1 ? 1 : 0) +
    (filters.mediaType && filters.mediaType !== "all" ? 1 : 0) +
    (filters.ctaText && filters.ctaText !== "all" ? 1 : 0) +
    (filters.dateFrom || filters.dateTo || (datePreset && datePreset !== "all") ? 1 : 0) +
    (excludedIds.length > 0 ? 1 : 0) +
    (filters.status && filters.status !== "all" && filters.status !== "archived" ? 1 : 0);

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(
    Boolean(
      filters.minWinnerScore ||
      filters.minProductCreatives ||
      filters.minDaysRunning ||
      (filters.minDuplications && filters.minDuplications > 1) ||
      (filters.mediaType && filters.mediaType !== "all") ||
      (filters.ctaText && filters.ctaText !== "all") ||
      filters.dateFrom ||
      filters.dateTo ||
      excludedIds.length > 0
    )
  );

  // Close brand dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (brandModalRef.current && !brandModalRef.current.contains(e.target as Node)) {
        setShowBrandModal(false);
      }
    }
    if (showBrandModal) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showBrandModal]);

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

  const filteredBrandList = brands.filter((b) =>
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
      {/* 1. Top Bar: Search Input & Quick Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
        {/* Keyword Search Bar */}
        <div className="relative w-full sm:w-80 md:w-96">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-600 dark:text-slate-400" />
          <input
            type="text"
            placeholder="Search copy, title, brand name, link URL, or ad ID..."
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
            onClick={() => {
              const newStatus = filters.status === "archived" ? "all" : "archived";
              onFilterChange({
                status: newStatus,
                smartPreset: undefined,
              });
            }}
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
              title="Grid View (Cards Layout)"
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
            <option value="winner_score" className="bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 font-bold">🏆 Sort: Winner Score (Highest First)</option>
            <option value="product_creatives" className="bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 font-bold">🎯 Sort: Most Creative Angles (Product Depth)</option>
            <option value="started_running_on" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: Newest Launched</option>
            <option value="oldest" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: Oldest / Longest Running</option>
            <option value="duplication_count" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: Most Scaled (Copies)</option>
            <option value="recently_observed" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: Recently Observed</option>
            <option value="first_seen_at" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sort: First Discovered</option>
          </select>
        </div>
      </div>

      {/* 2. 1-Click Smart Filter Pills Bar */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/60">
        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0 mr-1 hidden md:inline-block">
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer shrink-0 ${
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

          {/* More Filters Toggle Button */}
          <div className="shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                showAdvancedFilters || activeAdvancedCount > 0
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shadow-sm"
                  : "bg-white dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <SlidersHorizontal className="w-3 h-3 text-indigo-500" />
              <span>More Filters</span>
              {activeAdvancedCount > 0 && (
                <span className="bg-indigo-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {activeAdvancedCount}
                </span>
              )}
              {showAdvancedFilters ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Filters Section */}
      {showAdvancedFilters && (
        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* 3. Detailed Filter Options Row */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800/40 text-[11px]">
            {/* Winner Score Filter */}
            <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-amber-300/60 dark:border-amber-700/50 shadow-sm shadow-amber-500/5">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-amber-700 dark:text-amber-300 font-bold">Winner Score:</span>
              <select
                value={filters.minWinnerScore || 0}
                onChange={(e) =>
                  onFilterChange({ minWinnerScore: Number(e.target.value), smartPreset: undefined })
                }
                className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
              >
                <option value={0} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Scores</option>
                <option value={85} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🏆 85+ (Super Winners Only)</option>
                <option value={70} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🔥 70+ (High Potential)</option>
                <option value={50} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">⚡ 50+ (Promising Tests)</option>
              </select>
            </div>

            {/* Creative Angles Filter */}
            <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-cyan-300/60 dark:border-cyan-700/50 shadow-sm shadow-cyan-500/5">
              <Target className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-cyan-700 dark:text-cyan-300 font-bold">Creative Angles:</span>
              <select
                value={filters.minProductCreatives || 0}
                onChange={(e) =>
                  onFilterChange({ minProductCreatives: Number(e.target.value), smartPreset: undefined })
                }
                className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
              >
                <option value={0} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Products</option>
                <option value={5} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🎯 5+ Angles (Heavy Scale)</option>
                <option value={3} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🎯 3+ Angles (Proven Iteration)</option>
                <option value={2} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🎯 2+ Angles (Multi-Angle Tests)</option>
              </select>
            </div>

            {/* Running For Filter */}
            <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              <span className="text-slate-600 dark:text-slate-400 font-semibold">Running For:</span>
              <select
                value={filters.minDaysRunning || 0}
                onChange={(e) =>
                  onFilterChange({ minDaysRunning: Number(e.target.value), smartPreset: undefined })
                }
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
            onChange={(e) => {
              onFilterChange({ smartPreset: undefined });
              handleDatePreset(e.target.value);
            }}
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
            onChange={(e) =>
              onFilterChange({ minDuplications: Number(e.target.value), smartPreset: undefined })
            }
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
            onChange={(e) =>
              onFilterChange({ mediaType: e.target.value as any, smartPreset: undefined })
            }
            className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Media</option>
            <option value="image" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Images Only</option>
            <option value="video" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Videos Only</option>
            <option value="carousel" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Carousel Only</option>
          </select>
        </div>

        {/* Call to Action (CTA) Filter */}
        <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <Tag className="w-3 h-3 text-blue-600 dark:text-blue-400" />
          <span className="text-slate-600 dark:text-slate-400 font-semibold">CTA:</span>
          <select
            value={filters.ctaText || "all"}
            onChange={(e) =>
              onFilterChange({ ctaText: e.target.value as any, smartPreset: undefined })
            }
            className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All CTAs</option>
            <option value="ecom_any" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🛍️ Any Shop / Buy CTA</option>
            <option value="Shop Now" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Shop Now</option>
            <option value="Order Now" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Order Now / Commander</option>
            <option value="Learn More" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Learn More</option>
            <option value="Send Message" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Send Message / WhatsApp</option>
            <option value="Get Offer" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Get Offer</option>
            <option value="Sign Up" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Sign Up</option>
            <option value="Contact Us" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Contact Us</option>
          </select>
        </div>

        {/* Negative Brand Exclude Button & Popover */}
        <div className="relative" ref={brandModalRef}>
          <button
            type="button"
            onClick={() => setShowBrandModal((prev) => !prev)}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer font-semibold ${
              excludedIds.length > 0
                ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800 shadow-sm"
                : "bg-white dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800"
            }`}
          >
            <Ban className="w-3 h-3 text-rose-500" />
            <span>
              {excludedIds.length > 0 ? `Excluded (${excludedIds.length})` : "Exclude Brands"}
            </span>
          </button>

          {/* Floating Exclusion Popover */}
          {showBrandModal && (
            <div className="absolute left-0 top-full mt-1.5 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Exclude Brands from Feed
                  </span>
                </div>
                {excludedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllExcluded}
                    className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Search input in modal */}
              <div className="relative my-2">
                <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tracked brands..."
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 text-xs rounded-lg pl-7 pr-3 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-rose-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Scrollable brand list */}
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                {filteredBrandList.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">
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
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                          isExcluded
                            ? "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
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

              <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowBrandModal(false)}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer hover:opacity-90"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active Status Filter */}
        <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-slate-600 dark:text-slate-400 font-semibold">Status:</span>
          <select
            value={filters.status || "all"}
            onChange={(e) =>
              onFilterChange({ status: e.target.value as any, smartPreset: undefined })
            }
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
          className="ml-auto text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer font-semibold"
        >
          <RefreshCw className="w-3 h-3" /> Reset Filters
        </button>
      </div>

      {/* 4. Active Excluded Brand Chips Bar */}
      {excludedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-800/60 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 shrink-0 mr-1 flex items-center gap-1">
            <Ban className="w-3 h-3" /> Excluded ({excludedIds.length}):
          </span>
          {excludedIds.map((pageId) => {
            const brand = brands.find((b) => b.pageId === pageId);
            const label = brand ? brand.displayName : `Page ${pageId}`;
            return (
              <span
                key={pageId}
                className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full text-[11px] font-medium"
              >
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => handleToggleExcludeBrand(pageId)}
                  className="hover:bg-rose-200 dark:hover:bg-rose-800/80 rounded-full p-0.5 transition-colors cursor-pointer"
                  title="Remove exclusion"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={handleClearAllExcluded}
            className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-semibold ml-1 cursor-pointer"
          >
            Clear All
          </button>
        </div>
      )}

      {/* 5. Custom Date Range Pickers */}
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
                  smartPreset: undefined,
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
                  smartPreset: undefined,
                })
              }
              className="bg-white dark:bg-slate-950/80 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1 focus:outline-none focus:border-indigo-500 cursor-pointer"
            />
          </div>

          {(filters.dateFrom || filters.dateTo) && (
            <button
              type="button"
              onClick={() => onFilterChange({ dateFrom: undefined, dateTo: undefined, smartPreset: undefined })}
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold ml-2 cursor-pointer"
            >
              Clear Range
            </button>
          )}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
