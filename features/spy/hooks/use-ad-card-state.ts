"use client";

import { useState, useEffect, useRef } from "react";
import type { Ad, ScrapedProduct } from "@/types";
import type { AdMediaConfig, AdActionsConfig } from "../types";
import { resolveDestinationUrl, getCleanDomain } from "@/lib/utils";
import { isFbCdnUrlExpired, isGenuineVideoUrl } from "@/lib/fb-cdn";
import { getSmartMediaUrl } from "@/lib/image-proxy-url";
import { useToast } from "@/components/toast-context";
import { calculateWinnerScore } from "@/lib/winner-score";

export function useAdCardState(
  ad: Ad,
  onArchiveToggle?: () => void,
  onMediaRefreshed?: (newAd: Ad) => void
) {
  const { showToast } = useToast();
  const [currentAd, setCurrentAd] = useState<Ad>(ad);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProxied, setIsProxied] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [isClusterModalOpen, setIsClusterModalOpen] = useState(false);
  const [isCreativeClusterModalOpen, setIsCreativeClusterModalOpen] = useState(false);
  const [isArchived, setIsArchived] = useState(Boolean(ad.isArchived));
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false);
  const [isExtractingProduct, setIsExtractingProduct] = useState(false);
  const [extractedProduct, setExtractedProduct] = useState<ScrapedProduct | null>(ad.product || null);
  const [showScoreTooltip, setShowScoreTooltip] = useState(false);

  // Sync when prop updates with BUG-02 fix (reset carouselIndex to 0)
  useEffect(() => {
    setCurrentAd(ad);
    setIsArchived(Boolean(ad.isArchived));
    if (ad.product) setExtractedProduct(ad.product);
    setVideoError(false);
    setIsPlayingVideo(false);
    setCarouselIndex(0); // BUG-02 fix: eliminate wrong slide display on ad prop updates
  }, [ad]);

  const firstVideoUrl = currentAd.mediaUrls?.find(isGenuineVideoUrl) || null;

  const isVideoExpired = firstVideoUrl ? isFbCdnUrlExpired(firstVideoUrl) : false;
  const canPlayVideo = Boolean(firstVideoUrl) && !isVideoExpired && !videoError;

  const isVideoAd =
    currentAd.mediaType === "video" ||
    Boolean(firstVideoUrl) ||
    Boolean(currentAd.storyboardUrls?.length);

  const imageSlides =
    currentAd.mediaUrls?.filter((url) => !isGenuineVideoUrl(url)) || [];

  const displayThumbnail =
    currentAd.signedThumbnailUrl ||
    currentAd.thumbnailUrl ||
    (imageSlides.length > 0 ? imageSlides[0] : null);

  const isCarousel = currentAd.mediaType === "carousel" || imageSlides.length > 1;

  const previewImages =
    isCarousel && imageSlides.length > 0
      ? imageSlides
      : displayThumbnail
      ? [displayThumbnail]
      : imageSlides;

  const activeSlideUrl =
    isCarousel && previewImages.length > 0
      ? previewImages[carouselIndex % previewImages.length]
      : displayThumbnail;

  const activeImageSrc =
    activeSlideUrl && activeSlideUrl.startsWith("http")
      ? isProxied
        ? `/api/spy/image-proxy?url=${encodeURIComponent(activeSlideUrl)}`
        : getSmartMediaUrl(activeSlideUrl, false)
      : activeSlideUrl;

  const handleImageError = () => {
    if (!isProxied && activeSlideUrl && activeSlideUrl.startsWith("http")) {
      setIsProxied(true);
    } else {
      setImgError(true);
    }
  };

  const openPreview = async () => {
    setIsPreviewOpen(true);
    if (currentAd.mediaUrls?.length || currentAd.storyboardUrls?.length) {
      return;
    }

    setIsLoadingMedia(true);
    try {
      const res = await fetch(`/api/spy/ads/${encodeURIComponent(currentAd.id)}`);
      const data = await res.json();
      if (res.ok && data.success && data.ad) {
        setCurrentAd((prev) => ({ ...prev, ...data.ad }));
      }
    } catch {
      // Keep the thumbnail preview available if detail loading fails.
    } finally {
      setIsLoadingMedia(false);
    }
  };

  const toggleArchive = async () => {
    setIsArchiving(true);
    const nextState = !isArchived;
    setIsArchived(nextState);
    try {
      const res = await fetch(`/api/spy/ads/${currentAd.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: nextState }),
      });
      if (res.ok) {
        onArchiveToggle?.();
      } else {
        setIsArchived(!nextState);
      }
    } catch {
      setIsArchived(!nextState);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRefreshMedia = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsRefreshingMedia(true);
    try {
      const res = await fetch(`/api/spy/ads/${currentAd.id}/refresh`, { method: "POST" });
      const contentType = res.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        showToast({
          type: "error",
          title: "Refresh Error",
          message: `Server temporary error (${res.status}). Click 'Watch on Meta Ad Library' to view.`,
        });
        return;
      }

      const data = await res.json();
      if (data.success && data.ad) {
        setCurrentAd(data.ad);
        setImgError(false);
        setVideoError(false);
        setIsPlayingVideo(false);
        setIsProxied(false);
        onMediaRefreshed?.(data.ad);

        if (data.isActive === false) {
          showToast({
            type: "warning",
            title: "Ad Inactive (Ended)",
            message: "Media refreshed. Meta Ad Library confirmed this ad is no longer active.",
          });
        } else {
          showToast({
            type: "success",
            title: "Media Refreshed",
            message: "Fresh media loaded. Ad is actively delivering on Meta.",
          });
        }
      } else {
        showToast({
          type: "error",
          title: "Refresh Failed",
          message: data.message || "Could not extract fresh media right now. Use 'Watch on Meta Ad Library' link.",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Connection Error",
        message: "Failed to refresh media: " + (err.message || "Network error"),
      });
    } finally {
      setIsRefreshingMedia(false);
    }
  };

  const destinationUrl = resolveDestinationUrl(currentAd.linkUrl);
  const targetDomain = getCleanDomain(currentAd.linkUrl);

  const handleFetchProduct = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!destinationUrl || isExtractingProduct) return;

    setIsExtractingProduct(true);
    try {
      const res = await fetch("/api/products/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: destinationUrl,
          adId: currentAd.id,
          pageId: currentAd.pageId,
        }),
      });

      const data = await res.json();
      if (data.success && data.product) {
        setExtractedProduct(data.product);
        setCurrentAd((prev) => ({
          ...prev,
          productId: data.product.id,
          product: data.product,
        }));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("product-added"));
        }
        showToast({
          type: "success",
          title: data.cached ? "Product Linked" : "Product Saved!",
          message: `${data.product.title || "Product"} ${
            data.product.currentPrice ? `(${data.product.currentPrice})` : ""
          } saved to your products list.`,
          link: "/products",
          linkLabel: "View in Products ↗",
        });
      } else {
        showToast({
          type: "error",
          title: "Could Not Read Page",
          message: data.error || "Could not read product details from this page.",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Connection Error",
        message: err.message || "Failed to reach the product service.",
      });
    } finally {
      setIsExtractingProduct(false);
    }
  };

  const winnerMetrics = calculateWinnerScore({
    startedRunningOn: currentAd.startedRunningOn,
    firstSeenAt: currentAd.firstSeenAt,
    lastSeenAt: currentAd.lastSeenAt,
    duplicationCount: currentAd.duplicationCount || 1,
    isActive: currentAd.isActive,
    isArchived: isArchived,
    mediaType: currentAd.mediaType,
    productCreativeCount: currentAd.productCreativeCount || 1,
  });

  // Grouped domain configurations (BUG-12 fix for <= 8 direct props)
  const mediaConfig: AdMediaConfig = {
    firstVideoUrl,
    displayThumbnail,
    isVideoAd,
    isVideoExpired,
    canPlayVideo,
    isCarousel,
    previewImages,
    carouselIndex,
    isProxied,
    imgError,
    videoError,
    isLoadingMedia,
    isPlayingVideo,
    activeImageSrc,
    mediaType: currentAd.mediaType,
    title: currentAd.title,
    winnerScore: winnerMetrics.winnerScore,
    isBreakout: winnerMetrics.isBreakout,
    isEvergreen: winnerMetrics.isEvergreen,
    creativeCount: currentAd.productCreativeCount || 1,
    totalAdSets: currentAd.creativeMetrics?.totalAdSets,
    distinctBrandsCount: currentAd.creativeMetrics?.distinctBrandsCount,
    isCrossBrand: currentAd.creativeMetrics?.isCrossBrand,
  };

  const actionsConfig: AdActionsConfig = {
    destinationUrl,
    targetDomain,
    ctaText: currentAd.ctaText,
    extractedProduct,
    isExtractingProduct,
    isRefreshingMedia,
    isArchiving,
    isArchived,
    canPlayVideo,
    firstVideoUrl,
    displayThumbnail,
    isVideoAd,
    adArchiveId: currentAd.adArchiveId,
    startedRunningOn: currentAd.startedRunningOn,
    firstSeenAt: currentAd.firstSeenAt,
    duplicationCount: currentAd.duplicationCount || 1,
    isActive: currentAd.isActive,
  };

  return {
    currentAd,
    setCurrentAd,
    isExpanded,
    setIsExpanded,
    videoRef,
    previewImages,
    firstVideoUrl,
    displayThumbnail,
    isVideoAd,
    canPlayVideo,
    destinationUrl,
    targetDomain,
    extractedProduct,
    isClusterModalOpen,
    setIsClusterModalOpen,
    isCreativeClusterModalOpen,
    setIsCreativeClusterModalOpen,
    isPreviewOpen,
    setIsPreviewOpen,
    showScoreTooltip,
    setShowScoreTooltip,
    mediaConfig,
    actionsConfig,
    handleImageError,
    openPreview,
    toggleArchive,
    handleRefreshMedia,
    handleFetchProduct,
    setCarouselIndex,
    setIsPlayingVideo,
    setVideoError,
  };
}

