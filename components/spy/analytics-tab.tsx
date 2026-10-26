"use client";

import React, { memo } from "react";
import { AdCard } from "@/components/spy/ad-card";
import { Ad } from "@/types";
import {
  CheckCircle2,
  Flame,
  Clock,
  ShoppingBag,
  TrendingUp,
  Video,
  Image as ImageIcon,
  Layers,
  Zap,
  DollarSign,
  MessageCircle,
  ArrowUpRight,
  Trophy,
} from "lucide-react";

export interface AnalyticsTabProps {
  summary: {
    activeAdsCount: number;
    inactiveAdsCount: number;
    archivedAdsCount: number;
    totalDuplicationCount: number;
    avgDuplicationsPerAd: number;
    evergreenRate: number;
    evergreenCount: number;
    distinctProductsCount: number;
  };
  history: Array<{
    id: string;
    results: number;
    difference: number;
    checkedAt: string;
    status: string;
  }>;
  mediaDistribution: {
    video: number;
    image: number;
    carousel: number;
    other: number;
    videoPercent: number;
    imagePercent: number;
    carouselPercent: number;
  };
  longevityDistribution: {
    fresh: number;
    scaling: number;
    evergreen: number;
    veteran: number;
    freshPercent: number;
    scalingPercent: number;
    evergreenPercent: number;
    veteranPercent: number;
  };
  launchVelocity: {
    launchedLast7Days: number;
    launchedLast30Days: number;
    activeRetentionRate: number;
    longestRunningDays: number;
    avgLifespanDays: number;
  };
  commercialStrategy: {
    totalCatalogProducts: number;
    minPrice: number | null;
    maxPrice: number | null;
    avgPrice: number | null;
    currency: string;
  };
  storeTech: {
    platforms: string[];
    pixelIds: string[];
    phoneNumbers: string[];
    whatsappNumbers: string[];
  };
  topWinners: Ad[];
  onArchiveToggle?: () => void;
  onMediaRefreshed?: (ad: Ad) => void;
  onNavigateToProducts: () => void;
}

export const AnalyticsTab = memo(function AnalyticsTab({
  summary,
  history,
  mediaDistribution,
  longevityDistribution,
  launchVelocity,
  commercialStrategy,
  storeTech,
  topWinners,
  onArchiveToggle,
  onMediaRefreshed,
  onNavigateToProducts,
}: AnalyticsTabProps) {
  return (
    <div className="space-y-5">
      {/* Executive Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Active Footprint</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {summary.activeAdsCount}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            {summary.inactiveAdsCount} inactive • {summary.archivedAdsCount} archived
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Scale Momentum</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {summary.totalDuplicationCount} copies
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            ~{summary.avgDuplicationsPerAd} avg copies per active ad
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Evergreen Ratio</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
            {summary.evergreenRate}%
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            {summary.evergreenCount} ads running 30+ days
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Product Depth</span>
            <ShoppingBag className="w-4 h-4 text-cyan-500" />
          </div>
          <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1">
            {summary.distinctProductsCount}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            distinct products tested
          </span>
        </div>
      </div>

      {/* Historical Ad Trajectory Chart (if history exists) */}
      {history.length > 1 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Historical Ad Count Trajectory (Scaling Velocity)
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {history.length} observation points
            </span>
          </div>

          <div className="h-32 flex items-end gap-1 pt-4 pb-2 border-b border-slate-200 dark:border-slate-800">
            {(() => {
              const maxVal = Math.max(...history.map((h) => h.results || 0), 1);
              return history.map((item, idx) => {
                const heightPct = Math.max(10, Math.round(((item.results || 0) / maxVal) * 100));
                const isPositive = (item.difference || 0) > 0;
                const isNegative = (item.difference || 0) < 0;

                return (
                  <div
                    key={item.id || idx}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                  >
                    <div
                      className={`w-full rounded-t transition-all ${
                        isPositive
                          ? "bg-emerald-500 hover:bg-emerald-400"
                          : isNegative
                          ? "bg-rose-500 hover:bg-rose-400"
                          : "bg-indigo-500/80 hover:bg-indigo-400"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-30 pointer-events-none">
                      <div className="bg-slate-900 text-white text-[10px] py-1 px-2 rounded shadow-lg whitespace-nowrap font-mono">
                        <div>
                          Ads: <strong>{item.results}</strong> ({item.difference > 0 ? `+${item.difference}` : item.difference || 0})
                        </div>
                        <div className="text-slate-400">{new Date(item.checkedAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Strategy Breakdown 2-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Format & Asset Distribution */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <Video className="w-4 h-4 text-purple-500" />
              <span>Media Format Strategy</span>
            </div>
            <span className="text-xs text-slate-500 font-semibold">
              {mediaDistribution.videoPercent}% Video dominance
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <div className="flex justify-between mb-1 text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1"><Video className="w-3.5 h-3.5 text-purple-500" /> Video Ads</span>
                <span className="font-bold">{mediaDistribution.video} ({mediaDistribution.videoPercent}%)</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${mediaDistribution.videoPercent}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5 text-indigo-500" /> Static Images</span>
                <span className="font-bold">{mediaDistribution.image} ({mediaDistribution.imagePercent}%)</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${mediaDistribution.imagePercent}%` }} />
              </div>
            </div>

            {mediaDistribution.carousel > 0 && (
              <div>
                <div className="flex justify-between mb-1 text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-amber-500" /> Carousel</span>
                  <span className="font-bold">{mediaDistribution.carousel} ({mediaDistribution.carouselPercent}%)</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${mediaDistribution.carouselPercent}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Longevity & Testing Cycles */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span>Creative Lifespan Tiers</span>
            </div>
            <span className="text-xs text-slate-500 font-semibold">
              Testing vs Evergreen
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <div className="flex justify-between mb-1 text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1">🟢 Evergreen (30–90 days)</span>
                <span className="font-bold">{longevityDistribution.evergreen} ({longevityDistribution.evergreenPercent}%)</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${longevityDistribution.evergreenPercent}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1">🟡 Scaling Phase (7–30 days)</span>
                <span className="font-bold">{longevityDistribution.scaling} ({longevityDistribution.scalingPercent}%)</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${longevityDistribution.scalingPercent}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1">🔵 Fresh Tests (&lt; 7 days)</span>
                <span className="font-bold">{longevityDistribution.fresh} ({longevityDistribution.freshPercent}%)</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${longevityDistribution.freshPercent}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostic Cards: Creative Launch Velocity & Commercial Strategy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Creative Launch Velocity & Testing Cadence */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Creative Launch Velocity</span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              {launchVelocity.launchedLast7Days >= 10
                ? "⚡ High Velocity"
                : launchVelocity.launchedLast7Days >= 3
                ? "⚡ Active Testing"
                : "🟢 Maintenance"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Last 7 Days</span>
              <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                {launchVelocity.launchedLast7Days} <span className="text-[10px] font-medium text-slate-500">new ads</span>
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Last 30 Days</span>
              <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                {launchVelocity.launchedLast30Days} <span className="text-[10px] font-medium text-slate-500">new ads</span>
              </span>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 pt-1">
            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-900">
              <span className="text-slate-500">Active Retention Rate:</span>
              <span className="font-bold text-slate-900 dark:text-white">{launchVelocity.activeRetentionRate}% of tested ads active</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-900">
              <span className="text-slate-500">Longest Running Winner:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{launchVelocity.longestRunningDays} days active</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500">Average Creative Lifespan:</span>
              <span className="font-bold text-slate-900 dark:text-white">{launchVelocity.avgLifespanDays} days</span>
            </div>
          </div>
        </div>

        {/* 2. Commercial Strategy & Store Footprint */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span>Commercial &amp; Store Footprint</span>
            </div>
            {commercialStrategy.minPrice && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {commercialStrategy.minPrice} – {commercialStrategy.maxPrice} {commercialStrategy.currency}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Average Price Ticket</span>
              <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block font-mono">
                {commercialStrategy.avgPrice ? `${commercialStrategy.avgPrice} ${commercialStrategy.currency}` : "—"}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Store Platform</span>
              <div className="mt-1 flex gap-1 flex-wrap">
                {storeTech.platforms.length > 0 ? (
                  storeTech.platforms.map((p) => (
                    <span key={p} className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-[10.5px]">
                      {p.toUpperCase()}
                    </span>
                  ))
                ) : (
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Standard Meta Store</span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 pt-1">
            {storeTech.pixelIds.length > 0 && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-900">
                <span className="text-slate-500">Meta Pixels ({storeTech.pixelIds.length}):</span>
                <div className="flex gap-1 flex-wrap">
                  {storeTech.pixelIds.slice(0, 2).map((px) => (
                    <span key={px} className="font-mono text-[10px] text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                      {px}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {storeTech.whatsappNumbers.length > 0 && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-900">
                <span className="text-slate-500">WhatsApp Sales:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> {storeTech.whatsappNumbers[0]}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500">Catalog Depth:</span>
              <button
                type="button"
                onClick={onNavigateToProducts}
                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{commercialStrategy.totalCatalogProducts} products detected</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Top 3 Winner Creatives Spotlight */}
      {topWinners.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Top 3 Winner Creatives Spotlight
              </h3>
            </div>
            <span className="text-xs text-slate-500">Highest Scaling &amp; Longevity</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {topWinners.map((ad) => (
              <AdCard
                key={ad.id}
                ad={ad}
                onArchiveToggle={onArchiveToggle}
                onMediaRefreshed={onMediaRefreshed}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
