"use client";

import { useState, useEffect, memo } from "react";
import { ScrapedProduct } from "@/types";
import { Layers } from "lucide-react";
import { formatPrice } from "@/lib/format-price";
import { useWorkspace } from "@/components/workspace-context";
import { useToast } from "@/components/toast-context";
import { ProductCardMedia } from "./card/product-card-media";
import { ProductCardPricing } from "./card/product-card-pricing";
import { ProductCardActions } from "./card/product-card-actions";
import { ProductCardFooter } from "./card/product-card-footer";

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
  const [localPrice, setLocalPrice] = useState(product.currentPrice);
  const isFavorite = Boolean(product.isFavorite);

  // Sync local price if parent updates
  useEffect(() => {
    setLocalPrice(product.currentPrice);
  }, [product.currentPrice]);

  // Carousel Bundle / Stacked Swiper State
  const isCarouselBundle = Boolean(
    product.isCarouselBundle && product.carouselItems && product.carouselItems.length > 1
  );
  const carouselItems = product.carouselItems || [];
  const [slideIndex, setSlideIndex] = useState(0);

  // If slideIndex is out of range when props change, reset to 0
  useEffect(() => {
    if (slideIndex >= carouselItems.length) {
      setSlideIndex(0);
    }
  }, [carouselItems.length, slideIndex]);

  const activeSlideItem = isCarouselBundle && carouselItems[slideIndex] ? carouselItems[slideIndex] : null;

  // Active reactive product properties based on currently selected slide
  const activeProductId = activeSlideItem?.id || product.id;
  const activeTitle = activeSlideItem?.title || product.title || "Untitled Product Landing Page";
  const activeImageUrl = activeSlideItem?.mainImageUrl || product.mainImageUrl;
  const activePrice = activeSlideItem?.currentPrice ?? localPrice;
  const activeUrl = activeSlideItem?.url || product.url;
  const activeAdsCount = activeSlideItem?.activeAdsCount ?? product.activeAdsCount;
  const activeLinkedAdsCount = activeSlideItem?.linkedAdsCount ?? product.linkedAdsCount;
  const isSlideFavorite =
    activeSlideItem?.isFavorite !== undefined ? Boolean(activeSlideItem.isFavorite) : isFavorite;

  const isPageOnHold = product.brandHoldStatus === "on_hold";
  const isPageInactive = product.brandHoldStatus === "inactive";
  const isBreakout = Boolean(
    !isPageOnHold &&
    !isPageInactive &&
    (product.isBreakout !== undefined
      ? product.isBreakout
      : ((product.activeAdsCount || 0) > 0 &&
          (product.daysRunning || 1) >= 7 &&
          (product.daysRunning || 1) <= 30 &&
          (product.maxDuplications || 1) >= 3))
  );
  const isInactive =
    isPageInactive ||
    (typeof product.activeAdsCount === "number" &&
      product.activeAdsCount === 0 &&
      (product.linkedAdsCount || 0) > 0);
  const isPendingScrape = product.scrapeStatus === "pending";

  // Brand navigation target
  const isUuid = (s?: string | null) =>
    Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
  const rawPageId =
    (product.pageId && !isUuid(product.pageId) ? product.pageId : null) ||
    (product.brandPageId && !isUuid(product.brandPageId) && product.brandPageId !== "0"
      ? product.brandPageId
      : null);

  const brandTarget =
    rawPageId || product.domain || (product.brandName && !isUuid(product.brandName) ? product.brandName : null);
  const brandDisplayName = product.brandName || product.domain || "Brand";

  // Meta Ad Library URL
  const metaAdLibraryUrl = rawPageId
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(
        rawPageId
      )}`
    : product.brandName && !isUuid(product.brandName)
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&q=${encodeURIComponent(
        product.brandName
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
      await onRefresh(product.id, product);
    } finally {
      setInternalIsRefreshing(false);
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.url) return;
    try {
      await navigator.clipboard.writeText(product.url);
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
    const targetPrice = localPrice || product.currentPrice;
    if (!targetPrice) return;
    const normalizedPrice = formatPrice(targetPrice, sym);
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, currentPrice: normalizedPrice }),
      });
      if (res.ok) {
        setLocalPrice(normalizedPrice);
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
    await onDelete(product.id);
  };

  return (
    <div
      onClick={() => {
        if (!isRefreshing) {
          const detailTarget = activeSlideItem
            ? {
                ...product,
                id: activeSlideItem.id,
                url: activeSlideItem.url,
                title: activeSlideItem.title,
                currentPrice: activeSlideItem.currentPrice,
                originalPrice: activeSlideItem.originalPrice || product.originalPrice,
                mainImageUrl: activeSlideItem.mainImageUrl || product.mainImageUrl,
                discountOrOffer: activeSlideItem.discountOrOffer || product.discountOrOffer,
                activeAdsCount: activeSlideItem.activeAdsCount ?? product.activeAdsCount,
                linkedAdsCount: activeSlideItem.linkedAdsCount ?? product.linkedAdsCount,
              }
            : product;
          onViewDetails?.(detailTarget);
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
          product={product}
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
          product={product}
          activeImageUrl={activeImageUrl}
          activeTitle={activeTitle}
          isCarouselBundle={isCarouselBundle}
          carouselItems={carouselItems}
          slideIndex={slideIndex}
          onSlideChange={setSlideIndex}
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
          product={product}
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
