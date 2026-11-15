"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import NextImage from "next/image";
import { ScrapedProduct, Ad, CarouselItemSummary } from "@/types";
import { materializeCarouselItem } from "@/lib/carousel-grouping";
import { useToast } from "@/components/toast-context";
import {
  ChevronLeft,
  ChevronRight,
  Package,
  Film,
  Boxes,
  Building2,
  Layers,
  Pause,
} from "lucide-react";
import {
  ModalTab,
  getSupplierPlatformInfo,
} from "./modal/modal-types";
import { ModalHeader } from "./modal/modal-header";
import { ModalProductHeroCard } from "./modal/modal-product-hero-card";
import { ModalProductSpecsSection } from "./modal/modal-product-specs-section";
import { ModalSourcingSection } from "./modal/modal-sourcing-section";
import { ModalNetworkIntelligence } from "./modal/modal-network-intelligence";
import { ModalAdGallery } from "./modal/modal-ad-gallery";
import { ModalEditForm, ModalEditFormHandle } from "./modal/modal-edit-form";
import { ProductCreativeView } from "./modal/product-creative-modal";
import { cn } from "@/lib/utils";
import { isGenuineVideoUrl, isFbCdnUrlExpired } from "@/lib/fb-cdn";
import { requestProductAdVerification, applyVerifiedCountsToProduct } from "@/lib/product-verify-client";

// Re-export getSupplierPlatformInfo for backward compatibility
export { getSupplierPlatformInfo };

export interface ProductDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ScrapedProduct | null;
  onRefresh?: (productId: string, product?: ScrapedProduct) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
  onProductUpdate?: (updatedProduct: ScrapedProduct) => void;
  currentIndex?: number;
  totalCount?: number;
  hasPrev?: boolean;
  hasNext?: boolean;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
}

export function ProductDetailsModal({
  isOpen,
  onClose,
  product,
  onRefresh,
  onDelete,
  onProductUpdate,
  currentIndex = -1,
  totalCount = 0,
  hasPrev = false,
  hasNext = false,
  onNavigatePrev,
  onNavigateNext,
}: ProductDetailsModalProps) {
  const { showToast } = useToast();

  // Internal product state synced to prop, allowing modal to update immediately even if caller omits onProductUpdate
  const [currentProduct, setCurrentProduct] = useState<ScrapedProduct | null>(product);
  const [activeTab, setActiveTab] = useState<ModalTab>("ads");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editFormRef = useRef<ModalEditFormHandle>(null);
  const carouselSwitchRequestIdRef = useRef(0);
  const [linkedAds, setLinkedAds] = useState<Ad[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [network, setNetwork] = useState<any>(null);
  const [loadingNetwork, setLoadingNetwork] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isQueueingVerify, setIsQueueingVerify] = useState(false);
  const [isQueueingLocalRescan, setIsQueueingLocalRescan] = useState(false);
  const [lightboxAd, setLightboxAd] = useState<Ad | null>(null);
  const [activeLightboxAdsList, setActiveLightboxAdsList] = useState<Ad[]>([]);
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number>(0);
  const [isRefreshingLightboxAd, setIsRefreshingLightboxAd] = useState(false);

  const handleRefreshLightboxAd = async (targetAd?: Ad) => {
    const adToRefresh = targetAd || lightboxAd;
    if (!adToRefresh) return;
    setIsRefreshingLightboxAd(true);
    try {
      const res = await fetch(`/api/spy/ads/${adToRefresh.id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.ad) {
        setLightboxAd(data.ad);
        setActiveLightboxAdsList((prev) => prev.map((a) => (a.id === data.ad.id ? { ...a, ...data.ad } : a)));
        setLinkedAds((prev) => prev.map((a) => (a.id === data.ad.id ? { ...a, ...data.ad } : a)));
        showToast({
          type: "success",
          title: "Media Refreshed",
          message: data.message || "Fresh ad media loaded from Meta.",
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Refresh Error",
        message: "Failed to refresh ad media.",
      });
    } finally {
      setIsRefreshingLightboxAd(false);
    }
  };

  const handleOpenAdPreview = (ad: Ad, filteredAds?: Ad[]) => {
    const list = filteredAds && filteredAds.length > 0 ? filteredAds : linkedAds;
    setActiveLightboxAdsList(list);
    const idx = list.findIndex((a) => a.id === ad.id);
    setActiveLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxAd(ad);

    // Auto-refresh strictly when modal is opened AND media CDN link is expired
    const vid = ad.mediaUrls?.find(isGenuineVideoUrl) || null;
    const thumb = ad.signedThumbnailUrl || ad.thumbnailUrl || (ad.mediaUrls?.[0] ?? null);
    const isVidExpired = vid ? isFbCdnUrlExpired(vid) : false;
    const isImgExpired = thumb ? isFbCdnUrlExpired(thumb) : false;

    if ((isVidExpired || isImgExpired) && !isRefreshingLightboxAd) {
      setIsRefreshingLightboxAd(true);
      fetch(`/api/spy/ads/${ad.id}/refresh`, { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.ad) {
            setLightboxAd(data.ad);
            setActiveLightboxAdsList((prev) => prev.map((a) => (a.id === data.ad.id ? { ...a, ...data.ad } : a)));
            setLinkedAds((prev) => prev.map((a) => (a.id === data.ad.id ? { ...a, ...data.ad } : a)));
          }
        })
        .catch(() => { })
        .finally(() => setIsRefreshingLightboxAd(false));
    }
  };

  const handleNavigateLightboxAdIndex = (newIndex: number) => {
    const list = activeLightboxAdsList.length > 0 ? activeLightboxAdsList : linkedAds;
    if (newIndex >= 0 && newIndex < list.length) {
      const nextAd = list[newIndex];
      setActiveLightboxIndex(newIndex);
      setLightboxAd(nextAd);

      // Check if newly navigated ad has expired media
      const vid = nextAd.mediaUrls?.find(isGenuineVideoUrl) || null;
      const thumb = nextAd.signedThumbnailUrl || nextAd.thumbnailUrl || (nextAd.mediaUrls?.[0] ?? null);
      const isVidExpired = vid ? isFbCdnUrlExpired(vid) : false;
      const isImgExpired = thumb ? isFbCdnUrlExpired(thumb) : false;

      if ((isVidExpired || isImgExpired) && !isRefreshingLightboxAd) {
        setIsRefreshingLightboxAd(true);
        fetch(`/api/spy/ads/${nextAd.id}/refresh`, { method: "POST" })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.ad) {
              setLightboxAd(data.ad);
              setActiveLightboxAdsList((prev) => prev.map((a) => (a.id === data.ad.id ? { ...a, ...data.ad } : a)));
              setLinkedAds((prev) => prev.map((a) => (a.id === data.ad.id ? { ...a, ...data.ad } : a)));
            }
          })
          .catch(() => { })
          .finally(() => setIsRefreshingLightboxAd(false));
      }
    }
  };

  const fetchLinkedAds = useCallback(async (productId: string) => {
    setLoadingAds(true);
    try {
      const res = await fetch(`/api/spy/ads?productId=${encodeURIComponent(productId)}&limit=50&includeMedia=true`);
      if (res.ok) {
        const data = await res.json();
        const rawAds: Ad[] = data.ads || data.items || [];
        // Deduplicate ads by id, adArchiveId, and normalized media URL
        const seenArchiveIds = new Set<string>();
        const seenMediaSigs = new Set<string>();
        const seenIds = new Set<string>();
        const uniqueList: Ad[] = [];

        for (const ad of rawAds) {
          if (!ad || !ad.id) continue;
          if (seenIds.has(ad.id)) continue;
          const archiveId = ad.adArchiveId?.trim();
          if (archiveId && seenArchiveIds.has(archiveId)) continue;

          const rawThumb = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0] || "";
          const baseThumb = rawThumb.split("?")[0].trim();
          const sig = baseThumb && baseThumb.length > 10 ? `${ad.mediaType}:${baseThumb}` : null;
          if (sig && seenMediaSigs.has(sig)) continue;

          seenIds.add(ad.id);
          if (archiveId) seenArchiveIds.add(archiveId);
          if (sig) seenMediaSigs.add(sig);
          uniqueList.push(ad);
        }

        setLinkedAds(uniqueList);
      }
    } catch (err) {
      console.error("Failed to fetch linked ads:", err);
    } finally {
      setLoadingAds(false);
    }
  }, []);

  const fetchNetworkIntelligence = useCallback(async (productId: string) => {
    setLoadingNetwork(true);
    try {
      const res = await fetch(`/api/products/network?productId=${productId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.network) {
          setNetwork(data.network);
        }
      }
    } catch (err) {
      console.error("Failed to fetch network intelligence:", err);
    } finally {
      setLoadingNetwork(false);
    }
  }, []);

  // Sync state on product prop change
  useEffect(() => {
    carouselSwitchRequestIdRef.current += 1;
    if (product) {
      setCurrentProduct(product);
      setIsEditMode(false);
      setLightboxAd(null);
      fetchLinkedAds(product.id);
      fetchNetworkIntelligence(product.id);
    }
  }, [product, fetchLinkedAds, fetchNetworkIntelligence]);

  // Keyboard navigation for ← and →
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (isEditMode) return;
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (lightboxAd) {
          setLightboxAd(null);
        } else {
          onClose();
        }
        return;
      }

      // If ad creative modal is open, do not handle ArrowLeft / ArrowRight here
      // ProductCreativeModal handles its own sibling navigation
      if (lightboxAd) {
        return;
      }

      if (e.key === "ArrowLeft") {
        if (hasPrev && onNavigatePrev) {
          e.preventDefault();
          onNavigatePrev();
        }
      } else if (e.key === "ArrowRight") {
        if (hasNext && onNavigateNext) {
          e.preventDefault();
          onNavigateNext();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isEditMode, hasPrev, hasNext, onNavigatePrev, onNavigateNext, lightboxAd]);

  if (!isOpen || !currentProduct) return null;

  const handleProductUpdateInternal = (updated: ScrapedProduct) => {
    setCurrentProduct(updated);
    onProductUpdate?.(updated);
  };

  const handleFavoriteToggle = async () => {
    if (!currentProduct) return;
    const nextState = !currentProduct.isFavorite;
    const updated = { ...currentProduct, isFavorite: nextState };
    handleProductUpdateInternal(updated);

    try {
      await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentProduct.id, isFavorite: nextState }),
      });
      showToast({
        type: "success",
        title: nextState ? "Starred" : "Removed",
        message: nextState ? "Added product to favorites" : "Removed product from favorites",
      });
    } catch {
      showToast({
        type: "error",
        title: "Favorite Error",
        message: "Failed to update favorite status.",
      });
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh(currentProduct.id, currentProduct);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleQueueVerify = async () => {
    if (!currentProduct?.id || isQueueingVerify) return;
    setIsQueueingVerify(true);
    try {
      const data = await requestProductAdVerification(currentProduct.id, (msg) => {
        showToast({
          type: "info",
          title: "Verification Dispatched",
          message: msg,
        });
      });

      if (data.isCompleted) {
        const activeText = `${data.activeCount ?? 0} active`;
        const inactiveText = `${data.inactiveCount ?? 0} inactive`;
        showToast({
          type: "success",
          title: "Linked Ads Verified",
          message: `Verified ${data.checkedCount ?? 0} ads (${activeText}, ${inactiveText}). Media refreshed.`,
        });

        const updated = applyVerifiedCountsToProduct(currentProduct, {
          activeCount: data.activeCount,
          inactiveCount: data.inactiveCount,
        });
        setCurrentProduct(updated);
        onProductUpdate?.(updated);
        await fetchLinkedAds(currentProduct.id);
      } else {
        showToast({
          type: "info",
          title: "Verification Dispatched",
          message: data.message || "Checking linked ads via Trigger.dev in background...",
        });
        await fetchLinkedAds(currentProduct.id);
      }
    } catch (err: any) {
      console.error("Failed to recheck linked ads:", err);
      showToast({
        type: "error",
        title: "Verification Error",
        message: err?.message || "Failed to recheck linked ads",
      });
    } finally {
      setIsQueueingVerify(false);
    }
  };

  const handleQueueLocalRescan = async () => {
    if (!currentProduct?.id || isQueueingLocalRescan) return;
    setIsQueueingLocalRescan(true);
    try {
      const res = await fetch(`/api/products/${currentProduct.id}/queue-rescan`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to queue local price extraction");
      }

      const updated: ScrapedProduct = {
        ...currentProduct,
        scrapeStatus: "pending",
        failureReason: "Queued for local worker residential price extraction",
      };
      setCurrentProduct(updated);
      onProductUpdate?.(updated);

      showToast({
        type: "success",
        title: "Queued for Local Price Sync",
        message: "Status set to Pending. Your local residential worker will scrape and validate the authentic store price.",
      });
    } catch (err: any) {
      console.error("Failed to queue local rescan:", err);
      showToast({
        type: "error",
        title: "Queue Failed",
        message: err.message || "Network error queueing product for local extraction.",
      });
    } finally {
      setIsQueueingLocalRescan(false);
    }
  };

  const handleSwitchCarouselItem = async (item: CarouselItemSummary) => {
    if (item.id === currentProduct?.id) return;
    const carouselItems = currentProduct?.carouselItems;
    const previousProduct = currentProduct;
    const requestId = ++carouselSwitchRequestIdRef.current;
    const optimistic = materializeCarouselItem(currentProduct!, item);
    setCurrentProduct(optimistic);

    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(item.id)}`);
      const data = await res.json();
      if (requestId !== carouselSwitchRequestIdRef.current) return;
      if (data.success && data.products && data.products.length > 0) {
        setCurrentProduct({
          ...data.products[0],
          carouselItems: carouselItems,
          isCarouselBundle: true,
          carouselBundleCount: carouselItems?.length,
          carouselGroupKey: currentProduct?.carouselGroupKey,
        });
      } else if (previousProduct) {
        setCurrentProduct(previousProduct);
      }
    } catch (err) {
      console.warn("[Modal] Failed deep fetch for carousel sibling:", err);
      if (requestId === carouselSwitchRequestIdRef.current && previousProduct) {
        setCurrentProduct(previousProduct);
      }
    }
  };

  const allImages = [
    ...(currentProduct.mainImageUrl ? [currentProduct.mainImageUrl] : []),
    ...(currentProduct.galleryImages || []),
  ].filter((img, idx, arr) => arr.indexOf(img) === idx);

  const supplierUrls = currentProduct.supplierUrls || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Product Details"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* Floating Desktop Side Navigation Chevrons */}
      {!lightboxAd && hasPrev && (
        <button
          type="button"
          onClick={onNavigatePrev}
          className="hidden xl:flex fixed left-4 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-slate-900/90 text-white hover:bg-indigo-600 border border-white/20 shadow-2xl items-center justify-center transition-all cursor-pointer hover:scale-110"
          title="Previous Product (Arrow Left ←)"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {!lightboxAd && hasNext && (
        <button
          type="button"
          onClick={onNavigateNext}
          className="hidden xl:flex fixed right-4 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-slate-900/90 text-white hover:bg-indigo-600 border border-white/20 shadow-2xl items-center justify-center transition-all cursor-pointer hover:scale-110"
          title="Next Product (Arrow Right →)"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      <div
        className={cn(
          "relative w-full max-w-6xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col transition-all duration-200",
          lightboxAd && "h-[92vh]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {lightboxAd ? (
          <ProductCreativeView
            ad={lightboxAd}
            ads={activeLightboxAdsList.length > 0 ? activeLightboxAdsList : linkedAds}
            currentIndex={activeLightboxIndex}
            onNavigateIndex={handleNavigateLightboxAdIndex}
            onBack={() => setLightboxAd(null)}
            onClose={onClose}
            product={currentProduct}
            network={network}
            onRefreshMedia={handleRefreshLightboxAd}
            isRefreshingMedia={isRefreshingLightboxAd}
          />
        ) : (
          <>
            {/* Header Component */}
            <ModalHeader
              product={currentProduct}
              linkedAds={linkedAds}
              supplierUrls={supplierUrls}
              allImages={allImages}
              isEditMode={isEditMode}
              isSavingEdit={isSavingEdit}
              onSaveEdit={() => editFormRef.current?.save()}
              onCancelEdit={() => setIsEditMode(false)}
              onStartEdit={() => setIsEditMode(true)}
              onSwitchTab={(tab) => setActiveTab(tab)}
              onFavoriteToggle={handleFavoriteToggle}
              onQueueVerify={handleQueueVerify}
              isQueueingVerify={isQueueingVerify}
              onRefresh={onRefresh ? handleRefresh : undefined}
              isRefreshing={isRefreshing}
              onQueueLocalRescan={handleQueueLocalRescan}
              isQueueingLocalRescan={isQueueingLocalRescan}
              onDelete={onDelete}
              onClose={onClose}
              currentIndex={currentIndex}
              totalCount={totalCount}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onNavigatePrev={onNavigatePrev}
              onNavigateNext={onNavigateNext}
            />

            {/* On Hold Notification Banner */}
            {currentProduct?.brandHoldStatus === "on_hold" && (
              <div className="mx-6 mt-3 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-300">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span>
                    <strong>Brand on Hold:</strong> {(currentProduct?.activeAdsCount ?? 0) === 0 ? "Meta Ad Library detected 0 active ads during recent scans." : "Meta Ad Library detected an ad volume drop during recent scans."} This product is preserved under the grace period before being marked off-air.
                  </span>
                </div>
                <span className="shrink-0 text-[10px] font-bold uppercase bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 inline-flex items-center gap-1">
                  <Pause className="w-2.5 h-2.5" />
                  <span>Paused</span>
                </span>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {isEditMode ? (
                <ModalEditForm
                  ref={editFormRef}
                  product={currentProduct}
                  linkedAds={linkedAds}
                  isSaving={isSavingEdit}
                  onSavingChange={setIsSavingEdit}
                  onCancelEdit={() => setIsEditMode(false)}
                  onProductUpdate={handleProductUpdateInternal}
                  onRefreshAds={() => fetchLinkedAds(currentProduct.id)}
                  onRefreshProduct={onRefresh ? () => onRefresh(currentProduct.id, currentProduct) : undefined}
                />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Product Visual & Commercial Hero Card (5 cols, sticky) */}
                  <div className="lg:col-span-5 lg:sticky lg:top-0 space-y-4">
                    <ModalProductHeroCard
                      product={currentProduct}
                      allImages={allImages}
                      isRefreshing={isRefreshing}
                      onSwitchCarouselItem={handleSwitchCarouselItem}
                    />
                  </div>

                  {/* Right Column: Exploration & Intelligence Tabs (7 cols) */}
                  <div className="lg:col-span-7 space-y-4">
                    {/* Navigation Tabs Bar */}
                    <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 overflow-x-auto shrink-0 scrollbar-none">
                      <button
                        type="button"
                        onClick={() => setActiveTab("ads")}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0",
                          activeTab === "ads"
                            ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        )}
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>Ad Creatives</span>
                        {linkedAds.length > 0 && (
                          <span className={cn(
                            "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                            activeTab === "ads"
                              ? "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                          )}>
                            {linkedAds.length}
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("overview")}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0",
                          activeTab === "overview" || activeTab === "suppliers" || activeTab === "network"
                            ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        )}
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>Offers, Sourcing & Intel</span>
                        {supplierUrls.length > 0 && (
                          <span className={cn(
                            "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                            activeTab === "overview" || activeTab === "suppliers" || activeTab === "network"
                              ? "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                          )}>
                            {supplierUrls.length}
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("all")}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0",
                          activeTab === "all"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        )}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>All</span>
                      </button>
                    </div>

                    {/* Tab Content Panes */}
                    {(activeTab === "all" || activeTab === "ads") && (
                      <div>
                        <ModalAdGallery
                          productId={currentProduct.id}
                          linkedAds={linkedAds}
                          loadingAds={loadingAds}
                          onRefreshAds={() => fetchLinkedAds(currentProduct.id)}
                          onRefreshProduct={onRefresh ? () => onRefresh(currentProduct.id, currentProduct) : undefined}
                          onQueueVerify={handleQueueVerify}
                          isQueueingVerify={isQueueingVerify}
                          onOpenLightbox={handleOpenAdPreview}
                        />
                      </div>
                    )}

                    {(activeTab === "all" || activeTab === "overview" || activeTab === "suppliers" || activeTab === "network") && (
                      <div className={cn("space-y-6", activeTab === "all" && "pt-6 border-t border-slate-200 dark:border-slate-800")}>
                        {/* 1. Offers, Taxonomy & Audience Specs */}
                        <ModalProductSpecsSection product={currentProduct} />

                        {/* 2. Sourcing & Supplier Links */}
                        <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
                          <ModalSourcingSection
                            product={currentProduct}
                            onProductUpdate={handleProductUpdateInternal}
                          />
                        </div>

                        {/* 3. Connected Brand Network & Related Stores */}
                        <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
                          <ModalNetworkIntelligence
                            network={network}
                            loadingNetwork={loadingNetwork}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
</div>
);
}
