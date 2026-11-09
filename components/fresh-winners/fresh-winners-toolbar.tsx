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
  minCreatives: number;
  onChangeMinCreatives: (c: number) => void;
  minCopies: number;
  onChangeMinCopies: (c: number) => void;
  mediaType: "all" | "video" | "image";
  onChangeMediaType: (m: "all" | "video" | "image") => void;
  category: string;
  onChangeCategory: (cat: string) => void;
  search: string;
  onChangeSearch: (s: string) => void;
  sortBy: string;
  onChangeSortBy: (s: string) => void;
  viewMode: "grid" | "list";
  onChangeViewMode: (m: "grid" | "list") => void;
  onResetFilters: () => void;
  totalResults: number;
}

export function FreshWinnersToolbar({
  window,
  onChangeWindow,
  minCreatives,
  onChangeMinCreatives,
  minCopies,
  onChangeMinCopies,
  mediaType,
  onChangeMediaType,
  category,
  onChangeCategory,
  search,
  onChangeSearch,
  sortBy,
  onChangeSortBy,
  viewMode,
  onChangeViewMode,
  onResetFilters,
  totalResults,
}: FreshWinnersToolbarProps) {
  const hasActiveFilters =
    window !== "7d" ||
    minCreatives !== 1 ||
    minCopies !== 2 ||
    mediaType !== "all" ||
    category !== "all" ||
    search.trim() !== "" ||
    sortBy !== "velocity";

  return (
    <div className="space-y-2.5 bg-card border border-border rounded-xl p-2.5 sm:p-3 shadow-xs">
      {/* Row 1: Search & Sorting */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder="Search product title, brand name, store domain..."
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

        {/* Right side: Sorting & View Mode */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value)}
              className="bg-background text-foreground text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="velocity">Scale Velocity</option>
              <option value="creatives">Most Creatives Tested</option>
              <option value="copies">Total Copies (Scale)</option>
              <option value="newest">Newest Product Launch</option>
            </select>
          </div>

          {/* Grid vs List View */}
          <div className="flex items-center rounded-lg bg-muted p-0.5 border border-border">
            <button
              onClick={() => onChangeViewMode("grid")}
              title="Grid View"
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeViewMode("list")}
              title="List View"
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Filter Pills */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-border/60">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Time Window Buttons */}
          <div className="flex items-center rounded-lg bg-muted/60 p-0.5 border border-border">
            <button
              onClick={() => onChangeWindow("3d")}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                window === "3d"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Last 72h
            </button>
            <button
              onClick={() => onChangeWindow("7d")}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                window === "7d"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Past 7 Days
            </button>
            <button
              onClick={() => onChangeWindow("14d")}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                window === "14d"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Past 14 Days
            </button>
          </div>

          {/* Min Creatives Filter */}
          <select
            value={minCreatives}
            onChange={(e) => onChangeMinCreatives(Number(e.target.value))}
            className="bg-background text-foreground text-[11px] font-semibold rounded-lg px-2.5 py-1 border border-border cursor-pointer focus:outline-none"
          >
            <option value={1}>All Creative Counts (1+)</option>
            <option value={2}>2+ Creatives Tested</option>
            <option value={3}>3+ Creatives Tested</option>
            <option value={5}>5+ Creatives Tested</option>
            <option value={10}>10+ Creatives Tested</option>
          </select>

          {/* Min Total Copies Filter */}
          <select
            value={minCopies}
            onChange={(e) => onChangeMinCopies(Number(e.target.value))}
            className="bg-background text-foreground text-[11px] font-semibold rounded-lg px-2.5 py-1 border border-border cursor-pointer focus:outline-none"
          >
            <option value={2}>Min 2+ Copies Scaled</option>
            <option value={5}>Min 5+ Copies Scaled</option>
            <option value={10}>Min 10+ Copies Scaled</option>
            <option value={20}>Min 20+ Copies Scaled</option>
          </select>

          {/* Media Format Filter */}
          <div className="flex items-center rounded-lg bg-muted/60 p-0.5 border border-border">
            <button
              onClick={() => onChangeMediaType("all")}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                mediaType === "all"
                  ? "bg-card text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Formats
            </button>
            <button
              onClick={() => onChangeMediaType("video")}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                mediaType === "video"
                  ? "bg-card text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Video className="w-3 h-3 text-indigo-500" />
              <span>Has Video</span>
            </button>
            <button
              onClick={() => onChangeMediaType("image")}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                mediaType === "image"
                  ? "bg-card text-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Static Only
            </button>
          </div>

          {/* Category Dropdown */}
          <select
            value={category}
            onChange={(e) => onChangeCategory(e.target.value)}
            className="bg-background text-foreground text-[11px] font-semibold rounded-lg px-2 py-1 border border-border cursor-pointer focus:outline-none max-w-[140px] truncate"
          >
            <option value="all">All Niches</option>
            <option value="Electronics & Tech">Tech & Gadgets</option>
            <option value="Beauty">Beauty & Cosmetics</option>
            <option value="Health & Care">Health & Care</option>
            <option value="Fashion">Fashion & Apparel</option>
            <option value="Home & Kitchen">Home & Kitchen</option>
            <option value="Jewelry & Watches">Jewelry & Watches</option>
            <option value="Automotive">Automotive</option>
            <option value="Kids & Toys">Kids & Toys</option>
            <option value="Sports & Fitness">Sports & Fitness</option>
            <option value="Pet Supplies">Pet Supplies</option>
          </select>
        </div>

        {/* Right side: Results count & Reset */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">
            <strong className="text-foreground">{totalResults}</strong> products found
          </span>

          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <X className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
