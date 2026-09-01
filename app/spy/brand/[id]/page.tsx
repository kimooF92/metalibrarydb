"use client";

import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAdFeed } from "@/hooks/use-spy";
import { AdCard } from "@/components/spy/ad-card";
import { AdRow } from "@/components/spy/ad-row";
import { ProductCard } from "@/components/products/product-card";
import { resolveProductForRefresh } from "@/lib/product-extraction";
import { ProductDetailsModal } from "@/components/products/product-details-modal";
import { ExportDossierModal } from "@/components/export-dossier-modal";
import { useToast } from "@/components/toast-context";
import { Ad, ScrapedProduct } from "@/types";
import { classifyScalingPattern } from "@/lib/scaling-classifier";
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
  X,
  Zap,
  Check,
  RotateCw,
  DollarSign,
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
  launchVelocity?: {
    launchedLast7Days: number;
    launchedLast30Days: number;
    activeRetentionRate: number;
    longestRunningDays: number;
    avgLifespanDays: number;
    testingIntensity: string;
  };
  commercialStrategy?: {
    totalCatalogProducts: number;
    scrapedProductsCount: number;
    minPrice: number | null;
    maxPrice: number | null;
    avgPrice: number | null;
    currency: string;
    discountedProductsCount: number;
    hasFreeDelivery: boolean;
  };
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
  products?: ScrapedProduct[];
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

  const [activeTab, setActiveTab] = useState<"analytics" | "products" | "creatives">("analytics");
  const [data, setData] = useState<BrandAnalyticsData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [isTogglingWatchlist, setIsTogglingWatchlist] = useState(false);

  // Products Tab State
  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState<"all" | "scraped" | "pending">("all");
  const [productOfferOnly, setProductOfferOnly] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<ScrapedProduct | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [filteredProductForCreatives, setFilteredProductForCreatives] = useState<{
    id: string;
    title: string;
    url: string;
  } | null>(null);

  // Creative feed controls
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [feedSearch, setFeedSearch] = useState("");
  const [feedMediaType, setFeedMediaType] = useState<string>("all");
  const [feedStatus, setFeedStatus] = useState<string>("all");
  const [feedSortBy, setFeedSortBy] = useState<string>("winner_score");

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Sync activeTab from URL query params on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const tab = urlParams.get("tab");
      if (tab === "products" || tab === "creatives" || tab === "analytics") {
        setActiveTab(tab as any);
      }
    }
  }, []);

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
    trackedPageId: data?.brand?.pageId || data?.brand?.id || id,
    search: feedSearch,
    productId: filteredProductForCreatives?.id,
    mediaType: feedMediaType as any,
    status: feedStatus as any,
    sortBy: feedSortBy as any,
    limit: 24,
    enabled: activeTab === "creatives",
  });

  // Batch Sync & Extract Brand Products
  const handleSyncBrandProducts = async (forceRefresh = false) => {
    if (isSyncingProducts || !id) return;
    setIsSyncingProducts(true);
    try {
      const res = await fetch(`/api/spy/brand/${encodeURIComponent(id)}/products/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      });
      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || "Failed to sync brand products");
      }
      showToast({
        type: "success",
        title: "Products Synchronized",
        message: `${resJson.uniqueProductUrlsCount || 0} unique product URLs found: ${resJson.alreadyScrapedCount || 0} linked, ${resJson.newlyScrapedCount || 0} scraped.`,
      });
      await Promise.all([fetchBrandData(), refetchFeed()]);
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Product Sync Error",
        message: err.message || "Failed to sync products from brand ads.",
      });
    } finally {
      setIsSyncingProducts(false);
    }
  };

  // Re-extract individual product
  const handleRefreshProduct = async (productId: string, productOverride?: ScrapedProduct) => {
    const prod = resolveProductForRefresh(productId, data?.products || [], productOverride);
    if (!prod || !prod.url) {
      showToast({
        type: "error",
        title: "Refresh Unavailable",
        message: "This product has no usable landing-page URL to re-extract.",
      });
      return;
    }
    try {
      const res = await fetch("/api/products/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: prod.url, pageId: data?.brand?.pageId, forceRefresh: true }),
      });
      const resJson = await res.json();
      if (resJson.success) {
        showToast({
          type: "success",
          title: "Product Scraped",
          message: `${resJson.product?.title || "Product"} updated successfully.`,
        });
        await fetchBrandData();
      } else {
        throw new Error(resJson.error || "Failed to scrape product");
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Scrape Failed",
        message: err.message || "Could not scrape product page.",
      });
    }
  };

  // Delete individual product
  const handleDeleteProduct = async (productId: string) => {
    try {
      await fetch(`/api/products?id=${productId}`, { method: "DELETE" });
      showToast({
        type: "info",
        title: "Product Deleted",
        message: "Product removed from brand catalog.",
      });
      await fetchBrandData();
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Delete Error",
        message: err.message || "Failed to delete product.",
      });
    }
  };

  // View creatives for a specific product
  const handleViewCreativesForProduct = (product: any) => {
    setFilteredProductForCreatives({
      id: product.id,
      title: product.title || "Product",
      url: product.url,
    });
    setFeedSearch("");
    updateFilters({ search: "", productId: product.id, page: 1 });
    setActiveTab("creatives");
  };

  const handleClearProductFilter = () => {
    setFilteredProductForCreatives(null);
    updateFilters({ productId: undefined, page: 1 });
  };

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

  const {
    brand,
    summary,
    mediaDistribution,
    longevityDistribution,
    ctaDistribution,
    launchVelocity: rawLaunchVelocity,
    commercialStrategy: rawCommercialStrategy,
    productClusters,
    topWinners,
    history,
    storeTech,
  } = data;

  const launchVelocity = rawLaunchVelocity || {
    launchedLast7Days: longevityDistribution?.fresh || 0,
    launchedLast30Days: (longevityDistribution?.fresh || 0) + (longevityDistribution?.scaling || 0),
    activeRetentionRate: summary.totalAdsCaptured > 0 ? Math.round((summary.activeAdsCount / summary.totalAdsCaptured) * 100) : 0,
    longestRunningDays: topWinners[0]?.daysRunning || 0,
    avgLifespanDays: 14,
    testingIntensity: "Active Testing",
  };

  const commercialStrategy = rawCommercialStrategy || {
    totalCatalogProducts: data.products?.length || 0,
    scrapedProductsCount: data.products?.filter((p) => p.scrapeStatus === "success")?.length || 0,
    minPrice: null,
    maxPrice: null,
    avgPrice: null,
    currency: "TND",
    discountedProductsCount: 0,
    hasFreeDelivery: false,
  };

  const historyPoints = [...(history || [])]
    .map((h) => h.results)
    .filter((r): r is number => r !== null)
    .reverse();
  const scalingPattern = classifyScalingPattern(historyPoints, brand.currentResults);

  return (
    <div className="space-y-5 pb-16 animate-in fade-in duration-150">
      {/* 1. Header & Navigation */}
      <div className="flex flex-col gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Back Button, Brand Title & Key Metric Subline */}
          <div className="flex items-start gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 mt-0.5"
              title="Back to Meta Ad Tracker"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                  {brand.displayName}
                </h1>

                {/* Primary Archetype Badge */}
                {scalingPattern.archetype !== "inactive" && (
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border shadow-2xs ${scalingPattern.badgeClass}`}
                    title={`${scalingPattern.label} (${scalingPattern.confidence} confidence): ${scalingPattern.description}`}
                  >
                    <span>{scalingPattern.icon}</span>
                    <span>{scalingPattern.label}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {summary.totalAdsCaptured} total ads captured
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="font-mono text-[11px]">ID: {brand.pageId}</span>
                {brand.country && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span>{brand.country}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Clean Action Button Group */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {/* Watchlist Star Icon Toggle */}
            <button
              onClick={handleToggleWatchlist}
              disabled={isTogglingWatchlist}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isWatchlisted
                  ? "bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                  : "bg-white dark:bg-slate-900 text-slate-400 hover:text-yellow-500 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
              title={isWatchlisted ? "Remove from Starred Competitors" : "Star Competitor"}
            >
              <Star className={`w-4 h-4 ${isWatchlisted ? "fill-amber-500 dark:fill-amber-400" : ""}`} />
            </button>

            {/* Meta Ad Library External Link */}
            <a
              href={brand.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer"
              title="Open Meta Ad Library in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Meta Library</span>
            </a>

            {/* Refresh Brand Media */}
            <button
              onClick={handleBulkRefreshMedia}
              disabled={isRefreshingMedia}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-60"
              title="Scrape and refresh media files via cloud worker"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMedia ? "animate-spin text-indigo-500" : ""}`} />
              <span>{isRefreshingMedia ? "Refreshing..." : "Refresh"}</span>
            </button>

            {/* Export LLM Intelligence Dossier */}
            <button
              onClick={() => setIsDossierModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/25 transition-all cursor-pointer"
              title="Export structured LLM intelligence prompt"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Export Dossier</span>
            </button>
          </div>
        </div>

        {/* Sleek Segmented Tab Switcher */}
        <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 w-fit max-w-full overflow-x-auto gap-1">
          <button
            onClick={() => setActiveTab("analytics")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === "analytics"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Strategy & Overview</span>
          </button>

          <button
            onClick={() => setActiveTab("products")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === "products"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Products ({data?.products?.length ?? productClusters.length})</span>
            {data?.products && data.products.filter((p) => p.scrapeStatus === "pending").length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-black bg-amber-400 text-slate-950">
                {data.products.filter((p) => p.scrapeStatus === "pending").length} new
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("creatives")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === "creatives"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Creatives ({summary.totalAdsCaptured})</span>
            {filteredProductForCreatives && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
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
                  <span>Commercial & Store Footprint</span>
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
                    onClick={() => setActiveTab("products")}
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
                <span className="text-xs text-slate-500">Highest Scaling & Longevity</span>
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
      ) : activeTab === "products" ? (
        /* 2b. PRODUCTS & CATALOG TAB */
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Header & Batch Scrape Action Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-950/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Brand Product Catalog & Landing Pages
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Extract all destination URLs from scanned ads, remove duplicates, and scrape full product details with pricing and offers.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleSyncBrandProducts(false)}
                disabled={isSyncingProducts}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm shadow-indigo-600/25 transition-all cursor-pointer disabled:opacity-60"
              >
                {isSyncingProducts ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                <span>{isSyncingProducts ? "Scanning & Extracting..." : "⚡ Sync & Scrape Brand Products"}</span>
              </button>

              <button
                onClick={() => handleSyncBrandProducts(true)}
                disabled={isSyncingProducts}
                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 text-xs font-semibold transition-all cursor-pointer"
                title="Force re-scrape all URLs from landing pages"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          {(() => {
            const allProds = data?.products || [];
            const scrapedCount = allProds.filter((p) => p.scrapeStatus === "success").length;
            const pendingCount = allProds.filter((p) => p.scrapeStatus === "pending").length;
            const heroProd = allProds[0];

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Unique Products</span>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{allProds.length}</p>
                  <span className="text-[10px] text-slate-500 font-medium">Extracted from {summary.totalAdsCaptured} ads</span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Scraped with Details</span>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{scrapedCount}</p>
                  <span className="text-[10px] text-slate-500 font-medium">{pendingCount} URLs pending scrape</span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Hero Flagship Item</span>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-1">
                    {heroProd?.title || "None detected yet"}
                  </p>
                  <span className="text-[10px] text-indigo-500 font-semibold">
                    {heroProd?.linkedAdsCount ? `${heroProd.linkedAdsCount} active creatives` : "Sync to calculate"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Detected Platform</span>
                  <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-1 uppercase">
                    {storeTech.platforms.length > 0 ? storeTech.platforms.join(", ") : "Meta Ads"}
                  </p>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {storeTech.whatsappNumbers.length > 0 ? `${storeTech.whatsappNumbers.length} WhatsApp numbers` : "No WhatsApp links"}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-between bg-white dark:bg-slate-950/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search products by title, domain, offer..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 text-xs rounded-lg pl-9 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500"
              />
              {productSearch && (
                <button
                  type="button"
                  onClick={() => setProductSearch("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              <select
                value={productStatusFilter}
                onChange={(e) => setProductStatusFilter(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
              >
                <option value="all">All Products</option>
                <option value="scraped">Scraped Only</option>
                <option value="pending">Pending Scrape Only</option>
              </select>

              <button
                type="button"
                onClick={() => setProductOfferOnly(!productOfferOnly)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  productOfferOnly
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold"
                    : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                }`}
              >
                <Tag className="w-3 h-3" />
                <span>With Offers Only</span>
              </button>
            </div>
          </div>

          {/* Product Grid */}
          {(() => {
            const allProds: ScrapedProduct[] = (data?.products as any[]) || [];
            const filtered = allProds.filter((p) => {
              if (productStatusFilter === "scraped" && p.scrapeStatus !== "success") return false;
              if (productStatusFilter === "pending" && p.scrapeStatus === "success") return false;
              if (productOfferOnly && (!p.discountOrOffer || p.discountOrOffer.trim() === "")) return false;
              if (productSearch.trim()) {
                const q = productSearch.toLowerCase();
                const matchTitle = p.title?.toLowerCase().includes(q);
                const matchDomain = p.domain?.toLowerCase().includes(q);
                const matchUrl = p.url?.toLowerCase().includes(q);
                const matchOffer = p.discountOrOffer?.toLowerCase().includes(q);
                if (!matchTitle && !matchDomain && !matchUrl && !matchOffer) return false;
              }
              return true;
            });

            if (allProds.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center p-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950/40 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-500">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      No Scraped Products in Brand Catalog Yet
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mt-1">
                      Click the button below to extract all unique destination URLs from this brand's scanned ads and scrape product prices, offers, and photos.
                    </p>
                  </div>
                  <button
                    onClick={() => handleSyncBrandProducts(false)}
                    disabled={isSyncingProducts}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    <span>⚡ Extract & Scrape Brand Products</span>
                  </button>
                </div>
              );
            }

            if (filtered.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
                  <Search className="w-8 h-8 text-slate-400 mb-2" />
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    No products match your filter criteria
                  </h4>
                  <button
                    onClick={() => {
                      setProductSearch("");
                      setProductStatusFilter("all");
                      setProductOfferOnly(false);
                    }}
                    className="text-xs text-indigo-600 font-semibold mt-2 hover:underline cursor-pointer"
                  >
                    Reset Product Filters
                  </button>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onRefresh={handleRefreshProduct}
                    onViewDetails={(p) => {
                      setSelectedProductForModal(p);
                      setIsProductModalOpen(true);
                    }}
                    onViewCreatives={handleViewCreativesForProduct}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        /* 3. ALL CREATIVES FEED TAB */
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Filter banner if filtered by product */}
          {filteredProductForCreatives && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse shrink-0" />
                <span className="text-slate-600 dark:text-slate-300 truncate">
                  Filtered by Product: <strong className="text-slate-900 dark:text-white font-bold">{filteredProductForCreatives.title}</strong>
                </span>
              </div>
              <button
                onClick={handleClearProductFilter}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold cursor-pointer transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" /> Clear Filter
              </button>
            </div>
          )}

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
                className="w-full bg-slate-50 dark:bg-slate-900 text-xs rounded-lg pl-9 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500"
              />
              {feedSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setFeedSearch("");
                    updateFilters({ search: "", page: 1 });
                  }}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
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
                <option value="winner_score">🏆 Winner Score (Highest First)</option>
                <option value="duplication_count">🔥 Most Scaled (Active Copies)</option>
                <option value="started_running_on">⚡ Newest Launched (Meta Date)</option>
                <option value="oldest">⏳ Longest Running (Evergreen)</option>
                <option value="recently_observed">👁️ Recently Active (Last Verified)</option>
                <option value="first_seen_at">📅 Newly Indexed (First Found)</option>
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
                  {ads.map((ad: Ad) => (
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
                  {ads.map((ad: Ad) => (
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

      {/* Product Details & Competitor Benchmark Modal */}
      <ProductDetailsModal
        isOpen={isProductModalOpen}
        onClose={() => {
          setIsProductModalOpen(false);
          setSelectedProductForModal(null);
        }}
        product={selectedProductForModal}
        onRefresh={handleRefreshProduct}
        onDelete={handleDeleteProduct}
      />

      {/* Export LLM Intelligence Dossier Modal */}
      {brand && (
        <ExportDossierModal
          page={{
            id: brand.id || brand.pageId,
            displayName: brand.displayName,
            pageId: brand.pageId,
            url: brand.url,
            country: brand.country,
            currentResults: brand.currentResults,
            searchType: "page",
            lastChecked: brand.lastChecked,
            lastSuccessAt: brand.lastChecked,
            createdAt: "",
            updatedAt: "",
            status: (brand.status as any) || "success",
          }}
          isOpen={isDossierModalOpen}
          onClose={() => setIsDossierModalOpen(false)}
        />
      )}
    </div>
  );
}
