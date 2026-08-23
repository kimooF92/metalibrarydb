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
  Rocket,
  Award,
  Target,
  Sparkles,
  Flame,
  Plus,
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
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activeMenuCategory, setActiveMenuCategory] = useState<string | null>(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showCustomDates, setShowCustomDates] = useState(Boolean(filters.dateFrom || filters.dateTo));
  const [datePreset, setDatePreset] = useState<string>("all");
  const [brandSearch, setBrandSearch] = useState("");

  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const brandModalRef = useRef<HTMLDivElement | null>(null);
  const customDateRef = useRef<HTMLDivElement | null>(null);

  const excludedIds = filters.excludePageIds || [];

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
        setActiveMenuCategory(null);
      }
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

  // Check which custom filters are actively set
  const isWinnerScoreActive = Boolean(filters.minWinnerScore && filters.minWinnerScore > 0);
  const isScaleActive = Boolean(filters.minDuplications && filters.minDuplications > 1);
  const isAnglesActive = Boolean(filters.minProductCreatives && filters.minProductCreatives > 0);
  const isDaysRunningActive = Boolean(filters.minDaysRunning && filters.minDaysRunning > 0);
  const isMediaActive = Boolean(filters.mediaType && filters.mediaType !== "all");
  const isCtaActive = Boolean(filters.ctaText && filters.ctaText !== "all");
  const isDateActive = Boolean(filters.dateFrom || filters.dateTo || (datePreset && datePreset !== "all"));
  const isStatusActive = Boolean(filters.status && filters.status !== "all" && filters.status !== "archived");
  const isExcludedActive = excludedIds.length > 0;

  const totalActiveCustomFilters =
    (isWinnerScoreActive ? 1 : 0) +
    (isScaleActive ? 1 : 0) +
    (isAnglesActive ? 1 : 0) +
    (isDaysRunningActive ? 1 : 0) +
    (isMediaActive ? 1 : 0) +
    (isCtaActive ? 1 : 0) +
    (isDateActive ? 1 : 0) +
    (isStatusActive ? 1 : 0) +
    (isExcludedActive ? 1 : 0);

  // Helper text for chips
  const getWinnerScoreLabel = () => {
    if (filters.minWinnerScore === 85) return "Score 85+ (Super)";
    if (filters.minWinnerScore === 70) return "Score 70+ (High)";
    if (filters.minWinnerScore === 50) return "Score 50+";
    return `Score ${filters.minWinnerScore}+`;
  };

  const getScaleLabel = () => {
    return `${filters.minDuplications}+ copies`;
  };

  const getAnglesLabel = () => {
    return `${filters.minProductCreatives}+ angles`;
  };

  const getDaysRunningLabel = () => {
    return `Running ${filters.minDaysRunning}d+`;
  };

  const getDateLabel = () => {
    if (datePreset === "today") return "Launched: Today";
    if (datePreset === "yesterday") return "Launched: Yesterday";
    if (datePreset === "7days") return "Launched: Last 7d";
    if (datePreset === "30days") return "Launched: Last 30d";
    if (filters.dateFrom && filters.dateTo) return "Custom Dates";
    if (filters.dateFrom) return `From ${new Date(filters.dateFrom).toLocaleDateString([], { month: "short", day: "numeric" })}`;
    return "Date Filter";
  };

  const getCtaLabel = () => {
    if (filters.ctaText === "ecom_any") return "Shop / Buy CTAs";
    return filters.ctaText || "CTA";
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/60 backdrop-blur-md p-3.5 mb-4 shadow-sm">
      {/* ─── ROW 1: Search Bar & Global Controls ─── */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 justify-between">
        {/* Search Input & Count Badge */}
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search copy, title, brand name, link URL, or ad ID..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900/90 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-9.5 pr-8 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all font-medium"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => setSearchValue("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Result Count Pill */}
          {filteredCount !== undefined && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 whitespace-nowrap shadow-2xl"
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
          {/* Archive Vault Toggle Button */}
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
          <div className="relative flex items-center">
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
      </div>

      {/* ─── ROW 2: Smart Presets + Filter Add Popover + Active Chips ─── */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Quick Filter Presets */}
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

          <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1 shrink-0 hidden sm:block" />

          {/* ─── + Filter Button & Flyout Dropdown ─── */}
          <div className="relative" ref={addMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowAddMenu((prev) => !prev);
                setActiveMenuCategory(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                showAddMenu || totalActiveCustomFilters > 0
                  ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shadow-sm"
                  : "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-indigo-500" />
              <span>Filter</span>
              {totalActiveCustomFilters > 0 && (
                <span className="bg-indigo-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {totalActiveCustomFilters}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showAddMenu ? "rotate-180" : ""}`} />
            </button>

            {/* Filter Menu Popover */}
            {showAddMenu && (
              <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                  Add Filter Condition
                </div>

                <div className="space-y-0.5 text-xs">
                  {/* Winner Score */}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuCategory(activeMenuCategory === "winner" ? null : "winner")
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <Award className="w-3.5 h-3.5 text-amber-500" />
                        <span>Winner Score</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {isWinnerScoreActive ? getWinnerScoreLabel() : "Any"}
                      </span>
                    </button>

                    {activeMenuCategory === "winner" && (
                      <div className="pl-6 pr-1 py-1 space-y-1 bg-slate-50 dark:bg-slate-950/60 rounded-lg my-1">
                        {[
                          { label: "Any Score (0+)", value: 0 },
                          { label: "🏆 85+ (Super Winners Only)", value: 85 },
                          { label: "🔥 70+ (High Potential)", value: 70 },
                          { label: "⚡ 50+ (Promising Tests)", value: 50 },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onFilterChange({ minWinnerScore: opt.value, smartPreset: undefined });
                              setShowAddMenu(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition cursor-pointer ${
                              filters.minWinnerScore === opt.value
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Scale (Duplications) */}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuCategory(activeMenuCategory === "scale" ? null : "scale")
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <Flame className="w-3.5 h-3.5 text-amber-500" />
                        <span>Scale (Active Copies)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {isScaleActive ? getScaleLabel() : "1+"}
                      </span>
                    </button>

                    {activeMenuCategory === "scale" && (
                      <div className="pl-6 pr-1 py-1 space-y-1 bg-slate-50 dark:bg-slate-950/60 rounded-lg my-1">
                        {[
                          { label: "All ads (1+ copies)", value: 1 },
                          { label: "3+ copies running", value: 3 },
                          { label: "🔥 5+ copies (Scaling)", value: 5 },
                          { label: "🚀 10+ copies (Heavy Scale)", value: 10 },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onFilterChange({ minDuplications: opt.value, smartPreset: undefined });
                              setShowAddMenu(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition cursor-pointer ${
                              (filters.minDuplications || 1) === opt.value
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Creative Angles */}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuCategory(activeMenuCategory === "angles" ? null : "angles")
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-cyan-500" />
                        <span>Creative Angles (Depth)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {isAnglesActive ? getAnglesLabel() : "All"}
                      </span>
                    </button>

                    {activeMenuCategory === "angles" && (
                      <div className="pl-6 pr-1 py-1 space-y-1 bg-slate-50 dark:bg-slate-950/60 rounded-lg my-1">
                        {[
                          { label: "All Products", value: 0 },
                          { label: "🎯 2+ Angles (Multi-Angle)", value: 2 },
                          { label: "🎯 3+ Angles (Proven Testing)", value: 3 },
                          { label: "🎯 5+ Angles (Heavy Scale)", value: 5 },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onFilterChange({ minProductCreatives: opt.value, smartPreset: undefined });
                              setShowAddMenu(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition cursor-pointer ${
                              (filters.minProductCreatives || 0) === opt.value
                                ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Running Duration */}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuCategory(activeMenuCategory === "duration" ? null : "duration")
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Running Duration</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {isDaysRunningActive ? getDaysRunningLabel() : "Any"}
                      </span>
                    </button>

                    {activeMenuCategory === "duration" && (
                      <div className="pl-6 pr-1 py-1 space-y-1 bg-slate-50 dark:bg-slate-950/60 rounded-lg my-1">
                        {[
                          { label: "Any duration", value: 0 },
                          { label: "Running 1+ days", value: 1 },
                          { label: "Running 7+ days", value: 7 },
                          { label: "Running 14+ days", value: 14 },
                          { label: "Running 30+ days (Evergreen)", value: 30 },
                          { label: "Running 60+ days", value: 60 },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onFilterChange({ minDaysRunning: opt.value, smartPreset: undefined });
                              setShowAddMenu(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition cursor-pointer ${
                              (filters.minDaysRunning || 0) === opt.value
                                ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Launch Date */}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuCategory(activeMenuCategory === "date" ? null : "date")
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Launch Date</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {isDateActive ? getDateLabel() : "All Time"}
                      </span>
                    </button>

                    {activeMenuCategory === "date" && (
                      <div className="pl-6 pr-1 py-1 space-y-1 bg-slate-50 dark:bg-slate-950/60 rounded-lg my-1">
                        {[
                          { label: "All Time", value: "all" },
                          { label: "Today", value: "today" },
                          { label: "Yesterday", value: "yesterday" },
                          { label: "Last 7 Days", value: "7days" },
                          { label: "Last 30 Days", value: "30days" },
                          { label: "Custom Range...", value: "custom" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              handleDatePreset(opt.value);
                              setShowAddMenu(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition cursor-pointer ${
                              datePreset === opt.value
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Media Type */}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuCategory(activeMenuCategory === "media" ? null : "media")
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Media Type</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal capitalize">
                        {filters.mediaType || "All"}
                      </span>
                    </button>

                    {activeMenuCategory === "media" && (
                      <div className="pl-6 pr-1 py-1 space-y-1 bg-slate-50 dark:bg-slate-950/60 rounded-lg my-1">
                        {[
                          { label: "All Media", value: "all" },
                          { label: "Videos Only", value: "video" },
                          { label: "Images Only", value: "image" },
                          { label: "Carousel Only", value: "carousel" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onFilterChange({ mediaType: opt.value as any, smartPreset: undefined });
                              setShowAddMenu(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition cursor-pointer ${
                              (filters.mediaType || "all") === opt.value
                                ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuCategory(activeMenuCategory === "cta" ? null : "cta")
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-blue-500" />
                        <span>Call to Action (CTA)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {isCtaActive ? getCtaLabel() : "All"}
                      </span>
                    </button>

                    {activeMenuCategory === "cta" && (
                      <div className="pl-6 pr-1 py-1 space-y-1 bg-slate-50 dark:bg-slate-950/60 rounded-lg my-1 max-h-48 overflow-y-auto">
                        {[
                          { label: "All CTAs", value: "all" },
                          { label: "🛍️ Any Shop / Buy CTA", value: "ecom_any" },
                          { label: "Shop Now", value: "Shop Now" },
                          { label: "Order Now / Commander", value: "Order Now" },
                          { label: "Learn More", value: "Learn More" },
                          { label: "Send Message / WhatsApp", value: "Send Message" },
                          { label: "Get Offer", value: "Get Offer" },
                          { label: "Sign Up", value: "Sign Up" },
                          { label: "Contact Us", value: "Contact Us" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onFilterChange({ ctaText: opt.value as any, smartPreset: undefined });
                              setShowAddMenu(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition cursor-pointer ${
                              (filters.ctaText || "all") === opt.value
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Exclude Brands Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMenu(false);
                      setShowBrandModal(true);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <Ban className="w-3.5 h-3.5 text-rose-500" />
                      <span>Exclude Specific Brands</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {isExcludedActive ? `${excludedIds.length} excluded` : "None"}
                    </span>
                  </button>

                  {/* Status Option */}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuCategory(activeMenuCategory === "status" ? null : "status")
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                        <span>Ad Status</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal capitalize">
                        {filters.status || "All"}
                      </span>
                    </button>

                    {activeMenuCategory === "status" && (
                      <div className="pl-6 pr-1 py-1 space-y-1 bg-slate-50 dark:bg-slate-950/60 rounded-lg my-1">
                        {[
                          { label: "All Statuses", value: "all" },
                          { label: "Active Only", value: "active" },
                          { label: "Inactive Only", value: "inactive" },
                          { label: "Archived Only", value: "archived" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onFilterChange({ status: opt.value as any, smartPreset: undefined });
                              setShowAddMenu(false);
                            }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition cursor-pointer ${
                              (filters.status || "all") === opt.value
                                ? "bg-slate-500/10 text-slate-900 dark:text-white font-bold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Active Filter Chips ─── */}
          {isWinnerScoreActive && (
            <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs">
              <Award className="w-3 h-3 text-amber-500" />
              <span>{getWinnerScoreLabel()}</span>
              <button
                type="button"
                onClick={() => onFilterChange({ minWinnerScore: 0 })}
                className="hover:bg-amber-200 dark:hover:bg-amber-800 rounded p-0.5 transition cursor-pointer"
                title="Remove Winner Score filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {isScaleActive && (
            <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs">
              <Flame className="w-3 h-3 text-amber-500" />
              <span>{getScaleLabel()}</span>
              <button
                type="button"
                onClick={() => onFilterChange({ minDuplications: 1 })}
                className="hover:bg-amber-200 dark:hover:bg-amber-800 rounded p-0.5 transition cursor-pointer"
                title="Remove Scale filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {isAnglesActive && (
            <span className="inline-flex items-center gap-1 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs">
              <Target className="w-3 h-3 text-cyan-500" />
              <span>{getAnglesLabel()}</span>
              <button
                type="button"
                onClick={() => onFilterChange({ minProductCreatives: 0 })}
                className="hover:bg-cyan-200 dark:hover:bg-cyan-800 rounded p-0.5 transition cursor-pointer"
                title="Remove Angles filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {isDaysRunningActive && (
            <span className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs">
              <Clock className="w-3 h-3 text-indigo-500" />
              <span>{getDaysRunningLabel()}</span>
              <button
                type="button"
                onClick={() => onFilterChange({ minDaysRunning: 0 })}
                className="hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded p-0.5 transition cursor-pointer"
                title="Remove Duration filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {isDateActive && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs">
              <Calendar className="w-3 h-3 text-emerald-500" />
              <span>{getDateLabel()}</span>
              <button
                type="button"
                onClick={() => {
                  setDatePreset("all");
                  setShowCustomDates(false);
                  onFilterChange({ dateFrom: undefined, dateTo: undefined });
                }}
                className="hover:bg-emerald-200 dark:hover:bg-emerald-800 rounded p-0.5 transition cursor-pointer"
                title="Remove Date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {isMediaActive && (
            <span className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold capitalize shadow-2xs">
              <Filter className="w-3 h-3 text-indigo-500" />
              <span>{filters.mediaType} only</span>
              <button
                type="button"
                onClick={() => onFilterChange({ mediaType: "all" })}
                className="hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded p-0.5 transition cursor-pointer"
                title="Remove Media filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {isCtaActive && (
            <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs">
              <Tag className="w-3 h-3 text-blue-500" />
              <span>CTA: {getCtaLabel()}</span>
              <button
                type="button"
                onClick={() => onFilterChange({ ctaText: "all" })}
                className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded p-0.5 transition cursor-pointer"
                title="Remove CTA filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {isStatusActive && (
            <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold capitalize shadow-2xs">
              <span>Status: {filters.status}</span>
              <button
                type="button"
                onClick={() => onFilterChange({ status: "all" })}
                className="hover:bg-slate-200 dark:hover:bg-slate-700 rounded p-0.5 transition cursor-pointer"
                title="Remove Status filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {isExcludedActive && (
            <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs">
              <Ban className="w-3 h-3 text-rose-500" />
              <button
                type="button"
                onClick={() => setShowBrandModal(true)}
                className="hover:underline cursor-pointer"
              >
                {excludedIds.length} Brands Excluded
              </button>
              <button
                type="button"
                onClick={handleClearAllExcluded}
                className="hover:bg-rose-200 dark:hover:bg-rose-800 rounded p-0.5 transition cursor-pointer"
                title="Clear brand exclusions"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>

        {/* Clear All Filters Button */}
        {(totalActiveCustomFilters > 0 || (filters.smartPreset && filters.smartPreset !== "all") || searchValue) && (
          <button
            type="button"
            onClick={() => {
              setShowCustomDates(false);
              setDatePreset("all");
              setSearchValue("");
              onReset();
            }}
            className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1 text-xs transition-colors cursor-pointer font-semibold ml-auto shrink-0"
          >
            <RefreshCw className="w-3 h-3" /> Reset all
          </button>
        )}
      </div>

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
