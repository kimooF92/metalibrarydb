"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Globe,
  Maximize2,
  Minimize2,
  AlertTriangle,
  RotateCw,
  Copy,
  Check,
  Video,
  Play,
  Image as ImageIcon,
  Layers,
  Sparkles,
  LayoutDashboard,
  Mic,
} from "lucide-react";
import { cn, getCleanDomain, resolveDestinationUrl, isRtlText } from "@/lib/utils";
import { isFbCdnUrlExpired } from "@/lib/fb-cdn";
import { getProxiedImageUrl, getSmartMediaUrl } from "@/lib/image-proxy-url";
import { BrandLogo } from "@/components/brand-logo";
import { AdTranscriptViewer } from "@/components/ad-transcript-viewer";
import { useToast } from "@/components/toast-context";

export interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  adId?: string | null;
  imageUrls: string[];
  initialIndex?: number;
  initialTab?: "overview" | "transcript";
  title?: string | null;
  pageName?: string | null;
  pageId?: string | null;
  caption?: string | null;
  destinationUrl?: string | null;
  adArchiveId?: string | null;
  videoUrl?: string | null;
  fallbackThumbnail?: string | null;
  isVideoAd?: boolean;
  startDate?: string | null;
  startedRunningOn?: string | null;
  isActive?: boolean;
  onRefreshMedia?: () => void | Promise<void>;
  isRefreshingMedia?: boolean;
}

export function ImagePreviewModal({
  isOpen,
  onClose,
  adId,
  imageUrls,
  initialIndex = 0,
  initialTab = "overview",
  title,
  pageName,
  pageId,
  caption,
  destinationUrl,
  adArchiveId,
  videoUrl,
  fallbackThumbnail,
  isVideoAd = false,
  startDate,
  startedRunningOn,
  isActive,
  onRefreshMedia,
  isRefreshingMedia = false,
}: ImagePreviewModalProps) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "transcript">(initialTab);
  const [videoError, setVideoError] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isVideoExpired = videoUrl ? isFbCdnUrlExpired(videoUrl) : false;
  const activeVideo = videoUrl && !isVideoExpired && !videoError ? videoUrl : null;
  const isExpiredVideo = isVideoAd && Boolean(videoUrl) && (isVideoExpired || videoError);
  const isVideoSnapshotOnly = isVideoAd && !videoUrl;

  const canTranscribe = Boolean(adId && (isVideoAd || activeVideo || videoUrl));
  const hasDetails = Boolean(caption || title || destinationUrl || canTranscribe);
  // Default to Theater mode if there are no details, otherwise Split view
  const [isTheaterMode, setIsTheaterMode] = useState(!hasDetails);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab, adId]);

  useEffect(() => {
    setVideoError(false);
    setImgError(false);
  }, [videoUrl, imageUrls, fallbackThumbnail, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsTheaterMode(!hasDetails);
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, hasDetails]);

  const displayMediaList = useMemo(() => {
    if (imageUrls.length > 0) return imageUrls;
    if (fallbackThumbnail) return [fallbackThumbnail];
    if (activeVideo) return [activeVideo];
    return [];
  }, [imageUrls, fallbackThumbnail, activeVideo]);

  const cleanDestUrl = useMemo(() => {
    if (!destinationUrl) return null;
    return resolveDestinationUrl(destinationUrl) || destinationUrl;
  }, [destinationUrl]);

  const targetDomain = useMemo(() => {
    return cleanDestUrl ? getCleanDomain(cleanDestUrl) : null;
  }, [cleanDestUrl]);

  const isRtl = useMemo(() => {
    return isRtlText(caption) || isRtlText(title);
  }, [caption, title]);

  // Handle keyboard shortcuts (Escape to close, Arrows for carousel, T for Theater toggle)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Skip navigation if typing in an input
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return;

      if (e.key === "ArrowLeft" && displayMediaList.length > 1 && !activeVideo) {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : displayMediaList.length - 1));
      } else if (e.key === "ArrowRight" && displayMediaList.length > 1 && !activeVideo) {
        setCurrentIndex((prev) => (prev < displayMediaList.length - 1 ? prev + 1 : 0));
      } else if ((e.key === "t" || e.key === "T") && hasDetails) {
        setIsTheaterMode((prev) => !prev);
      }
    },
    [isOpen, onClose, displayMediaList.length, activeVideo, hasDetails]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSeekVideo = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  if (!isOpen || !mounted) return null;

  const currentMedia = displayMediaList[currentIndex] || displayMediaList[0];
  const isImageExpired = !isVideoAd && currentMedia ? isFbCdnUrlExpired(currentMedia) : false;
  const isExpiredImage = !isVideoAd && Boolean(currentMedia || fallbackThumbnail) && (isImageExpired || imgError);
  const downloadHref = activeVideo || currentMedia || fallbackThumbnail;
  const fullSizeHref = activeVideo || currentMedia || fallbackThumbnail;

  const handleCopyAdCopy = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const textToCopy = [title, caption].filter(Boolean).join("\n\n");
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
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
    if (!adArchiveId) return;

    try {
      await navigator.clipboard.writeText(adArchiveId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      showToast({
        type: "success",
        title: "Ad ID Copied",
        message: `ID ${adArchiveId} copied to clipboard.`,
      });
    } catch {
      // ignore
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/75 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Cohesive Modal Dialog */}
      <div
        className={cn(
          "relative flex flex-col w-full bg-slate-900/95 dark:bg-slate-950/95 border border-slate-700/60 dark:border-slate-800/80 rounded-2xl shadow-2xl shadow-black/60 backdrop-blur-xl overflow-hidden transition-all duration-200 animate-in zoom-in-95 duration-150",
          isTheaterMode || !hasDetails
            ? "max-w-4xl max-h-[92vh]"
            : "max-w-5xl xl:max-w-6xl max-h-[92vh]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-800/80 bg-slate-900/90 dark:bg-slate-950/90 shrink-0">
          {/* Brand Info */}
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo name={pageName} domain={targetDomain} pageId={pageId} size="sm" />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                  {pageName || (activeVideo ? "Ad Video Preview" : "Ad Media Preview")}
                </h3>
                {isActive !== undefined && (
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0",
                      isActive
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-slate-500/20 text-slate-300 border-slate-500/30"
                    )}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </span>
                )}
              </div>
              {adArchiveId && (
                <button
                  type="button"
                  onClick={handleCopyArchiveId}
                  className="text-[11px] text-slate-400 hover:text-slate-200 font-mono inline-flex items-center gap-1 transition-colors cursor-pointer w-fit group"
                  title="Click to copy Ad Archive ID"
                >
                  <span>ID: {adArchiveId}</span>
                  {copiedId ? (
                    <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-2.5 h-2.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Multi-image slide counter */}
            {displayMediaList.length > 1 && !activeVideo && (
              <span className="text-xs font-semibold text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 inline-flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  {currentIndex + 1} / {displayMediaList.length}
                </span>
              </span>
            )}

            {/* Download Button */}
            {downloadHref && (
              <a
                href={downloadHref}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800/90 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700/80 transition-colors cursor-pointer"
                title={activeVideo ? "Download Video Creative (.mp4)" : "Download Media File"}
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Download</span>
              </a>
            )}

            {/* Full Size Tab */}
            {fullSizeHref && (
              <a
                href={fullSizeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 sm:px-3 sm:py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 bg-slate-800/90 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700/80 transition-colors cursor-pointer"
                title="Open high resolution media in new tab"
              >
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Full Size</span>
              </a>
            )}

            {/* Theater Mode Toggle (Available when ad has details) */}
            {hasDetails && (
              <button
                type="button"
                onClick={() => setIsTheaterMode(!isTheaterMode)}
                className={cn(
                  "p-1.5 sm:px-3 sm:py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer",
                  isTheaterMode
                    ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-600/30"
                    : "bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700/80"
                )}
                title={isTheaterMode ? "Show Details Panel (T)" : "Theater Mode (T)"}
              >
                {isTheaterMode ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Details</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden sm:inline">Theater</span>
                  </>
                )}
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/90 rounded-lg transition-colors cursor-pointer ml-1"
              title="Close Preview (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body Area */}
        <div
          className={cn(
            "flex flex-1 overflow-hidden min-h-0",
            isTheaterMode || !hasDetails ? "flex-col" : "flex-col lg:flex-row"
          )}
        >
          {/* Main Media Stage */}
          <div className="relative flex-1 bg-slate-950 flex flex-col items-center justify-center p-3 sm:p-5 select-none overflow-hidden min-h-[340px] sm:min-h-[460px]">
            {/* Video Snapshot (Stream Not Yet Loaded) Notice Badge */}
            {isVideoSnapshotOnly && (
              <div className="absolute top-3 left-3 right-3 sm:right-auto z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-indigo-500/40 text-slate-200 text-xs shadow-lg backdrop-blur-md">
                <Play className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400/20 shrink-0" />
                <span className="truncate">Video ad • Showing snapshot</span>
                {adArchiveId && (
                  <a
                    href={`https://www.facebook.com/ads/library/?id=${adArchiveId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline font-semibold text-indigo-300 hover:text-white shrink-0"
                  >
                    Meta ↗
                  </a>
                )}
                {onRefreshMedia && (
                  <button
                    type="button"
                    onClick={onRefreshMedia}
                    disabled={isRefreshingMedia}
                    className="ml-auto sm:ml-2 px-2.5 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 font-semibold border border-indigo-400/30 flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0 transition-colors"
                    title="Fetch full video (.mp4) on demand"
                  >
                    <RotateCw className={`w-3 h-3 ${isRefreshingMedia ? "animate-spin" : ""}`} />
                    <span>{isRefreshingMedia ? "Fetching..." : "Fetch Video"}</span>
                  </button>
                )}
              </div>
            )}

            {/* Expired Video Notice Badge */}
            {isExpiredVideo && (
              <div className="absolute top-3 left-3 right-3 sm:right-auto z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/90 border border-amber-600/40 text-amber-200 text-xs shadow-lg backdrop-blur-md">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">Video expired on Meta CDN • Showing snapshot</span>
                {adArchiveId && (
                  <a
                    href={`https://www.facebook.com/ads/library/?id=${adArchiveId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline font-semibold text-amber-300 hover:text-white shrink-0"
                  >
                    Meta ↗
                  </a>
                )}
                {onRefreshMedia && (
                  <button
                    type="button"
                    onClick={onRefreshMedia}
                    disabled={isRefreshingMedia}
                    className="ml-auto sm:ml-2 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold border border-amber-400/30 flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RotateCw className={`w-3 h-3 ${isRefreshingMedia ? "animate-spin" : ""}`} />
                    <span>{isRefreshingMedia ? "Refreshing..." : "Refresh"}</span>
                  </button>
                )}
              </div>
            )}

            {/* Expired Image Notice Badge */}
            {isExpiredImage && (
              <div className="absolute top-3 left-3 right-3 sm:right-auto z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/90 border border-amber-600/40 text-amber-200 text-xs shadow-lg backdrop-blur-md">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">Image token expired on Meta CDN</span>
                {adArchiveId && (
                  <a
                    href={`https://www.facebook.com/ads/library/?id=${adArchiveId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline font-semibold text-amber-300 hover:text-white shrink-0"
                  >
                    Meta ↗
                  </a>
                )}
                {onRefreshMedia && (
                  <button
                    type="button"
                    onClick={onRefreshMedia}
                    disabled={isRefreshingMedia}
                    className="ml-auto sm:ml-2 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold border border-amber-400/30 flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RotateCw className={`w-3 h-3 ${isRefreshingMedia ? "animate-spin" : ""}`} />
                    <span>{isRefreshingMedia ? "Refreshing..." : "Refresh"}</span>
                  </button>
                )}
              </div>
            )}

            {/* Carousel Previous Button */}
            {displayMediaList.length > 1 && !activeVideo && (
              <button
                type="button"
                onClick={() =>
                  setCurrentIndex((prev) => (prev > 0 ? prev - 1 : displayMediaList.length - 1))
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-sm transition-all hover:scale-110 cursor-pointer"
                title="Previous Image (←)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Media Player Element */}
            <div className="relative flex items-center justify-center max-h-[75vh] max-w-full rounded-xl overflow-hidden shadow-2xl border border-slate-800/80 bg-slate-950">
              {activeVideo ? (
                <video
                  ref={videoRef}
                  src={activeVideo}
                  poster={fallbackThumbnail || undefined}
                  controls
                  autoPlay
                  playsInline
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  {...({ referrerPolicy: "no-referrer" } as any)}
                  className="max-h-[75vh] max-w-full object-contain rounded-xl"
                  onError={() => setVideoError(true)}
                />
              ) : currentMedia || fallbackThumbnail ? (
                <img
                  src={getSmartMediaUrl(currentMedia || fallbackThumbnail)}
                  alt={title || pageName || "Ad preview"}
                  referrerPolicy="no-referrer"
                  className="max-h-[75vh] max-w-full object-contain rounded-xl select-none"
                  onError={(e) => {
                    const target = e.currentTarget;
                    const source = currentMedia || fallbackThumbnail;
                    if (source && !target.src.includes("/api/spy/image-proxy")) {
                      target.src = `/api/spy/image-proxy?url=${encodeURIComponent(source)}`;
                    } else {
                      setImgError(true);
                    }
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-slate-400 gap-2">
                  <ImageIcon className="w-10 h-10 opacity-40" />
                  <span className="text-xs">No media preview available</span>
                </div>
              )}
            </div>

            {/* Carousel Next Button */}
            {displayMediaList.length > 1 && !activeVideo && (
              <button
                type="button"
                onClick={() =>
                  setCurrentIndex((prev) => (prev < displayMediaList.length - 1 ? prev + 1 : 0))
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-sm transition-all hover:scale-110 cursor-pointer"
                title="Next Image (→)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}

            {/* Carousel Dots */}
            {displayMediaList.length > 1 && !activeVideo && (
              <div className="flex items-center gap-1.5 mt-3 z-10">
                {displayMediaList.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      "h-2 rounded-full transition-all cursor-pointer",
                      idx === currentIndex ? "w-6 bg-indigo-500" : "w-2 bg-slate-700 hover:bg-slate-500"
                    )}
                    title={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Details & Ad Intel Panel (Split View on Desktop) */}
          {!isTheaterMode && hasDetails && (
            <div className="w-full lg:w-[400px] xl:w-[440px] flex flex-col shrink-0 border-t lg:border-t-0 lg:border-l border-slate-800/80 bg-slate-900/60 dark:bg-slate-950/60 backdrop-blur-xl overflow-hidden max-h-[82vh]">
              {/* Tab Switcher Header (When Video Ad with AI Transcription Capability) */}
              {canTranscribe && (
                <div className="flex items-center p-2 bg-slate-900/90 dark:bg-slate-950/90 border-b border-slate-800/80 shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer",
                      activeTab === "overview"
                        ? "bg-slate-800/90 text-white shadow-sm border border-slate-700/80"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    )}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Overview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("transcript")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer relative",
                      activeTab === "transcript"
                        ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    )}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Voiceover & Hooks</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      AI
                    </span>
                  </button>
                </div>
              )}

              {/* Scrollable Panel Body */}
              <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-800/80">
                {activeTab === "transcript" && canTranscribe ? (
                  <AdTranscriptViewer
                    adId={adId!}
                    variant="full-tab"
                    currentTime={currentTime}
                    onSeek={handleSeekVideo}
                  />
                ) : (
                  <>
                    {/* Primary CTA: Visit Store */}
                    {cleanDestUrl && (
                      <div className="p-4 sm:p-5">
                        <a
                          href={cleanDestUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group w-full inline-flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-1.5 rounded-lg bg-white/10 shrink-0">
                              <Globe className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex flex-col text-left truncate">
                              <span className="text-xs font-bold leading-tight">Visit Store</span>
                              {targetDomain && (
                                <span className="text-[11px] text-indigo-200/90 truncate font-mono">
                                  {targetDomain}
                                </span>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-indigo-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                        </a>
                      </div>
                    )}

                    {/* Meta Ad Library Row */}
                    {adArchiveId && (
                      <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Meta Ad Library</span>
                        </div>
                        <a
                          href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${adArchiveId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition-colors cursor-pointer"
                        >
                          <span>View in Library</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                      </div>
                    )}

                    {/* AI Voiceover Feature Teaser Banner (Overview Tab) */}
                    {canTranscribe && (
                      <div className="px-4 sm:px-5 py-3">
                        <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-950/50 to-slate-900 border border-indigo-500/30 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 shrink-0">
                              <Mic className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col text-left truncate">
                              <span className="text-xs font-bold text-white leading-tight">Voiceover & Hook Tab</span>
                              <span className="text-[11px] text-slate-400 truncate">3.2s stop-the-scroll hook & script</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("transcript")}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shrink-0 cursor-pointer shadow-md shadow-indigo-600/25 transition-all"
                          >
                            Explore Tab →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Ad Headline & Caption Section */}
                    {(caption || title) && (
                      <div className="p-4 sm:p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Ad Copy & Hooks
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyAdCopy}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors cursor-pointer"
                          >
                            {copiedText ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedText ? "Copied!" : "Copy"}</span>
                          </button>
                        </div>

                        {title && (
                          <h4
                            dir={isRtl ? "rtl" : "ltr"}
                            className={cn(
                              "text-xs font-bold text-white leading-snug",
                              isRtl ? "text-right" : "text-left"
                            )}
                          >
                            {title}
                          </h4>
                        )}

                        {caption && (
                          <div
                            dir={isRtl ? "rtl" : "ltr"}
                            className={cn(
                              "p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap select-text font-normal",
                              isRtl ? "text-right" : "text-left"
                            )}
                          >
                            {caption}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Creative Metadata / Specs */}
                    <div className="p-4 sm:p-5 flex items-center justify-between text-[11px] text-slate-400 font-mono mt-auto">
                      <span className="flex items-center gap-1.5">
                        {isVideoAd || activeVideo ? (
                          <>
                            <Video className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Video (.mp4)</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Image Creative</span>
                          </>
                        )}
                      </span>
                      {(startedRunningOn || startDate) && (
                        <span>
                          Started:{" "}
                          {new Date(startedRunningOn || startDate!).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Compact Bottom Bar (Only when in Theater Mode and has details) */}
        {isTheaterMode && hasDetails && (
          <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-900/90 dark:bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="flex-1 min-w-0 flex items-center gap-2 w-full sm:w-auto">
              {caption && (
                <p
                  dir={isRtl ? "rtl" : "ltr"}
                  className="text-xs text-slate-300 line-clamp-1 truncate max-w-xl"
                  title={caption}
                >
                  {caption}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              {caption && (
                <button
                  type="button"
                  onClick={handleCopyAdCopy}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
                >
                  {copiedText ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedText ? "Copied" : "Copy"}</span>
                </button>
              )}
              {cleanDestUrl && (
                <a
                  href={cleanDestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Visit Store {targetDomain ? `(${targetDomain})` : ""}</span>
                  <ExternalLink className="w-3 h-3 text-indigo-200" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
