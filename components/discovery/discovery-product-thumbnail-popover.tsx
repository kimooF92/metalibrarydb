"use client";

import { useState } from "react";
import {
  ShoppingBag,
  ExternalLink,
  CheckCircle2,
  Tag,
  Sparkles,
  Store,
  Layers,
  Loader2,
} from "lucide-react";
import type { DiscoveryProductPreviewItem } from "./discovery-product-card";

interface DiscoveryProductThumbnailPopoverProps {
  item: DiscoveryProductPreviewItem;
  onValidateAndMerge: (item: DiscoveryProductPreviewItem) => Promise<void>;
}

export function DiscoveryProductThumbnailPopover({
  item,
  onValidateAndMerge,
}: DiscoveryProductThumbnailPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasImage = Boolean(item.previewProductImage && !imageError);
  const isDeepProduct = item.previewSource === "product_page" && Boolean(item.previewProductUrl);
  const isHomepage = item.previewSource === "homepage_fallback";
  const isImported = item.status === "imported" || item.isTracked;

  const handleValidate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onValidateAndMerge(item);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* 42x42px Thumbnail Trigger */}
      <div className="w-[42px] h-[42px] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center cursor-pointer transition hover:scale-105 hover:border-indigo-400">
        {hasImage ? (
          <img
            src={item.previewProductImage!}
            alt={item.previewProductTitle || "Product thumbnail"}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
          />
        ) : isHomepage ? (
          <Store className="w-4 h-4 text-amber-500" />
        ) : (
          <ShoppingBag className="w-4 h-4 text-slate-400 dark:text-slate-600" />
        )}
      </div>

      {/* Popover Card */}
      {isOpen && (hasImage || item.previewProductTitle) && (
        <div className="absolute left-12 top-0 z-50 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
          {hasImage && (
            <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-950 mb-2.5">
              <img
                src={item.previewProductImage!}
                alt={item.previewProductTitle || "Product preview"}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              {item.previewProductPrice && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow">
                  <Tag className="w-2.5 h-2.5" />
                  {item.previewProductPrice}
                </span>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
              {item.previewProductTitle || "Product Landing Page"}
            </h4>

            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              {isHomepage ? (
                <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                  <Store className="w-3 h-3" /> Store Hero Fallback
                </span>
              ) : isDeepProduct ? (
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Deep Product Page
                </span>
              ) : null}
            </div>

            {!isImported && isDeepProduct && (
              <button
                onClick={handleValidate}
                disabled={isSubmitting}
                className="w-full mt-2 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                <span>Validate & Auto-Merge</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
