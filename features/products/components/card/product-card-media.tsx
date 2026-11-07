"use client";

import { useState } from "react";
import NextImage from "next/image";
import { ScrapedProduct } from "@/types";
import {
  ShoppingBag,
  Sparkles,
  RotateCw,
  AlertCircle,
  Clock,
  Rocket,
  Calendar,
  Pause,
  Layers,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDiscoveryDate } from "@/lib/format-date";

export interface ProductCardMediaProps {
  product: ScrapedProduct;
  activeImageUrl: string | null;
  activeTitle: string;
  isCarouselBundle: boolean;
  carouselItems: any[];
  slideIndex: number;
  onSlideChange: (index: number) => void;
  isRefreshing?: boolean;
}

export function ProductCardMedia({
  product,
  activeImageUrl,
  activeTitle,
  isCarouselBundle,
  carouselItems,
  slideIndex,
  onSlideChange,
  isRefreshing = false,
}: ProductCardMediaProps) {
  const [imgError, setImgError] = useState(false);

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
  const isWinning =
    !isBreakout &&
    !isPageOnHold &&
    !isPageInactive &&
    (product.linkedAdsCount || 0) >= 3 &&
    (product.activeAdsCount || 0) > 0;
  const isInactive =
    isPageInactive ||
    (typeof product.activeAdsCount === "number" &&
      product.activeAdsCount === 0 &&
      (product.linkedAdsCount || 0) > 0);
  const isPendingScrape = product.scrapeStatus === "pending";
  const isFailedScrape = product.scrapeStatus === "failed";

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return null;
    }
  };

  return (
    <div
      className={`relative w-full aspect-square overflow-hidden rounded-xl border mb-2.5 flex items-center justify-center transition-all ${
        isInactive
          ? "border-slate-200/70 dark:border-slate-800/50 bg-slate-100/70 dark:bg-slate-950/60"
          : "border-slate-200 dark:border-slate-800/80 bg-slate-900/95 dark:bg-slate-950"
      }`}
    >
      {/* Ambient Re-scraping Loading Overlay */}
      {isRefreshing && (
        <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2.5 text-center p-3 animate-in fade-in duration-200">
          <div className="relative flex items-center justify-center">
            <div className="w-10 h-10 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
            <RotateCw className="w-4 h-4 text-indigo-400 absolute animate-pulse" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-white tracking-wide">
              Updating Product...
            </p>
            <p className="text-[10px] text-slate-300">
              Checking current price & photos
            </p>
          </div>
        </div>
      )}

      {activeImageUrl && !imgError ? (
        <>
          {/* Ambient Blurred Background Canvas */}
          <NextImage
            src={activeImageUrl}
            alt=""
            fill
            unoptimized
            referrerPolicy="no-referrer"
            className={`object-cover blur-2xl scale-125 select-none pointer-events-none transition-all duration-300 ${
              isInactive ? "grayscale opacity-15" : "opacity-40 dark:opacity-30"
            }`}
          />

          {/* Main Crisp Uncropped Image */}
          <div className="relative w-full h-full p-1 flex items-center justify-center z-10">
            <NextImage
              key={activeImageUrl}
              src={activeImageUrl}
              alt={activeTitle || "Product image"}
              fill
              unoptimized
              referrerPolicy="no-referrer"
              className={`object-contain transition-all duration-300 group-hover:scale-[1.03] drop-shadow-md ${
                isInactive
                  ? "grayscale contrast-90 opacity-70 group-hover:grayscale-0 group-hover:opacity-100"
                  : ""
              }`}
              onError={() => setImgError(true)}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-400 font-medium">
          <ShoppingBag className="w-10 h-10 opacity-40 stroke-[1.5]" />
          <span className="text-[11px] text-slate-400">
            {isPendingScrape ? "Queued for Review" : "No Image Available"}
          </span>
        </div>
      )}

      {/* Carousel Bundle In-Card Controls */}
      {isCarouselBundle && carouselItems.length > 1 && (
        <>
          {/* Left Arrow Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setImgError(false);
              onSlideChange(slideIndex > 0 ? slideIndex - 1 : carouselItems.length - 1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer z-25 shadow-md border border-white/20 opacity-0 group-hover:opacity-100 active:scale-95"
            title="Previous Carousel Product"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Right Arrow Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setImgError(false);
              onSlideChange((slideIndex + 1) % carouselItems.length);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer z-25 shadow-md border border-white/20 opacity-0 group-hover:opacity-100 active:scale-95"
            title="Next Carousel Product"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Dot Pagination Rail */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-25 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 shadow-md pointer-events-auto">
            {carouselItems.slice(0, 8).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setImgError(false);
                  onSlideChange(idx);
                }}
                className={`transition-all rounded-full cursor-pointer ${
                  idx === slideIndex
                    ? "w-2.5 h-1.5 bg-indigo-400"
                    : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
                }`}
                title={`Product ${idx + 1}`}
              />
            ))}
            {carouselItems.length > 8 && (
              <span className="text-[9px] font-bold text-white/70 pl-0.5">
                +{carouselItems.length - 8}
              </span>
            )}
          </div>
        </>
      )}

      {/* Top-Left Dynamic Status Pill */}
      <div className="absolute top-2 left-2 z-20">
        {isCarouselBundle ? (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-300 bg-black/85 border border-indigo-500/60 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
            title={`${carouselItems.length} products bundled from this carousel`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>
              {slideIndex + 1}/{carouselItems.length} Products
            </span>
          </span>
        ) : isRefreshing ? (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-300 bg-black/85 border border-indigo-500/60 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md animate-pulse"
            title="Updating product page information..."
          >
            <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
            <span>Updating...</span>
          </span>
        ) : isPageOnHold ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-black/80 border border-amber-500/50 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
            title="Brand has paused ads"
          >
            <Pause className="w-3 h-3 text-amber-400" />
            <span>Paused</span>
          </span>
        ) : isBreakout ? (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md ${
              product.breakoutTier === "hard"
                ? "text-rose-300 bg-rose-950/80 border border-rose-500/70 animate-pulse"
                : product.breakoutTier === "soft"
                ? "text-amber-300 bg-black/80 border border-amber-500/50"
                : "text-pink-300 bg-black/80 border border-pink-500/50"
            }`}
            title={`Scaling fast: running for ${product.daysRunning || 7} days with active ads`}
          >
            <Rocket
              className={`w-3 h-3 ${
                product.breakoutTier === "hard" ? "text-rose-400" : "text-pink-400"
              }`}
            />
            <span>{product.breakoutTier === "hard" ? "Top Scaler" : "Rising"}</span>
          </span>
        ) : isWinning ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-black/80 border border-amber-500/50 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
            title={`Proven product with ${product.linkedAdsCount || 0} active ads`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Winning</span>
          </span>
        ) : isInactive ? (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-300 bg-black/80 border border-slate-600/60 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
            title="Ads for this product have ended"
          >
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>Ended</span>
          </span>
        ) : isPendingScrape ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-300 bg-black/80 border border-slate-600/60 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
            title="Product details will be checked shortly"
          >
            <Clock className="w-3 h-3 text-slate-400" />
            <span>In Queue</span>
          </span>
        ) : isFailedScrape ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-300 bg-black/80 border border-rose-500/50 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
            title="Could not open product page"
          >
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>Needs Check</span>
          </span>
        ) : null}
      </div>

      {/* Top-Right Discovery Date Pill */}
      <div className="absolute top-2 right-2 z-20">
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-200 bg-black/80 border border-white/20 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
          title={`Discovered: ${formatDate(product.createdAt || product.lastScrapedAt)}`}
        >
          <Calendar className="w-3 h-3 text-slate-400" />
          <span>{formatDiscoveryDate(product.createdAt || product.lastScrapedAt)}</span>
        </span>
      </div>
    </div>
  );
}

