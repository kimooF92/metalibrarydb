"use client";

import type React from "react";
import type { AdMediaConfig } from "../../types";
import {
  Play,
  Image as ImageIcon,
  Camera,
  ChevronLeft,
  ChevronRight,
  Layers,
  Trophy,
  Rocket,
  Flame,
  Sparkles,
  Zap,
} from "lucide-react";

export interface AdCardMediaHandlers {
  onOpenPreview: () => void;
  onImageError: () => void;
  onVideoError: () => void;
  onPlayingVideoChange: (playing: boolean) => void;
  onPrevSlide: (e: React.MouseEvent) => void;
  onNextSlide: (e: React.MouseEvent) => void;
  onSlideChange?: (index: number) => void;
  onToggleScoreTooltip?: () => void;
  onOpenClusterModal?: () => void;
  onOpenCreativeClusterModal?: () => void;
}

export interface AdCardMediaProps {
  config: AdMediaConfig;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onOpenPreview?: () => void;
  onImageError?: () => void;
  onVideoError?: () => void;
  onPlayingVideoChange?: (playing: boolean) => void;
  onPrevSlide?: (e: React.MouseEvent) => void;
  onNextSlide?: (e: React.MouseEvent) => void;
  handlers?: AdCardMediaHandlers;
}

export function AdCardMedia({
  config,
  videoRef,
  onOpenPreview: propOnOpenPreview,
  onImageError: propOnImageError,
  onVideoError: propOnVideoError,
  onPlayingVideoChange: propOnPlayingVideoChange,
  onPrevSlide: propOnPrevSlide,
  onNextSlide: propOnNextSlide,
  handlers,
}: AdCardMediaProps) {
  const onOpenPreview = handlers?.onOpenPreview || propOnOpenPreview || (() => {});
  const onImageError = handlers?.onImageError || propOnImageError || (() => {});
  const onVideoError = handlers?.onVideoError || propOnVideoError || (() => {});
  const onPlayingVideoChange =
    handlers?.onPlayingVideoChange || propOnPlayingVideoChange || (() => {});
  const onPrevSlide = handlers?.onPrevSlide || propOnPrevSlide || (() => {});
  const onNextSlide = handlers?.onNextSlide || propOnNextSlide || (() => {});

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
    winnerScore,
    isBreakout,
    isEvergreen,
    creativeCount,
    totalAdSets,
    distinctBrandsCount,
    isCrossBrand,
  } = config;

  const hasScoreBadge = Boolean(
    isBreakout || (winnerScore && winnerScore >= 68) || isEvergreen
  );

  const hasAnglesBadge = Boolean(creativeCount && creativeCount > 1);
  const hasSetsBadge = Boolean(totalAdSets && totalAdSets > 1);

  return (
    <div
      className="relative w-full aspect-square overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-900/95 dark:bg-slate-950 mb-2.5 flex items-center justify-center cursor-pointer select-none group/media"
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
      {/* Ambient Blurred Background Canvas */}
      {(displayThumbnail || activeImageSrc) && !imgError && (
        <img
          src={displayThumbnail || activeImageSrc || ""}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 dark:opacity-30 scale-125 select-none pointer-events-none"
        />
      )}

      {/* Main Content Area */}
      {isLoadingMedia ? (
        <div className="text-[11px] text-slate-400 font-medium animate-pulse z-10">
          Loading creative…
        </div>
      ) : canPlayVideo && firstVideoUrl ? (
        <div className="relative w-full h-full p-1.5 flex items-center justify-center z-10">
          <video
            ref={videoRef}
            src={firstVideoUrl}
            poster={displayThumbnail || undefined}
            preload="none"
            playsInline
            muted
            loop
            {...({ referrerPolicy: "no-referrer" } as any)}
            className="w-full h-full object-contain transition-transform duration-300 group-hover/media:scale-[1.02] drop-shadow-md rounded-lg"
            onError={() => {
              onVideoError();
              onPlayingVideoChange(false);
            }}
          />
        </div>
      ) : activeImageSrc && !imgError ? (
        <div className="relative w-full h-full p-1.5 flex items-center justify-center z-10">
          <img
            src={activeImageSrc}
            alt={title || "Ad creative"}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain transition-transform duration-300 group-hover/media:scale-[1.02] drop-shadow-md"
            onError={onImageError}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-400 font-medium z-10">
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

      {/* Top-Left: Media Type / Playback Indicator (Overlaid like ProductCardMedia) */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none">
        {canPlayVideo && firstVideoUrl ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-black/80 border border-white/15 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md">
            <Play
              className={`w-2.5 h-2.5 text-indigo-400 fill-indigo-400 ${
                isPlayingVideo ? "animate-pulse" : ""
              }`}
            />
            <span>{isPlayingVideo ? "Playing" : "Video"}</span>
          </span>
        ) : isCarousel && previewImages.length > 1 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-black/80 border border-white/15 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md">
            <Layers className="w-2.5 h-2.5 text-indigo-400" />
            <span>
              {carouselIndex + 1}/{previewImages.length}
            </span>
          </span>
        ) : isVideoAd && isVideoExpired ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300 bg-black/80 border border-amber-500/40 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md"
            title="Video token expired on Meta CDN. Displaying snapshot thumbnail."
          >
            <Camera className="w-2.5 h-2.5 text-amber-400" />
            <span>Snapshot</span>
          </span>
        ) : isVideoAd && !firstVideoUrl ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-300 bg-black/80 border border-indigo-500/40 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md"
            title="Video creative snapshot. Click to open and optionally fetch video."
          >
            <Play className="w-2.5 h-2.5 text-indigo-400 fill-indigo-400/20" />
            <span>Video Ad</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-200 bg-black/80 border border-white/15 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md opacity-85 group-hover/media:opacity-100 transition-opacity">
            <ImageIcon className="w-2.5 h-2.5 text-slate-300" />
            <span>Image</span>
          </span>
        )}
      </div>

      {/* Top-Right: High-Signal Winner / Performance Pill (Overlaid) */}
      {hasScoreBadge && (
        <div className="absolute top-2 right-2 z-20">
          {isBreakout ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlers?.onToggleScoreTooltip?.();
              }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-200 bg-rose-950/85 border border-rose-500/60 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={`Breakout Score (${winnerScore || 75}+) — click for breakdown`}
            >
              <Rocket className="w-2.5 h-2.5 text-rose-400 fill-rose-400/20" />
              <span>Breakout</span>
            </button>
          ) : winnerScore && winnerScore >= 85 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlers?.onToggleScoreTooltip?.();
              }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-200 bg-black/85 border border-amber-500/60 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={`Super Winner (${winnerScore}/100) — click for breakdown`}
            >
              <Trophy className="w-2.5 h-2.5 text-amber-400 fill-amber-400/20" />
              <span>{winnerScore} Winner</span>
            </button>
          ) : winnerScore && winnerScore >= 68 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlers?.onToggleScoreTooltip?.();
              }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-200 bg-black/85 border border-orange-500/60 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={`High Performance Score (${winnerScore}/100) — click for breakdown`}
            >
              <Flame className="w-2.5 h-2.5 text-orange-400 fill-orange-400/20" />
              <span>Winning</span>
            </button>
          ) : isEvergreen ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-200 bg-black/85 border border-emerald-500/60 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md"
              title="Evergreen ad running 30+ days with active copies"
            >
              <Sparkles className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400/20" />
              <span>Evergreen</span>
            </span>
          ) : null}
        </div>
      )}

      {/* Bottom-Right: Multi-Angle / Copycat Saturation Trigger (Overlaid) */}
      {(hasAnglesBadge || hasSetsBadge) && (
        <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1">
          {hasAnglesBadge && handlers?.onOpenClusterModal && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlers.onOpenClusterModal?.();
              }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-200 bg-black/85 hover:bg-black border border-indigo-500/60 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={`Click to view all ${creativeCount} sister creative angles`}
            >
              <Layers className="w-2.5 h-2.5 text-indigo-400" />
              <span>{creativeCount} Angles</span>
            </button>
          )}

          {hasSetsBadge && handlers?.onOpenCreativeClusterModal && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlers.onOpenCreativeClusterModal?.();
              }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-200 bg-black/85 hover:bg-black border border-purple-500/60 px-2 py-0.5 rounded-full backdrop-blur-md shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={
                isCrossBrand
                  ? `${totalAdSets} ads across ${distinctBrandsCount} brands — click to inspect`
                  : `${totalAdSets} scaled sets — click to inspect`
              }
            >
              <Zap className="w-2.5 h-2.5 text-purple-400" />
              <span>
                {isCrossBrand
                  ? `${totalAdSets} Ads (${distinctBrandsCount} Brands)`
                  : `${totalAdSets} Sets`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Carousel Navigation Controls & Dot Pagination */}
      {isCarousel && previewImages.length > 1 && !canPlayVideo && (
        <>
          <button
            type="button"
            onClick={onPrevSlide}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer z-25 shadow-md border border-white/20 opacity-0 group-hover/media:opacity-100 active:scale-95"
            title="Previous slide"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onNextSlide}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer z-25 shadow-md border border-white/20 opacity-0 group-hover/media:opacity-100 active:scale-95"
            title="Next slide"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Dot Pagination Rail */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-25 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 shadow-md pointer-events-auto">
            {previewImages.slice(0, 7).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlers?.onSlideChange?.(idx);
                }}
                className={`transition-all rounded-full cursor-pointer ${
                  idx === carouselIndex % previewImages.length
                    ? "w-2.5 h-1.5 bg-indigo-400"
                    : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
                }`}
                title={`Slide ${idx + 1}`}
              />
            ))}
            {previewImages.length > 7 && (
              <span className="text-[9px] font-bold text-white/70 pl-0.5">
                +{previewImages.length - 7}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
