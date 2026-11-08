"use client";

import type { BrandAnalyticsCalculations } from "@/types";
import { KPICard } from "@/components/analytics/kpi-card";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Star,
  BarChart3,
} from "lucide-react";

interface BrandAnalyticsKPIsProps {
  analytics: BrandAnalyticsCalculations;
  isLoading: boolean;
  pagesCount: number;
}

export function BrandAnalyticsKPIs({
  analytics,
  isLoading,
  pagesCount,
}: BrandAnalyticsKPIsProps) {
  const isNetPositive = (analytics.netAdsDelta ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* 1. Key Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard
          title="Scaling Pages"
          value={analytics.scalingPages?.length || 0}
          icon={TrendingUp}
          colorTheme="emerald"
          badge={{
            text: `+${analytics.totalAdsScaled || 0} ads`,
            variant: "emerald",
          }}
          subtext={`Avg +${analytics.avgScalingDelta || 0} ads/page`}
          isLoading={isLoading}
        />

        <KPICard
          title="Descaling Pages"
          value={analytics.descalingPages?.length || 0}
          icon={TrendingDown}
          colorTheme="rose"
          badge={{
            text: `-${analytics.totalAdsDescaled || 0} ads`,
            variant: "rose",
          }}
          subtext={`Avg -${analytics.avgDescalingDelta || 0} ads/page`}
          isLoading={isLoading}
        />

        <KPICard
          title="Net Velocity"
          value={isNetPositive ? `+${analytics.netAdsDelta}` : `${analytics.netAdsDelta}`}
          icon={Activity}
          colorTheme={isNetPositive ? "indigo" : "rose"}
          subtext={isNetPositive ? "Bullish Market Growth" : "Net Ad Reduction"}
          isLoading={isLoading}
        />

        <KPICard
          title="Total Monitored Ads"
          value={analytics.totalAds ? Number(analytics.totalAds).toLocaleString() : "0"}
          icon={Layers}
          colorTheme="purple"
          subtext={`${(analytics.megaVolume?.length || 0) + (analytics.highVolume?.length || 0)} high-scale (50+)`}
          isLoading={isLoading}
        />

        <KPICard
          title="Watchlist"
          value={analytics.watchlistedPages?.length || 0}
          icon={Star}
          colorTheme="amber"
          badge={{
            text: `${analytics.watchlistedScaling?.length || 0} up / ${analytics.watchlistedDescaling?.length || 0} down`,
            variant: "amber",
          }}
          subtext="Priority tracked targets"
          isLoading={isLoading}
        />
      </div>

      {/* 2. Scaling Velocity & Distribution Tier Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scaling Tiers */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Scaling Velocity Tiers</h3>
            </div>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full">
              {analytics.scalingPages?.length || 0} scaling
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  🚀 Aggressive Scale (+20+ ads)
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Heavy campaign expansion</p>
              </div>
              <span className="text-base font-black text-emerald-700 dark:text-emerald-400 font-mono">
                {analytics.aggressiveScaling?.length || 0}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  📈 Rapid Scale (+10 to +19)
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Strong ad test scaling</p>
              </div>
              <span className="text-base font-black text-teal-700 dark:text-teal-400 font-mono">
                {analytics.rapidScaling?.length || 0}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  💹 Moderate Scale (+1 to +9)
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Steady creative additions</p>
              </div>
              <span className="text-base font-black text-indigo-700 dark:text-indigo-400 font-mono">
                {analytics.moderateScaling?.length || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Descaling Tiers */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Descaling Tiers</h3>
            </div>
            <span className="text-[10px] bg-rose-500/10 text-rose-700 dark:text-rose-400 font-bold px-2 py-0.5 rounded-full">
              {analytics.descalingPages?.length || 0} descaling
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  📉 Heavy Descale (-20+ ads lost)
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Major campaign shutdowns</p>
              </div>
              <span className="text-base font-black text-rose-700 dark:text-rose-400 font-mono">
                {analytics.heavyDescaling?.length || 0}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  🔻 Moderate Descale (-10 to -19)
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Ad pruning & budget shifts</p>
              </div>
              <span className="text-base font-black text-orange-700 dark:text-orange-400 font-mono">
                {analytics.moderateDescaling?.length || 0}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  🤏 Light Descale (-1 to -9)
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Minor ad expirations</p>
              </div>
              <span className="text-base font-black text-amber-700 dark:text-amber-400 font-mono">
                {analytics.lightDescaling?.length || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Volume Distribution */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-purple-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Ad Volume Distribution</h3>
            </div>
            <span className="text-[10px] text-slate-500">By active ads</span>
          </div>

          <div className="space-y-3">
            {[
              {
                label: "Mega Scale (100+)",
                count: analytics.megaVolume?.length || 0,
                color: "bg-purple-500",
                textColor: "text-purple-600 dark:text-purple-400",
              },
              {
                label: "High Volume (50–99)",
                count: analytics.highVolume?.length || 0,
                color: "bg-amber-500",
                textColor: "text-amber-600 dark:text-amber-400",
              },
              {
                label: "Growing (20–49)",
                count: analytics.midVolume?.length || 0,
                color: "bg-indigo-500",
                textColor: "text-indigo-600 dark:text-indigo-400",
              },
              {
                label: "Low Volume (1–19)",
                count: analytics.lowVolume?.length || 0,
                color: "bg-cyan-500",
                textColor: "text-cyan-600 dark:text-cyan-400",
              },
              {
                label: "Zero Ads (0)",
                count: analytics.zeroAds?.length || 0,
                color: "bg-slate-400",
                textColor: "text-slate-500 dark:text-slate-400",
              },
            ].map((tier) => (
              <div key={tier.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${tier.textColor}`}>{tier.label}</span>
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {tier.count}{" "}
                    <span className="text-[10px] font-normal text-slate-400">
                      ({pagesCount > 0 ? Math.round((tier.count / pagesCount) * 100) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${tier.color} rounded-full transition-all duration-700`}
                    style={{
                      width: `${pagesCount > 0 ? Math.min(100, (tier.count / pagesCount) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

