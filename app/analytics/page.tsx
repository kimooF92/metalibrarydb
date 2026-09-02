"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { TrackedPage, DashboardStats } from "@/types";
import {
  BarChart3,
  TrendingUp,
  ShoppingBag,
  Eye,
  RefreshCw,
  Sparkles,
  Layers,
  Zap,
} from "lucide-react";
import { PulseBanner } from "@/components/analytics/pulse-banner";
import { MarketForecastCard } from "@/components/analytics/market-forecast-card";
import { ProductAnalyticsTab } from "@/components/analytics/product-analytics-tab";
import { AdAnalyticsTab } from "@/components/analytics/ad-analytics-tab";
import { BrandAnalyticsTab } from "@/components/analytics/brand-analytics-tab";
import {
  DateRange,
  DateRangeFilter,
} from "@/components/analytics/date-range-filter";

type MainAnalyticsTab = "products" | "ads" | "pages";

function getInitialTab(): MainAnalyticsTab {
  if (typeof window === "undefined") return "pages";
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam === "ads" || tabParam === "pages" || tabParam === "products") {
      return tabParam as MainAnalyticsTab;
    }
    // Also handle legacy tab params (e.g. scaling, descaling) by redirecting to pages tab
    if (tabParam && ["scaling", "descaling", "top", "watchlist", "attention"].includes(tabParam)) {
      return "pages";
    }
    const saved = localStorage.getItem("analytics_main_tab");
    if (saved === "ads" || saved === "pages" || saved === "products") {
      return saved as MainAnalyticsTab;
    }
  } catch {}
  return "pages";
}

function isDateRange(value: string | null): value is DateRange {
  return value === "today" || value === "7d" || value === "15d" || value === "30d";
}

function getInitialDateRange(): DateRange {
  if (typeof window === "undefined") return "7d";
  try {
    const urlRange = new URLSearchParams(window.location.search).get("range");
    if (isDateRange(urlRange)) return urlRange;

    const saved = localStorage.getItem("analytics_date_range");
    if (isDateRange(saved)) return saved;
  } catch {}
  return "7d";
}

function syncStateToUrl(tab: MainAnalyticsTab, range: DateRange) {
  if (typeof window === "undefined") return;
  try {
    const query = new URLSearchParams(window.location.search);
    query.set("tab", tab);
    query.set("range", range);
    const newUrl = `${window.location.pathname}?${query.toString()}`;
    window.history.replaceState(null, "", newUrl);
    localStorage.setItem("analytics_main_tab", tab);
    localStorage.setItem("analytics_date_range", range);
  } catch {}
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<MainAnalyticsTab>(() => getInitialTab());
  const [dateRange, setDateRange] = useState<DateRange>(() => getInitialDateRange());

  // Data states
  const [productsData, setProductsData] = useState<any>(null);
  const [adsData, setAdsData] = useState<any>(null);
  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Loading states
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingAds, setLoadingAds] = useState(true);
  const [loadingPages, setLoadingPages] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [updatingWatchlistId, setUpdatingWatchlistId] = useState<string | null>(null);

  // Sync tab with URL
  const handleTabChange = (tab: MainAnalyticsTab) => {
    setActiveTab(tab);
    syncStateToUrl(tab, dateRange);
  };

  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
    syncStateToUrl(activeTab, range);
  };

  // Popstate listener for back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getInitialTab());
      setDateRange(getInitialDateRange());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 1. Fetch Products Analytics
  const fetchProductsAnalytics = useCallback(async (forceRefresh = false) => {
    try {
      setLoadingProducts(true);
      const cacheBust = forceRefresh ? `&_t=${Date.now()}` : "";
      const res = await fetch(`/api/analytics/products?range=${dateRange}${cacheBust}`, {
        cache: forceRefresh ? "no-store" : "default",
      });
      if (res.ok) {
        const json = await res.json();
        setProductsData(json);
      }
    } catch (err) {
      console.error("Failed to fetch products analytics:", err);
    } finally {
      setLoadingProducts(false);
    }
  }, [dateRange]);

  // 2. Fetch Ads Analytics
  const fetchAdsAnalytics = useCallback(async (forceRefresh = false) => {
    try {
      setLoadingAds(true);
      const cacheBust = forceRefresh ? `&_t=${Date.now()}` : "";
      const res = await fetch(`/api/analytics/ads?range=${dateRange}${cacheBust}`, {
        cache: forceRefresh ? "no-store" : "default",
      });
      if (res.ok) {
        const json = await res.json();
        setAdsData(json);
      }
    } catch (err) {
      console.error("Failed to fetch ads analytics:", err);
    } finally {
      setLoadingAds(false);
    }
  }, [dateRange]);

  // 3. Fetch Pages Analytics
  const fetchPagesData = useCallback(async (forceRefresh = false) => {
    try {
      setLoadingPages(true);
      const cacheBust = forceRefresh ? `&_t=${Date.now()}` : "";
      const [pagesRes, statsRes] = await Promise.all([
        fetch(`/api/analytics/pages?range=${dateRange}${cacheBust}`, {
          cache: forceRefresh ? "no-store" : "default",
        }),
        fetch(`/api/stats${forceRefresh ? `?_t=${Date.now()}` : ""}`, {
          cache: forceRefresh ? "no-store" : "default",
        }),
      ]);

      if (pagesRes.ok) {
        const data = await pagesRes.json();
        setPages(data.data || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch pages data:", err);
    } finally {
      setLoadingPages(false);
    }
  }, [dateRange]);

  // Fetch all in parallel
  const fetchAll = useCallback(async (forceRefresh = false) => {
    await Promise.all([
      fetchProductsAnalytics(forceRefresh),
      fetchAdsAnalytics(forceRefresh),
      fetchPagesData(forceRefresh),
    ]);
    setLastRefreshed(new Date());
  }, [fetchProductsAnalytics, fetchAdsAnalytics, fetchPagesData]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Watchlist toggle handler
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

  // Calculations for Page Velocity tab
  const pageAnalytics = useMemo(() => {
    const getDelta = (page: TrackedPage) => page.windowDelta ?? page.difference;
    const completed = pages.filter((p) => p.status === "success");
    const withResults = pages.filter((p) => p.currentResults !== null && p.currentResults > 0);
    const zeroAds = pages.filter((p) => p.status === "success" && p.currentResults === 0);
    const failed = pages.filter((p) => p.status === "failed");
    const unclear = pages.filter((p) => p.status === "unclear");
    const withDiff = pages.filter((p) => getDelta(p) !== null && getDelta(p) !== undefined);

    const scalingPages = withDiff
      .filter((p) => (getDelta(p) ?? 0) > 0)
      .sort((a, b) => (getDelta(b) ?? 0) - (getDelta(a) ?? 0));

    const descalingPages = withDiff
      .filter((p) => (getDelta(p) ?? 0) < 0)
      .sort((a, b) => (getDelta(a) ?? 0) - (getDelta(b) ?? 0));

    const totalAdsScaled = scalingPages.reduce((sum, p) => sum + (getDelta(p) ?? 0), 0);
    const totalAdsDescaled = descalingPages.reduce((sum, p) => sum + Math.abs(getDelta(p) ?? 0), 0);
    const netAdsDelta = totalAdsScaled - totalAdsDescaled;

    const avgScalingDelta = scalingPages.length > 0 ? (totalAdsScaled / scalingPages.length).toFixed(1) : "0";
    const avgDescalingDelta = descalingPages.length > 0 ? (totalAdsDescaled / descalingPages.length).toFixed(1) : "0";

    const aggressiveScaling = scalingPages.filter((p) => (getDelta(p) ?? 0) >= 20);
    const rapidScaling = scalingPages.filter((p) => (getDelta(p) ?? 0) >= 10 && (getDelta(p) ?? 0) < 20);
    const moderateScaling = scalingPages.filter((p) => (getDelta(p) ?? 0) >= 1 && (getDelta(p) ?? 0) < 10);

    const heavyDescaling = descalingPages.filter((p) => (getDelta(p) ?? 0) <= -20);
    const moderateDescaling = descalingPages.filter((p) => (getDelta(p) ?? 0) <= -10 && (getDelta(p) ?? 0) > -20);
    const lightDescaling = descalingPages.filter((p) => (getDelta(p) ?? 0) <= -1 && (getDelta(p) ?? 0) > -10);

    const megaVolume = pages.filter((p) => (p.currentResults ?? 0) >= 100);
    const highVolume = pages.filter((p) => (p.currentResults ?? 0) >= 50 && (p.currentResults ?? 0) < 100);
    const midVolume = pages.filter((p) => (p.currentResults ?? 0) >= 20 && (p.currentResults ?? 0) < 50);
    const lowVolume = pages.filter((p) => (p.currentResults ?? 0) >= 1 && (p.currentResults ?? 0) < 20);

    const watchlistedPages = pages.filter((p) => p.isWatchlisted);
    const watchlistedScaling = watchlistedPages.filter((p) => (getDelta(p) ?? 0) > 0);
    const watchlistedDescaling = watchlistedPages.filter((p) => (getDelta(p) ?? 0) < 0);

    const totalAds = pages.reduce((sum, p) => sum + (p.currentResults ?? 0), 0);
    const maxResults = Math.max(...pages.map((p) => p.currentResults ?? 0), 1);

    return {
      scalingPages,
      descalingPages,
      withResults,
      zeroAds,
      failed,
      unclear,
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
      totalAds,
      maxResults,
    };
  }, [pages]);

  const isGlobalLoading = loadingProducts || loadingAds || loadingPages;

  // Pulse metrics extraction
  const pulseMetrics = useMemo(() => {
    const breakoutCount = adsData?.summary?.breakoutAdsCount || 0;
    const topCat = productsData?.categories?.length > 0 ? productsData.categories[0] : null;
    const topNiche = topCat?.name || "Beauty & Care";
    const topNichePrice = topCat?.avgPrice || 0;
    const dominantCTAObj = adsData?.ctaPsychology?.scaledCtas?.length > 0 ? adsData.ctaPsychology.scaledCtas[0] : null;
    const dominantCTA = dominantCTAObj?.name || "Shop Now";
    const dominantCTAPct = dominantCTAObj?.sharePct || 0;
    const catalogHealthPct = productsData?.dataQuality?.classifiedRate ?? 100;

    return {
      breakoutCount,
      topNiche,
      topNichePrice,
      dominantCTA,
      dominantCTAPct,
      catalogHealthPct,
    };
  }, [productsData, adsData]);

  return (
    <div className="h-full overflow-y-auto space-y-5 pb-12 pr-1 text-slate-900 dark:text-slate-100">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800/40">
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              Competitor & Market Intelligence
            </h1>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium hidden md:inline-block">
            {productsData?.summary?.totalProducts || 0} products • {adsData?.summary?.totalAds || 0} creatives • {pages.length} monitored pages
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
            {lastRefreshed && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline-block">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
          <button
            onClick={() => fetchAll(true)}
            disabled={isGlobalLoading}
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 ${isGlobalLoading ? "animate-spin" : ""}`} />
            <span>Refresh Analytics</span>
          </button>
        </div>
      </div>

      {/* Global Market Pulse Banner */}
      <PulseBanner
        breakoutCount={pulseMetrics.breakoutCount}
        topNiche={pulseMetrics.topNiche}
        topNichePrice={pulseMetrics.topNichePrice}
        dominantCTA={pulseMetrics.dominantCTA}
        dominantCTAPct={pulseMetrics.dominantCTAPct}
        catalogHealthPct={pulseMetrics.catalogHealthPct}
        dateRange={dateRange}
        isLoading={isGlobalLoading && !productsData && !adsData}
      />

      {/* AI Market Forecast & Strategic Playbook (DeepSeek / OpenRouter) */}
      <MarketForecastCard />

      {/* Primary 3-Pillar Tab Switcher */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
        <div className="flex items-center flex-wrap gap-2">
          {/* Tab 1: Products & Winner Niches */}
          <button
            onClick={() => handleTabChange("products")}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-extrabold rounded-2xl transition-all cursor-pointer ${
              activeTab === "products"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20 scale-[1.02]"
                : "text-slate-600 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800/80"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>🛍️ Products & Winner Niches</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                activeTab === "products"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {productsData?.summary?.totalProducts || 0}
            </span>
          </button>

          {/* Tab 2: Ad Creatives & Campaigns */}
          <button
            onClick={() => handleTabChange("ads")}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-extrabold rounded-2xl transition-all cursor-pointer ${
              activeTab === "ads"
                ? "bg-purple-600 text-white shadow-md shadow-purple-500/20 scale-[1.02]"
                : "text-slate-600 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800/80"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>🎯 Ad Creatives & Campaigns</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                activeTab === "ads"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {adsData?.summary?.totalAds || 0}
            </span>
          </button>

          {/* Tab 3: Page Velocity & Scaling */}
          <button
            onClick={() => handleTabChange("pages")}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-extrabold rounded-2xl transition-all cursor-pointer ${
              activeTab === "pages"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20 scale-[1.02]"
                : "text-slate-600 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800/80"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>📈 Page Velocity & Scaling</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                activeTab === "pages"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {pages.length}
            </span>
          </button>
        </div>
      </div>

      {/* Tab Content Rendering */}
      {activeTab === "products" && (
        <ProductAnalyticsTab
          data={productsData}
          isLoading={loadingProducts}
          onRefresh={fetchProductsAnalytics}
          dateRange={dateRange}
        />
      )}

      {activeTab === "ads" && (
        <AdAnalyticsTab
          data={adsData}
          isLoading={loadingAds}
          onRefresh={fetchAdsAnalytics}
          dateRange={dateRange}
        />
      )}

      {activeTab === "pages" && (
        <BrandAnalyticsTab
          pages={pages}
          analytics={pageAnalytics}
          isLoading={loadingPages}
          onToggleWatchlist={toggleWatchlist}
          updatingWatchlistId={updatingWatchlistId}
        />
      )}
    </div>
  );
}
