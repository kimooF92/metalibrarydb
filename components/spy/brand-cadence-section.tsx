"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import {
  BrandCadenceAnalytics,
  CadenceGranularity,
  AdInjectionBucket,
  ProductLaunchRecord,
} from "@/types/cadence";
import {
  Flame,
  Calendar,
  Zap,
  ShoppingBag,
  Video,
  Image as ImageIcon,
  Layers,
  ArrowRight,
  Filter,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Sparkles,
  TrendingUp,
} from "lucide-react";

export interface BrandCadenceSectionProps {
  cadence: BrandCadenceAnalytics;
  onViewProductDetails?: (product: any) => void;
  onViewCreativesForProduct?: (product: any) => void;
  onNavigateToCreatives?: () => void;
}

export function BrandCadenceSection({
  cadence,
  onViewProductDetails,
  onViewCreativesForProduct,
  onNavigateToCreatives,
}: BrandCadenceSectionProps) {
  const [granularity, setGranularity] = useState<CadenceGranularity>("week");
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);

  // Active buckets based on selected granularity
  const buckets: AdInjectionBucket[] = useMemo(() => {
    if (!cadence?.timeSeries) return [];
    if (granularity === "day") return cadence.timeSeries.days || [];
    if (granularity === "month") return cadence.timeSeries.months || [];
    return cadence.timeSeries.weeks || [];
  }, [cadence, granularity]);

  // Max ads count in bucket for relative bar heights
  const maxAdCount = useMemo(() => {
    return Math.max(...buckets.map((b) => b.totalAds), 1);
  }, [buckets]);

  // Selected bucket for micro drill-down
  const activeBucket = useMemo(() => {
    if (!selectedPeriodKey) return null;
    return buckets.find((b) => b.periodKey === selectedPeriodKey) || null;
  }, [buckets, selectedPeriodKey]);

  // Filtered product launches: if a bucket is selected, show only products from that bucket
  const displayedProducts: ProductLaunchRecord[] = useMemo(() => {
    const all = cadence?.recentProductLaunches || [];
    if (!activeBucket) return all;
    const bucketProductIds = new Set(activeBucket.productIds || []);
    return all.filter((p) => bucketProductIds.has(p.id));
  }, [cadence?.recentProductLaunches, activeBucket]);

  // Peak day calculation
  const peakDay = useMemo(() => {
    const list = cadence?.dayOfWeekPattern || [];
    if (list.length === 0) return null;
    return [...list].sort((a, b) => b.adCount - a.adCount)[0];
  }, [cadence?.dayOfWeekPattern]);

  const funnel = cadence?.productLifecycleFunnel || {
    totalProductsTested: 0,
    quickKills: 0,
    activeTesting: 0,
    scalingWinners: 0,
    winRate: 0,
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 sm:p-5 shadow-sm space-y-5">
      {/* 1. Header with Granularity Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Competitor Testing Cadence &amp; Launch History
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track daily, weekly, and monthly ad injections, product launch intervals, and kill rates.
          </p>
        </div>

        {/* Granularity Pill Selector */}
        <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setGranularity("day");
              setSelectedPeriodKey(null);
            }}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${granularity === "day"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            Day (30D)
          </button>
          <button
            type="button"
            onClick={() => {
              setGranularity("week");
              setSelectedPeriodKey(null);
            }}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${granularity === "week"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            Week (16W)
          </button>
          <button
            type="button"
            onClick={() => {
              setGranularity("month");
              setSelectedPeriodKey(null);
            }}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${granularity === "month"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            Month (12M)
          </button>
        </div>
      </div>

      {/* 2. Interactive Injection Velocity Bar Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3 text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-purple-500 inline-block" />
              <span>Video Ads</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 inline-block" />
              <span>Static Images</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
              <span>Carousel</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-bold">
              <Sparkles className="w-3 h-3" />
              <span>Badge = Product Launch</span>
            </span>
          </div>

          {selectedPeriodKey && (
            <button
              type="button"
              onClick={() => setSelectedPeriodKey(null)}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* The Bar Chart Canvas */}
        <div className="h-44 flex items-end gap-1 sm:gap-1.5 pt-6 pb-2 px-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto select-none">
          {buckets.map((bucket) => {
            const isSelected = selectedPeriodKey === bucket.periodKey;
            const hasAds = bucket.totalAds > 0;
            const heightPct = hasAds ? Math.max(12, Math.round((bucket.totalAds / maxAdCount) * 100)) : 4;

            const videoPct = hasAds ? (bucket.videoCount / bucket.totalAds) * 100 : 0;
            const imagePct = hasAds ? (bucket.imageCount / bucket.totalAds) * 100 : 0;
            const carouselPct = hasAds ? (bucket.carouselCount / bucket.totalAds) * 100 : 0;
            const otherPct = hasAds ? (bucket.otherCount / bucket.totalAds) * 100 : 0;

            return (
              <div
                key={bucket.periodKey}
                onClick={() => {
                  setSelectedPeriodKey(isSelected ? null : bucket.periodKey);
                }}
                className={`flex-1 min-w-[22px] sm:min-w-[28px] flex flex-col items-center justify-end h-full group relative cursor-pointer transition-opacity ${selectedPeriodKey && !isSelected ? "opacity-35 hover:opacity-75" : "opacity-100"
                  }`}
              >
                {/* Product Launch Indicator Badge */}
                {bucket.newProductsLaunched > 0 && (
                  <div className="absolute bottom-full mb-1 flex items-center justify-center">
                    <span className="px-1.5 py-0.5 rounded-full bg-cyan-500 text-white font-black text-[9px] tracking-tight shadow-sm whitespace-nowrap animate-in fade-in zoom-in-75">
                      +{bucket.newProductsLaunched} SKU{bucket.newProductsLaunched > 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                {/* Stacked Bar */}
                <div
                  className={`w-full rounded-t overflow-hidden flex flex-col-reverse transition-all ${isSelected
                      ? "ring-2 ring-offset-1 ring-amber-500 dark:ring-offset-slate-950 scale-x-105"
                      : "group-hover:brightness-110"
                    }`}
                  style={{ height: `${heightPct}%` }}
                >
                  {hasAds ? (
                    <>
                      {videoPct > 0 && <div style={{ height: `${videoPct}%` }} className="bg-purple-500 w-full" />}
                      {imagePct > 0 && <div style={{ height: `${imagePct}%` }} className="bg-indigo-500 w-full" />}
                      {carouselPct > 0 && <div style={{ height: `${carouselPct}%` }} className="bg-amber-500 w-full" />}
                      {otherPct > 0 && <div style={{ height: `${otherPct}%` }} className="bg-slate-400 w-full" />}
                    </>
                  ) : (
                    <div className="bg-slate-200 dark:bg-slate-800 w-full h-full rounded-t" />
                  )}
                </div>

                {/* X-Axis Label */}
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono mt-1 text-center truncate max-w-full">
                  {bucket.label.replace("Wk ", "")}
                </span>

                {/* Hover Tooltip */}
                <div className="absolute bottom-full mb-6 hidden group-hover:flex flex-col items-center z-40 pointer-events-none">
                  <div className="bg-slate-900 text-white text-[11px] p-2 rounded-lg shadow-xl whitespace-nowrap font-sans border border-slate-800">
                    <div className="font-bold text-slate-100 pb-1 mb-1 border-b border-slate-800 flex justify-between gap-4">
                      <span>{bucket.label}</span>
                      <span className="text-amber-400 font-mono">{bucket.totalAds} ads injected</span>
                    </div>
                    <div className="space-y-0.5 text-[10px] text-slate-300">
                      <div>🎥 Video: <strong className="text-white">{bucket.videoCount}</strong></div>
                      <div>🖼️ Image: <strong className="text-white">{bucket.imageCount}</strong></div>
                      {bucket.carouselCount > 0 && (
                        <div>📑 Carousel: <strong className="text-white">{bucket.carouselCount}</strong></div>
                      )}
                      <div>⚡ Scale Copies: <strong className="text-emerald-400">{bucket.totalCopies}</strong></div>
                      {bucket.newProductsLaunched > 0 && (
                        <div className="text-cyan-400 font-bold pt-0.5">
                          🛍️ {bucket.newProductsLaunched} Product Launch{bucket.newProductsLaunched > 1 ? "es" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Executive Cadence KPIs (Funnel, Launch Rhythm, Speed) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* A. Product Testing & Kill Rate Funnel */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <ShoppingBag className="w-3.5 h-3.5 text-cyan-500" />
              <span>Product Survival Funnel</span>
            </div>
            <span className="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400">
              {funnel.winRate}% Win Rate
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Scaled Winners
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {funnel.scalingWinners} SKUs
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-500" /> Active Testing
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {funnel.activeTesting} SKUs
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3 text-rose-500" /> Quick Kills (&lt; 7d)
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {funnel.quickKills} SKUs
              </span>
            </div>
          </div>
        </div>

        {/* B. Peak Launch Rhythm (Day of Week) */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>Day-of-Week Rhythm</span>
            </div>
            {peakDay && (
              <span className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400">
                Peak: {peakDay.dayName} ({peakDay.percentage}%)
              </span>
            )}
          </div>

          {/* Mini Horizontal Bars */}
          <div className="grid grid-cols-7 gap-1 pt-1">
            {(cadence?.dayOfWeekPattern || []).map((day) => {
              const isPeak = peakDay?.dayIndex === day.dayIndex && day.adCount > 0;
              return (
                <div key={day.dayIndex} className="flex flex-col items-center gap-1">
                  <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded-xs flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded-xs transition-all ${isPeak
                          ? "bg-amber-500"
                          : day.adCount > 0
                            ? "bg-indigo-500"
                            : "bg-transparent"
                        }`}
                      style={{ height: `${Math.max(day.percentage, day.adCount > 0 ? 15 : 0)}%` }}
                    />
                  </div>
                  <span
                    className={`text-[9.5px] font-mono ${isPeak
                        ? "text-amber-600 dark:text-amber-400 font-bold"
                        : "text-slate-400"
                      }`}
                  >
                    {day.dayName.slice(0, 2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* C. Catalog Agility & Testing Cadence */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
              <span>Testing Archetype</span>
            </div>
            <span className="text-[10.5px] font-bold text-purple-600 dark:text-purple-400">
              {funnel.totalProductsTested > 10 ? "Catalog Tester" : "Hero Brand"}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Total SKUs Tested:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {funnel.totalProductsTested} products
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Creatives per SKU:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                ~
                {funnel.totalProductsTested > 0
                  ? Math.round(
                    ((cadence?.timeSeries?.weeks || []).reduce((acc, b) => acc + b.totalAds, 0) /
                      funnel.totalProductsTested) *
                    10
                  ) / 10
                  : 0}{" "}
                ads
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Playbook Agility:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {funnel.quickKills >= funnel.scalingWinners ? "Fast Fail & Pivot" : "Deep Creative Scaling"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Chronological Product Launch & Ad Injection Feed */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {activeBucket
                ? `Products Launched in ${activeBucket.label} (${displayedProducts.length})`
                : `Recent Product Launch Timeline (${displayedProducts.length})`}
            </h4>
          </div>

          {onNavigateToCreatives && (
            <button
              type="button"
              onClick={onNavigateToCreatives}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Explore All Creatives</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {displayedProducts.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">
            No distinct product landing URLs detected for this specific timeframe.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedProducts.map((p) => {
              const statusColor =
                p.status === "winner"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : p.status === "scaling"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    : p.status === "testing"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";

              const statusLabel =
                p.status === "winner"
                  ? "🌟 Scaled Winner"
                  : p.status === "scaling"
                    ? "🔥 Scaling"
                    : p.status === "testing"
                      ? "⚡ Testing"
                      : "❌ Killed";

              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-3 flex flex-col justify-between hover:border-indigo-400 dark:hover:border-indigo-600 transition-all group"
                >
                  <div className="flex gap-2.5">
                    {/* Thumbnail */}
                    <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 shrink-0 overflow-hidden relative border border-slate-200 dark:border-slate-800">
                      {p.mainImageUrl ? (
                        <Image
                          src={p.mainImageUrl}
                          alt={p.title}
                          fill
                          sizes="56px"
                          className="object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border ${statusColor}`}
                        >
                          {statusLabel}
                        </span>
                        {p.currentPrice && (
                          <span className="text-[11px] font-mono font-bold text-slate-900 dark:text-white">
                            {p.currentPrice} {p.currency || ""}
                          </span>
                        )}
                      </div>

                      <h5
                        onClick={() => onViewProductDetails && onViewProductDetails(p)}
                        className="text-xs font-bold text-slate-900 dark:text-white truncate mt-1 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                        title={p.title}
                      >
                        {p.title}
                      </h5>

                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Launched {new Date(p.launchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} • {p.daysSinceLaunch}d ago
                      </span>
                    </div>
                  </div>

                  {/* Actions & Stats Footer */}
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-500 font-medium">
                      <strong>{p.totalAdsInjected}</strong> ads •{" "}
                      <strong className="text-amber-600 dark:text-amber-400">{p.maxCopies}</strong> max copies
                    </span>

                    {onViewCreativesForProduct && (
                      <button
                        type="button"
                        onClick={() => onViewCreativesForProduct(p)}
                        className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>View Ads</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

