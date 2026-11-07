"use client";

import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/format-price";

export interface Inflow24hData {
  totalAdded: number;
  withOffersCount: number;
  offerPercentage: number;
  topPlatform: string;
  avgPrice: number;
  nicheShare: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
}

export type InflowTodayData = Inflow24hData;

interface Inflow24hCardProps {
  data?: Inflow24hData;
  loading?: boolean;
  currencySymbol?: string;
}

export function Inflow24hCard({ data, loading = false, currencySymbol = "DT" }: Inflow24hCardProps) {
  const total = data?.totalAdded ?? 0;
  const offerPct = data?.offerPercentage ?? 0;
  const platform = data?.topPlatform || "Shopify";
  const avgPriceFormatted = data?.avgPrice ? formatPrice(String(data.avgPrice), currencySymbol) : "—";
  const nicheShare = data?.nicheShare || [];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-500">
            <Clock className="w-3.5 h-3.5" />
          </span>
          <div>
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Today&apos;s Catalog Discoveries
            </h2>
          </div>
        </div>
        <Link
          href="/products?discovery=today"
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
        >
          <span>Explore catalog</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* KPI 4-Tile Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {/* Metric 1: Total Products Added */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Found Today
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {loading ? "--" : total}
            </span>
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              items
            </span>
          </div>
        </div>

        {/* Metric 2: Offer Penetration */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Offers & Bundles
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold font-mono tabular-nums text-purple-600 dark:text-purple-400">
              {loading ? "--" : `${offerPct}%`}
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              discounted
            </span>
          </div>
        </div>

        {/* Metric 3: Average Entry Price */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Average Price
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {loading ? "--" : avgPriceFormatted}
            </span>
          </div>
        </div>

        {/* Metric 4: Leading Platform */}
        <div className="p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
            Top E-Com Engine
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate capitalize">
              {loading ? "--" : platform}
            </span>
          </div>
        </div>
      </div>

      {/* Today's Niche Breakdown (% Share) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-800/60">
          <span>Trending Niches Today</span>
          <span>Category Share</span>
        </div>

        {loading ? (
          <div className="space-y-2 py-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-6 rounded bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
            ))}
          </div>
        ) : nicheShare.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-500">
            No products categorized yet today. Once new competitor ads are scanned, category trends will show up here.
          </div>
        ) : (
          nicheShare.map((cat) => (
            <Link
              key={cat.category}
              href={`/products?category=${encodeURIComponent(cat.category)}`}
              className="group block"
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300 group-hover:text-indigo-500 transition-colors">
                  {cat.category}
                </span>
                <span className="text-[11px] font-semibold font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {cat.count} products ({cat.percentage}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
                  style={{ width: `${Math.max(6, cat.percentage)}%` }}
                />
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Footer Link */}
      <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          Extracted directly from competitor landing pages
        </span>
        <Link
          href="/products?discovery=today"
          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
        >
          <span>Browse today&apos;s catalog</span>
          <span className="text-[11px]">→</span>
        </Link>
      </div>
    </div>
  );
}

export const InflowTodayCard = Inflow24hCard;
