"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import { Ad, ScrapedProduct } from "@/types";
import { BrandLogo } from "@/components/brand-logo";
import { AdTranscriptViewer } from "@/components/ad-transcript-viewer";
import { useToast } from "@/components/toast-context";
import { cn, getCleanDomain, resolveDestinationUrl } from "@/lib/utils";
import { isGenuineVideoUrl, isFbCdnUrlExpired } from "@/lib/fb-cdn";
import { getSmartMediaUrl } from "@/lib/image-proxy-url";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Download,
  Copy,
  Check,
  RotateCw,
  Play,
  Layers,
  Sparkles,
  ShoppingBag,
  Building2,
  Package,
  Calendar,
  Clock,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Share2,
} from "lucide-react";

export interface ProductCreativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  ad: Ad | null;
  ads?: Ad[];
  currentIndex?: number;
  onNavigateIndex?: (index: number) => void;
  product?: ScrapedProduct | null;
  network?: any;
  onRefreshMedia?: (ad: Ad) => Promise<void>;
  isRefreshingMedia?: boolean;
}

export function ProductCreativeModal({
  isOpen,
  onClose,
  ad,
  ads = [],
  currentIndex = 0,
  onNavigateIndex,
  product,
  network,
  onRefreshMedia,
  isRefreshingMedia = false,
}: ProductCreativeModalProps) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "transcript">("overview");
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [copiedCopy, setCopiedCopy] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset transient states on ad switch
  useEffect(() => {
    setIsCaptionExpanded(false);
    setVideoError(false);
    setCurrentTime(0);
  }, [ad?.id]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Calculate ad duration in days
  const adDuration = useMemo(() => {
    if (!ad) return null;
    const dateStr = ad.startedRunningOn || ad.firstSeenAt;
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return Math.max(1, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
  }, [ad]);

  // Formatted date string
  const formattedStartDate = useMemo(() => {
    if (!ad) return null;
    const dateStr = ad.startedRunningOn || ad.firstSeenAt;
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [ad]);

  // Video and media resolution
  const isVideo = Boolean(
    ad?.mediaType === "video" ||
    ad?.mediaUrls?.some((u) => isGenuineVideoUrl(u)) ||
    ad?.storyboardUrls?.length
  );
  const videoUrl = ad?.mediaUrls?.find(isGenuineVideoUrl) || null;
  const isVideoExpired = videoUrl ? isFbCdnUrlExpired(videoUrl) : false;
  const activeVideo = videoUrl && !isVideoExpired && !videoError ? videoUrl : null;
  const rawThumbnail = ad?.signedThumbnailUrl || ad?.thumbnailUrl || ad?.mediaUrls?.[0] || null;
  const smartThumbnail = rawThumbnail ? getSmartMediaUrl(rawThumbnail) : null;

  const isArchived = Boolean(ad?.isArchived || ad?.isActive === false);

  const cleanDestUrl = useMemo(() => {
    const raw = ad?.linkUrl || product?.url;
    if (!raw) return null;
    return resolveDestinationUrl(raw) || raw;
  }, [ad?.linkUrl, product?.url]);

  const targetDomain = useMemo(() => {
    return cleanDestUrl ? getCleanDomain(cleanDestUrl) : product?.domain || null;
  }, [cleanDestUrl, product?.domain]);

  // Navigation handlers
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < ads.length - 1;

  const handlePrev = useCallback(() => {
    if (canGoPrev && onNavigateIndex) {
      onNavigateIndex(currentIndex - 1);
    }
  }, [canGoPrev, currentIndex, onNavigateIndex]);

  const handleNext = useCallback(() => {
    if (canGoNext && onNavigateIndex) {
      onNavigateIndex(currentIndex + 1);
    }
  }, [canGoNext, currentIndex, onNavigateIndex]);

  // Scoped Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "ArrowLeft") {
        if (canGoPrev) {
          e.preventDefault();
          e.stopPropagation();
          handlePrev();
        }
      } else if (e.key === "ArrowRight") {
        if (canGoNext) {
          e.preventDefault();
          e.stopPropagation();
          handleNext();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, canGoPrev, canGoNext, handlePrev, handleNext, onClose]);

  const handleCopyCopy = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const textToCopy = [ad?.title, ad?.caption].filter(Boolean).join("\n\n");
    if (!textToCopy) {
      showToast({
        type: "info",
        title: "No Text",
        message: "This creative has no extractable copy or headline.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedCopy(true);
      setTimeout(() => setCopiedCopy(false), 2000);
      showToast({
        type: "success",
        title: "Ad Copy Copied",
        message: "Headline & caption copied to clipboard.",
      });
    } catch {
      showToast({
        type: "error",
        title: "Copy Failed",
        message: "Could not access clipboard.",
      });
    }
  };

  const handleCopyArchiveId = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!ad?.adArchiveId) return;
    try {
      await navigator.clipboard.writeText(ad.adArchiveId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      showToast({
        type: "success",
        title: "Ad ID Copied",
        message: `ID ${ad.adArchiveId} copied to clipboard.`,
      });
    } catch {
      // ignore
    }
  };

  const handleSeekVideo = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  if (!isOpen || !mounted || !ad) return null;

  const downloadUrl = activeVideo || smartThumbnail || rawThumbnail;

  return createPortal(
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-6xl max-h-[94vh] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP BAR: Nav Stepper, View Tabs & Global Actions */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          {/* Sibling Stepper */}
          <div className="flex items-center gap-2">
            {ads.length > 1 && (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/80 p-0.5 shadow-xs">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={!canGoPrev}
                    className="p-1.5 rounded text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Previous Creative (← Left Arrow)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2.5 text-xs font-bold font-mono text-slate-700 dark:text-slate-200 select-none">
                    Ad {currentIndex + 1} of {ads.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!canGoNext}
                    className="p-1.5 rounded text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Next Creative (→ Right Arrow)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <span className="hidden md:inline-flex text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800/80 text-slate-500 border border-slate-300/60 dark:border-slate-700/60 select-none" title="Use Left and Right arrow keys">
                  ← / →
                </span>
              </div>
            )}

            {/* Quick format & status badge */}
            <div className="flex items-center gap-1.5">
              {isArchived ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  Stopped
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              )}

              {adDuration && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Flame className="w-3 h-3 text-amber-500" />
                  {adDuration}d running
                </span>
              )}
            </div>
          </div>

          {/* Center Tabs: Overview vs Transcript */}
          <div className="flex items-center bg-slate-200/70 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-300/60 dark:border-slate-700/60 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={cn(
                "px-3 py-1 rounded-lg transition-all cursor-pointer",
                activeTab === "overview"
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("transcript")}
              className={cn(
                "px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                activeTab === "transcript"
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <span>Transcript & Hooks</span>
              {ad.id && isVideo && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              )}
            </button>
          </div>

          {/* Action Links & Close */}
          <div className="flex items-center gap-2">
            {cleanDestUrl && (
              <a
                href={cleanDestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors shadow-xs"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-indigo-500" />
                <span>Visit Store</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            )}

            {ad.adArchiveId && (
              <a
                href={`https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-xs"
              >
                <span>Meta Ad Library</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MAIN BODY: 2-Column Responsive Layout */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: Authentic Meta Feed Simulation Card (5 cols) */}
            <div className="lg:col-span-5 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden lg:sticky lg:top-0">
                {/* Simulated Post Header */}
                <div className="p-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BrandLogo
                      name={ad.pageName || product?.title}
                      domain={targetDomain}
                      pageId={ad.pageId}
                      size="sm"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {ad.pageName || "Advertiser"}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span>{formattedStartDate || "Recent"}</span>
                        <span>•</span>
                        <span className="font-semibold text-indigo-500">Sponsored</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={isVideo ? "Download Video (.mp4)" : "Download Image"}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Simulated Primary Text / Hook Copy */}
                {(ad.caption || ad.title) && (
                  <div className="px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-200 space-y-1.5 border-b border-slate-100 dark:border-slate-800/50 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Primary Ad Copy
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyCopy}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {copiedCopy ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Hook</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p
                      className={cn(
                        "whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300 transition-all",
                        !isCaptionExpanded && "line-clamp-2"
                      )}
                    >
                      {ad.caption || ad.title}
                    </p>

                    {ad.caption && ad.caption.length > 120 && (
                      <button
                        type="button"
                        onClick={() => setIsCaptionExpanded(!isCaptionExpanded)}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {isCaptionExpanded ? "Show less" : "...Show more"}
                      </button>
                    )}
                  </div>
                )}

                {/* Media Container (Portrait 9:16 or Square) */}
                <div className="relative aspect-[4/5] sm:aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden">
                  {/* Expired Token Notice */}
                  {isVideoExpired && (
                    <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between p-2 rounded-lg bg-amber-950/90 border border-amber-600/40 text-amber-200 text-[11px] backdrop-blur-md">
                      <div className="flex items-center gap-1.5 truncate">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">Media CDN link expired</span>
                      </div>
                      {onRefreshMedia && (
                        <button
                          type="button"
                          onClick={() => onRefreshMedia(ad)}
                          disabled={isRefreshingMedia}
                          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold border border-amber-400/30 flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <RotateCw className={cn("w-3 h-3", isRefreshingMedia && "animate-spin")} />
                          <span>Refresh</span>
                        </button>
                      )}
                    </div>
                  )}

                  {activeVideo ? (
                    <video
                      ref={videoRef}
                      src={activeVideo}
                      poster={smartThumbnail || undefined}
                      controls
                      autoPlay
                      playsInline
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                      {...({ referrerPolicy: "no-referrer" } as any)}
                      className="w-full h-full object-contain bg-black"
                      onError={() => setVideoError(true)}
                    />
                  ) : smartThumbnail ? (
                    <NextImage
                      src={smartThumbnail}
                      alt={ad.title || "Ad creative"}
                      fill
                      unoptimized
                      referrerPolicy="no-referrer"
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-600">
                      <Play className="w-10 h-10 fill-slate-700" />
                      <span className="text-xs font-semibold">Media not available</span>
                    </div>
                  )}
                </div>

                {/* Simulated Meta Post Footer: Domain + Headline + CTA Button */}
                <div className="p-3 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] uppercase font-bold text-slate-400 truncate">
                      {targetDomain || "store-checkout.com"}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {ad.title || product?.title || "Special Offer Today"}
                    </h4>
                  </div>

                  {cleanDestUrl ? (
                    <a
                      href={cleanDestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition-colors shrink-0 shadow-xs flex items-center gap-1"
                    >
                      <span>{ad.ctaText || "Shop now"}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 shrink-0">
                      {ad.ctaText || "Shop now"}
                    </span>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Bento Intelligence Grid OR Transcript Viewer (7 cols) */}
              <div className="lg:col-span-7">
                {activeTab === "transcript" ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 shadow-xs">
                    {ad.id ? (
                      <AdTranscriptViewer
                        adId={ad.id}
                        onSeek={handleSeekVideo}
                        currentTime={currentTime}
                        variant="full-tab"
                      />
                    ) : (
                      <div className="text-center py-12 text-sm text-slate-500">
                        No transcript available for this creative.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* BENTO CARD 1: Ad Velocity & Scaling Signals */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      Ad Velocity & Scale
                    </span>
                    {ad.adArchiveId && (
                      <button
                        type="button"
                        onClick={handleCopyArchiveId}
                        className="text-[10px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1"
                        title="Copy Meta Ad Archive ID"
                      >
                        <span>ID: {ad.adArchiveId}</span>
                        {copiedId ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Duration
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {adDuration ? `${adDuration} Days Running` : "Just Launched"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        First Seen
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {formattedStartDate || "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        Active Clones / Copies
                      </span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        {ad.duplicationCount ? `${ad.duplicationCount} Active Copies` : "1 Copy"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-500">Media Format</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                        {ad.mediaType || (isVideo ? "Video" : "Image")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* BENTO CARD 2: Product Landing Page & Store */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-indigo-500" />
                      Product & Store
                    </span>
                    {product?.storePlatform && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
                        {product.storePlatform}
                      </span>
                    )}
                  </div>

                  {/* 2x2 Photo Quad from Landing Page */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {(product?.galleryImages?.slice(0, 4) || (product?.mainImageUrl ? [product.mainImageUrl] : [])).map((img, i) => (
                      <div key={i} className="relative aspect-square rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-700/60">
                        <NextImage
                          src={getSmartMediaUrl(img)}
                          alt="Product thumb"
                          fill
                          unoptimized
                          referrerPolicy="no-referrer"
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Retail Price</span>
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {product?.currentPrice ? `${product.currentPrice} ${product.currency || ""}` : "Not detected"}
                      </span>
                    </div>
                    {product?.url && (
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate"
                      >
                        <span>{product.title || product.domain || "View Landing Page"}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    )}
                  </div>
                </div>

                {/* BENTO CARD 3: Page & Brand Strength */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                      Brand Strength
                    </span>
                    {ad.pageId && (
                      <span className="text-[10px] font-mono text-slate-400">
                        Page {ad.pageId}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 py-1">
                    <div className="flex flex-col">
                      <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                        {network?.connectedPages?.[0]?.activeAdsCount || product?.activeAdsCount || ads.length}
                      </span>
                      <span className="text-[11px] text-slate-400">Active Meta Ads</span>
                    </div>

                    <div className="h-10 w-px bg-slate-200 dark:bg-slate-800" />

                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {ad.pageName || product?.domain || "Advertiser"}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate">
                        {network?.connectedPages?.length ? `${network.connectedPages.length} Connected Page(s)` : "Single Brand Page"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* BENTO CARD 4: Sourcing & Supplier */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-indigo-500" />
                      Sourcing Opportunities
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      {product?.supplierUrls?.length ? `${product.supplierUrls.length} Matched` : "Ready"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {product?.supplierUrls && product.supplierUrls.length > 0 ? (
                      <div className="space-y-1.5">
                        {product.supplierUrls.slice(0, 2).map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-xs hover:border-indigo-500 transition-colors"
                          >
                            <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px]">
                              Supplier #{idx + 1}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-center">
                        <span className="text-xs text-slate-500">
                          Search 1688 / AliExpress for dropshipping suppliers.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>,
  document.body
);
}
