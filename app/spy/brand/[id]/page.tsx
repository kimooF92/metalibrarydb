"use client";

import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAdFeed } from "@/hooks/use-spy";
import { AdCard } from "@/components/spy/ad-card";
import { AdRow } from "@/components/spy/ad-row";
import { useToast } from "@/components/toast-context";
import { Ad } from "@/types";
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  RefreshCw,
  Star,
  Layers,
  Calendar,
  Video,
  Image as ImageIcon,
  Flame,
  Trophy,
  Award,
  Clock,
  Sparkles,
  Tag,
  ShoppingBag,
  Globe,
  MessageCircle,
  Phone,
  LayoutGrid,
  LayoutList,
  Search,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Archive,
  BarChart3,
  Rocket,
  Target,
  ArrowUpRight,
} from "lucide-react";

interface BrandAnalyticsData {
  success: boolean;
  brand: {
    id: string | null;
    pageId: string;
    displayName: string;
    url: string;
    country: string | null;
    landingPage: string | null;
    isWatchlisted: boolean;
    lastChecked: string | null;
    lastCreativeScan: string | null;
    status: string;
    currentResults: number;
    isTracked: boolean;
  };
  summary: {
    totalAdsCaptured: number;
    activeAdsCount: number;
    inactiveAdsCount: number;
    archivedAdsCount: number;
    totalDuplicationCount: number;
    avgDuplicationsPerAd: number;
    winnerCount: number;
    breakoutCount: number;
    evergreenCount: number;
    evergreenRate: number;
    distinctProductsCount: number;
  };
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
  ctaDistribution: Array<{ cta: string; count: number; percent: number }>;
  productClusters: Array<{
    productKey: string;
    productName: string;
    cleanProductUrl: string | null;
    creativeCount: number;
    videoCount: number;
    imageCount: number;
    activeCount: number;
    maxDuplications: number;
    isFlagship: boolean;
    sharePercent: number;
    product: any | null;
  }>;
  topWinners: Ad[];
  history: Array<{
    id: string;
    results: number;
    difference: number;
    checkedAt: string;
    status: string;
  }>;
  storeTech: {
    platforms: string[];
    pixelIds: string[];
    phoneNumbers: string[];
    whatsappNumbers: string[];
  };
}

export default function BrandDeepDivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"analytics" | "creatives">("analytics");
  const [data, setData] = useState<BrandAnalyticsData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [isTogglingWatchlist, setIsTogglingWatchlist] = useState(false);

  // Creative feed controls
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [feedSearch, setFeedSearch] = useState("");
  const [feedMediaType, setFeedMediaType] = useState<string>("all");
  const [feedStatus, setFeedStatus] = useState<string>("all");
  const [feedSortBy, setFeedSortBy] = useState<string>("winner_score");

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Load brand analytics payload
  const fetchBrandData = async () => {
    setIsLoadingAnalytics(true);
    setError(null);
    try {
      const res = await fetch(`/api/spy/brand/${encodeURIComponent(id)}?_t=${Date.now()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load brand analytics");
      }
      setData(json);
      setIsWatchlisted(Boolean(json.brand?.isWatchlisted));
    } catch (err: any) {
      setError(err.message || "Failed to load brand data");
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    fetchBrandData();
  }, [id]);

  // Brand Ad Feed
  const {
    ads,
    pagination,
    isLoading: isLoadingFeed,
    isFetchingMore,
    refetch: refetchFeed,
    updateFilters,
    updateAdInFeed,
  } = useAdFeed({
    trackedPageId: id,
    search: feedSearch,
    mediaType: feedMediaType as any,
    status: feedStatus as any,
    sortBy: feedSortBy as any,
    limit: 24,
    enabled: activeTab === "creatives",
  });

  // Watchlist toggle handler
  const handleToggleWatchlist = async () => {
    if (!data?.brand || isTogglingWatchlist) return;
    setIsTogglingWatchlist(true);
    const nextState = !isWatchlisted;
    setIsWatchlisted(nextState);

    try {
      if (data.brand.id) {
        const res = await fetch(`/api/page/${data.brand.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isWatchlisted: nextState }),
        });
        if (!res.ok) throw new Error("Failed to update watchlist");
      } else {
        // Not yet tracked — import as tracked page
        const res = await fetch("/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: data.brand.url,
            displayName: data.brand.displayName,
            pageId: data.brand.pageId,
            isWatchlisted: nextState,
          }),
        });
        if (!res.ok) throw new Error("Failed to track brand page");
      }

      showToast({
        type: "success",
        title: nextState ? "Added to Starred Watchlist" : "Removed from Watchlist",
        message: `${data.brand.displayName} watchlist status updated.`,
      });
      fetchBrandData();
    } catch (err: any) {
      setIsWatchlisted(!nextState);
      showToast({
        type: "error",
        title: "Watchlist Error",
        message: err.message || "Could not update watchlist.",
      });
    } finally {
      setIsTogglingWatchlist(false);
    }
  };

  // Bulk Media Refresh Trigger
  const handleBulkRefreshMedia = async () => {
    if (isRefreshingMedia || !data?.brand?.pageId) return;
    setIsRefreshingMedia(true);
    try {
      const res = await fetch("/api/spy/ads/bulk-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackedPageId: data.brand.id || data.brand.pageId,
          pageId: data.brand.pageId,
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        showToast({
          type: "success",
          title: "Brand Media Refresh Enqueued",
          message: resData.message || "Scraping fresh creative media links...",
        });
        await Promise.all([fetchBrandData(), refetchFeed()]);
      } else {
        throw new Error(resData.message || "Could not refresh brand media");
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Refresh Error",
        message: err.message || "Failed to trigger media refresh.",
      });
    } finally {
      setIsRefreshingMedia(false);
    }
  };

  // Infinite scroll listener for creatives tab
  useEffect(() => {
    if (activeTab !== "creatives") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (
          first.isIntersecting &&
          !isLoadingFeed &&
          !isFetchingMore &&
          pagination.page < pagination.totalPages
        ) {
          updateFilters({ page: pagination.page + 1 });
        }
      },
      { threshold: 0.1 }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) observer.observe(currentSentinel);
    return () => {
      if (currentSentinel) observer.unobserve(currentSentinel);
    };
  }, [activeTab, isLoadingFeed, isFetchingMore, pagination.page, pagination.totalPages, updateFilters]);

  if (isLoadingAnalytics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Loading Brand Intelligence & Analytics...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4 text-center">
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
          {error || "Brand details could not be found."}
        </div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Previous Page
        </button>
      </div>
    );
  }

  const { brand, summary, mediaDistribution, longevityDistribution, ctaDistribution, productClusters, topWinners, history, storeTech } = data;

  return (
    <div className="space-y-5 pb-16 animate-in fade-in duration-150">
      {/* 1. Header & Navigation */}
      <div className="flex flex-col gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Back Button & Brand Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                  {brand.displayName}
                </h1>

                {brand.isWatchlisted && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Starred Competitor
                  </span>
                )}

                {summary.evergreenRate >= 30 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="w-3 h-3 text-emerald-500" /> High Evergreen ({summary.evergreenRate}%)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap font-mono">
                <span>Page ID: {brand.pageId}</span>
                {brand.country && <span>• Country: {brand.country}</span>}
                <span>• {summary.totalAdsCaptured} total ads captured</span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Watchlist Toggle */}
            <button
              onClick={handleToggleWatchlist}
              disabled={isTogglingWatchlist}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isWatchlisted
                  ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm shadow-amber-500/20"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
              title={isWatchlisted ? "Remove from Starred Watchlist" : "Add to Starred Watchlist"}
            >
              <Star className={`w-3.5 h-3.5 ${isWatchlisted ? "fill-current" : ""}`} />
              <span>{isWatchlisted ? "Starred" : "Star Brand"}</span>
            </button>

            {/* Refresh Brand Media */}
            <button
              onClick={handleBulkRefreshMedia}
              disabled={isRefreshingMedia}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-sm shadow-indigo-600/20 disabled:opacity-60"
              title="Scrape and update media files via Apify cloud"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMedia ? "animate-spin" : ""}`} />
              <span>{isRefreshingMedia ? "Refreshing..." : "Refresh Media"}</span>
            </button>

            {/* Meta Ad Library External Link */}
            <a
              href={brand.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Meta Library</span>
            </a>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() => setActiveTab("analytics")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "analytics"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Brand Analytics & Strategy</span>
          </button>

          <button
            onClick={() => setActiveTab("creatives")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "creatives"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>All Scanned Creatives ({summary.totalAdsCaptured})</span>
          </button>
        </div>
      </div>

      {/* 2. TAB CONTENT */}
      {activeTab === "analytics" ? (
        <div className="space-y-5 animate-in fade-in duration-150">
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
                            <div>Ads: <strong>{item.results}</strong> ({item.difference > 0 ? `+${item.difference}` : item.difference || 0})</div>
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

          {/* Funnel Diagnostics & Store Tech */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top CTAs */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-sm">
              <div className="flex items-center gap-1.5 pb-2 mb-3 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                <Tag className="w-4 h-4 text-blue-500" />
                <span>Call to Actions (CTAs)</span>
              </div>
              <div className="space-y-1.5 text-xs">
                {ctaDistribution.slice(0, 5).map((item) => (
                  <div key={item.cta} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{item.cta}</span>
                    <span className="text-slate-500 font-mono font-bold">{item.count} ads ({item.percent}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Store Platform & Tracking Tech */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-sm">
              <div className="flex items-center gap-1.5 pb-2 mb-3 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                <Globe className="w-4 h-4 text-indigo-500" />
                <span>Detected Funnel & Tech Stack</span>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Store Platform:</span>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {storeTech.platforms.length > 0 ? (
                      storeTech.platforms.map((p) => (
                        <span key={p} className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 text-[11px]">
                          {p.toUpperCase()}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400">Standard Meta Ad Funnel</span>
                    )}
                  </div>
                </div>

                {storeTech.pixelIds.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Meta Pixel IDs:</span>
                    <div className="flex gap-1.5 mt-1 flex-wrap font-mono text-[11px]">
                      {storeTech.pixelIds.map((px) => (
                        <span key={px} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                          {px}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {storeTech.whatsappNumbers.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">WhatsApp Channels:</span>
                    <div className="flex gap-1.5 mt-1 flex-wrap text-[11px]">
                      {storeTech.whatsappNumbers.map((w) => (
                        <span key={w} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800">
                          <MessageCircle className="w-3 h-3" /> {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Product Portfolio & Angle Testing Depth */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-cyan-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Hero Products & Creative Angle Portfolio
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                {productClusters.length} distinct offers detected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {productClusters.map((p, idx) => (
                <div
                  key={p.productKey || idx}
                  className="rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/40 p-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
                        {p.productName}
                      </h4>
                      {p.isFlagship && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20 shrink-0">
                          Hero Product
                        </span>
                      )}
                    </div>

                    {p.product?.currentPrice && (
                      <div className="text-xs font-black text-indigo-600 dark:text-indigo-400 mb-2">
                        {p.product.currentPrice} {p.product.currency || ""}
                        {p.product.discountOrOffer && (
                          <span className="ml-1.5 text-[10px] text-emerald-600 font-semibold">
                            ({p.product.discountOrOffer})
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px] flex items-center justify-between text-slate-500">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {p.creativeCount} angles ({p.sharePercent}% budget)
                    </span>
                    <div className="flex items-center gap-1.5">
                      {p.videoCount > 0 && <span className="text-purple-600 dark:text-purple-400 font-semibold">{p.videoCount} vid</span>}
                      {p.imageCount > 0 && <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{p.imageCount} img</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top 3 Winning Creatives Spotlight */}
          {topWinners.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Top Winning Creatives Spotlight
                  </h3>
                </div>
                <button
                  onClick={() => setActiveTab("creatives")}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  View All Creatives <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {topWinners.map((ad) => (
                  <AdCard
                    key={ad.id}
                    ad={ad}
                    onArchiveToggle={() => fetchBrandData()}
                    onMediaRefreshed={updateAdInFeed}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 3. ALL CREATIVES FEED TAB */
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Feed Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-between bg-white dark:bg-slate-950/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search ad copy, title, ID..."
                value={feedSearch}
                onChange={(e) => {
                  setFeedSearch(e.target.value);
                  updateFilters({ search: e.target.value, page: 1 });
                }}
                className="w-full bg-slate-50 dark:bg-slate-900 text-xs rounded-lg pl-9 pr-3 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Quick Controls */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              {/* Media Filter */}
              <select
                value={feedMediaType}
                onChange={(e) => {
                  setFeedMediaType(e.target.value);
                  updateFilters({ mediaType: e.target.value as any, page: 1 });
                }}
                className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
              >
                <option value="all">All Media</option>
                <option value="video">Videos Only</option>
                <option value="image">Images Only</option>
                <option value="carousel">Carousel Only</option>
              </select>

              {/* Status Filter */}
              <select
                value={feedStatus}
                onChange={(e) => {
                  setFeedStatus(e.target.value);
                  updateFilters({ status: e.target.value as any, page: 1 });
                }}
                className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
                <option value="archived">Archived</option>
              </select>

              {/* Sort By */}
              <select
                value={feedSortBy}
                onChange={(e) => {
                  setFeedSortBy(e.target.value);
                  updateFilters({ sortBy: e.target.value as any, page: 1 });
                }}
                className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
              >
                <option value="winner_score">🏆 Winner Score</option>
                <option value="duplication_count">🔥 Most Scaled (Copies)</option>
                <option value="started_running_on">Newest Launched</option>
                <option value="oldest">Longest Running</option>
              </select>

              {/* Grid / List Switcher */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-md transition-all ${
                    viewMode === "grid" ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-sm" : "text-slate-500"
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md transition-all ${
                    viewMode === "list" ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-sm" : "text-slate-500"
                  }`}
                  title="List View"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Creatives Grid / List */}
          {isLoadingFeed && ads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs font-semibold">Loading brand creatives...</span>
            </div>
          ) : ads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
              <Layers className="w-8 h-8 text-slate-400 mb-2" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">No creatives match your filter criteria</h4>
            </div>
          ) : (
            <>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {ads.map((ad) => (
                    <AdCard
                      key={ad.id}
                      ad={ad}
                      onArchiveToggle={() => refetchFeed()}
                      onMediaRefreshed={updateAdInFeed}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {ads.map((ad) => (
                    <AdRow
                      key={ad.id}
                      ad={ad}
                      onArchiveToggle={() => refetchFeed()}
                      onMediaRefreshed={updateAdInFeed}
                    />
                  ))}
                </div>
              )}

              {/* Sentinel for infinite scroll */}
              <div ref={sentinelRef} className="h-4 w-full" />

              {isFetchingMore && (
                <div className="flex items-center justify-center py-4 text-xs font-medium text-slate-500 gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  <span>Loading more creatives...</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
