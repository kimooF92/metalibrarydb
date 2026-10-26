"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { resolveProductForRefresh } from "@/lib/product-extraction";
import { ProductDetailsModal } from "@/components/products/product-details-modal";
import { ExportDossierModal } from "@/components/export-dossier-modal";
import { ManageDomainModal } from "@/components/manage-domain-modal";
import { useToast } from "@/components/toast-context";
import { getSupabase } from "@/lib/supabase";
import { Ad, ScrapedProduct } from "@/types";
import { classifyScalingPattern } from "@/lib/scaling-classifier";
import { useBrandOverlay } from "@/components/spy/brand-overlay-sheet";
import { BrandDeepDiveHeader } from "@/components/spy/brand-deep-dive-header";
import { BrandDeepDiveTabs } from "@/components/spy/brand-deep-dive-tabs";
import { AnalyticsTab } from "@/components/spy/analytics-tab";
import { ProductsTab } from "@/components/spy/products-tab";
import { CreativesTab } from "@/components/spy/creatives-tab";
import {
  ArrowLeft,
  RefreshCw,
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

export interface BrandDeepDiveViewProps {
  id: string;
  isModal?: boolean;
  onClose?: () => void;
}

export function BrandDeepDiveView({
  id,
  isModal = false,
  onClose,
}: BrandDeepDiveViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { setOverlayMeta } = useBrandOverlay();
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [activeTab, setActiveTab] = useState<"analytics" | "products" | "creatives">(() => {
    if (typeof window !== "undefined") {
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      if (tabParam === "products" || tabParam === "creatives") return tabParam;
    }
    return "analytics";
  });
  const [data, setData] = useState<BrandAnalyticsData | null>(null);

  // Sync active brand metadata to overlay header if mounted in modal
  useEffect(() => {
    if (data?.brand) {
      const effResults = data.brand.holdStatus === "on_hold"
        ? (data.brand.lastKnownValidResults ?? data.brand.currentResults)
        : data.brand.currentResults;
      setOverlayMeta({
        displayName: data.brand.displayName,
        currentResults: effResults,
      });
    }
  }, [data?.brand, setOverlayMeta]);
  const [selectedSisterPageId, setSelectedSisterPageId] = useState<string | null>(null);
  const currentSisterPageIdRef = useRef<string | null>(null);
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
  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<ScrapedProduct | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const detailRequestIdRef = useRef(0);
  const [filteredProductForCreatives, setFilteredProductForCreatives] = useState<{
    id: string;
    title: string;
    url: string;
  } | null>(null);

  const [feedRevision, setFeedRevision] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState<Set<"analytics" | "products" | "creatives">>(() => {
    if (typeof window !== "undefined") {
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      if (tabParam === "products" || tabParam === "creatives") return new Set([tabParam]);
    }
    return new Set(["analytics"]);
  });

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
    const requestedSisterPageId = sisterPageIdOverride !== undefined ? sisterPageIdOverride : currentSisterPageIdRef.current;
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
      if (id !== requestedBrandId || currentSisterPageIdRef.current !== requestedSisterPageId) return;

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

    // 0. Mark tab as visited for lazy first-mount
    setVisitedTabs((prev) => (prev.has(nextTab) ? prev : new Set(prev).add(nextTab)));

    // 1. Save scroll position of the active scroll container
    const scrollContainer = isModal
      ? document.getElementById("brand-overlay-scroll-container")
      : document.querySelector("main");
    if (scrollContainer) {
      tabScrollPositionsRef.current[currentTab] = scrollContainer.scrollTop;
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
      // In modal mode, always use replaceState so ESC or Back closes modal directly!
      if (pushHistory && !isModal) {
        window.history.pushState({ tab: nextTab }, "", url.toString());
      } else {
        window.history.replaceState({ tab: nextTab }, "", url.toString());
      }
    }

    // 4. Restore scroll position for target tab
    requestAnimationFrame(() => {
      if (scrollContainer) {
        scrollContainer.scrollTop = tabScrollPositionsRef.current[nextTab] || 0;
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
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => {
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
    currentSisterPageIdRef.current = targetSisterId;
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
            if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
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
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      abortControllerRef.current?.abort();
      revalidateAbortControllerRef.current?.abort();
      productsAbortControllerRef.current?.abort();
    };
  }, [id]);

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
      setFeedRevision((r) => r + 1);
      await fetchBrandData(true);
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
    setVisitedTabs((prev) => (prev.has("creatives") ? prev : new Set(prev).add("creatives")));
    handleTabChange("creatives");
  };

  const handleClearProductFilter = () => {
    setFilteredProductForCreatives(null);
  };

  // Open product details modal with full specifications
  const handleOpenProductDetails = async (p: ScrapedProduct) => {
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
      // Keep lean product card available if detail loading fails.
    }
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
        setFeedRevision((r) => r + 1);
        await fetchBrandData(true);
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
      <BrandDeepDiveHeader
        brand={brand}
        effectiveResults={effectiveResults}
        totalAdsCaptured={summary.totalAdsCaptured}
        scalingPattern={scalingPattern}
        isWatchlisted={isWatchlisted}
        isTogglingWatchlist={isTogglingWatchlist}
        onToggleWatchlist={handleToggleWatchlist}
        isCheckingStatus={isCheckingStatus}
        onCheckAdLibraryNow={handleCheckAdLibraryNow}
        isRefreshingMedia={isRefreshingMedia}
        onBulkRefreshMedia={handleBulkRefreshMedia}
        onOpenDossierModal={() => setIsDossierModalOpen(true)}
        sisterPages={data.sisterPages}
        brandDomain={data.brandDomain}
        selectedSisterPageId={selectedSisterPageId}
        onSelectSisterPage={handleSisterPageSelect}
        onOpenManageDomainModal={() => setIsManageDomainModalOpen(true)}
        onBack={() => (onClose ? onClose() : router.back())}
      />

      <BrandDeepDiveTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        totalAdsCaptured={summary.totalAdsCaptured}
        productCount={
          summary.totalProductsCount ??
          commercialStrategy.totalCatalogProducts ??
          (data?.products?.length ?? productClusters.length)
        }
        pendingProductCount={
          summary.pendingProductsCount !== undefined
            ? summary.pendingProductsCount
            : (data?.products?.filter((p) => p.scrapeStatus === "pending").length || 0)
        }
        hasFilteredProductForCreatives={Boolean(filteredProductForCreatives)}
      />

      {/* 2. TAB CONTENT PANELS (Preserved DOM nodes to eliminate unmounting and scroll collapse) */}
      {visitedTabs.has("analytics") && (
        <div
          id="tabpanel-analytics"
          role="tabpanel"
          aria-labelledby="tab-analytics"
          hidden={activeTab !== "analytics"}
          className={activeTab === "analytics" ? "space-y-5" : "hidden"}
        >
          <AnalyticsTab
            summary={summary}
            history={history}
            mediaDistribution={mediaDistribution}
            longevityDistribution={longevityDistribution}
            launchVelocity={launchVelocity}
            commercialStrategy={commercialStrategy}
            storeTech={storeTech}
            topWinners={topWinners}
            onArchiveToggle={() => fetchBrandData(true)}
            onNavigateToProducts={() => handleTabChange("products")}
          />
        </div>
      )}

      {/* 2b. PRODUCTS & CATALOG TAB */}
      {visitedTabs.has("products") && (
        <div
          id="tabpanel-products"
          role="tabpanel"
          aria-labelledby="tab-products"
          hidden={activeTab !== "products"}
          className={activeTab === "products" ? "space-y-4" : "hidden"}
        >
          <ProductsTab
            products={data?.products || []}
            totalProductsCount={summary.totalProductsCount}
            pendingProductsCount={summary.pendingProductsCount}
            storePlatforms={storeTech.platforms}
            storeWhatsAppNumbers={storeTech.whatsappNumbers}
            isLoadingProductsTab={isLoadingProductsTab}
            productsTabError={productsTabError}
            isSyncingProducts={isSyncingProducts}
            isQueueingLocalRescan={isQueueingLocalRescan}
            onLoadProducts={loadProductsTab}
            onSyncBrandProducts={handleSyncBrandProducts}
            onQueueBrandProductsForLocalRescan={handleQueueBrandProductsForLocalRescan}
            onRefreshProduct={handleRefreshProduct}
            onViewProductDetails={handleOpenProductDetails}
            onViewCreativesForProduct={handleViewCreativesForProduct}
          />
        </div>
      )}

      {/* 3. ALL CREATIVES FEED TAB */}
      {visitedTabs.has("creatives") && (
        <div
          id="tabpanel-creatives"
          role="tabpanel"
          aria-labelledby="tab-creatives"
          hidden={activeTab !== "creatives"}
          className={activeTab === "creatives" ? "space-y-4" : "hidden"}
        >
          <CreativesTab
            trackedPageId={selectedSisterPageId || (!data?.brandDomain ? (data?.brand?.pageId || data?.brand?.id || id) : undefined)}
            brandDomainId={!selectedSisterPageId && data?.brandDomain ? data.brandDomain.id : undefined}
            sisterPageId={selectedSisterPageId || undefined}
            feedRevision={feedRevision}
            filteredProductForCreatives={filteredProductForCreatives}
            onClearProductFilter={handleClearProductFilter}
            isActive={activeTab === "creatives"}
          />
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
