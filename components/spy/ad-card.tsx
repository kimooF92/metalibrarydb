"use client";

import { useState, useEffect, useRef } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { Ad, ScrapedProduct } from "@/types";
import { resolveDestinationUrl, getCleanDomain } from "@/lib/utils";
import { calculateWinnerScore } from "@/lib/winner-score";
import { ImagePreviewModal } from "./image-preview-modal";
import { ProductClusterModal } from "./product-cluster-modal";
import { useToast } from "@/components/toast-context";
import {
  Calendar,
  Layers,
  ExternalLink,
  Download,
  Play,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Flame,
  Globe,
  Archive,
  ArchiveRestore,
  Clock,
  RotateCw,
  Ban,
  X,
  VolumeX,
  Volume2,
  Award,
  Rocket,
  Zap,
  Sparkles,
  Trophy,
  Crown,
  Info,
  ShoppingBag,
  Tag,
} from "lucide-react";

interface AdCardProps {
  ad: Ad;
  onArchiveToggle?: () => void;
  onExcludeBrand?: (pageId: string) => void;
  onMediaRefreshed?: (newAd: Ad) => void;
}

export function AdCard({ ad, onArchiveToggle, onExcludeBrand, onMediaRefreshed }: AdCardProps) {
  const { showToast } = useToast();
  const [currentAd, setCurrentAd] = useState<Ad>(ad);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [isProxied, setIsProxied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isClusterModalOpen, setIsClusterModalOpen] = useState(false);
  const [isArchived, setIsArchived] = useState(Boolean(ad.isArchived));
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false);
  const [isExtractingProduct, setIsExtractingProduct] = useState(false);
  const [extractedProduct, setExtractedProduct] = useState<ScrapedProduct | null>(ad.product || null);
  const [isHovered, setIsHovered] = useState(false);
  const [showScoreTooltip, setShowScoreTooltip] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync when prop updates
  useEffect(() => {
    setCurrentAd(ad);
    setIsArchived(Boolean(ad.isArchived));
    if (ad.product) setExtractedProduct(ad.product);
  }, [ad]);

  // Clean up hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const initialDisplayImage = currentAd.signedThumbnailUrl || currentAd.thumbnailUrl || currentAd.mediaUrls?.[0];
  const activeImageSrc = isProxied && initialDisplayImage
    ? `/api/spy/image-proxy?url=${encodeURIComponent(initialDisplayImage)}`
    : initialDisplayImage;

  const handleImageError = () => {
    if (!isProxied && initialDisplayImage) {
      setIsProxied(true);
    } else {
      setImgError(true);
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

  const handleRefreshMedia = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshingMedia(true);
    try {
      const res = await fetch(`/api/spy/ads/${currentAd.id}/refresh`, { method: "POST" });
      const contentType = res.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        alert("Server temporary error (" + res.status + "). Click 'Watch on Meta Ad Library' to view.");
        return;
      }

      const data = await res.json();
      if (data.success && data.ad) {
        setCurrentAd(data.ad);
        setVideoError(false);
        setImgError(false);
        setIsProxied(false);
        onMediaRefreshed?.(data.ad);
      } else {
        alert(data.message || "Could not extract fresh media right now. Use 'Watch on Meta Ad Library' link.");
      }
    } catch (err: any) {
      alert("Failed to refresh media: " + (err.message || "Network error"));
    } finally {
      setIsRefreshingMedia(false);
    }
  };

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
        showToast({
          type: "success",
          title: data.cached ? "Product Linked (Cached)" : "Product Added to Hub!",
          message: `${data.product.title || "Product"} ${data.product.currentPrice ? `(${data.product.currentPrice})` : ""} has been saved.`,
          link: "/products",
          linkLabel: "View in Products Hub ↗",
        });
      } else {
        showToast({
          type: "error",
          title: "Extraction Failed",
          message: data.error || "Could not extract product details from this landing page.",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Failed to contact extraction service.",
      });
    } finally {
      setIsExtractingProduct(false);
    }
  };

  // Format launch date
  const formatLaunchDate = (dateStr: string | null, firstSeenStr?: string | null) => {
    const isFirstSeen = !dateStr;
    const targetStr = dateStr || firstSeenStr;
    if (!targetStr) return "Unknown launch date";
    const date = new Date(targetStr);
    if (isNaN(date.getTime())) return "Unknown launch date";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const launchDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diffTime = today.getTime() - launchDay.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const prefix = isFirstSeen ? "First seen " : "Launched ";

    if (diffDays <= 0) return `${prefix}today`;
    if (diffDays === 1) return `${prefix}yesterday`;
    if (diffDays < 30) return `${prefix}${diffDays}d ago`;
    return `${prefix}${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  };

  const formatFreshnessDate = (dateStr?: string | Date | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const diffHours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return "Verified just now";
    if (diffHours < 24) return `Verified ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Verified ${diffDays}d ago`;
  };

  const duplicationCount = currentAd.duplicationCount || 1;
  const isScaled = duplicationCount >= 5;
  const freshnessLabel = formatFreshnessDate(currentAd.lastSeenAt);

  // Calculate Winner Metrics with multi-creative angle bonus
  const winnerMetrics = calculateWinnerScore({
    startedRunningOn: currentAd.startedRunningOn,
    firstSeenAt: currentAd.firstSeenAt,
    lastSeenAt: currentAd.lastSeenAt,
    duplicationCount,
    isActive: currentAd.isActive,
    isArchived: currentAd.isArchived,
    mediaType: currentAd.mediaType,
    productCreativeCount: currentAd.productCreativeCount || 1,
  });

  const firstVideoUrl = currentAd.mediaUrls?.find(
    (url) => url.includes(".mp4") || url.includes("video") || currentAd.mediaType === "video"
  );
  const displayImage = currentAd.signedThumbnailUrl || currentAd.thumbnailUrl || currentAd.mediaUrls?.[0];
  const destinationUrl = resolveDestinationUrl(currentAd.linkUrl);
  const targetDomain = getCleanDomain(currentAd.linkUrl);

  const previewImages = currentAd.mediaUrls && currentAd.mediaUrls.length > 0 ? currentAd.mediaUrls : displayImage ? [displayImage] : [];

  const handleMouseEnter = () => {
    if (!firstVideoUrl || isPlayingVideo || videoError) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
  };

  const creativeCount = currentAd.productCreativeCount || 1;
  const isMultiCreative = creativeCount > 1;

  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-4 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-md">
      {/* Top Section */}
      <div>
        {/* Brand Name & Status Badges */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {currentAd.pageName || `Page ${currentAd.pageId}`}
              </span>
              {currentAd.brandProductCount && currentAd.brandProductCount > 1 && (
                <span
                  title={`Brand tested ${currentAd.brandProductCount} distinct products (${currentAd.productSharePercent || 100}% creatives dedicated to this product)`}
                  className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium shrink-0"
                >
                  {currentAd.brandProductCount} Products
                </span>
              )}
              {onExcludeBrand && (
                <button
                  type="button"
                  onClick={() => onExcludeBrand(currentAd.pageId)}
                  title={`Hide "${currentAd.pageName || currentAd.pageId}" from feed`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded shrink-0 cursor-pointer"
                >
                  <Ban className="w-3 h-3" />
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
              ID: {currentAd.adArchiveId}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isArchived ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                <Archive className="w-3 h-3" /> Archived
              </span>
            ) : currentAd.isActive === true ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            ) : currentAd.isActive === false ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-150 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-2 py-0.5 rounded-full">
                <XCircle className="w-3 h-3 text-slate-600 dark:text-slate-400" /> Inactive
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 px-2 py-0.5 rounded-full">
                <HelpCircle className="w-3 h-3" /> Unknown
              </span>
            )}
          </div>
        </div>

        {/* Row 1: High-Signal Intelligence Pills (Max 2 clean pills) */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {/* Winner Score / Breakout Pill with Breakdown Popover */}
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setShowScoreTooltip(true)}
              onMouseLeave={() => setShowScoreTooltip(false)}
              onClick={() => setShowScoreTooltip((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold cursor-pointer transition-all ${
                winnerMetrics.isBreakout
                  ? "bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 text-white shadow-sm shadow-pink-500/20 border border-pink-400/40 animate-pulse"
                  : winnerMetrics.winnerScore >= 85
                  ? "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 text-slate-950 shadow-sm shadow-amber-500/20 border border-amber-300"
                  : winnerMetrics.winnerScore >= 68
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20"
                  : winnerMetrics.winnerScore >= 45
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
              }`}
            >
              {winnerMetrics.isBreakout ? (
                <Rocket className="w-3 h-3 text-white fill-white/20" />
              ) : winnerMetrics.winnerScore >= 85 ? (
                <Trophy className="w-3 h-3 fill-slate-950" />
              ) : winnerMetrics.winnerScore >= 68 ? (
                <Flame className="w-3 h-3 fill-white" />
              ) : winnerMetrics.winnerScore >= 45 ? (
                <Zap className="w-3 h-3 text-indigo-500" />
              ) : (
                <Sparkles className="w-3 h-3 text-slate-400" />
              )}
              <span>
                {winnerMetrics.isBreakout
                  ? `Breakout (${winnerMetrics.winnerScore})`
                  : winnerMetrics.winnerScore >= 85
                  ? `${winnerMetrics.winnerScore} Super Winner`
                  : winnerMetrics.winnerScore >= 68
                  ? `${winnerMetrics.winnerScore} Winner Score`
                  : `${winnerMetrics.winnerScore} Score`}
              </span>
            </button>

            {/* Score Breakdown Tooltip */}
            {showScoreTooltip && (
              <div className="absolute left-0 top-full mt-1.5 w-60 p-2.5 bg-slate-900 text-white dark:bg-slate-950 dark:border-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 text-[10px] space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between font-bold border-b border-slate-800 pb-1 text-amber-400">
                  <div className="flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    <span>Winner Score Breakdown</span>
                  </div>
                  <span className="text-xs font-black">{winnerMetrics.winnerScore}/100</span>
                </div>
                <div className="space-y-1 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">📈 Scale ({duplicationCount} copies):</span>
                    <strong className="text-emerald-400 font-mono">+{winnerMetrics.breakdown.scalePts} pts</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">⏳ Longevity ({winnerMetrics.daysRunning}d running):</span>
                    <strong className="text-emerald-400 font-mono">+{winnerMetrics.breakdown.longevityPts} pts</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">⚡ Status & Recency:</span>
                    <strong className="text-emerald-400 font-mono">+{winnerMetrics.breakdown.recencyPts} pts</strong>
                  </div>
                  {winnerMetrics.breakdown.bonusPts > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">🚀 Velocity & Angle Bonus:</span>
                      <strong className="text-amber-400 font-mono">+{winnerMetrics.breakdown.bonusPts} pts</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Product Creative Angle & Flagship Trigger Pill */}
          {(isMultiCreative || currentAd.isFlagshipProduct) && (
            <button
              type="button"
              onClick={() => setIsClusterModalOpen(true)}
              title="Click to view all sister creative angles tested for this product"
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-all cursor-pointer shadow-sm"
            >
              <Layers className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>{creativeCount} Angles</span>
              {currentAd.isFlagshipProduct && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 ml-0.5">
                  <Crown className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20" />
                  Hero
                </span>
              )}
            </button>
          )}

          {/* Evergreen Badge (Subtle inline pill) */}
          {winnerMetrics.isEvergreen && !winnerMetrics.isBreakout && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full shadow-sm">
              <Sparkles className="w-2.5 h-2.5 text-emerald-500 fill-emerald-500/20" />
              <span>Evergreen</span>
            </span>
          )}
        </div>

        {/* Row 2: Unified Metadata Line (Clean, non-boxy) */}
        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
            <Calendar className="w-3 h-3 text-indigo-500/80" />
            <span>{formatLaunchDate(currentAd.startedRunningOn, currentAd.firstSeenAt)}</span>
          </span>

          <span className="text-slate-300 dark:text-slate-700">•</span>

          <span className={`inline-flex items-center gap-1 font-semibold ${isScaled ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"}`}>
            {isScaled ? <Flame className="w-3 h-3 text-amber-500 fill-amber-500/20 animate-pulse" /> : <Layers className="w-3 h-3 text-slate-400" />}
            <span>{duplicationCount} {duplicationCount === 1 ? "copy" : "copies running"}</span>
            {isScaled && (
              <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-1 py-0.2 rounded uppercase tracking-wider">
                Scaled
              </span>
            )}
          </span>

          {freshnessLabel && (
            <>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">{freshnessLabel}</span>
            </>
          )}
        </div>

        {/* Media Container */}
        <div
          className="relative w-full h-[280px] sm:h-[320px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-900/95 dark:bg-slate-950 mb-3 flex items-center justify-center"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isPlayingVideo && firstVideoUrl && !videoError ? (
            <div className="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center">
              <video
                src={firstVideoUrl}
                controls
                autoPlay
                {...({ referrerPolicy: "no-referrer" } as any)}
                onError={() => setVideoError(true)}
                className="w-full h-full object-contain bg-black rounded-xl"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlayingVideo(false);
                }}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/80 hover:bg-black text-white hover:text-rose-400 transition-all cursor-pointer z-30 shadow-lg border border-white/20"
                title="Close Video (Back to Poster)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : isPlayingVideo && videoError ? (
            <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-slate-200 w-full h-full gap-3">
              <Play className="w-10 h-10 text-indigo-400 opacity-60" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-white">Direct CDN stream expired</span>
                <span className="text-[11px] text-slate-400">Meta CDN links expire after 24–72 hours</span>
              </div>
              <a
                href={`https://www.facebook.com/ads/library/?id=${currentAd.adArchiveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium shadow-md transition-all"
              >
                Watch on Meta Ad Library
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : isHovered && firstVideoUrl && !videoError ? (
            <div
              className="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center cursor-pointer group/hovervid"
              onClick={() => setIsPlayingVideo(true)}
            >
              <video
                src={firstVideoUrl}
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
                {...({ referrerPolicy: "no-referrer" } as any)}
                onError={() => {
                  setIsHovered(false);
                  setVideoError(true);
                }}
                className="w-full h-full object-contain bg-black rounded-xl select-none"
              />
              {/* Subtle Muted Preview Badge */}
              <div className="absolute top-2 left-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 border border-white/15 text-[10px] font-semibold text-white pointer-events-none shadow-md">
                <VolumeX className="w-3 h-3 text-indigo-400" />
                <span>Preview</span>
              </div>

              {/* Click to Play with Sound Indicator */}
              <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/90 text-white text-[11px] font-bold shadow-lg hover:bg-indigo-500 transition-all">
                <Play className="w-3 h-3 fill-current" />
                <span>Play Sound</span>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full group/media cursor-pointer flex items-center justify-center" onClick={() => setIsPreviewOpen(true)}>
              {activeImageSrc && !imgError ? (
                <>
                  {/* Ambient Blurred Background Canvas */}
                  <NextImage
                    src={activeImageSrc}
                    alt=""
                    fill
                    unoptimized
                    referrerPolicy="no-referrer"
                    className="object-cover blur-2xl opacity-40 dark:opacity-30 scale-125 select-none pointer-events-none"
                  />

                  {/* Main Crisp Uncropped Image */}
                  <div className="relative w-full h-full p-2 flex items-center justify-center z-10">
                    <NextImage
                      src={activeImageSrc}
                      alt={currentAd.title || "Ad creative"}
                      fill
                      unoptimized
                      referrerPolicy="no-referrer"
                      className="object-contain transition-transform duration-300 group-hover/media:scale-[1.02] drop-shadow-md"
                      onError={handleImageError}
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400 font-medium">
                  {currentAd.mediaType === "video" ? (
                    <Play className="w-8 h-8 text-indigo-400 opacity-70" />
                  ) : (
                    <ImageIcon className="w-8 h-8 opacity-60" />
                  )}
                  <span className="text-[11px] text-slate-400">
                    {currentAd.mediaType === "video" ? "Video Creative" : "Image Creative"}
                  </span>
                </div>
              )}

              {firstVideoUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPlayingVideo(true);
                  }}
                  className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl hover:bg-indigo-500 hover:scale-110 transition-all cursor-pointer z-30"
                  title="Play Video Creative"
                >
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Extracted Product Info Pill */}
        {extractedProduct && (
          <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 truncate">
              <ShoppingBag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="font-bold text-indigo-700 dark:text-indigo-300 truncate">
                {extractedProduct.currentPrice || "Product Scraped"}
              </span>
              {extractedProduct.discountOrOffer && (
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded truncate">
                  {extractedProduct.discountOrOffer}
                </span>
              )}
            </div>
            <Link
              href="/products"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 flex items-center gap-0.5"
            >
              <span>View Hub</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
        )}

        {/* Title */}
        {currentAd.title && (
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1 line-clamp-1">
            {currentAd.title}
          </h4>
        )}

        {/* Copy / Caption */}
        {currentAd.caption && (
          <div className="mb-3">
            <p
              className={`text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed ${
                isExpanded ? "" : "line-clamp-3"
              }`}
            >
              {currentAd.caption}
            </p>
            {currentAd.caption.length > 120 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-1 cursor-pointer"
              >
                {isExpanded ? "Show less" : "Read full copy..."}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-2 mt-auto text-xs">
        {destinationUrl ? (
          <div className="flex items-center gap-1.5 max-w-[75%]">
            <a
              href={destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg shadow-sm transition-all truncate"
              title={`Direct Brand Website: ${destinationUrl}`}
            >
              <Globe className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
              <span className="truncate">
                {currentAd.ctaText || "Visit Store"} {targetDomain ? `• ${targetDomain}` : ""}
              </span>
              <ExternalLink className="w-3 h-3 text-indigo-200 shrink-0 ml-0.5" />
            </a>

            {!extractedProduct && (
              <button
                onClick={handleFetchProduct}
                disabled={isExtractingProduct}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200/60 dark:border-indigo-800/60 px-2.5 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer shrink-0 disabled:opacity-50"
                title="Scan Landing Page with Firecrawl to Extract Product, Price & Offers"
              >
                {isExtractingProduct ? (
                  <>
                    <RotateCw className="w-3 h-3 animate-spin text-indigo-500" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-3 h-3 text-indigo-500" />
                    <span>Fetch Product</span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 italic font-medium">No store website link</span>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRefreshMedia}
            disabled={isRefreshingMedia}
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors cursor-pointer"
            title="Refresh Single Ad Media Links"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshingMedia ? "animate-spin text-indigo-500" : ""}`} />
          </button>

          <button
            onClick={toggleArchive}
            disabled={isArchiving}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              isArchived
                ? "text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                : "text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            }`}
            title={isArchived ? "Unarchive Ad (Move to Active Feed)" : "Archive Ad (Move to Vault)"}
          >
            {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          </button>

          {(firstVideoUrl || displayImage) && (
            <a
              href={firstVideoUrl || displayImage}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors"
              title="Download Media File"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}

          <a
            href={`https://www.facebook.com/ads/library/?id=${currentAd.adArchiveId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-slate-700 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline inline-flex items-center gap-1 p-1 rounded-md"
            title="Open in Meta Ad Library"
          >
            Meta
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        imageUrls={previewImages}
        title={currentAd.title}
        pageName={currentAd.pageName || `Page ${currentAd.pageId}`}
        caption={currentAd.caption}
        destinationUrl={destinationUrl}
        adArchiveId={currentAd.adArchiveId}
      />

      {/* Product Creative Cluster Modal */}
      <ProductClusterModal
        isOpen={isClusterModalOpen}
        onClose={() => setIsClusterModalOpen(false)}
        initialAd={currentAd}
        adId={currentAd.id}
        pageId={currentAd.pageId}
        productKey={currentAd.productKey}
      />
    </div>
  );
}
