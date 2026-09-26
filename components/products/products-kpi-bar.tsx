"use client";

import { ShoppingBag, Star, Zap, Clock, Tag } from "lucide-react";

export type SmartPreset =
  | "all"
  | "breakout"
  | "most_scaled"
  | "new_discovered"
  | "top_lasting"
  | "with_offers"
  | "favorites";

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

interface ProductsKpiBarProps {
  stats: Stats;
  statsLoading: boolean;
  smartPreset: SmartPreset;
  onSelectPreset: (preset: SmartPreset, defaultSort?: string) => void;
}

export function ProductsKpiBar({
  stats,
  statsLoading,
  smartPreset,
  onSelectPreset,
}: ProductsKpiBarProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {/* Total Products */}
      <div
        onClick={() => onSelectPreset("all")}
        title={`View All Products (${stats.successfulProducts} fully scraped, ${stats.pendingProducts} pending)`}
        className={`px-3 py-2 rounded-lg bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-150 select-none ${
          smartPreset === "all"
            ? "border-indigo-500/60 ring-1 ring-indigo-500/25 bg-indigo-50/25 dark:bg-indigo-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-indigo-500/35"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
          <span className="truncate">Total Products</span>
          <ShoppingBag className="w-3.5 h-3.5 text-indigo-500 shrink-0 ml-1" />
        </div>
        <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
          <span
            className={`text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight ${
              statsLoading ? "animate-pulse opacity-60" : ""
            }`}
          >
            {stats.totalProducts}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">
            {stats.successfulProducts} scraped
          </span>
        </div>
      </div>

      {/* Starred Favorites */}
      <div
        onClick={() => onSelectPreset("favorites")}
        title="Filter by Starred Favorites"
        className={`px-3 py-2 rounded-lg bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-150 select-none ${
          smartPreset === "favorites"
            ? "border-amber-500/60 ring-1 ring-amber-500/25 bg-amber-50/25 dark:bg-amber-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-amber-500/35"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
          <span className="truncate">Favorites</span>
          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 shrink-0 ml-1" />
        </div>
        <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
          <span
            className={`text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 leading-tight ${
              statsLoading ? "animate-pulse opacity-60" : ""
            }`}
          >
            {stats.favoritesCount}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">
            watchlist
          </span>
        </div>
      </div>

      {/* Fresh Drops (Last 7 Days) */}
      <div
        onClick={() => onSelectPreset("new_discovered", "latest")}
        title="Filter by Fresh Drops discovered in the last 7 days"
        className={`px-3 py-2 rounded-lg bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-150 select-none ${
          smartPreset === "new_discovered"
            ? "border-emerald-500/60 ring-1 ring-emerald-500/25 bg-emerald-50/25 dark:bg-emerald-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-emerald-500/35"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
          <span className="truncate">Fresh Drops (7d)</span>
          <Zap className="w-3.5 h-3.5 text-emerald-500 shrink-0 ml-1" />
        </div>
        <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
          <span
            className={`text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 leading-tight ${
              statsLoading ? "animate-pulse opacity-60" : ""
            }`}
          >
            {stats.newThisWeekCount}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">
            this week
          </span>
        </div>
      </div>

      {/* Top Lasting (Evergreen 30d+) */}
      <div
        onClick={() => onSelectPreset("top_lasting", "top_lasting")}
        title="Filter by Longest Running Evergreen products (30d+)"
        className={`px-3 py-2 rounded-lg bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-150 select-none ${
          smartPreset === "top_lasting"
            ? "border-purple-500/60 ring-1 ring-purple-500/25 bg-purple-50/25 dark:bg-purple-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-purple-500/35"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
          <span className="truncate">Evergreen (30d+)</span>
          <Clock className="w-3.5 h-3.5 text-purple-500 shrink-0 ml-1" />
        </div>
        <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
          <span
            className={`text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 leading-tight ${
              statsLoading ? "animate-pulse opacity-60" : ""
            }`}
          >
            {stats.evergreenCount}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">
            proven
          </span>
        </div>
      </div>

      {/* With Discounts / Bundle Offers */}
      <div
        onClick={() => onSelectPreset("with_offers")}
        title="Filter by Products with bundle offers and discounts"
        className={`px-3 py-2 rounded-lg bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-150 select-none col-span-2 sm:col-span-1 ${
          smartPreset === "with_offers"
            ? "border-blue-500/60 ring-1 ring-blue-500/25 bg-blue-50/25 dark:bg-blue-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-blue-500/35"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
          <span className="truncate">Offers &amp; Bundles</span>
          <Tag className="w-3.5 h-3.5 text-blue-500 shrink-0 ml-1" />
        </div>
        <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
          <span
            className={`text-base sm:text-lg font-black text-blue-600 dark:text-blue-400 leading-tight ${
              statsLoading ? "animate-pulse opacity-60" : ""
            }`}
          >
            {stats.withOffersCount}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">
            {stats.totalProducts > 0
              ? Math.round((stats.withOffersCount / stats.totalProducts) * 100)
              : 0}
            % promo
          </span>
        </div>
      </div>
    </div>
  );
}
