"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BrandDeepDiveViewProps } from "../types";
import type { BrandTabId } from "@/components/spy/brand-deep-dive-tabs";
import type { ScrapedProduct } from "@/types";
import { useBrandTabs } from "../hooks/use-brand-tabs";
import { useBrandAnalytics } from "../hooks/use-brand-analytics";
import { useBrandActions } from "../hooks/use-brand-actions";
import { useBrandOverlay } from "@/components/spy/brand-overlay-sheet";
import { classifyScalingPattern } from "@/lib/scaling-classifier";
import { BrandDeepDiveHeader } from "@/components/spy/brand-deep-dive-header";
import { BrandDeepDiveTabs } from "@/components/spy/brand-deep-dive-tabs";
import { AnalyticsTab } from "@/components/spy/analytics-tab";
import { BrandCadenceSection } from "@/components/spy/brand-cadence-section";
import { ProductsTab } from "@/components/spy/products-tab";
import { CreativesTab } from "@/components/spy/creatives-tab";
import { ProductDetailsModal } from "@/components/products/product-details-modal";
import { ExportDossierModal } from "@/components/export-dossier-modal";
import { ManageDomainModal } from "@/components/manage-domain-modal";
import { ArrowLeft, RefreshCw } from "lucide-react";

export function BrandDeepDiveView({
  id,
  isModal = false,
  initialTab,
  onClose,
}: BrandDeepDiveViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setOverlayMeta, onClose: overlayOnClose } = useBrandOverlay();

  // Search param deep-linking
  const searchProductId =
    searchParams?.get("productId") ||
    searchParams?.get("id") ||
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("productId") ||
        new URLSearchParams(window.location.search).get("id")
      : null);

  const [feedRevision, setFeedRevision] = useState(0);
  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
  const [isManageDomainModalOpen, setIsManageDomainModalOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] =
    useState<ScrapedProduct | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [filteredProductForCreatives, setFilteredProductForCreatives] = useState<{
    id: string;
    title: string;
    url: string;
  } | null>(null);

  const detailRequestIdRef = useRef(0);
  const initialProductIdRef = useRef<string | null>(searchProductId || null);

  // Auto-open product modal if productId is present in URL search params on initial mount
  useEffect(() => {
    const targetProductId = initialProductIdRef.current;
    if (!targetProductId) return;
    initialProductIdRef.current = null;

    async function hydrateProductModal() {
      try {
        const res = await fetch(
          `/api/products?id=${encodeURIComponent(targetProductId!)}&details=true`
        );
        const json = await res.json();
        const product = json.products?.[0];
        if (product) {
          setSelectedProductForModal(product);
          setIsProductModalOpen(true);
        }
      } catch (err) {
        console.warn("[BrandDeepDive] Failed to hydrate deep-linked product modal:", err);
      }
    }

    hydrateProductModal();
  }, []);

  // Continuous sync between active product modal state and URL address bar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (isProductModalOpen && selectedProductForModal?.id) {
      if (url.searchParams.get("productId") !== selectedProductForModal.id) {
        url.searchParams.set("productId", selectedProductForModal.id);
        window.history.replaceState(null, "", url.toString());
      }
    } else if (!isProductModalOpen) {
      if (url.searchParams.has("productId") || url.searchParams.has("id")) {
        url.searchParams.delete("productId");
        url.searchParams.delete("id");
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, [isProductModalOpen, selectedProductForModal?.id]);

  // Domain Tab Navigation Hook (with popstate & scroll-restoration handling)
  const {
    activeTab,
    visitedTabs,
    setVisitedTabs,
    handleTabChange,
  } = useBrandTabs({
    id,
    isModal,
    initialTab,
    onProductsNeeded: () => loadProductsTab(true),
    onProductsRefreshNeeded: () => loadProductsTab(true),
  });

  // Domain Data & Realtime Hook
  const {
    data,
    setData,
    selectedSisterPageId,
    isLoadingAnalytics,
    error,
    isProductsLoaded,
    isLoadingProductsTab,
    productsTabError,
    loadProductsTab,
    fetchBrandData,
    handleSisterPageSelect,
  } = useBrandAnalytics({
    id,
    activeTab,
  });

  useEffect(() => {
    if (data?.brand && setOverlayMeta) {
      setOverlayMeta({
        displayName: data.brand.displayName,
        currentResults: data.brand.currentResults,
      });
    }
  }, [data?.brand, setOverlayMeta]);

  // Domain Actions Hook (with locked ref set & internal toast feedback)
  const {
    isCheckingStatus,
    isWatchlisted,
    isTogglingWatchlist,
    isRefreshingMedia,
    isSyncingProducts,
    isQueueingLocalRescan,
    handleCheckAdLibraryNow,
    handleToggleWatchlist,
    handleBulkRefreshMedia,
    handleSyncBrandProducts,
    handleQueueBrandProductsForLocalRescan,
    handleRefreshProduct,
    handleDeleteProduct,
  } = useBrandActions({
    id,
    brand: data?.brand || null,
    products: data?.products || [],
    setData,
    fetchBrandData,
    onFeedRevisionIncrement: () => setFeedRevision((r) => r + 1),
  });

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
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
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
    activeRetentionRate:
      summary.totalAdsCaptured > 0
        ? Math.round((summary.activeAdsCount / summary.totalAdsCaptured) * 100)
        : 0,
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
  const effectiveResults =
    brand.holdStatus === "on_hold"
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
        onBack={() => (onClose ? onClose() : overlayOnClose ? overlayOnClose() : router.back())}
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
        winRate={data?.cadence?.productLifecycleFunnel.productWinRate}
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
            cadence={data?.cadence}
            onViewProductDetails={handleOpenProductDetails}
            onViewCreativesForProduct={handleViewCreativesForProduct}
            onNavigateToCreatives={() => handleTabChange("creatives")}
            onNavigateToCadence={() => handleTabChange("cadence")}
            onArchiveToggle={() => fetchBrandData(true)}
            onNavigateToProducts={() => handleTabChange("products")}
          />
        </div>
      )}

      {/* 2b. TESTING CADENCE & LAUNCH HISTORY TAB */}
      {visitedTabs.has("cadence") && (
        <div
          id="tabpanel-cadence"
          role="tabpanel"
          aria-labelledby="tab-cadence"
          hidden={activeTab !== "cadence"}
          className={activeTab === "cadence" ? "space-y-5" : "hidden"}
        >
          {data?.cadence && (
            <BrandCadenceSection
              cadence={data.cadence}
              onViewProductDetails={handleOpenProductDetails}
              onViewCreativesForProduct={handleViewCreativesForProduct}
              onNavigateToCreatives={() => handleTabChange("creatives")}
            />
          )}
        </div>
      )}

      {/* 2c. PRODUCTS & CATALOG TAB */}
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
            trackedPageId={
              selectedSisterPageId ||
              (!data?.brandDomain ? (data?.brand?.pageId || data?.brand?.id || id) : undefined)
            }
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
