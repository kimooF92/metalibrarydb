"use client";

import React from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  LayoutGrid,
  LayoutList,
  PlusCircle,
  Sparkles,
  Flame,
  TrendingUp,
  Clock,
  Tag,
  Building2,
  Globe2,
  Calendar,
  EyeOff,
  Layers,
} from "lucide-react";
import type { SmartPreset } from "./products-kpi-bar";
import { getNicheDisplayLabel } from "@/lib/niches-taxonomy";

export interface ProductsTopBarProps {
  // Search
  searchInput: string;
  onChangeSearch: (val: string) => void;
  onClearSearch: () => void;

  // Presets
  smartPreset: SmartPreset;
  onSelectPreset: (preset: SmartPreset, defaultSort?: string) => void;

  // Sorting & View
  sortBy: string;
  onChangeSortBy: (val: string) => void;
  viewMode: "grid" | "list";
  onChangeViewMode: (mode: "grid" | "list") => void;

  // Mobile drawer trigger
  onOpenMobileDrawer: () => void;
  activeFilterCount: number;

  // Add Product CTA
  onOpenAddProduct?: () => void;

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
  sortBy,
  onChangeSortBy,
  viewMode,
  onChangeViewMode,
  onOpenMobileDrawer,
  activeFilterCount,
  onOpenAddProduct,
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
  const PRESET_TABS = [
    { id: "all" as SmartPreset, label: "All Products", icon: null },
    { id: "favorites" as SmartPreset, label: "Favorites", icon: Sparkles, color: "text-amber-400" },
    { id: "breakout" as SmartPreset, label: "Breakout", icon: Flame, color: "text-amber-500", sort: "most_scaled" },
    { id: "scaled" as SmartPreset, label: "Most Scaled", icon: TrendingUp, color: "text-emerald-500", sort: "most_scaled" },
    { id: "new" as SmartPreset, label: "New This Week", icon: Sparkles, color: "text-blue-500", sort: "latest" },
    { id: "evergreen" as SmartPreset, label: "Evergreen", icon: Clock, color: "text-purple-500", sort: "top_lasting" },
    { id: "with_offers" as SmartPreset, label: "Offers", icon: Tag, color: "text-rose-500" },
  ];

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
            type="text"
            value={searchInput}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder="Search product title, brand, URL, offer..."
            className="w-full bg-background text-foreground text-xs placeholder:text-muted-foreground rounded-lg pl-9 pr-8 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium transition-colors"
          />
          {searchInput && (
            <button
              type="button"
              onClick={onClearSearch}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
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

          {/* Quick Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => onChangeSortBy(e.target.value)}
            className="bg-background text-xs font-semibold rounded-lg border border-border px-2.5 py-2 text-foreground focus:outline-none cursor-pointer"
          >
            <option value="latest">Newest Discovered</option>
            <option value="oldest">Oldest Discovered</option>
            <option value="most_scaled">Most Scaled (Active Ads)</option>
            <option value="top_lasting">Longest Lasting (Evergreen)</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="title">Title: A to Z</option>
          </select>

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

          {/* Add Product CTA */}
          {onOpenAddProduct && (
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              title="Add a new product"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </button>
          )}
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer select-none border ${
                isActive
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                  : "bg-card hover:bg-accent text-muted-foreground hover:text-foreground border-border"
              }`}
            >
              {Icon && <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : tab.color || ""}`} />}
              <span>{tab.label}</span>
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
              <span>Sub-Niche: {sub}</span>
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
