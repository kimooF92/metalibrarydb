"use client";

import { useEffect, useState, useMemo } from "react";
import { TrackedPage, DashboardStats } from "@/types";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Flame,
  RefreshCw,
  FolderInput,
  Zap,
  Star,
  Search,
  ExternalLink,
  Layers,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";

function MiniBar({ value, max, colorClass = "bg-indigo-500" }: { value: number; max: number; colorClass?: string }) {
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

function getInitialAnalyticsState() {
  const defaults = {
    searchQuery: "",
    activeTab: "scaling" as "scaling" | "descaling" | "top" | "watchlist" | "zero",
    tablePage: 1,
  };

  if (typeof window === "undefined") return defaults;

  try {
    // 1. Load saved state from localStorage or sessionStorage
    let saved: Partial<typeof defaults> = {};
    const rawSaved =
      localStorage.getItem("analytics_filters") ||
      sessionStorage.getItem("analytics_filters");

    if (rawSaved) {
      try {
        saved = JSON.parse(rawSaved);
      } catch {}
    }

    const state = {
      ...defaults,
      ...saved,
    };

    // 2. Overlay individual URL query parameters if present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("search")) state.searchQuery = urlParams.get("search") || "";
    if (urlParams.has("tab")) {
      const tab = urlParams.get("tab");
      const validTabs = ["scaling", "descaling", "top", "watchlist", "zero"];
      if (validTabs.includes(tab || "")) state.activeTab = tab as any;
    }
    if (urlParams.has("page")) state.tablePage = Number(urlParams.get("page")) || 1;

    return state;
  } catch (e) {
    console.error("Error reading analytics params:", e);
  }

  return defaults;
}

function syncAnalyticsStateToUrl(state: {
  searchQuery: string;
  activeTab: string;
  tablePage: number;
}) {
  if (typeof window === "undefined") return;
  try {
    const query = new URLSearchParams();
    if (state.searchQuery) query.set("search", state.searchQuery);
    if (state.activeTab && state.activeTab !== "scaling") query.set("tab", state.activeTab);
    if (state.tablePage && state.tablePage > 1) query.set("page", String(state.tablePage));

    const queryString = query.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);

    const payload = JSON.stringify(state);
    sessionStorage.setItem("analytics_filters", payload);
    localStorage.setItem("analytics_filters", payload);
  } catch (e) {
    console.error("Error syncing analytics state:", e);
  }
}

export default function AnalyticsPage() {
  const [initialLoaded] = useState(() => getInitialAnalyticsState());

  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialLoaded.searchQuery);
  const [activeTab, setActiveTab] = useState<"scaling" | "descaling" | "top" | "watchlist" | "zero">(initialLoaded.activeTab);
  const [tablePage, setTablePage] = useState(initialLoaded.tablePage);
  const [pageSize, setPageSize] = useState(15);
  const [updatingWatchlistId, setUpdatingWatchlistId] = useState<string | null>(null);

  // Sync state to URL and session storage
  useEffect(() => {
    syncAnalyticsStateToUrl({
      searchQuery,
      activeTab,
      tablePage,
    });
  }, [searchQuery, activeTab, tablePage]);

  // Sync on browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const init = getInitialAnalyticsState();
      setSearchQuery(init.searchQuery);
      setActiveTab(init.activeTab);
      setTablePage(init.tablePage);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [pagesRes, statsRes] = await Promise.all([
        fetch("/api/pages?limit=5000&sortBy=currentResults&sortOrder=desc"),
        fetch("/api/stats"),
      ]);

      if (pagesRes.ok) {
        const data = await pagesRes.json();
        setPages(data.data || []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Failed to fetch analytics data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const toggleWatchlist = async (pageId: string, currentStatus?: boolean) => {
    try {
      setUpdatingWatchlistId(pageId);
      const res = await fetch(`/api/page/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatchlisted: !currentStatus }),
      });
      if (res.ok) {
        setPages((prev) =>
          prev.map((p) => (p.id === pageId ? { ...p, isWatchlisted: !currentStatus } : p))
        );
      }
    } catch (err) {
      console.error("Failed to update watchlist status", err);
    } finally {
      setUpdatingWatchlistId(null);
    }
  };

  // Comprehensive analytics calculations
  const analytics = useMemo(() => {
    const completed = pages.filter((p) => p.status === "success");
    const withResults = pages.filter((p) => p.currentResults !== null && p.currentResults > 0);
    const zeroAds = pages.filter((p) => p.status === "success" && p.currentResults === 0);
    const failed = pages.filter((p) => p.status === "failed");
    const unclear = pages.filter((p) => p.status === "unclear");
    const pending = pages.filter((p) => p.status === "pending");
    const scanning = pages.filter((p) => p.status === "scanning");

    // Pages with difference data
    const withDiff = pages.filter((p) => p.difference !== null && p.difference !== undefined);
    
    // Page Scaling vs Descaling
    const scalingPages = withDiff
      .filter((p) => (p.difference ?? 0) > 0)
      .sort((a, b) => (b.difference ?? 0) - (a.difference ?? 0));
    
    const descalingPages = withDiff
      .filter((p) => (p.difference ?? 0) < 0)
      .sort((a, b) => (a.difference ?? 0) - (b.difference ?? 0));
    
    const stablePages = withDiff.filter((p) => (p.difference ?? 0) === 0);

    // Sums & Deltas
    const totalAdsScaled = scalingPages.reduce((sum, p) => sum + (p.difference ?? 0), 0);
    const totalAdsDescaled = descalingPages.reduce((sum, p) => sum + Math.abs(p.difference ?? 0), 0);
    const netAdsDelta = totalAdsScaled - totalAdsDescaled;

    const avgScalingDelta = scalingPages.length > 0 ? (totalAdsScaled / scalingPages.length).toFixed(1) : "0";
    const avgDescalingDelta = descalingPages.length > 0 ? (totalAdsDescaled / descalingPages.length).toFixed(1) : "0";

    // Scaling Severity Breakdown
    const aggressiveScaling = scalingPages.filter((p) => (p.difference ?? 0) >= 20);
    const rapidScaling = scalingPages.filter((p) => (p.difference ?? 0) >= 10 && (p.difference ?? 0) < 20);
    const moderateScaling = scalingPages.filter((p) => (p.difference ?? 0) >= 1 && (p.difference ?? 0) < 10);

    // Descaling Severity Breakdown
    const heavyDescaling = descalingPages.filter((p) => (p.difference ?? 0) <= -20);
    const moderateDescaling = descalingPages.filter((p) => (p.difference ?? 0) <= -10 && (p.difference ?? 0) > -20);
    const lightDescaling = descalingPages.filter((p) => (p.difference ?? 0) <= -1 && (p.difference ?? 0) > -10);

    // Volume Distribution Tiers
    const megaVolume = pages.filter((p) => (p.currentResults ?? 0) >= 100);
    const highVolume = pages.filter((p) => (p.currentResults ?? 0) >= 50 && (p.currentResults ?? 0) < 100);
    const midVolume = pages.filter((p) => (p.currentResults ?? 0) >= 20 && (p.currentResults ?? 0) < 50);
    const lowVolume = pages.filter((p) => (p.currentResults ?? 0) >= 1 && (p.currentResults ?? 0) < 20);

    // Watchlist Scaling Stats
    const watchlistedPages = pages.filter((p) => p.isWatchlisted);
    const watchlistedScaling = watchlistedPages.filter((p) => (p.difference ?? 0) > 0);
    const watchlistedDescaling = watchlistedPages.filter((p) => (p.difference ?? 0) < 0);

    // Search Type Breakdown
    const pageIdSearches = pages.filter((p) => p.searchType === "page_id" || (!p.searchType && p.pageId));
    const keywordSearches = pages.filter((p) => p.searchType === "keyword");

    const pageIdScaling = pageIdSearches.filter((p) => (p.difference ?? 0) > 0).length;
    const keywordScaling = keywordSearches.filter((p) => (p.difference ?? 0) > 0).length;

    const totalAds = pages.reduce((sum, p) => sum + (p.currentResults ?? 0), 0);
    const maxResults = Math.max(...pages.map((p) => p.currentResults ?? 0), 1);

    return {
      totalPages: pages.length,
      completed,
      withResults,
      zeroAds,
      failed,
      unclear,
      pending,
      scanning,
      scalingPages,
      descalingPages,
      stablePages,
      totalAdsScaled,
      totalAdsDescaled,
      netAdsDelta,
      avgScalingDelta,
      avgDescalingDelta,
      aggressiveScaling,
      rapidScaling,
      moderateScaling,
      heavyDescaling,
      moderateDescaling,
      lightDescaling,
      megaVolume,
      highVolume,
      midVolume,
      lowVolume,
      watchlistedPages,
      watchlistedScaling,
      watchlistedDescaling,
      pageIdSearches,
      keywordSearches,
      pageIdScaling,
      keywordScaling,
      totalAds,
      maxResults,
    };
  }, [pages]);

  // Tab Filtering & Search Filtering
  const filteredTablePages = useMemo(() => {
    let source: TrackedPage[] = [];

    if (activeTab === "scaling") {
      source = analytics.scalingPages;
    } else if (activeTab === "descaling") {
      source = analytics.descalingPages;
    } else if (activeTab === "top") {
      source = [...analytics.withResults].sort((a, b) => (b.currentResults ?? 0) - (a.currentResults ?? 0));
    } else if (activeTab === "watchlist") {
      source = analytics.watchlistedPages;
    } else if (activeTab === "zero") {
      source = analytics.zeroAds;
    }

    if (!searchQuery.trim()) return source;

    const query = searchQuery.toLowerCase();
    return source.filter(
      (p) =>
        (p.displayName && p.displayName.toLowerCase().includes(query)) ||
        (p.pageId && p.pageId.toLowerCase().includes(query)) ||
        (p.url && p.url.toLowerCase().includes(query))
    );
  }, [activeTab, searchQuery, analytics]);

  const totalTablePages = Math.ceil(filteredTablePages.length / pageSize) || 1;
  const paginatedTablePages = useMemo(() => {
    const start = (tablePage - 1) * pageSize;
    return filteredTablePages.slice(start, start + pageSize);
  }, [filteredTablePages, tablePage, pageSize]);

  return (
    <div className="h-full overflow-y-auto space-y-5 pb-12 pr-1 text-slate-900 dark:text-slate-100">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800/40">
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              Scaling & Velocity Analytics
            </h1>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium hidden md:inline-block">
            {pages.length} monitored • {analytics.scalingPages.length} scaling • {analytics.descalingPages.length} descaling
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {lastRefreshed && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline-block">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={fetchAll}
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Analytics</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-600 dark:text-slate-400 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-sm font-semibold">Aggregating page scaling & performance metrics...</span>
        </div>
      ) : (
        <>
          {/* Consolidated 5 Key High-Signal Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* 1. Pages Scaling */}
            <div className="glass-card rounded-xl p-3.5 flex flex-col justify-between border border-emerald-500/20 bg-emerald-500/5 transition-all hover:-translate-y-0.5 shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> Scaling Pages
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded">
                    +{analytics.totalAdsScaled} ads
                  </span>
                </div>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                  {analytics.scalingPages.length}
                </div>
              </div>
              <div className="text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/80 mt-1.5 truncate">
                Avg: +{analytics.avgScalingDelta} ads/page
              </div>
            </div>

            {/* 2. Pages Descaling */}
            <div className="glass-card rounded-xl p-3.5 flex flex-col justify-between border border-rose-500/20 bg-rose-500/5 transition-all hover:-translate-y-0.5 shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" /> Descaling Pages
                  </span>
                  <span className="text-[10px] bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold px-1.5 py-0.5 rounded">
                    -{analytics.totalAdsDescaled} ads
                  </span>
                </div>
                <div className="text-2xl font-black text-rose-700 dark:text-rose-300">
                  {analytics.descalingPages.length}
                </div>
              </div>
              <div className="text-[11px] font-medium text-rose-600/80 dark:text-rose-400/80 mt-1.5 truncate">
                Avg: -{analytics.avgDescalingDelta} ads/page
              </div>
            </div>

            {/* 3. Net Velocity */}
            <div className="glass-card rounded-xl p-3.5 flex flex-col justify-between border border-indigo-500/20 bg-indigo-500/5 transition-all hover:-translate-y-0.5 shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" /> Net Velocity
                  </span>
                </div>
                <div className={`text-2xl font-black flex items-center ${analytics.netAdsDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {analytics.netAdsDelta >= 0 ? `+${analytics.netAdsDelta}` : analytics.netAdsDelta}
                </div>
              </div>
              <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mt-1.5 truncate">
                {analytics.netAdsDelta >= 0 ? "Bullish Market Growth" : "Net Ad Reduction"}
              </div>
            </div>

            {/* 4. Total Active Ads */}
            <div className="glass-card rounded-xl p-3.5 flex flex-col justify-between transition-all hover:-translate-y-0.5 shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" /> Total Active Ads
                  </span>
                </div>
                <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                  {analytics.totalAds.toLocaleString()}
                </div>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5 truncate">
                {analytics.megaVolume.length + analytics.highVolume.length} heavy brands (50+)
              </div>
            </div>

            {/* 5. Watchlist Trajectory */}
            <div className="glass-card rounded-xl p-3.5 flex flex-col justify-between transition-all hover:-translate-y-0.5 shadow-sm col-span-2 sm:col-span-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Watchlist
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-800 dark:text-slate-100">
                  {analytics.watchlistedPages.length}
                </div>
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1.5 truncate">
                +{analytics.watchlistedScaling.length} up / -{analytics.watchlistedDescaling.length} down
              </div>
            </div>
          </div>

          {/* Scaling Velocity & Distribution Tier Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Scaling Tiers Breakdown Card */}
            <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Scaling Velocity Tiers</h3>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full">
                  {analytics.scalingPages.length} total scaling
                </span>
              </div>

              <div className="space-y-3.5">
                {/* Aggressive Scaling */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      🚀 Aggressive Scale (+20+ ads)
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium">Heavy campaign expansion</p>
                  </div>
                  <span className="text-base font-black text-emerald-700 dark:text-emerald-400 font-mono">
                    {analytics.aggressiveScaling.length}
                  </span>
                </div>

                {/* Rapid Scaling */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-teal-500" />
                      📈 Rapid Scale (+10 to +19)
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium">Strong ad test scaling</p>
                  </div>
                  <span className="text-base font-black text-teal-700 dark:text-teal-400 font-mono">
                    {analytics.rapidScaling.length}
                  </span>
                </div>

                {/* Moderate Scaling */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      💹 Moderate Scale (+1 to +9)
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium">Steady creative additions</p>
                  </div>
                  <span className="text-base font-black text-indigo-700 dark:text-indigo-400 font-mono">
                    {analytics.moderateScaling.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Descaling Tiers Breakdown Card */}
            <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Descaling Tiers</h3>
                </div>
                <span className="text-[10px] bg-rose-500/10 text-rose-700 dark:text-rose-400 font-bold px-2 py-0.5 rounded-full">
                  {analytics.descalingPages.length} total descaling
                </span>
              </div>

              <div className="space-y-3.5">
                {/* Heavy Descaling */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      📉 Heavy Descale (-20+ ads lost)
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium">Major campaign shutdowns</p>
                  </div>
                  <span className="text-base font-black text-rose-700 dark:text-rose-400 font-mono">
                    {analytics.heavyDescaling.length}
                  </span>
                </div>

                {/* Moderate Descaling */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      🔻 Moderate Descale (-10 to -19)
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium">Ad pruning & budget shifts</p>
                  </div>
                  <span className="text-base font-black text-orange-700 dark:text-orange-400 font-mono">
                    {analytics.moderateDescaling.length}
                  </span>
                </div>

                {/* Light Descaling */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      🤏 Light Descale (-1 to -9)
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium">Minor ad expirations</p>
                  </div>
                  <span className="text-base font-black text-amber-700 dark:text-amber-400 font-mono">
                    {analytics.lightDescaling.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Active Ad Volume Distribution Card */}
            <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Ad Volume Distribution</h3>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">By active ads</span>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Mega Scale (100+)", count: analytics.megaVolume.length, color: "bg-purple-500", textColor: "text-purple-600 dark:text-purple-400" },
                  { label: "High Volume (50–99)", count: analytics.highVolume.length, color: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400" },
                  { label: "Growing (20–49)", count: analytics.midVolume.length, color: "bg-indigo-500", textColor: "text-indigo-600 dark:text-indigo-400" },
                  { label: "Low Volume (1–19)", count: analytics.lowVolume.length, color: "bg-cyan-500", textColor: "text-cyan-600 dark:text-cyan-400" },
                  { label: "Zero Ads (0)", count: analytics.zeroAds.length, color: "bg-slate-400", textColor: "text-slate-500 dark:text-slate-400" },
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

          {/* Interactive Detailed Page Explorer Table Section */}
          <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-sm p-5 space-y-4">
            {/* Explorer Toolbar & Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/60">
              {/* Tabs */}
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  onClick={() => { setActiveTab("scaling"); setTablePage(1); }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === "scaling"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Scaling Pages ({analytics.scalingPages.length})</span>
                </button>

                <button
                  onClick={() => { setActiveTab("descaling"); setTablePage(1); }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === "descaling"
                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                  <span>Descaling Pages ({analytics.descalingPages.length})</span>
                </button>

                <button
                  onClick={() => { setActiveTab("top"); setTablePage(1); }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === "top"
                      ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>Top Active Ads ({analytics.withResults.length})</span>
                </button>

                <button
                  onClick={() => { setActiveTab("watchlist"); setTablePage(1); }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === "watchlist"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
                  }`}
                >
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>Watchlist ({analytics.watchlistedPages.length})</span>
                </button>

                <button
                  onClick={() => { setActiveTab("zero"); setTablePage(1); }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === "zero"
                      ? "bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent"
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>Zero Ads ({analytics.zeroAds.length})</span>
                </button>
              </div>

              {/* Search Filter input */}
              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter page or keyword..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setTablePage(1); }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
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
                                onClick={() => toggleWatchlist(p.id, p.isWatchlisted)}
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
                                <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono truncate block">
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
                              max={analytics.maxResults}
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
                  onClick={() => setTablePage((prev: number) => Math.max(1, prev - 1))}
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
                  onClick={() => setTablePage((prev: number) => Math.min(totalTablePages, prev + 1))}
                  className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
