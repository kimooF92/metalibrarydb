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
import { ManageDomainModal } from "@/components/manage-domain-modal";
import { BrandLogo } from "@/components/brand-logo";
import { useToast } from "@/components/toast-context";
import { getSupabase } from "@/lib/supabase";
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
  Laptop,
  ChevronDown,
} from "lucide-react";

interface BrandAnalyticsData {
  success: boolean;
  brand: {
    id: string | null;
    pageId: string;
    displayName: string;
    profilePicUrl?: string | null;
    url: string;
    country: string | null;
    landingPage: string | null;
    isWatchlisted: boolean;
    lastChecked: string | null;
    lastCreativeScan: string | null;
    status: string;
    currentResults: number;
    isTracked: boolean;
    holdStatus?: string | null;
    lastKnownValidResults?: number | null;
    consecutiveZeroScans?: number | null;
    lastSuccessAt?: string | null;
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
    totalProductsCount?: number;
    pendingProductsCount?: number;
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
  brandDomain?: {
    id: string;
    domain: string;
    displayName: string;
  } | null;
  sisterPages?: Array<{
    id: string;
    pageId: string;
    displayName: string;
    pageRole: "primary" | "satellite" | "backup" | null;
    currentResults: number;
  }>;
  isDomainPortfolio?: boolean;
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

  const [activeTab, setActiveTab] = useState<"analytics" | "products" | "creatives">(() => {
    if (typeof window !== "undefined") {
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      if (tabParam === "products" || tabParam === "creatives") return tabParam;
    }
    return "analytics";
  });
  const [data, setData] = useState<BrandAnalyticsData | null>(null);
  const [selectedSisterPageId, setSelectedSisterPageId] = useState<string | null>(null);
  const [isManageDomainModalOpen, setIsManageDomainModalOpen] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [isTogglingWatchlist, setIsTogglingWatchlist] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Products Tab State
  const [isProductsLoaded, setIsProductsLoaded] = useState(false);
  const [isLoadingProductsTab, setIsLoadingProductsTab] = useState(false);
  const [productsTabError, setProductsTabError] = useState<string | null>(null);
  const productsAbortControllerRef = useRef<AbortController | null>(null);
  const productsRequestIdRef = useRef(0);

  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
  const [isQueueingLocalRescan, setIsQueueingLocalRescan] = useState(false);
  const [isScrapeMenuOpen, setIsScrapeMenuOpen] = useState(false);
  const scrapeMenuRef = useRef<HTMLDivElement | null>(null);
  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState<"all" | "scraped" | "pending">("all");
  const [productOfferOnly, setProductOfferOnly] = useState(false);
  const [productActiveOnly, setProductActiveOnly] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<ScrapedProduct | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const detailRequestIdRef = useRef(0);
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

  const tabScrollPositionsRef = useRef<Record<string, number>>({
    analytics: 0,
    products: 0,
    creatives: 0,
  });
  const activeTabRef = useRef<"analytics" | "products" | "creatives">("analytics");
  activeTabRef.current = activeTab;

  // On-demand products fetcher (scope=products)
  const loadProductsTab = async (force = false, sisterPageIdOverride?: string | null) => {
    if (!force && (isProductsLoaded || isLoadingProductsTab)) return;
    setIsLoadingProductsTab(true);
    setProductsTabError(null);

    productsAbortControllerRef.current?.abort();
    const controller = new AbortController();
    productsAbortControllerRef.current = controller;

    const currentReqId = ++productsRequestIdRef.current;
    const requestedSisterPageId = sisterPageIdOverride !== undefined ? sisterPageIdOverride : selectedSisterPageId;
    const requestedBrandId = id;

    try {
      const params = new URLSearchParams({ scope: "products" });
      if (requestedSisterPageId) params.set("sisterPageId", requestedSisterPageId);
      const res = await fetch(`/api/spy/brand/${encodeURIComponent(requestedBrandId)}?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to load products catalog");
      }
      const json = await res.json();
      if (currentReqId !== productsRequestIdRef.current) return;
      if (id !== requestedBrandId || selectedSisterPageId !== requestedSisterPageId) return;

      setData((prev) => (prev ? { ...prev, products: json.products } : prev));
      setIsProductsLoaded(true);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      if (currentReqId !== productsRequestIdRef.current) return;
      setProductsTabError(err.message || "Could not load products catalog.");
    } finally {
      if (currentReqId === productsRequestIdRef.current) {
        setIsLoadingProductsTab(false);
      }
    }
  };

  const handleTabChange = (nextTab: "analytics" | "products" | "creatives", pushHistory = true) => {
    const currentTab = activeTabRef.current;
    if (nextTab === currentTab) return;

    // 1. Save scroll position of the scroll container (<main>)
    const mainEl = document.querySelector("main");
    if (mainEl) {
      tabScrollPositionsRef.current[currentTab] = mainEl.scrollTop;
    }

    // 2. Set active tab
    activeTabRef.current = nextTab;
    setActiveTab(nextTab);

    // 3. Update URL query shallowly without triggering a Next.js re-fetch
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextTab === "analytics") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", nextTab);
      }
      if (pushHistory) {
        window.history.pushState({ tab: nextTab }, "", url.toString());
      } else {
        window.history.replaceState({ tab: nextTab }, "", url.toString());
      }
    }

    // 4. Restore scroll position for target tab
    requestAnimationFrame(() => {
      if (mainEl) {
        mainEl.scrollTop = tabScrollPositionsRef.current[nextTab] || 0;
      }
    });

    // 5. On-demand hydration: if switching to products and not loaded yet, fetch lightweight products
    if (nextTab === "products" && (!data?.products || data.products.length === 0)) {
      loadProductsTab();
    }
  };

  // Sync activeTab from URL query params on mount and on browser popstate (Back/Forward)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const tab = urlParams.get("tab");
      if (tab === "products" || tab === "creatives" || tab === "analytics") {
        activeTabRef.current = tab as any;
        setActiveTab(tab as any);
      }
      if (urlParams.get("active") === "true" || urlParams.get("activeOnly") === "true") {
        setProductActiveOnly(true);
      }
    }

    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tab = urlParams.get("tab");
      const resolvedTab = tab === "products" || tab === "creatives" ? tab : "analytics";
      handleTabChange(resolvedTab as any, false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      abortControllerRef.current?.abort();
      revalidateAbortControllerRef.current?.abort();
      productsAbortControllerRef.current?.abort();
    };
  }, []);

  const canonicalIdRef = useRef<string | null>(null);
  const primaryRequestIdRef = useRef(0);
  const silentRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const revalidateAbortControllerRef = useRef<AbortController | null>(null);

  // Load brand analytics payload
  const fetchBrandData = async (
    forceRefresh = false,
    sisterPageIdOverride?: string | null,
    silent = false
  ) => {
    // Silent revalidations use an independent controller so they don't cancel primary user fetches
    const activeControllerRef = silent ? revalidateAbortControllerRef : abortControllerRef;
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;

    // Separate request tracking so silent background revalidations don't invalidate in-flight primary requests
    const activeRequestIdRef = silent ? silentRequestIdRef : primaryRequestIdRef;
    const currentRequestId = ++activeRequestIdRef.current;

    // Only display blocking loader on cold mount when no data is present
    if (!silent && !data) {
      setIsLoadingAnalytics(true);
    }
    if (!silent) {
      setError(null);
    }
    try {
      const activeSisterId = sisterPageIdOverride !== undefined ? sisterPageIdOverride : selectedSisterPageId;
      const params = new URLSearchParams();
      if (forceRefresh) params.set("_t", Date.now().toString());
      if (activeSisterId) params.set("sisterPageId", activeSisterId);

      // Initial analytics tab load requests lean=true mode to omit 200+ unrendered product cards
      const isProductsTab = activeTabRef.current === "products" || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "products");
      if (!isProductsTab) {
        params.set("lean", "true");
      }

      const queryString = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/spy/brand/${encodeURIComponent(id)}${queryString}`, {
        cache: forceRefresh ? "no-store" : "default",
        signal: controller.signal,
      });
      const json = await res.json();
      if (currentRequestId !== activeRequestIdRef.current) return;
      if (!res.ok) {
        throw new Error(json.error || "Failed to load brand analytics");
      }
      setData(json);
      if (json.products && json.products.length > 0) {
        setIsProductsLoaded(true);
      } else {
        setIsProductsLoaded(false);
      }
      setIsWatchlisted(Boolean(json.brand?.isWatchlisted));
      if (json.brand?.pageId) {
        canonicalIdRef.current = json.brand.pageId;
      }

      // If user navigated with a legacy UUID, automatically replace URL with canonical numeric pageId or clean name
      const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      if (isUuid(id) && json.brand?.pageId && !isUuid(json.brand.pageId)) {
        const currentUrl = new URL(window.location.href);
        router.replace(`/spy/brand/${encodeURIComponent(json.brand.pageId)}${currentUrl.search}`);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      if (currentRequestId !== activeRequestIdRef.current) return;
      if (!silent) {
        setError(err.message || "Failed to load brand data");
      } else {
        console.warn("[Brand Analytics] Silent background revalidation failed:", err.message || err);
        showToast({
          type: "warning",
          title: "Metrics Refresh Delayed",
          message: "Product was updated, but aggregate brand metrics could not be refreshed immediately.",
        });
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current && !silent) {
        setIsLoadingAnalytics(false);
      }
    }
  };

  const handleCheckAdLibraryNow = async () => {
    const pageId = data?.brand?.id || id;
    if (!pageId || isCheckingStatus) return;
    setIsCheckingStatus(true);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [pageId] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to trigger scan");
      showToast({
        title: "⚡ Ad Library Check Enqueued",
        message: "Triggered real-time verification scan for this brand.",
        type: "success",
      });

      // Safety timeout in case worker/network drops connection
      setTimeout(() => {
        setIsCheckingStatus(false);
        fetchBrandData(true);
      }, 45000);
    } catch (err: any) {
      setIsCheckingStatus(false);
      showToast({
        title: "Check Failed",
        message: err.message || "Failed to trigger check",
        type: "error",
      });
    }
  };

  const handleSisterPageSelect = (targetSisterId: string | null) => {
    setSelectedSisterPageId(targetSisterId);
    setIsProductsLoaded(false);
    productsAbortControllerRef.current?.abort();
    fetchBrandData(true, targetSisterId);
    if (activeTabRef.current === "products") {
      loadProductsTab(true, targetSisterId);
    }
  };

  // Real-time row status & ad count updates via Supabase WebSockets (Zero polling, live instant results)
  useEffect(() => {
    const trackedPageId = data?.brand?.id;
    if (!trackedPageId) return;

    const supabase = getSupabase();
    const channel = supabase
      .channel(`realtime-brand-detail-${trackedPageId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tracked_pages",
          filter: `id=eq.${trackedPageId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;

          const rawResults =
            updated.current_results !== undefined && updated.current_results !== null
              ? updated.current_results
              : updated.currentResults !== undefined && updated.currentResults !== null
                ? updated.currentResults
                : null;
          const newCount = rawResults !== null ? Number(rawResults) : null;

          setData((prev) => {
            if (!prev || !prev.brand) return prev;
            return {
              ...prev,
              brand: {
                ...prev.brand,
                status: updated.status ?? prev.brand.status,
                currentResults: newCount !== null ? newCount : prev.brand.currentResults,
                lastChecked: updated.last_checked || updated.lastChecked || prev.brand.lastChecked,
                lastSuccessAt: updated.last_success_at || updated.lastSuccessAt || prev.brand.lastSuccessAt,
                holdStatus: updated.hold_status || updated.holdStatus || prev.brand.holdStatus,
              },
            };
          });

          if (updated.status === "success" || updated.status === "failed") {
            setIsCheckingStatus(false);
            fetchBrandData(true);
            if (updated.status === "success") {
              showToast({
                title: "⚡ Ad Count Updated",
                message: `Ad Library scan complete: ${newCount ?? 0} active ads found.`,
                type: "success",
              });
            }
          } else if (updated.status === "scanning") {
            setIsCheckingStatus(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [data?.brand?.id, showToast]);

  useEffect(() => {
    // If id changed to the canonical ID we just fetched via router.replace, skip duplicate fetch
    if (canonicalIdRef.current && id === canonicalIdRef.current && data) {
      return;
    }
    // Brand identity changed: invalidate products state and cancel inflight product requests
    setIsProductsLoaded(false);
    productsAbortControllerRef.current?.abort();
    fetchBrandData();
    return () => {
      abortControllerRef.current?.abort();
      revalidateAbortControllerRef.current?.abort();
      productsAbortControllerRef.current?.abort();
    };
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
    trackedPageId: selectedSisterPageId || (!data?.brandDomain ? (data?.brand?.pageId || data?.brand?.id || id) : undefined),
    brandDomainId: !selectedSisterPageId && data?.brandDomain ? data.brandDomain.id : undefined,
    sisterPageId: selectedSisterPageId || undefined,
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
      await Promise.all([fetchBrandData(true), refetchFeed()]);
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

  // Queue all brand products for local worker residential rescan
  const handleQueueBrandProductsForLocalRescan = async () => {
    if (isQueueingLocalRescan || !id) return;
    setIsQueueingLocalRescan(true);
    try {
      const res = await fetch(`/api/spy/brand/${encodeURIComponent(id)}/products/queue-rescan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || "Failed to set brand products for local rescan");
      }

      const brandTargetName = data?.brand?.displayName || resJson.brandName || resJson.pageId || id;
      showToast({
        type: "success",
        title: "Queued for Local Rescan",
        message: `${resJson.count || 0} product(s) marked as Pending for local worker. To run now: npm run scrape:products -- --brand "${brandTargetName}"`,
      });

      // Update all products in current state to 'pending'
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          products: (prev.products || []).map((p) => ({
            ...p,
            scrapeStatus: "pending",
            failureReason: "Queued for local worker rescan",
          })),
        };
      });
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Local Rescan Error",
        message: err.message || "Could not queue brand products for local rescan.",
      });
    } finally {
      setIsQueueingLocalRescan(false);
    }
  };

  const refreshingProductIdsRef = useRef<Set<string>>(new Set());

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

    if (refreshingProductIdsRef.current.has(prod.id)) return;
    refreshingProductIdsRef.current.add(prod.id);

    try {
      const res = await fetch("/api/products/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: prod.id,
          url: prod.url,
          pageId: data?.brand?.pageId || prod.pageId,
          forceRefresh: true,
        }),
      });
      const resJson = await res.json();
      if (resJson.success) {
        // 1. In-place optimistic update: update the product card immediately
        if (resJson.product) {
          const updated = resJson.product;
          setData((prev) => {
            if (!prev) return prev;
            const prevProducts = prev.products || [];
            const idx = prevProducts.findIndex((p) => p.id === updated.id || p.url === updated.url);
            const newProducts = [...prevProducts];
            if (idx >= 0) {
              newProducts[idx] = { ...newProducts[idx], ...updated };
            } else {
              newProducts.unshift(updated);
            }
            return { ...prev, products: newProducts };
          });
        }

        showToast({
          type: "success",
          title: "Product Scraped",
          message: `${resJson.product?.title || "Product"} updated successfully.`,
        });

        // 2. Background silent revalidation with forceRefresh=true so server-calculated aggregates refresh without unmounting UI
        fetchBrandData(true, undefined, true);
      } else {
        throw new Error(resJson.error || "Failed to scrape product");
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Scrape Failed",
        message: err.message || "Could not scrape product page.",
      });
    } finally {
      refreshingProductIdsRef.current.delete(prod.id);
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
      await fetchBrandData(true);
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
    handleTabChange("creatives");
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
      fetchBrandData(true);
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
        await Promise.all([fetchBrandData(true), refetchFeed()]);
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

  // Close scrape dropdown menu when clicking outside
  useEffect(() => {
    if (!isScrapeMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (scrapeMenuRef.current && !scrapeMenuRef.current.contains(e.target as Node)) {
        setIsScrapeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isScrapeMenuOpen]);

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

  if (isLoadingAnalytics && !data) {
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
    totalCatalogProducts: summary.totalProductsCount ?? (data.products?.length || 0),
    scrapedProductsCount:
      summary.totalProductsCount !== undefined && summary.pendingProductsCount !== undefined
        ? Math.max(0, summary.totalProductsCount - summary.pendingProductsCount)
        : (data.products?.filter((p) => p.scrapeStatus === "success")?.length || 0),
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
  const effectiveResults = brand.holdStatus === "on_hold"
    ? (brand.lastKnownValidResults ?? brand.currentResults)
    : brand.currentResults;
  const scalingPattern = classifyScalingPattern(historyPoints, effectiveResults);

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

            {/* Brand Logo Avatar */}
            <BrandLogo
              name={brand.displayName}
              url={brand.profilePicUrl}
              domain={brand.landingPage || (brand.displayName?.includes(".") ? brand.displayName : null)}
              pageId={brand.pageId}
              size="lg"
              className="mt-0.5 shrink-0"
            />

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                  {brand.displayName}
                </h1>

                {brand.holdStatus === "on_hold" && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 shadow-2xs"
                    title="Brand account is on pause / hold (under grace period recheck)"
                  >
                    <span>⏸️</span>
                    <span>On Hold / Paused</span>
                  </span>
                )}
                {brand.holdStatus === "inactive" && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 shadow-2xs"
                    title="Brand account is confirmed inactive (0 active ads)"
                  >
                    <span>⚫</span>
                    <span>Off-Air / Inactive</span>
                  </span>
                )}

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

            {/* Live Count Check Button */}
            <button
              onClick={handleCheckAdLibraryNow}
              disabled={isCheckingStatus}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer disabled:opacity-60"
              title="Verify active ad count live via Trigger.dev"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? "animate-spin text-indigo-500" : ""}`} />
              <span>{isCheckingStatus ? "Scanning..." : "Check Count"}</span>
            </button>

            {/* Refresh Brand Media */}
            <button
              onClick={handleBulkRefreshMedia}
              disabled={isRefreshingMedia}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-60"
              title="Scrape and refresh media files via cloud worker"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMedia ? "animate-spin text-indigo-500" : ""}`} />
              <span>{isRefreshingMedia ? "Refreshing..." : "Refresh Media"}</span>
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

        {/* On Hold Notification Banner */}
        {brand.holdStatus === "on_hold" && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs">
            <span className="text-base shrink-0">⏸️</span>
            <div>
              <strong>Brand on Hold:</strong> Meta Ad Library returned 0 active ads during the last scan, but existing ads and products are temporarily preserved under grace period ({brand.consecutiveZeroScans || 1}/3 scans).
            </div>
          </div>
        )}

        {/* Inactive Brand Notification Banner */}
        {brand.holdStatus === "inactive" && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-base shrink-0">💤</span>
              <div>
                <strong>Brand Inactive (Confirmed Dark):</strong> 0 active ads detected over 3 consecutive scans. The system rechecks this brand adaptively for ad relaunches.
              </div>
            </div>
            <button
              onClick={handleCheckAdLibraryNow}
              disabled={isCheckingStatus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
              title="Trigger immediate live count check on Meta Ad Library"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? "animate-spin" : ""}`} />
              <span>{isCheckingStatus ? "Checking..." : "Check Ad Library Now"}</span>
            </button>
          </div>
        )}

        {/* Domain Portfolio Sister Pages Filter */}
        {data.sisterPages && data.sisterPages.length > 1 && (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <Globe className="w-3 h-3" />
                  <span>Domain Portfolio ({data.brandDomain?.domain})</span>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {data.sisterPages.length} linked Facebook pages driving traffic to this store
                </span>
              </div>

              {data.brandDomain && (
                <button
                  type="button"
                  onClick={() => setIsManageDomainModalOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 hover:underline cursor-pointer"
                >
                  <span>⚙️ Manage Portfolio</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-1">
              <button
                type="button"
                onClick={() => handleSisterPageSelect(null)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  selectedSisterPageId === null
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>All Pages (Combined)</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    selectedSisterPageId === null
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {summary.totalAdsCaptured}
                </span>
              </button>

              {data.sisterPages.map((sp) => {
                const isSelected = selectedSisterPageId === sp.pageId || selectedSisterPageId === sp.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => handleSisterPageSelect(sp.pageId || sp.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {sp.pageRole === "primary" ? (
                      <Star
                        className={`w-3.5 h-3.5 ${
                          isSelected ? "text-amber-300 fill-amber-300" : "text-amber-500 fill-amber-500"
                        }`}
                      />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    )}
                    <span>{sp.displayName || `Page ${sp.pageId}`}</span>
                    {sp.pageRole === "primary" && (
                      <span
                        className={`text-[9.5px] font-bold px-1 rounded ${
                          isSelected
                            ? "bg-white/20 text-white"
                            : "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        Flagship
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {sp.currentResults ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sleek Segmented Tab Switcher */}
        <div
          role="tablist"
          aria-label="Brand Deep Dive Navigation Tabs"
          className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 w-fit max-w-full overflow-x-auto gap-1"
        >
          <button
            type="button"
            id="tab-analytics"
            role="tab"
            aria-selected={activeTab === "analytics"}
            aria-controls="tabpanel-analytics"
            onClick={() => handleTabChange("analytics")}
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
            type="button"
            id="tab-products"
            role="tab"
            aria-selected={activeTab === "products"}
            aria-controls="tabpanel-products"
            onClick={() => handleTabChange("products")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === "products"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>
              Products (
                {summary.totalProductsCount ??
                  commercialStrategy.totalCatalogProducts ??
                  (data?.products?.length ?? productClusters.length)}
              )
            </span>
            {(summary.pendingProductsCount !== undefined
              ? summary.pendingProductsCount > 0
              : (data?.products && data.products.filter((p) => p.scrapeStatus === "pending").length > 0)) && (
              <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-black bg-amber-400 text-slate-950">
                {summary.pendingProductsCount !== undefined
                  ? summary.pendingProductsCount
                  : data?.products?.filter((p) => p.scrapeStatus === "pending").length}{" "}
                new
              </span>
            )}
          </button>

          <button
            type="button"
            id="tab-creatives"
            role="tab"
            aria-selected={activeTab === "creatives"}
            aria-controls="tabpanel-creatives"
            onClick={() => handleTabChange("creatives")}
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

      {/* 2. TAB CONTENT PANELS (Preserved DOM nodes to eliminate unmounting and scroll collapse) */}
      <div
        id="tabpanel-analytics"
        role="tabpanel"
        aria-labelledby="tab-analytics"
        className={activeTab === "analytics" ? "space-y-5" : "hidden"}
      >
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
                    type="button"
                    onClick={() => handleTabChange("products")}
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
                    onArchiveToggle={() => fetchBrandData(true)}
                    onMediaRefreshed={updateAdInFeed}
                  />
                ))}
              </div>
            </div>
          )}
      </div>

      {/* 2b. PRODUCTS & CATALOG TAB */}
      <div
        id="tabpanel-products"
        role="tabpanel"
        aria-labelledby="tab-products"
        className={activeTab === "products" ? "space-y-4" : "hidden"}
      >
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

            {/* Split-Button with Unified Scraping & Rescan Dropdown */}
            <div className="relative inline-flex items-stretch shrink-0 rounded-lg shadow-sm" ref={scrapeMenuRef}>
              <button
                type="button"
                onClick={() => handleSyncBrandProducts(false)}
                disabled={isSyncingProducts || isQueueingLocalRescan}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-l-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
                title="Extract all destination URLs from ads and scrape new product details"
              >
                {isSyncingProducts ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                <span>
                  {isSyncingProducts
                    ? "Scanning & Extracting..."
                    : isQueueingLocalRescan
                    ? "Queueing..."
                    : "Sync & Scrape Products"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsScrapeMenuOpen((prev) => !prev)}
                disabled={isSyncingProducts || isQueueingLocalRescan}
                className="px-2.5 py-2 rounded-r-lg bg-indigo-700 hover:bg-indigo-600 text-white border-l border-indigo-500/40 text-xs transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center"
                title="More extraction & scraping options"
                aria-expanded={isScrapeMenuOpen}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isScrapeMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Unified Dropdown Menu */}
              {isScrapeMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-76 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Scraping & Rescan Options
                    </span>
                  </div>

                  {/* Option 1: Force Full Re-scrape */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsScrapeMenuOpen(false);
                      handleSyncBrandProducts(true);
                    }}
                    disabled={isSyncingProducts || isQueueingLocalRescan}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2.5 transition-colors cursor-pointer text-slate-700 dark:text-slate-200 disabled:opacity-50"
                  >
                    <RotateCw className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Force Re-scrape All URLs
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Bypass cache to re-extract live pricing & content from all landing pages.
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Queue for Local Rescan */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsScrapeMenuOpen(false);
                      handleQueueBrandProductsForLocalRescan();
                    }}
                    disabled={isSyncingProducts || isQueueingLocalRescan}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2.5 transition-colors cursor-pointer text-slate-700 dark:text-slate-200 disabled:opacity-50 border-t border-slate-100 dark:border-slate-800/60"
                  >
                    <Laptop className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Queue for Local Residential Rescan
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Mark all products as pending for your local residential worker (fixes USD prices & bypasses Cloudflare).
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          {(() => {
            const allProds = data?.products || [];
            const displayTotal = summary.totalProductsCount ?? allProds.length;
            const pendingCount = summary.pendingProductsCount ?? allProds.filter((p) => p.scrapeStatus === "pending").length;
            const scrapedCount =
              summary.totalProductsCount !== undefined && summary.pendingProductsCount !== undefined
                ? Math.max(0, summary.totalProductsCount - summary.pendingProductsCount)
                : allProds.filter((p) => p.scrapeStatus === "success").length;
            const activeProdsCount = allProds.filter((p) => p.brandHoldStatus !== "inactive" && (p.activeAdsCount || 0) > 0).length;
            const heroProd = allProds[0];

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Unique Products</span>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{displayTotal}</p>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {activeProdsCount > 0 ? `${activeProdsCount} active on air • ` : ""}{Math.max(0, displayTotal - activeProdsCount)} off-air
                  </span>
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
              {/* Active Only Filter Toggle */}
              <button
                type="button"
                onClick={() => setProductActiveOnly(!productActiveOnly)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer select-none ${
                  productActiveOnly
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-bold shadow-2xs"
                    : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                title={productActiveOnly ? "Currently showing active products only. Click to show all." : "Filter products that currently have active running ads"}
              >
                <span className={`w-2 h-2 rounded-full ${productActiveOnly ? "bg-emerald-500 animate-pulse" : "bg-emerald-500/60"}`} />
                <span>Active Only</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  productActiveOnly
                    ? "bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}>
                  {(data?.products || []).filter((p: any) => p.brandHoldStatus !== "inactive" && (p.activeAdsCount || 0) > 0).length}
                </span>
              </button>

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
              if (productActiveOnly) {
                const isInactive =
                  p.brandHoldStatus === "inactive" ||
                  (typeof p.activeAdsCount === "number" && p.activeAdsCount === 0);
                if (isInactive || (p.activeAdsCount || 0) <= 0) return false;
              }
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
              if (isLoadingProductsTab) {
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
                      >
                        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
                        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                        <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                );
              }

              if (productsTabError) {
                return (
                  <div className="flex flex-col items-center justify-center p-10 border border-red-200 dark:border-red-900/50 rounded-2xl bg-red-50/50 dark:bg-red-950/20 text-center space-y-3">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                      {productsTabError}
                    </p>
                    <button
                      type="button"
                      onClick={() => loadProductsTab(true)}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Retry Loading Catalog</span>
                    </button>
                  </div>
                );
              }

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
                    <span>Extract & Scrape Brand Products</span>
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
                      setProductActiveOnly(false);
                    }}
                    className="text-xs text-indigo-600 font-semibold mt-2 hover:underline cursor-pointer"
                  >
                    Reset Product Filters
                  </button>
                </div>
              );
            }

            return (
              <div className="products-cards-grid">
                {filtered.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onRefresh={handleRefreshProduct}
                    onViewDetails={async (p) => {
                      const requestId = ++detailRequestIdRef.current;
                      setSelectedProductForModal(p);
                      setIsProductModalOpen(true);
                      try {
                        const res = await fetch(`/api/products?id=${encodeURIComponent(p.id)}&details=true`);
                        const json = await res.json();
                        const detailedProduct = json.products?.[0];
                        if (requestId === detailRequestIdRef.current && res.ok && detailedProduct) {
                          setSelectedProductForModal(detailedProduct);
                        }
                      } catch {
                        // Keep the lean product card available if detail loading fails.
                      }
                    }}
                    onViewCreatives={handleViewCreativesForProduct}
                  />
                ))}
              </div>
            );
          })()}
      </div>

      {/* 3. ALL CREATIVES FEED TAB */}
      <div
        id="tabpanel-creatives"
        role="tabpanel"
        aria-labelledby="tab-creatives"
        className={activeTab === "creatives" ? "space-y-4" : "hidden"}
      >
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

      {/* Domain Portfolio Sister Pages Manager Modal */}
      {data.brandDomain && (
        <ManageDomainModal
          domainOrId={data.brandDomain.domain || data.brandDomain.id}
          isOpen={isManageDomainModalOpen}
          onClose={() => setIsManageDomainModalOpen(false)}
          onSuccess={() => fetchBrandData(true)}
        />
      )}
    </div>
  );
}
