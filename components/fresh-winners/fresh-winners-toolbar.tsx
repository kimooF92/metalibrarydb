"use client";

import {
  Search,
  Flame,
  Clock,
  Layers,
  Video,
  ShoppingBag,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Sparkles,
  X,
  ChevronDown,
} from "lucide-react";

interface FreshWinnersToolbarProps {
  window: "3d" | "7d" | "14d";
  onChangeWindow: (w: "3d" | "7d" | "14d") => void;
  minCopies: number;
  onChangeMinCopies: (c: number) => void;
  mediaType: "all" | "video" | "image";
  onChangeMediaType: (m: "all" | "video" | "image") => void;
  hasProduct: boolean;
  onToggleHasProduct: () => void;
  category: string;
  onChangeCategory: (cat: string) => void;
  search: string;
  onChangeSearch: (s: string) => void;
  sortBy: string;
  onChangeSortBy: (s: string) => void;
  viewMode: "grid" | "list";
  onChangeViewMode: (m: "grid" | "list") => void;
  groupMode: "creative" | "product";
  onChangeGroupMode: (g: "creative" | "product") => void;
  onResetFilters: () => void;
  totalResults: number;
}

export function FreshWinnersToolbar({
  window,
  onChangeWindow,
  minCopies,
  onChangeMinCopies,
  mediaType,
  onChangeMediaType,
  hasProduct,
  onToggleHasProduct,
  category,
  onChangeCategory,
  search,
  onChangeSearch,
  sortBy,
  onChangeSortBy,
  viewMode,
  onChangeViewMode,
  groupMode,
  onChangeGroupMode,
  onResetFilters,
  totalResults,
}: FreshWinnersToolbarProps) {
  const hasActiveFilters =
    window !== "7d" ||
    minCopies !== 2 ||
    mediaType !== "all" ||
    hasProduct ||
    category !== "all" ||
    search.trim() !== "" ||
    sortBy !== "velocity";

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3 sm:p-4 shadow-xs backdrop-blur-md">
      {/* Row 1: Search & Quick Presets & View Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder="Search product title, ad copy, brand name, domain..."
            className="w-full bg-slate-50 dark:bg-slate-950/60 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-rose-500 transition-colors"
          />
          {search && (
            <button
              onClick={() => onChangeSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right side: View controls & Sorting */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {/* Creative vs Product Group Mode */}
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200 dark:border-slate-700/60">
            <button
              onClick={() => onChangeGroupMode("creative")}
              title="Creative-first View: shows individual scaling ad creatives"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                groupMode === "creative"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Creatives
            </button>
            <button
              onClick={() => onChangeGroupMode("product")}
              title="Product-first View: clusters creatives per product landing page"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                groupMode === "product"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Products
            </button>
          </div>

          {/* Sort Selector */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value)}
              className="appearance-none bg-slate-50 dark:bg-slate-950/60 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl pl-3 pr-8 py-2 focus:outline-none focus:border-rose-500 cursor-pointer shadow-xs"
            >
              <option value="velocity">⚡ Scaling Velocity</option>
              <option value="winner_score">🏆 Winner Score (Highest)</option>
              <option value="duplication_count">🔥 Active Copies (Scale)</option>
              <option value="newest">🆕 Newest Launch</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Grid vs List View Toggle */}
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200 dark:border-slate-700/60">
            <button
              onClick={() => onChangeViewMode("grid")}
              title="Grid View"
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeViewMode("list")}
              title="Compact Table View"
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Filter Chips & Quick Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800/60">
        <div className="flex flex-wrap items-center gap-2">
          {/* Freshness Window Pills */}
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-950/60 p-0.5 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => onChangeWindow("3d")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                window === "3d"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>⚡ 72 Hours</span>
            </button>
            <button
              onClick={() => onChangeWindow("7d")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                window === "7d"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>🔥 7 Days</span>
            </button>
            <button
              onClick={() => onChangeWindow("14d")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                window === "14d"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>14 Days</span>
            </button>
          </div>

          {/* Scale Threshold Chips */}
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-950/60 p-0.5 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => onChangeMinCopies(2)}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                minCopies === 2
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              2+ Copies
            </button>
            <button
              onClick={() => onChangeMinCopies(3)}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                minCopies === 3
                  ? "bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <span>🔥 3+ (Breakouts)</span>
            </button>
            <button
              onClick={() => onChangeMinCopies(5)}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                minCopies === 5
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              5+ Scaled
            </button>
          </div>

          {/* Media Format Filter */}
          <div className="relative">
            <select
              value={mediaType}
              onChange={(e) => onChangeMediaType(e.target.value as any)}
              className="appearance-none bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-xl pl-3 pr-7 py-1.5 focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="all">All Media</option>
              <option value="video">🎥 Videos Only</option>
              <option value="image">🖼️ Images Only</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <select
              value={category}
              onChange={(e) => onChangeCategory(e.target.value)}
              className="appearance-none bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-xl pl-3 pr-7 py-1.5 focus:outline-none focus:border-rose-500 cursor-pointer max-w-[170px] truncate"
            >
              <option value="all">All Categories</option>
              <option value="Electronics & Tech">📱 Electronics &amp; Tech</option>
              <option value="Beauty, Health & Care">💄 Beauty &amp; Health</option>
              <option value="Home, Kitchen & Living">🏠 Home &amp; Kitchen</option>
              <option value="Fashion & Jewelry">👗 Fashion &amp; Jewelry</option>
              <option value="Sports, Fitness & Outdoor">⚡ Sports &amp; Fitness</option>
              <option value="Kids, Baby & Toys">🧸 Kids &amp; Baby</option>
              <option value="Automotive & Tools">🚗 Automotive &amp; Tools</option>
              <option value="General & Other">📦 General &amp; Other</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>

          {/* Landing Page Only Toggle */}
          <button
            onClick={onToggleHasProduct}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              hasProduct
                ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-800 font-bold"
                : "bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Stores Only</span>
          </button>
        </div>

        {/* Clear Filters / Results count */}
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-white font-extrabold">{totalResults}</strong> fresh {totalResults === 1 ? "winner" : "winners"}
          </span>

          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
