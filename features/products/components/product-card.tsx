"use client";

import { useState, useEffect, useRef, memo } from "react";
import { ScrapedProduct } from "@/types";
import { Layers } from "lucide-react";
import { formatPrice } from "@/lib/format-price";
import { useWorkspace } from "@/components/workspace-context";
import { useToast } from "@/components/toast-context";
import { ProductCardMedia } from "./card/product-card-media";
import { ProductCardPricing } from "./card/product-card-pricing";
import { ProductCardActions } from "./card/product-card-actions";
import { ProductCardFooter } from "./card/product-card-footer";
import { materializeCarouselItem } from "@/lib/carousel-grouping";

export interface ProductCardProps {
  product: ScrapedProduct;
  onRefresh?: (productId: string, product?: ScrapedProduct) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
  onToggleFavorite?: (productId: string, nextFavorite: boolean) => Promise<void>;
  onViewDetails?: (product: ScrapedProduct) => void;
  onViewCreatives?: (product: ScrapedProduct) => void;
  onFilterBrand?: (brandName: string) => void;
  isRecentlyViewed?: boolean;
  isRefreshing?: boolean;
}

export const ProductCard = memo(function ProductCard({
  product,
  onRefresh,
  onDelete,
  onToggleFavorite,
  onViewDetails,
  onViewCreatives,
  onFilterBrand,
  isRecentlyViewed,
  isRefreshing: isRefreshingProp,
}: ProductCardProps) {
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const sym = activeWorkspace?.currencySymbol || "DT";

  const [internalIsRefreshing, setInternalIsRefreshing] = useState(false);
  const isRefreshing = Boolean(isRefreshingProp || internalIsRefreshing);
  const [localPriceOverrides, setLocalPriceOverrides] = useState<Record<string, string>>({});

  const priceSignature = [
    product.currentPrice ?? "",
    ...(product.carouselItems || []).map((item) => `${item.id}:${item.currentPrice ?? ""}`),
  ].join("|");

  useEffect(() => {
    setLocalPriceOverrides({});
  }, [product.id, priceSignature]);

  // Carousel Bundle / Stacked Swiper State
  const isCarouselBundle = Boolean(
    product.isCarouselBundle && product.carouselItems && product.carouselItems.length > 1
  );
  const carouselItems = product.carouselItems || [];
  const [slideIndex, setSlideIndex] = useState(0);
  const activeCarouselItemIdRef = useRef<string | null>(null);
  const carouselIdentityRef = useRef<string | null>(null);

  const carouselItemIds = carouselItems.map((item) => item.id).join("|");
  const carouselIdentity = `${product.carouselGroupKey || product.id}:${isCarouselBundle ? "bundle" : "single"}`;

  useEffect(() => {
    const carouselItemIdList = carouselItemIds ? carouselItemIds.split("|") : [];
    if (carouselIdentityRef.current !== carouselIdentity) {
      carouselIdentityRef.current = carouselIdentity;
      activeCarouselItemIdRef.current = null;
    }

    setSlideIndex((currentIndex) => {
      const selectedId =
        activeCarouselItemIdRef.current || carouselItemIdList[currentIndex] || carouselItemIdList[0];
      if (!selectedId) return 0;
      const nextIndex = carouselItemIdList.indexOf(selectedId);
      const resolvedIndex = nextIndex >= 0 ? nextIndex : 0;
      activeCarouselItemIdRef.current = carouselItemIdList[resolvedIndex] || null;
      return resolvedIndex;
    });
  }, [carouselIdentity, carouselItemIds]);

  const handleSlideChange = (nextIndex: number) => {
    const resolvedIndex = Math.max(0, Math.min(nextIndex, carouselItems.length - 1));
    activeCarouselItemIdRef.current = carouselItems[resolvedIndex]?.id || null;
    setSlideIndex(resolvedIndex);
  };

  const activeSlideItem = isCarouselBundle && carouselItems[slideIndex] ? carouselItems[slideIndex] : null;

  const activeProduct = activeSlideItem
    ? materializeCarouselItem(product, activeSlideItem)
    : product;

  // Active reactive product properties based on currently selected slide
  const activeProductId = activeProduct.id;
  const activeTitle = activeProduct.title || "Untitled Product Landing Page";
  const activeImageUrl = activeProduct.mainImageUrl;
  const activePrice = localPriceOverrides[activeProductId] ?? activeProduct.currentPrice;
  const activeUrl = activeProduct.url;
  const activeAdsCount = activeProduct.activeAdsCount;
  const activeLinkedAdsCount = activeProduct.linkedAdsCount;
  const isSlideFavorite = Boolean(activeProduct.isFavorite);

  const isPageOnHold = activeProduct.brandHoldStatus === "on_hold";
  const isPageInactive = activeProduct.brandHoldStatus === "inactive";
  const isBreakout = Boolean(
    !isPageOnHold &&
    !isPageInactive &&
    (activeProduct.isBreakout !== undefined
      ? activeProduct.isBreakout
      : ((activeProduct.activeAdsCount || 0) > 0 &&
          (activeProduct.daysRunning || 1) >= 7 &&
          (activeProduct.daysRunning || 1) <= 30 &&
          (activeProduct.maxDuplications || 1) >= 3))
  );
  const isInactive =
    isPageInactive ||
    (typeof activeProduct.activeAdsCount === "number" &&
      activeProduct.activeAdsCount === 0 &&
      (activeProduct.linkedAdsCount || 0) > 0);
  const isPendingScrape = activeProduct.scrapeStatus === "pending";

  // Brand navigation target
  const isUuid = (s?: string | null) =>
    Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
  const rawPageId =
    (activeProduct.pageId && !isUuid(activeProduct.pageId) ? activeProduct.pageId : null) ||
    (activeProduct.brandPageId && !isUuid(activeProduct.brandPageId) && activeProduct.brandPageId !== "0"
      ? activeProduct.brandPageId
      : null);

  const brandTarget =
    rawPageId || activeProduct.domain || (activeProduct.brandName && !isUuid(activeProduct.brandName) ? activeProduct.brandName : null);
  const brandDisplayName = activeProduct.brandName || activeProduct.domain || "Brand";

  // Meta Ad Library URL
  const metaAdLibraryUrl = rawPageId
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(
        rawPageId
      )}`
    : activeProduct.brandName && !isUuid(activeProduct.brandName)
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&q=${encodeURIComponent(
        activeProduct.brandName
      )}`
    : null;

  // Price formatting
  const effectivePrice = activePrice || "";
  const rawPrice = effectivePrice.trim();
  const isZeroPrice = !rawPrice || /^0(\.0+)?\s*(dt|dh|mad|tnd|usd|eur)?$/i.test(rawPrice);
  const cleanPrice = !isZeroPrice ? formatPrice(rawPrice, sym) : "";

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetId = activeProductId;
    const nextState = !isSlideFavorite;
    if (onToggleFavorite) {
      await onToggleFavorite(targetId, nextState);
    } else {
      await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetId, isFavorite: nextState }),
      });
    }
  };

  const handleRefresh = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!onRefresh || isRefreshing) return;
    setInternalIsRefreshing(true);
    try {
      await onRefresh(activeProduct.id, activeProduct);
    } finally {
      setInternalIsRefreshing(false);
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeUrl) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      showToast({
        type: "success",
        title: "Link Copied",
        message: "Product page link copied to clipboard.",
      });
    } catch {
      showToast({
        type: "error",
        title: "Copy Failed",
        message: "Could not copy link to clipboard.",
      });
    }
  };

  const handleSyncPrice = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetPrice = activePrice;
    if (!targetPrice) return;
    const normalizedPrice = formatPrice(targetPrice, sym);
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeProduct.id, currentPrice: normalizedPrice }),
      });
      if (res.ok) {
        setLocalPriceOverrides((prev) => ({ ...prev, [activeProduct.id]: normalizedPrice }));
        showToast({
          type: "success",
          title: "Price Updated",
          message: `Product price set to ${normalizedPrice}.`,
        });
      } else {
        showToast({
          type: "error",
          title: "Update Failed",
          message: "Failed to update price currency.",
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Connection Error",
        message: "Could not connect to update price.",
      });
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    await onDelete(activeProduct.id);
  };

  return (
    <div
      onClick={() => {
        if (!isRefreshing) {
          onViewDetails?.(activeProduct);
        }
      }}
      className={`group relative flex flex-col justify-between rounded-xl border px-3.5 py-[19px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg ${
        isCarouselBundle
          ? "before:absolute before:-top-1.5 before:-right-1.5 before:w-full before:h-full before:rounded-xl before:border before:border-indigo-500/25 before:bg-slate-200/60 dark:before:bg-slate-900/60 before:-z-10 after:absolute after:-top-3 after:-right-3 after:w-full after:h-full after:rounded-xl after:border after:border-indigo-500/15 after:bg-slate-300/40 dark:after:bg-slate-950/40 after:-z-20 shadow-indigo-500/5 hover:shadow-indigo-500/10"
          : ""
      } ${
        isRefreshing ? "cursor-wait ring-2 ring-indigo-500/40" : "cursor-pointer"
      } ${
        isPageOnHold
          ? "border-amber-500/40 dark:border-amber-500/40 hover:border-amber-400 bg-white dark:bg-slate-950/40"
          : isInactive
          ? "border-slate-200/90 dark:border-slate-800/60 bg-slate-100/50 dark:bg-slate-950/20 opacity-80 hover:opacity-100 hover:border-slate-300 dark:hover:border-slate-700/80"
          : isBreakout
          ? "border-pink-500/30 dark:border-pink-500/40 hover:border-pink-500/70 shadow-pink-500/5 bg-white dark:bg-slate-950/40"
          : "border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700/80"
      }`}
    >
      <div>
        {/* Brand Action Row */}
        <ProductCardActions
          product={activeProduct}
          brandDisplayName={brandDisplayName}
          brandTarget={brandTarget}
          rawPageId={rawPageId}
          cleanPrice={cleanPrice}
          isSlideFavorite={isSlideFavorite}
          isRefreshing={isRefreshing}
          handlers={{
            onFilterBrand,
            onToggleFavorite: handleToggleFavorite,
            onRefresh: handleRefresh,
            onSyncPrice: handleSyncPrice,
            onCopyLink: handleCopyLink,
            onDelete: handleDelete,
          }}
        />

        {/* Media Container */}
        <ProductCardMedia
          product={activeProduct}
          activeImageUrl={activeImageUrl}
          activeTitle={activeTitle}
          isCarouselBundle={isCarouselBundle}
          carouselItems={carouselItems}
          slideIndex={slideIndex}
          onSlideChange={handleSlideChange}
          isRefreshing={isRefreshing}
        />

        {/* Title */}
        <div className="h-11 flex items-start mb-2">
          <h4
            className={`text-[13px] sm:text-sm font-bold line-clamp-2 leading-snug transition-colors ${
              isPageOnHold || isInactive
                ? "text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"
                : "text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
            }`}
            title={activeTitle || "Product Landing Page"}
          >
            {(product.hasCarouselAd || isCarouselBundle) && (
              <span title="Active in Meta Carousel Ad format" className="inline-flex items-center">
                <Layers className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0 mr-1.5 -mt-0.5" />
              </span>
            )}
            {activeTitle || "Untitled Product Landing Page"}
          </h4>
        </div>
      </div>

      <div className="mt-auto">
        {/* Price & External Links */}
        <ProductCardPricing
          cleanPrice={cleanPrice}
          isPendingScrape={isPendingScrape}
          isPageOnHold={isPageOnHold}
          isInactive={isInactive}
          metaAdLibraryUrl={metaAdLibraryUrl}
          activeUrl={activeUrl}
        />

        {/* Velocity & Longevity Footer */}
        <ProductCardFooter
          product={activeProduct}
          activeAdsCount={activeAdsCount}
          activeLinkedAdsCount={activeLinkedAdsCount}
          isInactive={isInactive}
          isPageOnHold={isPageOnHold}
          onViewCreatives={onViewCreatives}
        />
      </div>
    </div>
  );
});
