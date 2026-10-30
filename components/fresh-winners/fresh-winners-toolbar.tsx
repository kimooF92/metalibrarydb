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
  LayoutList,
  Sparkles,
  X,
  ChevronDown,
  ArrowUpDown,
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
    <div className="space-y-2.5 bg-card border border-border rounded-xl p-2.5 sm:p-3 shadow-xs">
      {/* Row 1: Search, Group View & Sorting */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder="Search ad title, caption, brand, store domain..."
            className="w-full bg-background text-foreground text-xs placeholder:text-muted-foreground rounded-lg pl-9 pr-8 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium transition-colors"
          />
          {search && (
            <button
              onClick={() => onChangeSearch("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right side: View controls & Sorting */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {/* Creative vs Product Group Mode */}
          <div className="flex items-center rounded-lg bg-muted p-0.5 border border-border">
            <button
              onClick={() => onChangeGroupMode("creative")}
              title="Creative view: show individual scaling ads"
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${groupMode === "creative"
                ? "bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              Creatives
            </button>
            <button
              onClick={() => onChangeGroupMode("product")}
              title="Product view: cluster creatives per store product"
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${groupMode === "product"
                ? "bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
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
              className="appearance-none bg-background text-foreground text-xs font-semibold border border-border rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-xs"
            >
              <option value="velocity">⚡ Scaling Velocity</option>
              <option value="winner_score">🏆 Winner Score</option>
              <option value="duplication_count">🔥 Active Copies</option>
              <option value="newest">🆕 Newest Launch</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>

          {/* Grid vs List View Toggle */}
          <div className="flex items-center rounded-lg bg-muted p-0.5 border border-border">
            <button
              onClick={() => onChangeViewMode("grid")}
              title="Grid View"
              className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === "grid"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeViewMode("list")}
              title="List View"
              className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === "list"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Filter Pills & Options */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
        <div className="flex flex-wrap items-center gap-2">
          {/* Freshness Window Pills */}
          <div className="flex items-center rounded-lg bg-muted p-0.5 border border-border">
            <button
              onClick={() => onChangeWindow("3d")}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${window === "3d"
                ? "bg-indigo-600 text-white shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <span>⚡ 72 Hours</span>
            </button>
            <button
              onClick={() => onChangeWindow("7d")}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${window === "7d"
                ? "bg-indigo-600 text-white shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <span>Past 7 Days</span>
            </button>
            <button
              onClick={() => onChangeWindow("14d")}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${window === "14d"
                ? "bg-indigo-600 text-white shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <span>14 Days</span>
            </button>
          </div>

          {/* Scale Threshold Chips */}
          <div className="flex items-center rounded-lg bg-muted p-0.5 border border-border">
            <button
              onClick={() => onChangeMinCopies(2)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${minCopies === 2
                ? "bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              2+ Copies
            </button>
            <button
              onClick={() => onChangeMinCopies(3)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${minCopies === 3
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <Flame className="w-3 h-3 text-rose-500" />
              <span>3+ (Breakouts)</span>
            </button>
            <button
              onClick={() => onChangeMinCopies(5)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${minCopies === 5
                ? "bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
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
              className="appearance-none bg-background text-foreground text-xs font-medium border border-border rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Formats</option>
              <option value="video">🎥 Videos</option>
              <option value="image">🖼️ Images</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <select
              value={category}
              onChange={(e) => onChangeCategory(e.target.value)}
              className="appearance-none bg-background text-foreground text-xs font-medium border border-border rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[150px] truncate"
            >
              <option value="all">All Categories</option>
              <option value="Electronics & Tech">Electronics & Tech</option>
              <option value="Beauty, Health & Care">Beauty & Health</option>
              <option value="Home, Kitchen & Living">Home & Kitchen</option>
              <option value="Fashion & Jewelry">Fashion & Jewelry</option>
              <option value="Sports, Fitness & Outdoor">Sports & Fitness</option>
              <option value="Kids, Baby & Toys">Kids & Baby</option>
              <option value="Automotive & Tools">Automotive & Tools</option>
              <option value="General & Other">General & Other</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>

          {/* Stores Only Toggle */}
          <button
            onClick={onToggleHasProduct}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${hasProduct
              ? "bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 font-bold"
              : "bg-background text-muted-foreground border-border hover:text-foreground"
              }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Stores Only</span>
          </button>
        </div>

        {/* Clear Filters / Count */}
        <div className="flex items-center gap-2.5 ml-auto">
          <span className="text-xs text-muted-foreground">
            <strong className="text-foreground font-bold">{totalResults}</strong> fresh winners
          </span>

          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
