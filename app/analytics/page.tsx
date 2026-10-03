"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  TrackedPage,
  DashboardStats,
  ProductsAnalyticsData,
  AdsAnalyticsData,
  BrandAnalyticsCalculations,
  MainAnalyticsTab,
} from "@/types";
import {
  BarChart3,
  TrendingUp,
  ShoppingBag,
  Eye,
  RefreshCw,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { PulseBanner } from "@/components/analytics/pulse-banner";
import { MarketForecastCard } from "@/components/analytics/market-forecast-card";
import { ProductAnalyticsTab } from "@/components/analytics/product-analytics-tab";
import { AdAnalyticsTab } from "@/components/analytics/ad-analytics-tab";
import { BrandAnalyticsTab, BrandSubTab } from "@/components/analytics/brand-analytics-tab";
import {
  DateRange,
  DateRangeFilter,
} from "@/components/analytics/date-range-filter";

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

function getInitialSubTab(): BrandSubTab {
  if (typeof window === "undefined") return "scaling";
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const subParam = urlParams.get("sub");
    if (subParam && ["scaling", "descaling", "top", "watchlist", "attention"].includes(subParam)) {
      return subParam as BrandSubTab;
    }
  } catch {}
  return "scaling";
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

function syncStateToUrl(tab: MainAnalyticsTab, range: DateRange, subTab?: BrandSubTab) {
  if (typeof window === "undefined") return;
  try {
    const query = new URLSearchParams(window.location.search);
    query.set("tab", tab);
    query.set("range", range);
    if (tab === "pages" && subTab) {
      query.set("sub", subTab);
    } else {
      query.delete("sub");
    }
    const newUrl = `${window.location.pathname}?${query.toString()}`;
    window.history.replaceState(null, "", newUrl);
    localStorage.setItem("analytics_main_tab", tab);
    localStorage.setItem("analytics_date_range", range);
  } catch {}
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<MainAnalyticsTab>(() => getInitialTab());
  const [dateRange, setDateRange] = useState<DateRange>(() => getInitialDateRange());
  const [pageSubTab, setPageSubTab] = useState<BrandSubTab>(() => getInitialSubTab());

  // Data states
  const [productsData, setProductsData] = useState<ProductsAnalyticsData | null>(null);
  const [adsData, setAdsData] = useState<AdsAnalyticsData | null>(null);
  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Range tracking for lazy loading
  const [productsFetchedRange, setProductsFetchedRange] = useState<string | null>(null);
  const [adsFetchedRange, setAdsFetchedRange] = useState<string | null>(null);
  const [pagesFetchedRange, setPagesFetchedRange] = useState<string | null>(null);

  // Loading states
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingAds, setLoadingAds] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [updatingWatchlistId, setUpdatingWatchlistId] = useState<string | null>(null);

  // Error states
  const [productsError, setProductsError] = useState<string | null>(null);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [pagesError, setPagesError] = useState<string | null>(null);

  // Check staleness every minute
  useEffect(() => {
    const checkStaleness = () => {
      if (!lastRefreshed) return;
      const diffMin = (Date.now() - lastRefreshed.getTime()) / 60000;
      setIsStale(diffMin >= 30);
    };
    checkStaleness();
    const interval = setInterval(checkStaleness, 60000);
    return () => clearInterval(interval);
  }, [lastRefreshed]);

  // Sync tab with URL
  const handleTabChange = (tab: MainAnalyticsTab) => {
    setActiveTab(tab);
    syncStateToUrl(tab, dateRange, tab === "pages" ? pageSubTab : undefined);
  };

  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
    // Invalidate stale range markers so tabs refetch on visit
    setProductsFetchedRange(null);
    setAdsFetchedRange(null);
    setPagesFetchedRange(null);
    syncStateToUrl(activeTab, range, activeTab === "pages" ? pageSubTab : undefined);
  };

  const handlePageSubTabChange = (sub: BrandSubTab) => {
    setPageSubTab(sub);
    syncStateToUrl(activeTab, dateRange, sub);
  };

  // Popstate listener for back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getInitialTab());
      setDateRange(getInitialDateRange());
      setPageSubTab(getInitialSubTab());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 1. Fetch Products Analytics
  const fetchProductsAnalytics = useCallback(async (forceRefresh = false) => {
    try {
      setLoadingProducts(true);
      setProductsError(null);
      const cacheBust = forceRefresh ? `&_t=${Date.now()}` : "";
      const res = await fetch(`/api/analytics/products?range=${dateRange}${cacheBust}`, {
        cache: forceRefresh ? "no-store" : "default",
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to fetch products analytics (${res.status})`);
      }
      const json = await res.json();
      setProductsData(json);
      setProductsFetchedRange(dateRange);
      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error("Failed to fetch products analytics:", err);
      setProductsError(err?.message || "Failed to load product analytics data");
    } finally {
      setLoadingProducts(false);
    }
  }, [dateRange]);

  // 2. Fetch Ads Analytics
  const fetchAdsAnalytics = useCallback(async (forceRefresh = false) => {
    try {
      setLoadingAds(true);
      setAdsError(null);
      const cacheBust = forceRefresh ? `&_t=${Date.now()}` : "";
      const res = await fetch(`/api/analytics/ads?range=${dateRange}${cacheBust}`, {
        cache: forceRefresh ? "no-store" : "default",
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to fetch ads analytics (${res.status})`);
      }
      const json = await res.json();
      setAdsData(json);
      setAdsFetchedRange(dateRange);
      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error("Failed to fetch ads analytics:", err);
      setAdsError(err?.message || "Failed to load ad creatives data");
    } finally {
      setLoadingAds(false);
    }
  }, [dateRange]);

  // 3. Fetch Pages Analytics
  const fetchPagesData = useCallback(async (forceRefresh = false) => {
    try {
      setLoadingPages(true);
      setPagesError(null);
      const cacheBust = forceRefresh ? `&_t=${Date.now()}` : "";
      const [pagesRes, statsRes] = await Promise.all([
        fetch(`/api/analytics/pages?range=${dateRange}${cacheBust}`, {
          cache: forceRefresh ? "no-store" : "default",
        }),
        fetch(`/api/stats${forceRefresh ? `?_t=${Date.now()}` : ""}`, {
          cache: forceRefresh ? "no-store" : "default",
        }),
      ]);

      if (!pagesRes.ok) {
        const errJson = await pagesRes.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to fetch pages data (${pagesRes.status})`);
      }

      const data = await pagesRes.json();
      setPages(data.data || []);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      setPagesFetchedRange(dateRange);
      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error("Failed to fetch pages data:", err);
      setPagesError(err?.message || "Failed to load page velocity data");
    } finally {
      setLoadingPages(false);
    }
  }, [dateRange]);

  // Lazy-load: only fetch data for the active tab if it hasn't been loaded for current dateRange
  useEffect(() => {
    if (activeTab === "products" && productsFetchedRange !== dateRange) {
      fetchProductsAnalytics();
    } else if (activeTab === "ads" && adsFetchedRange !== dateRange) {
      fetchAdsAnalytics();
    } else if (activeTab === "pages" && pagesFetchedRange !== dateRange) {
      fetchPagesData();
    }
  }, [
    activeTab,
    dateRange,
    productsFetchedRange,
    adsFetchedRange,
    pagesFetchedRange,
    fetchProductsAnalytics,
    fetchAdsAnalytics,
    fetchPagesData,
  ]);

  // Force-refresh all loaded tabs or currently active tab
  const handleRefresh = useCallback(async (forceAll = false) => {
    if (forceAll) {
      await Promise.all([
        fetchProductsAnalytics(true),
        fetchAdsAnalytics(true),
        fetchPagesData(true),
      ]);
    } else {
      if (activeTab === "products") await fetchProductsAnalytics(true);
      else if (activeTab === "ads") await fetchAdsAnalytics(true);
      else await fetchPagesData(true);
    }
  }, [activeTab, fetchProductsAnalytics, fetchAdsAnalytics, fetchPagesData]);

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
  const pageAnalytics: BrandAnalyticsCalculations = useMemo(() => {
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
    // Safe reduce instead of Math.max(...spread) to avoid stack overflows on large arrays
    const maxResults = pages.reduce((max, p) => Math.max(max, p.currentResults ?? 0), 1);

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

  const isCurrentTabLoading =
    activeTab === "products"
      ? loadingProducts
      : activeTab === "ads"
      ? loadingAds
      : loadingPages;

  const currentTabError =
    activeTab === "products"
      ? productsError
      : activeTab === "ads"
      ? adsError
      : pagesError;

  // Pulse metrics extraction
  const pulseMetrics = useMemo(() => {
    const breakoutCount = adsData?.summary?.breakoutAdsCount || 0;
    const topCat = productsData?.categories && productsData.categories.length > 0 ? productsData.categories[0] : null;
    const topNiche = topCat?.name || "Beauty & Care";
    const topNichePrice = topCat?.avgPrice || 0;
    const dominantCTAObj =
      adsData?.ctaPsychology?.scaledCtas && adsData.ctaPsychology.scaledCtas.length > 0
        ? adsData.ctaPsychology.scaledCtas[0]
        : null;
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
            <h1 className="text-base font-extrabold text-slate-900 dark:white tracking-tight">
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
            onClick={() => handleRefresh(false)}
            disabled={isCurrentTabLoading}
            className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border transition-all cursor-pointer disabled:opacity-50 ${
              isStale
                ? "border-amber-400 dark:border-amber-500/60 ring-1 ring-amber-400/40"
                : "border-slate-200 dark:border-slate-700"
            }`}
            title={isStale ? "Data is older than 30 minutes. Click to refresh." : "Refresh active tab"}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isStale ? "text-amber-500" : "text-indigo-500"} ${
                isCurrentTabLoading ? "animate-spin" : ""
              }`}
            />
            <span>Refresh Analytics</span>
            {isStale && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            )}
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
        isLoading={isCurrentTabLoading && !productsData && !adsData}
      />

      {/* AI Market Forecast & Strategic Playbook (DeepSeek / OpenRouter) */}
      <MarketForecastCard />

      {/* Tab Switcher */}
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
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === "products"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {loadingProducts && !productsData ? "—" : productsData?.summary?.totalProducts || 0}
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
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === "ads"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {loadingAds && !adsData ? "—" : adsData?.summary?.totalAds || 0}
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
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === "pages"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {loadingPages && pages.length === 0 ? "—" : pages.length}
            </span>
          </button>
        </div>
      </div>

      {/* Active Tab Error Banner with Retry */}
      {currentTabError && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{currentTabError}</span>
          </div>
          <button
            onClick={() => handleRefresh(false)}
            className="flex items-center space-x-1 font-bold bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded-xl transition-all cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Tab Content Rendering: kept mounted using hidden CSS to preserve state, filters & pagination */}
      <div className={activeTab === "products" ? "block" : "hidden"}>
        <ProductAnalyticsTab
          data={productsData}
          isLoading={loadingProducts}
          onRefresh={() => fetchProductsAnalytics(true)}
          dateRange={dateRange}
        />
      </div>

      <div className={activeTab === "ads" ? "block" : "hidden"}>
        <AdAnalyticsTab
          data={adsData}
          isLoading={loadingAds}
          onRefresh={() => fetchAdsAnalytics(true)}
          dateRange={dateRange}
        />
      </div>

      <div className={activeTab === "pages" ? "block" : "hidden"}>
        <BrandAnalyticsTab
          pages={pages}
          analytics={pageAnalytics}
          isLoading={loadingPages}
          onToggleWatchlist={toggleWatchlist}
          updatingWatchlistId={updatingWatchlistId}
          subTab={pageSubTab}
          onSubTabChange={handlePageSubTabChange}
        />
      </div>
    </div>
  );
}
