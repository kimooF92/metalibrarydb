"use client";

import { useState, useMemo } from "react";
import { TrackedPage } from "@/types";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Star,
  Search,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronLeft,
  ChevronRight,
  X,
  Flame,
  AlertCircle,
  BarChart3,
} from "lucide-react";
import { KPICard } from "./kpi-card";

function MiniBar({
  value,
  max,
  colorClass = "bg-indigo-500",
}: {
  value: number;
  max: number;
  colorClass?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-12 text-right shrink-0">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

interface BrandAnalyticsTabProps {
  pages: TrackedPage[];
  analytics: any;
  isLoading: boolean;
  onToggleWatchlist: (pageId: string, currentStatus?: boolean) => Promise<void>;
  updatingWatchlistId: string | null;
}

export function BrandAnalyticsTab({
  pages,
  analytics,
  isLoading,
  onToggleWatchlist,
  updatingWatchlistId,
}: BrandAnalyticsTabProps) {
  const [subTab, setSubTab] = useState<"scaling" | "descaling" | "top" | "watchlist" | "attention">("scaling");
  const [searchQuery, setSearchQuery] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const filteredTablePages = useMemo(() => {
    let source: TrackedPage[] = [];

    if (subTab === "scaling") {
      source = analytics.scalingPages || [];
    } else if (subTab === "descaling") {
      source = analytics.descalingPages || [];
    } else if (subTab === "top") {
      source = [...(analytics.withResults || [])].sort(
        (a, b) => (b.currentResults ?? 0) - (a.currentResults ?? 0)
      );
    } else if (subTab === "watchlist") {
      source = analytics.watchlistedPages || [];
    } else if (subTab === "attention") {
      const ids = new Set<string>();
      source = [
        ...(analytics.zeroAds || []),
        ...(analytics.failed || []),
        ...(analytics.unclear || []),
      ].filter((p) => {
        if (ids.has(p.id)) return false;
        ids.add(p.id);
        return true;
      });
    }

    if (!searchQuery.trim()) return source;

    const query = searchQuery.toLowerCase();
    return source.filter(
      (p) =>
        (p.displayName && p.displayName.toLowerCase().includes(query)) ||
        (p.pageId && p.pageId.toLowerCase().includes(query)) ||
        (p.url && p.url.toLowerCase().includes(query))
    );
  }, [subTab, searchQuery, analytics]);

  const totalTablePages = Math.ceil(filteredTablePages.length / pageSize) || 1;
  const paginatedTablePages = useMemo(() => {
    const start = (tablePage - 1) * pageSize;
    return filteredTablePages.slice(start, start + pageSize);
  }, [filteredTablePages, tablePage, pageSize]);

  return (
    <div className="space-y-6">
      {/* 1. Key Metrics */}
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
          value={
            (analytics.netAdsDelta ?? 0) >= 0
              ? `+${analytics.netAdsDelta}`
              : `${analytics.netAdsDelta}`
          }
          icon={Activity}
          colorTheme={(analytics.netAdsDelta ?? 0) >= 0 ? "indigo" : "rose"}
          subtext={(analytics.netAdsDelta ?? 0) >= 0 ? "Bullish Market Growth" : "Net Ad Reduction"}
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
              { label: "Mega Scale (100+)", count: analytics.megaVolume?.length || 0, color: "bg-purple-500", textColor: "text-purple-600 dark:text-purple-400" },
              { label: "High Volume (50–99)", count: analytics.highVolume?.length || 0, color: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400" },
              { label: "Growing (20–49)", count: analytics.midVolume?.length || 0, color: "bg-indigo-500", textColor: "text-indigo-600 dark:text-indigo-400" },
              { label: "Low Volume (1–19)", count: analytics.lowVolume?.length || 0, color: "bg-cyan-500", textColor: "text-cyan-600 dark:text-cyan-400" },
              { label: "Zero Ads (0)", count: analytics.zeroAds?.length || 0, color: "bg-slate-400", textColor: "text-slate-500 dark:text-slate-400" },
            ].map((tier) => (
              <div key={tier.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${tier.textColor}`}>{tier.label}</span>
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {tier.count} <span className="text-[10px] font-normal text-slate-400">({pages.length > 0 ? Math.round((tier.count / pages.length) * 100) : 0}%)</span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${tier.color} rounded-full transition-all duration-700`}
                    style={{ width: `${pages.length > 0 ? Math.min(100, (tier.count / pages.length) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Detailed Page Explorer Table */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/60">
          {/* Subtabs */}
          <div className="flex items-center flex-wrap gap-1.5">
            <button
              onClick={() => { setSubTab("scaling"); setTablePage(1); }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                subTab === "scaling"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>Scaling ({analytics.scalingPages?.length || 0})</span>
            </button>

            <button
              onClick={() => { setSubTab("descaling"); setTablePage(1); }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                subTab === "descaling"
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
              <span>Descaling ({analytics.descalingPages?.length || 0})</span>
            </button>

            <button
              onClick={() => { setSubTab("top"); setTablePage(1); }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                subTab === "top"
                  ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>Top Active ({analytics.withResults?.length || 0})</span>
            </button>

            <button
              onClick={() => { setSubTab("watchlist"); setTablePage(1); }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                subTab === "watchlist"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
              }`}
            >
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Watchlist ({analytics.watchlistedPages?.length || 0})</span>
            </button>

            <button
              onClick={() => { setSubTab("attention"); setTablePage(1); }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                subTab === "attention"
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>
                Attention (
                {(analytics.zeroAds?.length || 0) +
                  (analytics.failed?.length || 0) +
                  (analytics.unclear?.length || 0)}
                )
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter page or keyword..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setTablePage(1); }}
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setTablePage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3.5 w-12 text-center">Rank</th>
                <th className="py-3 px-3.5">Tracked Page Name</th>
                <th className="py-3 px-3.5">Search Type</th>
                <th className="py-3 px-3.5 text-right">Current Ads</th>
                <th className="py-3 px-3.5 text-right">Previous Scan</th>
                <th className="py-3 px-3.5 text-right">Ad Growth / Change</th>
                <th className="py-3 px-3.5 text-center">Relative Scale Bar</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedTablePages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No pages match the selected tab filter or search query.
                  </td>
                </tr>
              ) : (
                paginatedTablePages.map((p, idx) => {
                  const rank = (tablePage - 1) * pageSize + idx + 1;
                  const diff = p.difference ?? 0;
                  const prev = p.previousResults;
                  const curr = p.currentResults ?? 0;
                  const pctChange = prev && prev > 0 && diff !== 0 ? Math.round((diff / prev) * 100) : null;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-3.5 text-center font-mono font-semibold text-slate-600 dark:text-slate-400">
                        #{rank}
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => onToggleWatchlist(p.id, p.isWatchlisted)}
                            disabled={updatingWatchlistId === p.id}
                            title={p.isWatchlisted ? "Remove from watchlist" : "Add to watchlist"}
                            className="text-slate-500 hover:text-amber-500 cursor-pointer transition-colors"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                p.isWatchlisted ? "fill-amber-400 text-amber-400" : "text-slate-400 dark:text-slate-600"
                              }`}
                            />
                          </button>

                          <div className="truncate max-w-[240px]">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 truncate block transition-colors"
                            >
                              {p.displayName || "Meta Ad Search"}
                            </a>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate block">
                              {p.pageId || p.url}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          {p.searchType === "page_id" || (!p.searchType && p.pageId) ? "Page ID" : "Keyword"}
                        </span>
                      </td>

                      <td className="py-3 px-3.5 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                        {curr.toLocaleString()}
                      </td>

                      <td className="py-3 px-3.5 text-right font-mono text-slate-600 dark:text-slate-400 font-medium">
                        {prev !== null && prev !== undefined ? prev.toLocaleString() : "—"}
                      </td>

                      <td className="py-3 px-3.5 text-right">
                        {diff > 0 ? (
                          <span className="inline-flex items-center text-xs font-extrabold text-emerald-800 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-300 dark:border-emerald-500/20">
                            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                            +{diff} {pctChange !== null && `(+${pctChange}%)`}
                          </span>
                        ) : diff < 0 ? (
                          <span className="inline-flex items-center text-xs font-extrabold text-rose-800 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-300 dark:border-rose-500/20">
                            <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                            {diff} {pctChange !== null && `(${pctChange}%)`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            <Minus className="w-3 h-3 mr-0.5" />
                            0
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3.5 min-w-[140px]">
                        <MiniBar
                          value={curr}
                          max={analytics.maxResults || 1}
                          colorClass={diff > 0 ? "bg-emerald-500" : diff < 0 ? "bg-rose-500" : "bg-indigo-500"}
                        />
                      </td>

                      <td className="py-3 px-3.5 text-right">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <span>View Ad Library</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing <strong className="text-slate-800 dark:text-slate-200">{filteredTablePages.length === 0 ? 0 : (tablePage - 1) * pageSize + 1}</strong> to{" "}
              <strong className="text-slate-800 dark:text-slate-200">{Math.min(tablePage * pageSize, filteredTablePages.length)}</strong> of{" "}
              <strong className="text-slate-800 dark:text-slate-200">{filteredTablePages.length}</strong> pages
            </span>

            <div className="flex items-center space-x-1">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setTablePage(1); }}
                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={tablePage <= 1}
              onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}
              className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 px-1">
              {tablePage} / {totalTablePages}
            </span>

            <button
              disabled={tablePage >= totalTablePages}
              onClick={() => setTablePage((prev) => Math.min(totalTablePages, prev + 1))}
              className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
