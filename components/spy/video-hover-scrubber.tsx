"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import NextImage from "next/image";
import { Film, Sparkles, Layers, Sliders } from "lucide-react";

interface VideoHoverScrubberProps {
  storyboardUrls?: string[] | null;
  fallbackThumbnailUrl: string | null;
  videoUrl?: string | null;
  adArchiveId: string;
  onPlayClick?: () => void;
  className?: string;
}

const STAGE_CONFIG = [
  { label: "The Hook", icon: "🎣", color: "from-amber-400 to-yellow-300" },
  { label: "Pain Point", icon: "💥", color: "from-rose-400 to-pink-500" },
  { label: "Product Demo", icon: "💡", color: "from-indigo-400 to-cyan-400" },
  { label: "Social Proof", icon: "⭐", color: "from-emerald-400 to-teal-300" },
  { label: "CTA & Offer", icon: "🎯", color: "from-purple-400 to-fuchsia-500" },
];

export function VideoHoverScrubber({
  storyboardUrls,
  fallbackThumbnailUrl,
  videoUrl,
  adArchiveId,
  onPlayClick,
  className = "",
}: VideoHoverScrubberProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [imgError, setImgError] = useState(false);

  const frames = useMemo(() => {
    if (storyboardUrls && storyboardUrls.length > 0) {
      return storyboardUrls;
    }
    if (fallbackThumbnailUrl) {
      return [fallbackThumbnailUrl];
    }
    return [];
  }, [storyboardUrls, fallbackThumbnailUrl]);

  const hasMultipleFrames = frames.length > 1;

  // Preload frames on hover for 0ms instantaneous swapping
  useEffect(() => {
    if (isHovering && hasMultipleFrames) {
      frames.forEach((url) => {
        if (url) {
          const img = new Image();
          img.src = url;
        }
      });
    }
  }, [isHovering, hasMultipleFrames, frames]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !hasMultipleFrames) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(0.999, x / rect.width));
    const nextIndex = Math.floor(ratio * frames.length);
    if (nextIndex !== activeFrameIndex) {
      setActiveFrameIndex(nextIndex);
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setActiveFrameIndex(0);
  };

  const currentDisplayUrl = (!imgError && frames[activeFrameIndex]) ? frames[activeFrameIndex] : fallbackThumbnailUrl;
  const currentStage = STAGE_CONFIG[activeFrameIndex] || STAGE_CONFIG[0];

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovering(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onPlayClick}
      className={`relative w-full h-full select-none cursor-pointer overflow-hidden group/scrubber bg-slate-950 ${className}`}
    >
      {/* Ambient Blurred Background Canvas (Fills letterbox edges naturally) */}
      {currentDisplayUrl && (
        <NextImage
          src={currentDisplayUrl}
          alt=""
          fill
          unoptimized
          aria-hidden="true"
          className="w-full h-full object-cover blur-2xl opacity-25 scale-110 pointer-events-none"
        />
      )}

      {/* Main Crisp Foreground Image (Respects native 9:16 & 4:5 portrait ratio without cropping) */}
      {currentDisplayUrl ? (
        <NextImage
          src={currentDisplayUrl}
          alt={`Ad ${adArchiveId} Frame ${activeFrameIndex + 1}`}
          fill
          unoptimized
          onError={() => {
            if (!imgError) {
              setImgError(true);
            }
          }}
          className="w-full h-full object-contain relative z-10 transition-opacity duration-75 drop-shadow-md"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-4 text-center relative z-10">
          <Film className="w-8 h-8 text-indigo-400 opacity-60 mb-1" />
          <span className="text-[11px] font-medium text-slate-300">Video Ad Preview</span>
        </div>
      )}

      {/* Top Segmented Filmstrip Progress Line (Always subtly visible for video ads) */}
      {hasMultipleFrames && (
        <div className="absolute top-2 left-2.5 right-2.5 z-20 pointer-events-none transition-all duration-200">
          {/* 5-segment track */}
          <div className="flex items-center gap-1.5 w-full">
            {frames.map((_, idx) => {
              const isActive = idx === activeFrameIndex;
              const isPast = idx < activeFrameIndex;
              return (
                <div
                  key={idx}
                  className={`h-1 flex-1 rounded-full transition-all duration-150 ${
                    isActive && isHovering
                      ? `bg-gradient-to-r ${currentStage.color} shadow-md shadow-amber-400/40 h-1.5`
                      : isActive
                      ? "bg-white/90"
                      : isPast
                      ? "bg-white/60"
                      : "bg-white/20 backdrop-blur-xs"
                  }`}
                />
              );
            })}
          </div>

          {/* Active Stage HUD Pill (Appears while scrubbing) */}
          {isHovering ? (
            <div className="flex items-center justify-between mt-1.5 animate-in fade-in duration-100">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900/90 backdrop-blur-md border border-white/20 text-[10px] font-extrabold text-white shadow-xl">
                <span>{currentStage.icon}</span>
                <span>{currentStage.label}</span>
              </div>
              <span className="text-[9px] font-mono font-bold text-slate-200 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10">
                {activeFrameIndex + 1} / {frames.length}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {/* Bottom Floating Scrub Guide (Subtle idle pill) */}
      {hasMultipleFrames && !isHovering && (
        <div className="absolute bottom-2.5 right-2.5 z-20 pointer-events-none transition-opacity duration-200">
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold text-slate-200 bg-slate-900/85 backdrop-blur-md border border-white/15 px-2.5 py-0.5 rounded-full shadow-lg">
            <Sliders className="w-2.5 h-2.5 text-indigo-400" />
            <span>Slide to scrub</span>
          </span>
        </div>
      )}
    </div>
  );
}
