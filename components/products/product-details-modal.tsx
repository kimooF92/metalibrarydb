"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import NextImage from "next/image";
import { ScrapedProduct, Ad, CarouselItemSummary } from "@/types";
import { useToast } from "@/components/toast-context";
import {
  ChevronLeft,
  ChevronRight,
  Package,
  Sparkles,
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
import { ModalOverviewSection } from "./modal/modal-overview-section";
import { ModalSourcingSection } from "./modal/modal-sourcing-section";
import { ModalNetworkIntelligence } from "./modal/modal-network-intelligence";
import { ModalAdGallery } from "./modal/modal-ad-gallery";
import { ModalEditForm, ModalEditFormHandle } from "./modal/modal-edit-form";
import { ImagePreviewModal } from "@/components/spy/image-preview-modal";
import { isGenuineVideoUrl, isFbCdnUrlExpired } from "@/lib/fb-cdn";

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
  const [activeTab, setActiveTab] = useState<ModalTab>("all");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editFormRef = useRef<ModalEditFormHandle>(null);
  const [linkedAds, setLinkedAds] = useState<Ad[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [network, setNetwork] = useState<any>(null);
  const [loadingNetwork, setLoadingNetwork] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isQueueingVerify, setIsQueueingVerify] = useState(false);
  const [isQueueingLocalRescan, setIsQueueingLocalRescan] = useState(false);
  const [lightboxAd, setLightboxAd] = useState<Ad | null>(null);
  const [isRefreshingLightboxAd, setIsRefreshingLightboxAd] = useState(false);

  const handleRefreshLightboxAd = async () => {
    if (!lightboxAd) return;
    setIsRefreshingLightboxAd(true);
    try {
      const res = await fetch(`/api/spy/ads/${lightboxAd.id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.ad) {
        setLightboxAd(data.ad);
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

  const handleOpenAdPreview = (ad: Ad) => {
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
            setLinkedAds((prev) => prev.map((a) => (a.id === data.ad.id ? { ...a, ...data.ad } : a)));
          }
        })
        .catch(() => { })
        .finally(() => setIsRefreshingLightboxAd(false));
    }
  };

  const fetchLinkedAds = useCallback(async (productId: string) => {
    setLoadingAds(true);
    try {
      const res = await fetch(`/api/spy/ads?productId=${encodeURIComponent(productId)}&limit=50&includeMedia=true`);
      if (res.ok) {
        const data = await res.json();
        setLinkedAds(data.ads || data.items || []);
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
  }, [isOpen, isEditMode, hasPrev, hasNext, onNavigatePrev, onNavigateNext]);

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
      const res = await fetch(`/api/products/${currentProduct.id}/queue-verify`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.isCompleted) {
          const activeText = `${data.activeCount ?? 0} active`;
          const inactiveText = `${data.inactiveCount ?? 0} inactive`;
          showToast({
            type: "success",
            title: "Linked Ads Verified",
            message: `Verified ${data.checkedCount ?? 0} ads (${activeText}, ${inactiveText}). Media refreshed.`,
          });
        } else {
          showToast({
            type: "info",
            title: "Verification Dispatched",
            message: data.message || "Checking linked ads via Trigger.dev in the background...",
          });
        }
        await fetchLinkedAds(currentProduct.id);
        onRefresh?.(currentProduct.id);
      } else {
        showToast({
          type: "error",
          title: "Verification Error",
          message: data.error || "Failed to recheck linked ads",
        });
      }
    } catch (err) {
      console.error("Failed to recheck linked ads:", err);
      showToast({
        type: "error",
        title: "Network Error",
        message: "Network error rechecking linked ads",
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
    const optimistic: ScrapedProduct = {
      ...currentProduct!,
      id: item.id,
      url: item.url,
      title: item.title,
      currentPrice: item.currentPrice,
      originalPrice: item.originalPrice || currentProduct!.originalPrice,
      mainImageUrl: item.mainImageUrl || currentProduct!.mainImageUrl,
      discountOrOffer: item.discountOrOffer || currentProduct!.discountOrOffer,
      activeAdsCount: item.activeAdsCount ?? currentProduct!.activeAdsCount,
      linkedAdsCount: item.linkedAdsCount ?? currentProduct!.linkedAdsCount,
      carouselItems: carouselItems,
      isCarouselBundle: true,
      carouselBundleCount: carouselItems?.length,
    };
    setCurrentProduct(optimistic);

    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(item.id)}`);
      const data = await res.json();
      if (data.success && data.products && data.products.length > 0) {
        setCurrentProduct({
          ...data.products[0],
          carouselItems: carouselItems,
          isCarouselBundle: true,
          carouselBundleCount: carouselItems?.length,
        });
      }
    } catch (err) {
      console.warn("[Modal] Failed deep fetch for carousel sibling:", err);
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
      {hasPrev && (
        <button
          type="button"
          onClick={onNavigatePrev}
          className="hidden xl:flex fixed left-4 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-slate-900/90 text-white hover:bg-indigo-600 border border-white/20 shadow-2xl items-center justify-center transition-all cursor-pointer hover:scale-110"
          title="Previous Product (Arrow Left ←)"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {hasNext && (
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
        className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
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

        {/* Carousel Siblings Rail */}
        {currentProduct?.carouselItems && currentProduct.carouselItems.length > 1 && (
          <div className="mx-6 mt-3 p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/60 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 shrink-0">
              <span className="p-1 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                <Layers className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Carousel Collection ({currentProduct.carouselItems.length} products):
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
              {currentProduct.carouselItems.map((item, idx) => {
                const isSelected = item.id === currentProduct.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSwitchCarouselItem(item)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer text-left shrink-0 ${isSelected
                        ? "bg-white dark:bg-slate-900 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-indigo-500/30 font-bold"
                        : "bg-white/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    title={item.title || `Item ${idx + 1}`}
                  >
                    {item.mainImageUrl && (
                      <div className="relative w-5 h-5 rounded overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                        <NextImage
                          src={item.mainImageUrl}
                          alt=""
                          fill
                          unoptimized
                          referrerPolicy="no-referrer"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <span className="truncate max-w-[120px] text-[11px]">
                      {item.title || `Product ${idx + 1}`}
                    </span>
                    {item.currentPrice && (
                      <span className="text-[10px] opacity-75 font-mono">
                        {item.currentPrice}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* On Hold Notification Banner */}
        {currentProduct?.brandHoldStatus === "on_hold" && (
          <div className="mx-6 mt-3 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span>
                <strong>Brand on Hold:</strong> Meta Ad Library detected 0 active ads during recent scans. This product is preserved under the grace period before being marked off-air.
              </span>
            </div>
            <span className="shrink-0 text-[10px] font-bold uppercase bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 inline-flex items-center gap-1">
              <Pause className="w-2.5 h-2.5" />
              <span>Paused</span>
            </span>
          </div>
        )}

        {/* Segmented Navigation Tab Bar */}
        {!isEditMode && (
          <div className="px-6 pt-3 pb-1 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 flex items-center gap-1.5 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${activeTab === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${activeTab === "overview"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Overview & Pricing</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("ads")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${activeTab === "ads"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ad Creatives</span>
              {linkedAds.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === "ads"
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}>
                  {linkedAds.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("suppliers")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${activeTab === "suppliers"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Sourcing</span>
              {supplierUrls.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === "suppliers"
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}>
                  {supplierUrls.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("network")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${activeTab === "network"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Network Intel</span>
            </button>
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
            <>
              {(activeTab === "all" || activeTab === "overview") && (
                <ModalOverviewSection
                  product={currentProduct}
                  allImages={allImages}
                />
              )}

              {(activeTab === "all" || activeTab === "suppliers") && (
                <div className={activeTab === "all" ? "pt-4 border-t border-slate-200 dark:border-slate-800" : ""}>
                  <ModalSourcingSection
                    product={currentProduct}
                    onProductUpdate={handleProductUpdateInternal}
                  />
                </div>
              )}

              {(activeTab === "all" || activeTab === "network") && (
                <div className={activeTab === "all" ? "pt-4 border-t border-slate-200 dark:border-slate-800" : ""}>
                  <ModalNetworkIntelligence
                    network={network}
                    loadingNetwork={loadingNetwork}
                  />
                </div>
              )}

              {(activeTab === "all" || activeTab === "ads") && (
                <div className={activeTab === "all" ? "pt-4 border-t border-slate-200 dark:border-slate-800" : ""}>
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
            </>
          )}
        </div>
      </div>

      {/* Creative Preview Modal mounted at root */}
      {lightboxAd && (
        <ImagePreviewModal
          isOpen={Boolean(lightboxAd)}
          onClose={() => setLightboxAd(null)}
          adId={lightboxAd.id}
          imageUrls={
            lightboxAd.mediaType === "carousel" && (lightboxAd.mediaUrls?.filter((u: string) => !isGenuineVideoUrl(u)).length || 0) > 0
              ? lightboxAd.mediaUrls!.filter((u: string) => !isGenuineVideoUrl(u))
              : lightboxAd.signedThumbnailUrl || lightboxAd.thumbnailUrl
                ? [lightboxAd.signedThumbnailUrl || lightboxAd.thumbnailUrl!]
                : []
          }
          videoUrl={lightboxAd.mediaUrls?.find(isGenuineVideoUrl) || null}
          fallbackThumbnail={lightboxAd.signedThumbnailUrl || lightboxAd.thumbnailUrl}
          isVideoAd={
            lightboxAd.mediaType === "video" ||
            Boolean(lightboxAd.mediaUrls?.find(isGenuineVideoUrl)) ||
            Boolean(lightboxAd.storyboardUrls?.length)
          }
          title={lightboxAd.title}
          pageName={lightboxAd.pageName || (lightboxAd.pageId ? `Page ${lightboxAd.pageId}` : null)}
          pageId={lightboxAd.pageId}
          caption={lightboxAd.caption}
          destinationUrl={lightboxAd.linkUrl}
          adArchiveId={lightboxAd.adArchiveId}
          startedRunningOn={lightboxAd.startedRunningOn}
          isActive={!lightboxAd.isArchived && lightboxAd.isActive !== false}
          onRefreshMedia={handleRefreshLightboxAd}
          isRefreshingMedia={isRefreshingLightboxAd}
        />
      )}
    </div>
  );
}
