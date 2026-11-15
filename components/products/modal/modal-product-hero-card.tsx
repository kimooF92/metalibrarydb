"use client";

import { useState, useEffect } from "react";
import NextImage from "next/image";
import { ScrapedProduct, CarouselItemSummary } from "@/types";
import {
  ShoppingBag,
  Tag,
  Truck,
  Layers,
  ExternalLink,
  RotateCw,
  Flame,
  Globe,
  Clock,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { formatPrice, formatDelivery } from "@/lib/format-price";
import { cn } from "@/lib/utils";

export interface ModalProductHeroCardProps {
  product: ScrapedProduct;
  allImages: string[];
  isRefreshing?: boolean;
  onSwitchCarouselItem?: (item: CarouselItemSummary) => void;
}

export function ModalProductHeroCard({
  product,
  allImages,
  isRefreshing,
  onSwitchCarouselItem,
}: ModalProductHeroCardProps) {
  const { activeWorkspace } = useWorkspace();
  const sym = activeWorkspace?.currencySymbol || "DT";
  const [selectedImage, setSelectedImage] = useState<string | null>(product.mainImageUrl || null);

  useEffect(() => {
    setSelectedImage(product.mainImageUrl || null);
  }, [product.mainImageUrl]);

  const daysRunning = product.daysRunning;

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden">
      {/* 1. TOP COMMERCIALS & PRICING BAR (Immediately visible above the fold) */}
      <div className="p-3.5 bg-slate-50/90 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            {product.currentPrice ? (
              <span className="text-2xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">
                {formatPrice(product.currentPrice, sym)}
              </span>
            ) : (
              <span className="text-sm text-slate-400 italic">Price not listed</span>
            )}

            {product.originalPrice && (
              <span className="text-sm text-slate-400 line-through font-medium">
                {formatPrice(product.originalPrice, sym)}
              </span>
            )}

            {product.discountOrOffer && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold border border-emerald-500/20">
                <Tag className="w-3 h-3" />
                {product.discountOrOffer}
              </span>
            )}
          </div>

          {daysRunning && daysRunning > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold border border-amber-500/20 shrink-0">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>{daysRunning}d running</span>
            </span>
          ) : null}
        </div>

        {/* Shipping badge */}
        {(() => {
          const delivery = product.deliveryCost;
          const formattedLabel = delivery ? formatDelivery(delivery, sym) : `Livraison: 7 ${sym} (Standard COD)`;
          const isFree =
            formattedLabel.toLowerCase().includes("gratuit") ||
            formattedLabel.toLowerCase().includes("free") ||
            formattedLabel.toLowerCase().includes("مجاني");
          const isPaid = formattedLabel && formattedLabel !== "Livraison Non Spécifiée" && !isFree;

          return (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border",
                isFree
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : isPaid
                  ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800"
              )}
            >
              <Truck className="w-3.5 h-3.5 shrink-0" />
              <span>{formattedLabel}</span>
            </div>
          );
        })()}
      </div>

      {/* 2. PRODUCT IMAGE VIEWPORT (Compact vertical height to prevent content cutoff) */}
      <div className="relative h-56 sm:h-64 w-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-200 dark:border-slate-800">
        {selectedImage ? (
          <NextImage
            src={selectedImage}
            alt={product.title || "Product image"}
            fill
            unoptimized
            referrerPolicy="no-referrer"
            className={cn(
              "object-contain p-2.5 transition-all duration-300",
              typeof product.activeAdsCount === "number" && product.activeAdsCount === 0 && "grayscale contrast-90 hover:grayscale-0"
            )}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <ShoppingBag className="w-12 h-12 stroke-[1.5] opacity-40" />
            <span className="text-xs">No Image</span>
          </div>
        )}

        {/* Re-scraping Loading Overlay */}
        {isRefreshing && (
          <div className="absolute inset-0 z-20 bg-slate-950/75 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2.5 p-3 text-center animate-in fade-in duration-200">
            <div className="relative flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
              <RotateCw className="w-4 h-4 text-indigo-400 absolute animate-pulse" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-white tracking-wide">
                Updating Product...
              </p>
              <p className="text-[10px] text-slate-300">
                Checking price & photos
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. THUMBNAIL STRIP */}
      {allImages.length > 1 && (
        <div className="p-2.5 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
          {allImages.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedImage(img)}
              className={cn(
                "relative w-10 h-10 rounded-lg border-2 overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-950 transition-all cursor-pointer",
                selectedImage === img
                  ? "border-indigo-600 dark:border-indigo-400 shadow-xs ring-1 ring-indigo-500/30"
                  : "border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100"
              )}
            >
              <NextImage
                src={img}
                alt={`Thumbnail ${i + 1}`}
                fill
                unoptimized
                referrerPolicy="no-referrer"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* 4. CAROUSEL VARIANTS RAIL (if bundle/carousel) */}
      {product.carouselItems && product.carouselItems.length > 1 && onSwitchCarouselItem && (
        <div className="p-2.5 bg-indigo-50/50 dark:bg-indigo-950/30 border-b border-indigo-200/60 dark:border-indigo-800/50 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
            <Layers className="w-3.5 h-3.5" />
            <span>Variants & Siblings ({product.carouselItems.length})</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {product.carouselItems.map((item, idx) => {
              const isSelected = item.id === product.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSwitchCarouselItem(item)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border transition-all cursor-pointer shrink-0",
                    isSelected
                      ? "bg-white dark:bg-slate-900 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs ring-1 ring-indigo-500/30"
                      : "bg-white/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  )}
                  title={item.title || `Item ${idx + 1}`}
                >
                  {item.mainImageUrl && (
                    <div className="relative w-4 h-4 rounded overflow-hidden shrink-0">
                      <NextImage src={item.mainImageUrl} alt="" fill unoptimized referrerPolicy="no-referrer" className="object-cover" />
                    </div>
                  )}
                  <span className="truncate max-w-[100px]">{item.title || `#${idx + 1}`}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. STORE FOOTER CTA BAR */}
      <div className="p-3 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 mt-auto">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 truncate">
              {product.domain || "Online Store"}
            </span>
            {product.storePlatform && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40">
                {product.storePlatform}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 truncate">
            {product.category || "E-commerce Product"}
          </span>
        </div>

        {product.url ? (
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition-colors shrink-0 shadow-xs flex items-center gap-1"
          >
            <span>Visit Store</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
