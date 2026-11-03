"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Globe,
  Maximize2,
  ZoomIn,
  AlertTriangle,
  RotateCw,
} from "lucide-react";
import { getCleanDomain } from "@/lib/utils";
import { isFbCdnUrlExpired } from "@/lib/fb-cdn";
import { getProxiedImageUrl, getSmartMediaUrl } from "@/lib/image-proxy-url";

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrls: string[];
  initialIndex?: number;
  title?: string | null;
  pageName?: string | null;
  caption?: string | null;
  destinationUrl?: string | null;
  adArchiveId?: string | null;
  videoUrl?: string | null;
  fallbackThumbnail?: string | null;
  isVideoAd?: boolean;
  onRefreshMedia?: () => void | Promise<void>;
  isRefreshingMedia?: boolean;
}

export function ImagePreviewModal({
  isOpen,
  onClose,
  imageUrls,
  initialIndex = 0,
  title,
  pageName,
  caption,
  destinationUrl,
  adArchiveId,
  videoUrl,
  fallbackThumbnail,
  isVideoAd = false,
  onRefreshMedia,
  isRefreshingMedia = false,
}: ImagePreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    setVideoError(false);
  }, [videoUrl, isOpen]);

  const isVideoExpired = videoUrl ? isFbCdnUrlExpired(videoUrl) : false;
  const activeVideo = videoUrl && !isVideoExpired && !videoError ? videoUrl : null;
  const isExpiredVideo = isVideoAd && Boolean(videoUrl) && (isVideoExpired || videoError);

  const displayMediaList = imageUrls.length > 0
    ? imageUrls
    : fallbackThumbnail
    ? [fallbackThumbnail]
    : activeVideo
    ? [activeVideo]
    : [];

  // Handle ESC key press
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && displayMediaList.length > 1) {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : displayMediaList.length - 1));
      }
      if (e.key === "ArrowRight" && displayMediaList.length > 1) {
        setCurrentIndex((prev) => (prev < displayMediaList.length - 1 ? prev + 1 : 0));
      }
    },
    [isOpen, onClose, displayMediaList.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen || (displayMediaList.length === 0 && !activeVideo)) return null;

  const currentMedia = displayMediaList[currentIndex] || displayMediaList[0];
  const targetDomain = destinationUrl ? getCleanDomain(destinationUrl) : null;
  const downloadHref = activeVideo || currentMedia || fallbackThumbnail;
  const fullSizeHref = activeVideo || currentMedia || fallbackThumbnail;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/90 p-4 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="w-full max-w-6xl flex items-center justify-between gap-4 py-2 px-4 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-100 shadow-xl shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
            <ZoomIn className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="text-sm font-bold text-white truncate">
              {pageName || (activeVideo ? "Ad Video Preview" : "Ad Media Preview")}
            </h3>
            {adArchiveId && (
              <span className="text-[11px] text-zinc-400 font-mono">
                Ad Archive ID: {adArchiveId}
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {displayMediaList.length > 1 && !activeVideo && (
            <span className="text-xs font-semibold text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-md border border-zinc-700 mr-2">
              {currentIndex + 1} / {displayMediaList.length}
            </span>
          )}

          {downloadHref && (
            <a
              href={downloadHref}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 hover:text-white rounded-lg border border-zinc-700 transition-all cursor-pointer"
              title={activeVideo ? "Download Video Creative (.mp4)" : "Download Media File"}
            >
              <Download className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Download</span>
            </a>
          )}

          {fullSizeHref && (
            <a
              href={fullSizeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 hover:text-white rounded-lg border border-zinc-700 transition-all cursor-pointer"
              title="Open high resolution original media in new tab"
            >
              <Maximize2 className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Full Size</span>
            </a>
          )}

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer ml-1"
            title="Close Preview (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Display Area */}
      <div
        className="relative flex-1 w-full max-w-6xl flex items-center justify-center my-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous Button */}
        {displayMediaList.length > 1 && !activeVideo && (
          <button
            onClick={() =>
              setCurrentIndex((prev) => (prev > 0 ? prev - 1 : displayMediaList.length - 1))
            }
            className="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-zinc-900/80 hover:bg-indigo-600 text-white border border-zinc-700/80 shadow-2xl transition-all hover:scale-110 cursor-pointer"
            title="Previous Image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Media Container (Video or Fallback Image) */}
        <div className="relative max-h-[75vh] max-w-full rounded-xl overflow-hidden shadow-2xl border border-zinc-800/80 bg-zinc-950 flex items-center justify-center">
          {/* Expired Video Notice Badge */}
          {isExpiredVideo && (
            <div className="absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/90 border border-amber-600/40 text-amber-200 text-xs shadow-lg backdrop-blur-md">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Video link expired on Meta CDN • Showing snapshot thumbnail</span>
              {adArchiveId && (
                <a
                  href={`https://www.facebook.com/ads/library/?id=${adArchiveId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 underline font-semibold text-amber-300 hover:text-white"
                >
                  View on Meta ↗
                </a>
              )}
              {onRefreshMedia && (
                <button
                  type="button"
                  onClick={onRefreshMedia}
                  disabled={isRefreshingMedia}
                  className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold border border-amber-400/30 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Request fresh media URLs from Meta Ad Library"
                >
                  <RotateCw className={`w-3 h-3 ${isRefreshingMedia ? "animate-spin" : ""}`} />
                  <span>{isRefreshingMedia ? "Refreshing..." : "Refresh"}</span>
                </button>
              )}
            </div>
          )}

          {activeVideo ? (
            <video
              src={activeVideo}
              poster={fallbackThumbnail || undefined}
              controls
              autoPlay
              playsInline
              {...({ referrerPolicy: "no-referrer" } as any)}
              className="max-h-[75vh] max-w-full object-contain rounded-xl"
              onError={() => setVideoError(true)}
            />
          ) : (
            /* eslint-disable-next-html-shortcut */
            <img
              src={getSmartMediaUrl(fallbackThumbnail || currentMedia)}
              alt={title || pageName || "Ad preview"}
              referrerPolicy="no-referrer"
              className="max-h-[75vh] max-w-full object-contain rounded-xl select-none"
              onError={(e) => {
                const target = e.currentTarget;
                const source = fallbackThumbnail || currentMedia;
                if (source && !target.src.includes("/api/spy/image-proxy") && !target.src.includes("workers.dev")) {
                  target.src = getProxiedImageUrl(source);
                }
              }}
            />
          )}
        </div>

        {/* Next Button */}
        {displayMediaList.length > 1 && !activeVideo && (
          <button
            onClick={() =>
              setCurrentIndex((prev) => (prev < displayMediaList.length - 1 ? prev + 1 : 0))
            }
            className="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-zinc-900/80 hover:bg-indigo-600 text-white border border-zinc-700/80 shadow-2xl transition-all hover:scale-110 cursor-pointer"
            title="Next Image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Footer Info Banner */}
      {(title || caption || destinationUrl) && (
        <div
          className="w-full max-w-6xl p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 shadow-xl shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col min-w-0 max-w-3xl">
            {title && (
              <h4 className="text-xs font-bold text-white mb-0.5 line-clamp-1">
                {title}
              </h4>
            )}
            {caption && (
              <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed font-normal">
                {caption}
              </p>
            )}
          </div>

          {destinationUrl && (
            <a
              href={destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg shadow-lg shadow-indigo-600/30 transition-all shrink-0 cursor-pointer"
            >
              <Globe className="w-4 h-4 text-indigo-200" />
              <span>Visit Store {targetDomain ? `(${targetDomain})` : ""}</span>
              <ExternalLink className="w-3.5 h-3.5 text-indigo-200" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
