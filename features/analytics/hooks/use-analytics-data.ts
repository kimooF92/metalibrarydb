"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type {
  TrackedPage,
  DashboardStats,
  ProductsAnalyticsData,
  AdsAnalyticsData,
  BrandAnalyticsCalculations,
} from "@/types";
import type { MainAnalyticsTab, DateRange } from "../types";
import { useWorkspace } from "@/components/workspace-context";

interface UseAnalyticsDataOptions {
  activeTab: MainAnalyticsTab;
  dateRange: DateRange;
}

export function useAnalyticsData({ activeTab, dateRange }: UseAnalyticsDataOptions) {
  const { activeWorkspace } = useWorkspace();

  const [productsData, setProductsData] = useState<ProductsAnalyticsData | null>(null);
  const [adsData, setAdsData] = useState<AdsAnalyticsData | null>(null);
  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const [productsFetchedRange, setProductsFetchedRange] = useState<string | null>(null);
  const [adsFetchedRange, setAdsFetchedRange] = useState<string | null>(null);
  const [pagesFetchedRange, setPagesFetchedRange] = useState<string | null>(null);

  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingAds, setLoadingAds] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [updatingWatchlistId, setUpdatingWatchlistId] = useState<string | null>(null);

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

  // 1. Fetch Products Analytics
  const fetchProductsAnalytics = useCallback(
    async (forceRefresh = false) => {
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
    },
    [dateRange]
  );

  // 2. Fetch Ads Analytics
  const fetchAdsAnalytics = useCallback(
    async (forceRefresh = false) => {
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
    },
    [dateRange]
  );

  // 3. Fetch Pages Analytics
  const fetchPagesData = useCallback(
    async (forceRefresh = false) => {
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
    },
    [dateRange]
  );

  // Lazy-load data when activeTab changes or dateRange changes
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

  // Invalidate when workspace changes
  useEffect(() => {
    if (!activeWorkspace?.id) return;
    setProductsFetchedRange(null);
    setAdsFetchedRange(null);
    setPagesFetchedRange(null);
    if (activeTab === "products") {
      fetchProductsAnalytics(true);
    } else if (activeTab === "ads") {
      fetchAdsAnalytics(true);
    } else if (activeTab === "pages") {
      fetchPagesData(true);
    }
  }, [activeWorkspace?.id, activeTab, fetchProductsAnalytics, fetchAdsAnalytics, fetchPagesData]);

  const handleRefresh = useCallback(
    async (forceAll = false) => {
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
    },
    [activeTab, fetchProductsAnalytics, fetchAdsAnalytics, fetchPagesData]
  );

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

    const avgScalingDelta =
      scalingPages.length > 0 ? (totalAdsScaled / scalingPages.length).toFixed(1) : "0";
    const avgDescalingDelta =
      descalingPages.length > 0 ? (totalAdsDescaled / descalingPages.length).toFixed(1) : "0";

    const aggressiveScaling = scalingPages.filter((p) => (getDelta(p) ?? 0) >= 20);
    const rapidScaling = scalingPages.filter(
      (p) => (getDelta(p) ?? 0) >= 10 && (getDelta(p) ?? 0) < 20
    );
    const moderateScaling = scalingPages.filter(
      (p) => (getDelta(p) ?? 0) >= 1 && (getDelta(p) ?? 0) < 10
    );

    const heavyDescaling = descalingPages.filter((p) => (getDelta(p) ?? 0) <= -20);
    const moderateDescaling = descalingPages.filter(
      (p) => (getDelta(p) ?? 0) <= -10 && (getDelta(p) ?? 0) > -20
    );
    const lightDescaling = descalingPages.filter(
      (p) => (getDelta(p) ?? 0) <= -1 && (getDelta(p) ?? 0) > -10
    );

    const megaVolume = pages.filter((p) => (p.currentResults ?? 0) >= 100);
    const highVolume = pages.filter(
      (p) => (p.currentResults ?? 0) >= 50 && (p.currentResults ?? 0) < 100
    );
    const midVolume = pages.filter(
      (p) => (p.currentResults ?? 0) >= 20 && (p.currentResults ?? 0) < 50
    );
    const lowVolume = pages.filter(
      (p) => (p.currentResults ?? 0) >= 1 && (p.currentResults ?? 0) < 20
    );

    const watchlistedPages = pages.filter((p) => p.isWatchlisted);
    const watchlistedScaling = watchlistedPages.filter((p) => (getDelta(p) ?? 0) > 0);
    const watchlistedDescaling = watchlistedPages.filter((p) => (getDelta(p) ?? 0) < 0);

    const totalAds = pages.reduce((sum, p) => sum + (p.currentResults ?? 0), 0);
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

  const pulseMetrics = useMemo(() => {
    const breakoutCount = adsData?.summary?.breakoutAdsCount || 0;
    const topCat =
      productsData?.categories && productsData.categories.length > 0
        ? productsData.categories[0]
        : null;
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

  return {
    productsData,
    adsData,
    pages,
    stats,
    loadingProducts,
    loadingAds,
    loadingPages,
    isCurrentTabLoading,
    currentTabError,
    lastRefreshed,
    isStale,
    updatingWatchlistId,
    pageAnalytics,
    pulseMetrics,
    handleRefresh,
    toggleWatchlist,
    fetchProductsAnalytics,
    fetchAdsAnalytics,
    fetchPagesData,
  };
}

