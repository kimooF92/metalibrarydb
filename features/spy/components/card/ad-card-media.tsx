"use client";

import type React from "react";
import type { AdMediaConfig } from "../../types";
import { Play, Image as ImageIcon, Camera, ChevronLeft, ChevronRight, Layers } from "lucide-react";

export interface AdCardMediaProps {
  config: AdMediaConfig;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onOpenPreview: () => void;
  onImageError: () => void;
  onVideoError: () => void;
  onPlayingVideoChange: (playing: boolean) => void;
  onPrevSlide: (e: React.MouseEvent) => void;
  onNextSlide: (e: React.MouseEvent) => void;
}

export function AdCardMedia({
  config,
  videoRef,
  onOpenPreview,
  onImageError,
  onVideoError,
  onPlayingVideoChange,
  onPrevSlide,
  onNextSlide,
}: AdCardMediaProps) {
  const {
    firstVideoUrl,
    displayThumbnail,
    isVideoAd,
    isVideoExpired,
    canPlayVideo,
    isCarousel,
    previewImages,
    carouselIndex,
    imgError,
    isLoadingMedia,
    isPlayingVideo,
    activeImageSrc,
    mediaType,
    title,
  } = config;

  return (
    <div
      className="relative w-full h-[280px] sm:h-[320px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-900/95 dark:bg-slate-950 mb-3 flex items-center justify-center cursor-pointer"
      onClick={onOpenPreview}
      onMouseEnter={() => {
        if (canPlayVideo && videoRef.current) {
          videoRef.current.play().catch(() => {});
          onPlayingVideoChange(true);
        }
      }}
      onMouseLeave={() => {
        if (canPlayVideo && videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
          onPlayingVideoChange(false);
        }
      }}
    >
      <div className="relative w-full h-full group/media flex items-center justify-center">
        {isLoadingMedia ? (
          <div className="text-[11px] text-slate-400">Loading media…</div>
        ) : canPlayVideo && firstVideoUrl ? (
          <>
            {/* Ambient Blurred Background Canvas */}
            {displayThumbnail && (
              <img
                src={displayThumbnail}
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 dark:opacity-30 scale-125 select-none pointer-events-none"
              />
            )}

            {/* Main Crisp Video Player */}
            <div className="relative w-full h-full p-2 flex items-center justify-center z-10">
              <video
                ref={videoRef}
                src={firstVideoUrl}
                poster={displayThumbnail || undefined}
                preload="none"
                playsInline
                muted
                loop
                {...({ referrerPolicy: "no-referrer" } as any)}
                className="w-full h-full object-contain transition-transform duration-300 group-hover/media:scale-[1.01] drop-shadow-md rounded-lg"
                onError={() => {
                  onVideoError();
                  onPlayingVideoChange(false);
                }}
              />
            </div>

            {/* Video Play Badge */}
            <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-bold text-white shadow-md border border-white/10 pointer-events-none">
              <Play className={`w-2.5 h-2.5 text-indigo-400 fill-indigo-400 ${isPlayingVideo ? "animate-pulse" : ""}`} />
              <span>{isPlayingVideo ? "PLAYING" : "HOVER TO PLAY"}</span>
            </div>
          </>
        ) : activeImageSrc && !imgError ? (
          <>
            {/* Ambient Blurred Background Canvas */}
            <img
              src={activeImageSrc}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 dark:opacity-30 scale-125 select-none pointer-events-none"
            />

            {/* Main Crisp Uncropped Image */}
            <div className="relative w-full h-full p-2 flex items-center justify-center z-10">
              <img
                src={activeImageSrc}
                alt={title || "Ad creative"}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain transition-transform duration-300 group-hover/media:scale-[1.02] drop-shadow-md select-none"
                onError={onImageError}
              />
            </div>

            {/* Snapshot Indicator for Expired Video */}
            {isVideoAd && isVideoExpired && (
              <div
                className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-medium text-slate-300 shadow-md border border-white/10 pointer-events-none"
                title="Video link expired on Meta CDN (24-48h token limit). Displaying original snapshot thumbnail."
              >
                <Camera className="w-2.5 h-2.5 text-amber-400" />
                <span>Snapshot (Video Expired)</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400 font-medium">
            {mediaType === "video" ? (
              <Play className="w-8 h-8 text-indigo-400 opacity-70" />
            ) : (
              <ImageIcon className="w-8 h-8 opacity-60" />
            )}
            <span className="text-[11px] text-slate-400">
              {mediaType === "video" ? "Video Creative" : "Image Creative"}
            </span>
          </div>
        )}

        {/* Carousel Multi-Slide Navigation Controls */}
        {isCarousel && previewImages.length > 1 && !canPlayVideo && (
          <>
            <button
              type="button"
              onClick={onPrevSlide}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer z-20 shadow-md border border-white/20 opacity-0 group-hover/media:opacity-100"
              title="Previous Slide"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNextSlide}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer z-20 shadow-md border border-white/20 opacity-0 group-hover/media:opacity-100"
              title="Next Slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Slide Counter Pill */}
            <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 border border-white/15 text-[10px] font-bold text-white shadow-md pointer-events-none">
              <Layers className="w-3 h-3 text-indigo-400" />
              <span>
                {carouselIndex + 1}/{previewImages.length}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

