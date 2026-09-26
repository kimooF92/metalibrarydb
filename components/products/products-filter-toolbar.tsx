"use client";

import {
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
  Globe,
  Star,
  Rocket,
  Flame,
  Zap,
  Clock,
  Tag,
  Eye,
  EyeOff,
  LayoutGrid,
  LayoutList,
  Building2,
  Calendar,
} from "lucide-react";
import type { SmartPreset } from "./products-kpi-bar";

interface Stats {
  totalProducts: number;
  successfulProducts: number;
  pendingProducts: number;
  withOffersCount: number;
  favoritesCount: number;
  newThisWeekCount: number;
  evergreenCount: number;
  activeCount: number;
  inactiveCount: number;
  platforms: {
    shopify: number;
    youcan: number;
    woocommerce: number;
  };
}

export interface FilterToolbarProps {
  // Smart preset
  smartPreset: SmartPreset;
  onSelectPreset: (preset: SmartPreset, defaultSort?: string) => void;

  // Search
  searchInput: string;
  onChangeSearch: (value: string) => void;
  onClearSearch: () => void;

  // Sort
  sortBy: string;
  onChangeSortBy: (value: string) => void;

  // Active / inactive toggle
  hideInactive: boolean;
  onToggleHideInactive: () => void;

  // View mode
  viewMode: "grid" | "list";
  onChangeViewMode: (mode: "grid" | "list") => void;

  // Filters drawer
  isFiltersOpen: boolean;
  onToggleFilters: () => void;

  // Secondary filter values
  brandInput: string;
  onChangeBrand: (value: string) => void;
  onClearBrand: () => void;
  debouncedBrand: string;

  categoryFilter: string;
  onChangeCategoryFilter: (value: string) => void;

  platform: string;
  onChangePlatform: (value: string) => void;

  statusFilter: string;
  onChangeStatusFilter: (value: string) => void;

  discoveryFilter: string;
  onChangeDiscoveryFilter: (value: string) => void;

  discoveryFrom: string;
  onChangeDiscoveryFrom: (value: string) => void;

  discoveryTo: string;
  onChangeDiscoveryTo: (value: string) => void;

  onResetFilters: () => void;

  // Computed helpers
  activeFilterCount: number;
  discoveryLabels: Record<string, string>;
  stats: Stats;
}

export function ProductsFilterToolbar({
  smartPreset,
  onSelectPreset,
  searchInput,
  onChangeSearch,
  onClearSearch,
  sortBy,
  onChangeSortBy,
  hideInactive,
  onToggleHideInactive,
  viewMode,
  onChangeViewMode,
  isFiltersOpen,
  onToggleFilters,
  brandInput,
  onChangeBrand,
  onClearBrand,
  debouncedBrand,
  categoryFilter,
  onChangeCategoryFilter,
  platform,
  onChangePlatform,
  statusFilter,
  onChangeStatusFilter,
  discoveryFilter,
  onChangeDiscoveryFilter,
  discoveryFrom,
  onChangeDiscoveryFrom,
  discoveryTo,
  onChangeDiscoveryTo,
  onResetFilters,
  activeFilterCount,
  discoveryLabels,
  stats,
}: FilterToolbarProps) {
  return (
    <div className="space-y-2.5">
      {/* Smart Preset Pills */}
      <div className="flex items-center gap-1.5 pt-0.5 pb-0.5 flex-wrap">
        <button
          onClick={() => onSelectPreset("all")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            smartPreset === "all"
              ? "bg-indigo-600 text-white shadow-xs shadow-indigo-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>All ({stats.totalProducts})</span>
        </button>

        <button
          onClick={() => onSelectPreset("favorites")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            smartPreset === "favorites"
              ? "bg-amber-500 text-slate-950 font-bold shadow-xs shadow-amber-500/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Star
            className={`w-3.5 h-3.5 ${smartPreset === "favorites" ? "fill-current" : "text-amber-500"}`}
          />
          <span>Favorites ({stats.favoritesCount})</span>
        </button>

        <button
          onClick={() => onSelectPreset("breakout", "breakout")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            smartPreset === "breakout"
              ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white font-bold shadow-xs shadow-rose-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Rocket className="w-3.5 h-3.5 text-pink-400" />
          <span>Breakout</span>
        </button>

        <button
          onClick={() => onSelectPreset("most_scaled", "most_scaled")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            smartPreset === "most_scaled"
              ? "bg-rose-600 text-white shadow-xs shadow-rose-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-rose-400" />
          <span>Scaled</span>
        </button>

        <button
          onClick={() => onSelectPreset("new_discovered", "latest")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            smartPreset === "new_discovered"
              ? "bg-emerald-600 text-white shadow-xs shadow-emerald-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>New ({stats.newThisWeekCount})</span>
        </button>

        <button
          onClick={() => onSelectPreset("top_lasting", "top_lasting")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            smartPreset === "top_lasting"
              ? "bg-purple-600 text-white shadow-xs shadow-purple-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-purple-400" />
          <span>Evergreen ({stats.evergreenCount})</span>
        </button>

        <button
          onClick={() => onSelectPreset("with_offers")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            smartPreset === "with_offers"
              ? "bg-blue-600 text-white shadow-xs shadow-blue-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Tag className="w-3.5 h-3.5 text-blue-400" />
          <span>Offers ({stats.withOffersCount})</span>
        </button>
      </div>

      {/* Primary Toolbar Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder="Search product title, brand, URL, offer..."
            className="w-full bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-lg pl-9 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
          />
          {searchInput && (
            <button
              type="button"
              onClick={onClearSearch}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {/* Filters Toggle Button */}
          <button
            type="button"
            onClick={onToggleFilters}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer select-none ${
              isFiltersOpen || activeFilterCount > 0
                ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shadow-xs"
                : "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isFiltersOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Quick Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => onChangeSortBy(e.target.value)}
            className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="latest">Newest Discovered</option>
            <option value="oldest">Oldest Discovered</option>
            <option value="most_scaled">Most Scaled (Active Ads)</option>
            <option value="top_lasting">Longest Lasting (Evergreen)</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="title">Title: A to Z</option>
          </select>

          {/* Active / Inactive Toggle Button */}
          <button
            type="button"
            onClick={onToggleHideInactive}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer select-none ${
              hideInactive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-xs"
                : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
            title={
              hideInactive
                ? "Currently hiding inactive (off-air) products. Click to include all products."
                : "Currently showing all products including off-air. Click to hide inactive products."
            }
          >
            {hideInactive ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Active Only</span>
                {stats.inactiveCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">
                    -{stats.inactiveCount}
                  </span>
                )}
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>All Products</span>
              </>
            )}
          </button>

          {/* Grid / List View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onChangeViewMode("grid")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-xs"
                  : "text-slate-500"
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
                  ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-xs"
                  : "text-slate-500"
              }`}
              title="Dense List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Filter Drawer */}
      {isFiltersOpen && (
        <div className="p-4 bg-white dark:bg-slate-950/70 rounded-xl border border-slate-200 dark:border-slate-800/90 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Refine Product Catalog
              </span>
              {activeFilterCount > 0 && (
                <span className="text-[11px] text-slate-500 font-medium">
                  ({activeFilterCount} active)
                </span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Brand Filter Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Brand Name or Page ID
              </label>
              <div className="relative">
                <Building2 className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={brandInput}
                  onChange={(e) => onChangeBrand(e.target.value)}
                  placeholder="e.g. Nike, Apple..."
                  className="w-full bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 pl-8 pr-7 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
                />
                {brandInput && (
                  <button
                    type="button"
                    onClick={onClearBrand}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Niche &amp; Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => onChangeCategoryFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Categories</option>
                <option value="Electronics & Tech">📱 Electronics &amp; Tech</option>
                <option value="Beauty, Health & Care">💄 Beauty &amp; Health</option>
                <option value="Home, Kitchen & Living">🏠 Home &amp; Kitchen</option>
                <option value="Fashion & Jewelry">👗 Fashion &amp; Jewelry</option>
                <option value="Sports, Fitness & Outdoor">⚡ Sports &amp; Fitness</option>
                <option value="Kids, Baby & Toys">🧸 Kids &amp; Baby</option>
                <option value="Automotive & Tools">🚗 Automotive &amp; Tools</option>
                <option value="General & Other">📦 General &amp; Uncategorized</option>
              </select>
            </div>

            {/* E-Commerce Platform Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                E-Commerce Platform
              </label>
              <select
                value={platform}
                onChange={(e) => onChangePlatform(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Platforms</option>
                <option value="shopify">Shopify ({stats.platforms.shopify})</option>
                <option value="youcan">YouCan ({stats.platforms.youcan})</option>
                <option value="woocommerce">WooCommerce ({stats.platforms.woocommerce})</option>
              </select>
            </div>

            {/* Scrape Status Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Scraping Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => onChangeStatusFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Scrape Status</option>
                <option value="success">Scraped Only ({stats.successfulProducts})</option>
                <option value="pending">Pending / Needs Scrape ({stats.pendingProducts})</option>
                <option value="failed">Failed Scrape Only</option>
              </select>
            </div>

            {/* Discovery Date Filter & Custom Range */}
            <div className="space-y-1 sm:col-span-2 md:col-span-4 pt-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Discovery Date
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={discoveryFilter}
                  onChange={(e) => onChangeDiscoveryFilter(e.target.value)}
                  className={`text-xs font-semibold rounded-lg border px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
                    discoveryFilter !== "all"
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800"
                      : "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <option value="all">All Discovery Dates</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last_3d">Last 3 Days</option>
                  <option value="last_7d">Last 7 Days</option>
                  <option value="last_14d">Last 14 Days</option>
                  <option value="last_30d">Last 30 Days</option>
                  <option value="this_month">This Month</option>
                  <option value="custom">Custom Date Range...</option>
                </select>

                {discoveryFilter === "custom" && (
                  <div className="inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">From</span>
                    <input
                      type="date"
                      value={discoveryFrom}
                      onChange={(e) => onChangeDiscoveryFrom(e.target.value)}
                      className="bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer text-xs"
                    />
                    <span className="text-[10px] font-bold text-slate-400 uppercase">To</span>
                    <input
                      type="date"
                      value={discoveryTo}
                      onChange={(e) => onChangeDiscoveryTo(e.target.value)}
                      className="bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips Bar */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs pt-1 pb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">
            Active Filters ({activeFilterCount}):
          </span>

          {debouncedBrand.trim() && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>
                Brand: <strong>{debouncedBrand}</strong>
              </span>
              <button
                type="button"
                onClick={onClearBrand}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove brand filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {categoryFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <Tag className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>
                Category: <strong>{categoryFilter}</strong>
              </span>
              <button
                type="button"
                onClick={() => onChangeCategoryFilter("all")}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove category filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {platform !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <Globe className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>
                Platform: <strong className="capitalize">{platform}</strong>
              </span>
              <button
                type="button"
                onClick={() => onChangePlatform("all")}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove platform filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {statusFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <span>
                Status: <strong className="capitalize">{statusFilter}</strong>
              </span>
              <button
                type="button"
                onClick={() => onChangeStatusFilter("all")}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove status filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {discoveryFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>
                Discovery: <strong>{discoveryLabels[discoveryFilter] || discoveryFilter}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  onChangeDiscoveryFilter("all");
                  onChangeDiscoveryFrom("");
                  onChangeDiscoveryTo("");
                }}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove discovery date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {hideInactive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px]">
              <EyeOff className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>Active Ads Only</span>
              <button
                type="button"
                onClick={onToggleHideInactive}
                className="hover:text-emerald-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Show all products including inactive"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        </div>
      )}
    </div>
  );
}
