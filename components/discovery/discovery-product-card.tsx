"use client";

import { useState } from "react";
import {
  ExternalLink,
  Flame,
  CheckCircle2,
  Sparkles,
  Store,
  Layers,
  X,
  Loader2,
  ShoppingBag,
  Globe,
  Tag,
} from "lucide-react";

export interface DiscoveryProductPreviewItem {
  id: string;
  runId: string;
  pageId: string;
  displayName: string | null;
  country: string;
  matchingAdCount: number;
  verifiedAdCount: number | null;
  sampleUrls: string[] | null;
  status: "discovered" | "verifying" | "imported" | "ignored";
  isTracked: boolean;
  trackedPageId: string | null;
  previewProductTitle?: string | null;
  previewProductImage?: string | null;
  previewProductPrice?: string | null;
  previewProductCurrency?: string | null;
  previewSource?: "product_page" | "homepage_fallback" | "none" | null;
  previewScrapeStatus?: "idle" | "pending" | "processing" | "scraped" | "no_product" | "failed" | "promoted" | "expired" | "ignored" | null;
  previewProductUrl?: string | null;
  [key: string]: any;
}

interface DiscoveryProductCardProps {
  item: DiscoveryProductPreviewItem;
  onValidateAndMerge: (item: DiscoveryProductPreviewItem) => Promise<void>;
  onMergePageOnly: (item: DiscoveryProductPreviewItem) => Promise<void>;
  onIgnore: (pageId: string) => Promise<void>;
  isActionPending?: boolean;
}

export function DiscoveryProductCard({
  item,
  onValidateAndMerge,
  onMergePageOnly,
  onIgnore,
  isActionPending = false,
}: DiscoveryProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasImage = Boolean(item.previewProductImage && !imageError);
  const isDeepProduct = item.previewSource === "product_page" && Boolean(item.previewProductUrl);
  const isHomepage = item.previewSource === "homepage_fallback";
  const isImported = item.status === "imported" || item.isTracked;
  const isIgnored = item.status === "ignored";

  const adCount = item.verifiedAdCount ?? item.matchingAdCount ?? 0;
  const adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${item.pageId}&search_type=page&media_type=all`;

  const handleValidateClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubmitting || isActionPending) return;
    try {
      setIsSubmitting(true);
      await onValidateAndMerge(item);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMergePageClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubmitting || isActionPending) return;
    try {
      setIsSubmitting(true);
      await onMergePageOnly(item);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIgnoreClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubmitting || isActionPending) return;
    try {
      setIsSubmitting(true);
      await onIgnore(item.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`group relative flex flex-col rounded-xl border bg-white dark:bg-slate-900/80 transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md ${
        isImported
          ? "border-purple-300 dark:border-purple-900/60 ring-1 ring-purple-500/20"
          : isIgnored
          ? "opacity-50 border-slate-200 dark:border-slate-800"
          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
      }`}
    >
      {/* 4:3 Product Image Canvas */}
      <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-slate-950 overflow-hidden select-none">
        {hasImage ? (
          <img
            src={item.previewProductImage!}
            alt={item.previewProductTitle || "Product preview"}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 p-4 text-center">
            {item.previewScrapeStatus === "processing" || item.previewScrapeStatus === "pending" ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Extracting product...
                </span>
              </div>
            ) : isHomepage ? (
              <div className="flex flex-col items-center gap-1.5">
                <Store className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Store Homepage Only
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  No individual product landing page
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  No product image available
                </span>
              </div>
            )}
          </div>
        )}

        {/* Top Floating Badges */}
        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-1 pointer-events-none">
          {/* Source Tag */}
          {isHomepage ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/90 text-white backdrop-blur-sm shadow-sm">
              <Store className="w-3 h-3" />
              Store Hero
            </span>
          ) : isDeepProduct ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600/90 text-white backdrop-blur-sm shadow-sm">
              <Sparkles className="w-3 h-3" />
              Product Page
            </span>
          ) : (
            <span />
          )}

          {/* Price Badge */}
          {item.previewProductPrice ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-600 text-white shadow-md">
              <Tag className="w-3 h-3" />
              {item.previewProductPrice}
            </span>
          ) : null}
        </div>

        {/* Status Pill for Imported */}
        {isImported && (
          <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white shadow">
            <CheckCircle2 className="w-3 h-3" />
            Imported
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2.5">
        <div className="space-y-1.5">
          {/* Product Title */}
          <h3
            className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
            title={item.previewProductTitle || item.displayName || `Page ${item.pageId}`}
          >
            {item.previewProductTitle || "No Product Title Detected"}
          </h3>

          {/* Brand Attribution & Meta Ad Library link */}
          <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
            <a
              href={adLibraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[170px]"
              title={`View ${item.displayName || item.pageId} on Meta Ad Library`}
            >
              <span className="truncate">{item.displayName || `Page ${item.pageId}`}</span>
              <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
            </a>

            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                adCount >= 10
                  ? "bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />
              {adCount} {adCount === 1 ? "ad" : "ads"}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
          {isImported ? (
            <div className="flex-1 py-1.5 px-3 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center justify-center gap-1.5 border border-purple-200 dark:border-purple-900/50">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              Tracked Brand
            </div>
          ) : isDeepProduct ? (
            <button
              onClick={handleValidateClick}
              disabled={isSubmitting || isActionPending}
              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
              title="Atomically merges brand into dashboard and seeds product catalog"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Validate & Auto-Merge</span>
            </button>
          ) : (
            <button
              onClick={handleMergePageClick}
              disabled={isSubmitting || isActionPending}
              className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
              title="Merges page into dashboard only (no single product promotion)"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Layers className="w-3.5 h-3.5" />
              )}
              <span>Merge Page Only</span>
            </button>
          )}

          {!isImported && (
            <button
              onClick={handleIgnoreClick}
              disabled={isSubmitting || isActionPending}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900 transition cursor-pointer disabled:opacity-50"
              title="Dismiss page and clear staging preview data"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
