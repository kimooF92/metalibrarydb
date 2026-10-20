"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  LayoutGrid,
  LayoutList,
  Sparkles,
  Flame,
  TrendingUp,
  Clock,
  Tag,
  Building2,
  Globe2,
  Calendar,
  Eye,
  EyeOff,
  Layers,
  ArrowUpDown,
  ChevronDown,
  Check,
} from "lucide-react";
import type { SmartPreset } from "./products-kpi-bar";
import { getNicheDisplayLabel, getSubNicheDisplayLabel } from "@/lib/niches-taxonomy";
import { useAuth } from "@/components/auth-context";

const SORT_OPTIONS = [
  { value: "latest", label: "Newest Discovered" },
  { value: "oldest", label: "Oldest Discovered" },
  { value: "most_scaled", label: "Most Scaled (Active Ads)" },
  { value: "top_lasting", label: "Longest Lasting (Evergreen)" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "title", label: "Title: A to Z" },
];

export interface ProductsTopBarProps {
  // Search
  searchInput: string;
  onChangeSearch: (val: string) => void;
  onClearSearch: () => void;

  // Presets
  smartPreset: SmartPreset;
  onSelectPreset: (preset: SmartPreset, defaultSort?: string) => void;
  presetCounts?: Partial<Record<SmartPreset, number>>;

  // Sorting & View
  sortBy: string;
  onChangeSortBy: (val: string) => void;
  viewMode: "grid" | "list";
  onChangeViewMode: (mode: "grid" | "list") => void;

  // Mobile drawer trigger & Desktop sidebar toggle
  onOpenMobileDrawer: () => void;
  activeFilterCount: number;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;

  // Filter values for Chips Row
  selectedNiches: string[];
  onRemoveNiche: (niche: string) => void;
  selectedSubNiches: string[];
  onRemoveSubNiche: (sub: string) => void;

  brandInput: string;
  onClearBrand: () => void;
  platform: string;
  onChangePlatform: (val: string) => void;
  hideInactive: boolean;
  onToggleHideInactive: () => void;
  discoveryFilter: string;
  onChangeDiscoveryFilter: (val: string) => void;
  discoveryLabels?: Record<string, string>;
  adLaunchFilter: string;
  onChangeAdLaunchFilter: (val: string) => void;
  adLaunchLabels?: Record<string, string>;
  stillRunningOnly: boolean;

  onResetFilters: () => void;
}

export function ProductsTopBar({
  searchInput,
  onChangeSearch,
  onClearSearch,
  smartPreset,
  onSelectPreset,
  presetCounts,
  sortBy,
  onChangeSortBy,
  viewMode,
  onChangeViewMode,
  onOpenMobileDrawer,
  activeFilterCount,
  isSidebarCollapsed,
  onToggleSidebar,
  selectedNiches,
  onRemoveNiche,
  selectedSubNiches,
  onRemoveSubNiche,
  brandInput,
  onClearBrand,
  platform,
  onChangePlatform,
  hideInactive,
  onToggleHideInactive,
  discoveryFilter,
  onChangeDiscoveryFilter,
  discoveryLabels = {},
  adLaunchFilter,
  onChangeAdLaunchFilter,
  adLaunchLabels = {},
  stillRunningOnly,
  onResetFilters,
}: ProductsTopBarProps) {
  const { isStaff } = useAuth();
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        const activeTag = document.activeElement?.tagName;
        if (
          activeTag === "INPUT" ||
          activeTag === "TEXTAREA" ||
          activeTag === "SELECT" ||
          (document.activeElement as HTMLElement)?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close sort dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    if (isSortOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSortOpen]);

  const currentSortLabel =
    SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label || "Sort";

  const allPresetTabs = [
    { id: "all" as SmartPreset, label: "All Products", count: presetCounts?.all, icon: null },
    { id: "favorites" as SmartPreset, label: "Favorites", count: presetCounts?.favorites, icon: Sparkles, color: "text-amber-400" },
    { id: "breakout" as SmartPreset, label: "Breakout", icon: Flame, color: "text-amber-500", sort: "most_scaled" },
    { id: "most_scaled" as SmartPreset, label: "Most Scaled", icon: TrendingUp, color: "text-emerald-500", sort: "most_scaled" },
    { id: "new_discovered" as SmartPreset, label: "Fresh Drops", count: presetCounts?.new_discovered, icon: Sparkles, color: "text-blue-500", sort: "latest" },
    { id: "top_lasting" as SmartPreset, label: "Evergreen", count: presetCounts?.top_lasting, icon: Clock, color: "text-purple-500", sort: "top_lasting" },
    { id: "with_offers" as SmartPreset, label: "Offers", count: presetCounts?.with_offers, icon: Tag, color: "text-rose-500" },
  ];

  const PRESET_TABS = isStaff
    ? allPresetTabs.filter((t) => t.id === "all" || t.id === "favorites")
    : allPresetTabs;

  const hasAnyFilterActive =
    activeFilterCount > 0 ||
    selectedNiches.length > 0 ||
    selectedSubNiches.length > 0 ||
    brandInput.trim().length > 0 ||
    platform !== "all" ||
    hideInactive ||
    discoveryFilter !== "all" ||
    adLaunchFilter !== "all";

  return (
    <div className="space-y-2.5">
      {/* Row 1: Primary Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-card border border-border rounded-xl p-2.5 shadow-xs">
        {/* Left: Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder="Search product title, brand, URL, offer..."
            className="w-full bg-background text-foreground text-xs placeholder:text-muted-foreground rounded-lg pl-9 pr-10 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium transition-colors"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={onClearSearch}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd
              className="hidden sm:inline-flex items-center absolute right-2.5 top-2.5 px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground bg-muted border border-border/70 rounded pointer-events-none select-none"
              title="Press / to focus search"
            >
              /
            </kbd>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 justify-end flex-wrap">
          {/* Mobile Filter Drawer Trigger (lg:hidden) */}
          <button
            type="button"
            onClick={onOpenMobileDrawer}
            className={`lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer select-none ${
              hasAnyFilterActive
                ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800"
                : "bg-background text-foreground border-border hover:bg-accent"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Desktop Filter Sidebar Expand Button (when collapsed) */}
          {onToggleSidebar && isSidebarCollapsed && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer select-none ${
                hasAnyFilterActive
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800"
                  : "bg-background text-foreground border-border hover:bg-accent"
              }`}
              title="Expand Filters Sidebar"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {/* Quick Active Only Toggle */}
          <button
            type="button"
            onClick={onToggleHideInactive}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer select-none ${
              hideInactive
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs"
                : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground"
            }`}
            title={
              hideInactive
                ? "Currently showing only active products (off-air products hidden). Click to show all."
                : "Filter to only products with active ads currently running."
            }
          >
            {hideInactive ? (
              <EyeOff className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span>Active Only</span>
          </button>

          {/* Custom Styled Sort Dropdown */}
          <div className="relative" ref={sortRef}>
            <button
              type="button"
              onClick={() => setIsSortOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold border border-border bg-background hover:bg-accent text-foreground transition-all cursor-pointer select-none"
              title="Change sort order"
              aria-expanded={isSortOpen}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="hidden sm:inline">{currentSortLabel}</span>
              <span className="sm:hidden">Sort</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${
                  isSortOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isSortOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-card border border-border rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  Sort Products
                </div>
                <div className="p-1 space-y-0.5">
                  {SORT_OPTIONS.map((opt) => {
                    const isSelected = sortBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChangeSortBy(opt.value);
                          setIsSortOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 ml-2" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Grid / List View Toggle */}
          <div className="flex items-center bg-muted p-0.5 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => onChangeViewMode("grid")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-card text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode("list")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-card text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Dense List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Horizontally Scrollable Smart Preset Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {PRESET_TABS.map((tab) => {
          const isActive = smartPreset === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectPreset(tab.id, tab.sort)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer select-none border group ${
                isActive
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                  : "bg-card hover:bg-accent text-muted-foreground hover:text-foreground border-border"
              }`}
            >
              {Icon && <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : tab.color || ""}`} />}
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums transition-colors ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-muted text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Row 3: Active Filter Chips Bar */}
      {hasAnyFilterActive && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs pt-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Active Filters:
          </span>

          {/* Brand Chip */}
          {brandInput.trim() && (
            <span className="inline-flex items-center gap-1 px-2 py-0.8 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold text-[11px]">
              <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>Brand: {brandInput}</span>
              <button
                type="button"
                onClick={onClearBrand}
                className="hover:text-foreground ml-0.5 p-0.5 cursor-pointer"
                title="Remove brand filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Niche Chips */}
          {selectedNiches.map((niche) => (
            <span
              key={niche}
              className="inline-flex items-center gap-1 px-2 py-0.8 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold text-[11px]"
            >
              <Layers className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>Niche: {getNicheDisplayLabel(niche)}</span>
              <button
                type="button"
                onClick={() => onRemoveNiche(niche)}
                className="hover:text-foreground ml-0.5 p-0.5 cursor-pointer"
                title="Remove niche filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Sub-Niche Chips */}
          {selectedSubNiches.map((sub) => (
            <span
              key={sub}
              className="inline-flex items-center gap-1 px-2 py-0.8 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold text-[11px]"
            >
              <span>Sub-Niche: {getSubNicheDisplayLabel(sub)}</span>
              <button
                type="button"
                onClick={() => onRemoveSubNiche(sub)}
                className="hover:text-foreground ml-0.5 p-0.5 cursor-pointer"
                title="Remove sub-niche filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Platform Chip */}
          {platform !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.8 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold text-[11px]">
              <Globe2 className="w-3 h-3 text-indigo-500 shrink-0" />
              <span className="capitalize">Platform: {platform}</span>
              <button
                type="button"
                onClick={() => onChangePlatform("all")}
                className="hover:text-foreground ml-0.5 p-0.5 cursor-pointer"
                title="Remove platform filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Active Ads Only Chip */}
          {hideInactive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.8 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
              <EyeOff className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>Active Ads Only</span>
              <button
                type="button"
                onClick={onToggleHideInactive}
                className="hover:text-foreground ml-0.5 p-0.5 cursor-pointer"
                title="Show all products"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Ad Launch Date Chip */}
          {adLaunchFilter !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.8 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
              <Flame className="w-3 h-3 text-amber-500 shrink-0" />
              <span>Launch: {adLaunchLabels[adLaunchFilter] || adLaunchFilter}</span>
              <button
                type="button"
                onClick={() => onChangeAdLaunchFilter("all")}
                className="hover:text-foreground ml-0.5 p-0.5 cursor-pointer"
                title="Remove launch window filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Discovery Date Chip */}
          {discoveryFilter !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.8 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold text-[11px]">
              <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>Discovery: {discoveryLabels[discoveryFilter] || discoveryFilter}</span>
              <button
                type="button"
                onClick={() => onChangeDiscoveryFilter("all")}
                className="hover:text-foreground ml-0.5 p-0.5 cursor-pointer"
                title="Remove discovery date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Clear All Button */}
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-red-500 px-2 py-0.8 rounded-md hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        </div>
      )}
    </div>
  );
}
