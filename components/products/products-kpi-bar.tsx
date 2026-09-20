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
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {/* Total Products */}
      <div
        onClick={() => onSelectPreset("all")}
        title="View All Products"
        className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none ${
          smartPreset === "all"
            ? "border-indigo-500/60 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-indigo-500/40"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
          <span>Total Products</span>
          <ShoppingBag className="w-4 h-4 text-indigo-500" />
        </div>
        <p
          className={`text-2xl font-black text-slate-900 dark:text-white mt-1 ${
            statsLoading ? "animate-pulse opacity-60" : ""
          }`}
        >
          {stats.totalProducts}
        </p>
        <span className="text-[11px] text-slate-500 font-medium">
          {stats.successfulProducts} fully scraped • {stats.pendingProducts} pending
        </span>
      </div>

      {/* Starred Favorites */}
      <div
        onClick={() => onSelectPreset("favorites")}
        title="Filter by Starred Favorites"
        className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none ${
          smartPreset === "favorites"
            ? "border-amber-500/60 ring-2 ring-amber-500/20 bg-amber-50/20 dark:bg-amber-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-amber-500/40"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
          <span>⭐ Starred Favorites</span>
          <Star className="w-4 h-4 text-amber-500 fill-amber-500/20" />
        </div>
        <p
          className={`text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 ${
            statsLoading ? "animate-pulse opacity-60" : ""
          }`}
        >
          {stats.favoritesCount}
        </p>
        <span className="text-[11px] text-slate-500 font-medium">
          Saved to product watchlist
        </span>
      </div>

      {/* Fresh Drops (Last 7 Days) */}
      <div
        onClick={() => onSelectPreset("new_discovered", "latest")}
        title="Filter by Fresh Drops discovered in the last 7 days"
        className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none ${
          smartPreset === "new_discovered"
            ? "border-emerald-500/60 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-emerald-500/40"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
          <span>Fresh Drops (7d)</span>
          <Zap className="w-4 h-4 text-emerald-500" />
        </div>
        <p
          className={`text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 ${
            statsLoading ? "animate-pulse opacity-60" : ""
          }`}
        >
          {stats.newThisWeekCount}
        </p>
        <span className="text-[11px] text-slate-500 font-medium">
          Newly discovered this week
        </span>
      </div>

      {/* Top Lasting (Evergreen 30d+) */}
      <div
        onClick={() => onSelectPreset("top_lasting", "top_lasting")}
        title="Filter by Longest Running Evergreen products (30d+)"
        className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none ${
          smartPreset === "top_lasting"
            ? "border-purple-500/60 ring-2 ring-purple-500/20 bg-purple-50/20 dark:bg-purple-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-purple-500/40"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
          <span>Evergreen (30d+)</span>
          <Clock className="w-4 h-4 text-purple-500" />
        </div>
        <p
          className={`text-2xl font-black text-purple-600 dark:text-purple-400 mt-1 ${
            statsLoading ? "animate-pulse opacity-60" : ""
          }`}
        >
          {stats.evergreenCount}
        </p>
        <span className="text-[11px] text-slate-500 font-medium">
          Longest running proven winners
        </span>
      </div>

      {/* With Discounts / Bundle Offers */}
      <div
        onClick={() => onSelectPreset("with_offers")}
        title="Filter by Products with bundle offers and discounts"
        className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none col-span-2 sm:col-span-1 ${
          smartPreset === "with_offers"
            ? "border-blue-500/60 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20"
            : "border-slate-200 dark:border-slate-800/80 hover:border-blue-500/40"
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
          <span>Offers &amp; Bundles</span>
          <Tag className="w-4 h-4 text-blue-500" />
        </div>
        <p
          className={`text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 ${
            statsLoading ? "animate-pulse opacity-60" : ""
          }`}
        >
          {stats.withOffersCount}
        </p>
        <span className="text-[11px] text-slate-500 font-medium">
          {stats.totalProducts > 0
            ? Math.round((stats.withOffersCount / stats.totalProducts) * 100)
            : 0}
          % promotional rate
        </span>
      </div>
    </div>
  );
}
