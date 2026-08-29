"use client";

import { useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { ScrapedProduct } from "@/types";
import {
  ExternalLink,
  ShoppingBag,
  RotateCw,
  Trash2,
  Tag,
  Clock,
  Eye,
  Truck,
  Sparkles,
  Star,
  CheckCircle2,
  Rocket,
} from "lucide-react";

interface ProductRowProps {
  product: ScrapedProduct;
  onRefresh?: (productId: string) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
  onToggleFavorite?: (productId: string, nextFavorite: boolean) => Promise<void>;
  onViewDetails?: (product: ScrapedProduct) => void;
  onViewCreatives?: (product: ScrapedProduct) => void;
  onFilterBrand?: (brandName: string) => void;
}

export function ProductRow({
  product,
  onRefresh,
  onDelete,
  onToggleFavorite,
  onViewDetails,
  onViewCreatives,
  onFilterBrand,
}: ProductRowProps) {
  const [imgError, setImgError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFavorite, setIsFavorite] = useState(Boolean(product.isFavorite));
  const [isTogglingFav, setIsTogglingFav] = useState(false);
  const [isQueueingVerify, setIsQueueingVerify] = useState(false);

  const handleQueueVerify = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isQueueingVerify) return;
    setIsQueueingVerify(true);
    try {
      const res = await fetch(`/api/products/${product.id}/queue-verify`, {
        method: "POST",
      });
      if (res.ok && onRefresh) {
        await onRefresh(product.id);
      }
    } finally {
      setIsQueueingVerify(false);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTogglingFav) return;
    const nextState = !isFavorite;
    setIsFavorite(nextState);
    setIsTogglingFav(true);
    try {
      if (onToggleFavorite) {
        await onToggleFavorite(product.id, nextState);
      } else {
        await fetch("/api/products", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: product.id, isFavorite: nextState }),
        });
      }
    } catch {
      setIsFavorite(!nextState);
    } finally {
      setIsTogglingFav(false);
    }
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh(product.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(product.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const isBreakout = Boolean(
    product.isBreakout ||
    ((product.activeAdsCount || 0) > 0 &&
      (product.daysRunning || 1) <= 7 &&
      (product.maxDuplications || 1) >= 3)
  );
  const isPendingScrape = product.scrapeStatus === "pending";
  const isInactive = typeof product.activeAdsCount === "number" && product.activeAdsCount === 0 && (product.linkedAdsCount || 0) > 0;

  return (
    <div
      onClick={() => onViewDetails?.(product)}
      className={`group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900/60 rounded-xl border transition-all duration-150 cursor-pointer ${
        isInactive
          ? "border-slate-200/60 dark:border-slate-800/60 opacity-80 hover:opacity-100 shadow-xs"
          : isBreakout
            ? "border-pink-500/40 dark:border-pink-500/40 hover:border-pink-500 shadow-xs hover:shadow-md"
            : "border-slate-200 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 shadow-xs hover:shadow-md"
      }`}
    >
      {/* Left: Star + Thumbnail & Main Info */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Star Button */}
        <button
          type="button"
          onClick={handleToggleFavorite}
          className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
            isFavorite
              ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
              : "text-slate-400 hover:text-amber-400 border-transparent hover:border-slate-200 dark:hover:border-slate-800"
          }`}
          title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Star className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`} />
        </button>

        {/* Thumbnail */}
        <div className="relative w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-950 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
          {product.mainImageUrl && !imgError ? (
            <NextImage
              src={product.mainImageUrl}
              alt={product.title || "Product"}
              fill
              unoptimized
              referrerPolicy="no-referrer"
              className={`object-contain p-1 transition-all duration-300 ${
                isInactive ? "grayscale contrast-90 group-hover:grayscale-0 group-hover:contrast-100" : ""
              }`}
              onError={() => setImgError(true)}
            />
          ) : (
            <ShoppingBag className="w-5 h-5 text-slate-400" />
          )}
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isBreakout && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 text-white shadow-2xs">
                <Rocket className="w-2.5 h-2.5" />
                <span>🚀 Breakout ({product.maxDuplications || 3}x Copies)</span>
              </span>
            )}

            {product.brandPageId ? (
              <Link
                href={`/spy/brand/${encodeURIComponent(product.brandPageId)}?tab=products`}
                onClick={(e) => e.stopPropagation()}
                className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border hover:underline ${
                  isInactive
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60"
                }`}
              >
                {product.brandName || "Brand"} &rarr;
              </Link>
            ) : product.brandName ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterBrand?.(product.brandName!);
                }}
                className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border hover:underline cursor-pointer ${
                  isInactive
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60"
                }`}
              >
                {product.brandName}
              </button>
            ) : product.domain ? (
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                {product.domain}
              </span>
            ) : null}

            {product.category && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  isInactive
                    ? "bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                }`}
              >
                🏷️ {product.category}
              </span>
            )}

            {isInactive && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                ⚫ Inactive (Off-Air)
              </span>
            )}

            {product.storePlatform && product.storePlatform !== "other" && (
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                • {product.storePlatform}
              </span>
            )}

            {!isInactive && product.daysRunning && product.daysRunning >= 30 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                ⏳ {product.daysRunning}d Running
              </span>
            )}

            {product.supplierUrls && product.supplierUrls.length > 0 && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  isInactive
                    ? "bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    : "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                }`}
                title={`${product.supplierUrls.length} Supplier link${product.supplierUrls.length === 1 ? "" : "s"} attached`}
              >
                📦 {product.supplierUrls.length} {product.supplierUrls.length === 1 ? "Supplier" : "Suppliers"}
              </span>
            )}
          </div>

          <h4
            className={`text-xs font-bold truncate transition-colors mt-0.5 ${
              isInactive
                ? "text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"
                : "text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
            }`}
          >
            {product.title || "Untitled Landing Page"}
          </h4>

          {/* Offer / Delivery preview */}
          {product.discountOrOffer && (
            <div
              className={`inline-flex items-center gap-1 text-[11px] font-semibold mt-0.5 ${
                isInactive
                  ? "text-slate-500 dark:text-slate-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              <Tag className="w-3 h-3" />
              <span className="truncate max-w-xs">{product.discountOrOffer}</span>
            </div>
          )}
        </div>
      </div>

      {/* Center: Price & Ad Count */}
      <div className="flex items-center gap-4 shrink-0 sm:px-4">
        {/* Pricing */}
        <div className="text-left sm:text-right">
          <div
            className={`text-sm font-extrabold ${
              isInactive
                ? "text-slate-600 dark:text-slate-400"
                : "text-indigo-600 dark:text-indigo-400"
            }`}
          >
            {product.currentPrice || (isPendingScrape ? "Pending" : "—")}
          </div>
          {product.originalPrice && (
            <div className="text-[11px] text-slate-400 line-through">
              {product.originalPrice}
            </div>
          )}
        </div>

        {/* Active Ads Counter */}
        <div className="min-w-[70px] text-center">
          {typeof product.activeAdsCount === "number" && product.activeAdsCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              🔥 {product.activeAdsCount} active
            </span>
          ) : isInactive ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              ⚫ 0 active ads
            </span>
          ) : typeof product.linkedAdsCount === "number" && product.linkedAdsCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              🎬 {product.linkedAdsCount} ads
            </span>
          ) : (
            <span className="text-[10px] text-slate-400">0 ads</span>
          )}
        </div>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/80">
        {onViewCreatives && (product.linkedAdsCount || 0) > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewCreatives(product);
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              isInactive
                ? "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                : "bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-600 dark:text-indigo-400"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View Ads</span>
          </button>
        )}

        {(product.linkedAdsCount || 0) > 0 && (
          <button
            onClick={handleQueueVerify}
            disabled={isQueueingVerify}
            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            title="Mark all linked ads as Pending for next verifier scan"
          >
            <CheckCircle2 className={`w-3.5 h-3.5 ${isQueueingVerify ? "animate-pulse text-indigo-500" : ""}`} />
          </button>
        )}

        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            title="Re-extract Landing Page"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`} />
          </button>
        )}

        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          title="Open Landing Page"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {onDelete && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors cursor-pointer"
            title="Delete Product"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
