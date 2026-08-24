"use client";

import { useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { ScrapedProduct } from "@/types";
import {
  ExternalLink,
  ShoppingBag,
  Sparkles,
  Layers,
  RotateCw,
  Trash2,
  Tag,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  Truck,
  Star,
} from "lucide-react";

interface ProductCardProps {
  product: ScrapedProduct;
  onRefresh?: (productId: string) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
  onToggleFavorite?: (productId: string, nextFavorite: boolean) => Promise<void>;
  onViewDetails?: (product: ScrapedProduct) => void;
  onViewCreatives?: (product: ScrapedProduct) => void;
  onFilterBrand?: (brandName: string) => void;
}

export function ProductCard({
  product,
  onRefresh,
  onDelete,
  onToggleFavorite,
  onViewDetails,
  onViewCreatives,
  onFilterBrand,
}: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFavorite, setIsFavorite] = useState(Boolean(product.isFavorite));
  const [isTogglingFav, setIsTogglingFav] = useState(false);

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
      setIsFavorite(!nextState); // Rollback on error
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
    if (!confirm(`Are you sure you want to delete "${product.title || "this product"}"?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(product.id);
    } finally {
      setIsDeleting(false);
    }
  };

  // Format scraped date
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

  const isWinning = (product.linkedAdsCount || 0) >= 3;
  const isPendingScrape = product.scrapeStatus === "pending";
  const isFailedScrape = product.scrapeStatus === "failed";

  return (
    <div
      onClick={() => onViewDetails?.(product)}
      className="group relative flex flex-col bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer"
    >
      {/* Top Banner / Badges */}
      <div className="relative aspect-square w-full bg-slate-100 dark:bg-slate-950/80 overflow-hidden flex items-center justify-center border-b border-slate-200 dark:border-slate-800/60">
        {product.mainImageUrl && !imgError ? (
          <NextImage
            src={product.mainImageUrl}
            alt={product.title || "Product image"}
            fill
            unoptimized
            referrerPolicy="no-referrer"
            className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <ShoppingBag className="w-12 h-12 stroke-[1.5] opacity-40" />
            <span className="text-xs font-medium text-slate-400">
              {isPendingScrape ? "Pending Scrape" : "No Image Available"}
            </span>
          </div>
        )}

        {/* Winning Product Badge */}
        {isWinning && (
          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-bold shadow-md">
            <Sparkles className="w-3 h-3 fill-current" />
            <span>Winning ({product.linkedAdsCount} Ads)</span>
          </div>
        )}

        {/* Top Lasting (Evergreen) Badge */}
        {!isWinning && product.daysRunning && product.daysRunning >= 30 && (
          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-600 text-white text-[10px] font-bold shadow-md">
            <Clock className="w-3 h-3" />
            <span>⏳ {product.daysRunning}d Running</span>
          </div>
        )}

        {/* Pending / Failed Scrape Badge */}
        {isPendingScrape && (
          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/90 text-white text-[10px] font-bold shadow-sm backdrop-blur-sm">
            <Clock className="w-3 h-3" />
            <span>Pending Scrape</span>
          </div>
        )}

        {isFailedScrape && (
          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500/90 text-white text-[10px] font-bold shadow-sm backdrop-blur-sm">
            <AlertCircle className="w-3 h-3" />
            <span>Scrape Failed</span>
          </div>
        )}

        {/* Top Right: Favorite Star & Brand Badge */}
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggleFavorite}
            className={`p-1.5 rounded-lg backdrop-blur-md border transition-all cursor-pointer shadow-sm ${
              isFavorite
                ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                : "bg-slate-900/70 text-slate-300 border-white/10 hover:text-amber-400 hover:bg-slate-900/90"
            }`}
            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? "fill-current text-slate-950" : ""}`} />
          </button>
        </div>

        {/* Offer Overlay Ribbon */}
        {product.discountOrOffer && (
          <div className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/90 text-white text-[11px] font-bold shadow-md backdrop-blur-sm max-w-[90%] truncate">
            <Tag className="w-3 h-3 shrink-0" />
            <span className="truncate">{product.discountOrOffer}</span>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="p-4 flex flex-col flex-1">
        {/* Brand Name Link */}
        <div className="flex items-center justify-between gap-1 mb-1">
          {product.brandPageId ? (
            <Link
              href={`/spy/brand/${encodeURIComponent(product.brandPageId)}?tab=products`}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline uppercase tracking-wider truncate"
              title={`View ${product.brandName || "Brand"} Catalog`}
            >
              {product.brandName || product.domain || "View Brand"} &rarr;
            </Link>
          ) : product.brandName ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFilterBrand?.(product.brandName!);
              }}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline uppercase tracking-wider truncate text-left cursor-pointer"
              title={`Filter by ${product.brandName}`}
            >
              {product.brandName}
            </button>
          ) : product.domain ? (
            <span className="text-[11px] font-semibold text-slate-500 truncate">
              {product.domain}
            </span>
          ) : null}
        </div>

        {/* Product Title */}
        <h3
          className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2 mb-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
          title={product.title || "Product Landing Page"}
        >
          {product.title || "Untitled Product Landing Page"}
        </h3>

        {/* Badges: Platform + WhatsApp + Ad Count + Longevity */}
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          {product.storePlatform && product.storePlatform !== "other" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 uppercase">
              {product.storePlatform}
            </span>
          )}

          {product.whatsappNumbers && product.whatsappNumbers.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              💬 WhatsApp
            </span>
          )}

          {typeof product.activeAdsCount === "number" && product.activeAdsCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              🔥 {product.activeAdsCount} active {product.activeAdsCount === 1 ? "ad" : "ads"}
            </span>
          ) : typeof product.linkedAdsCount === "number" && product.linkedAdsCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              🎬 {product.linkedAdsCount} {product.linkedAdsCount === 1 ? "ad" : "ads"}
            </span>
          ) : null}

          {product.daysRunning && product.daysRunning > 1 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              ⏳ {product.daysRunning}d
            </span>
          )}
        </div>

        {/* Price & Offers */}
        <div className="flex items-center justify-between gap-2 mb-3 mt-auto flex-wrap">
          <div className="flex items-baseline gap-2">
            {product.currentPrice ? (
              <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">
                {product.currentPrice}
              </span>
            ) : isPendingScrape ? (
              <span className="text-xs text-amber-500 font-medium">Scrape to get price</span>
            ) : (
              <span className="text-xs text-slate-400 italic">Price not detected</span>
            )}

            {product.originalPrice && (
              <span className="text-xs text-slate-600 dark:text-slate-400 line-through">
                {product.originalPrice}
              </span>
            )}
          </div>

          {/* Delivery pill */}
          {(() => {
            const delivery = product.deliveryCost;
            const isFree =
              delivery?.toLowerCase().includes("gratuit") ||
              delivery?.toLowerCase().includes("free") ||
              delivery?.toLowerCase().includes("مجاني") ||
              delivery?.toLowerCase().includes("0 dt") ||
              delivery?.toLowerCase().includes("0dt") ||
              product.discountOrOffer?.toLowerCase().includes("livraison gratuite") ||
              product.discountOrOffer?.toLowerCase().includes("توصيل مجاني");

            const isSpecifiedPaid =
              delivery &&
              delivery !== "Livraison Non Spécifiée" &&
              !isFree;

            const label = isFree
              ? "Livraison Gratuite"
              : isSpecifiedPaid
              ? delivery
              : "Livraison: ~7 DT";

            return (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  isFree
                    ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : isSpecifiedPaid
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                }`}
                title={label}
              >
                <Truck className="w-2.5 h-2.5" />
                <span className="truncate max-w-[110px]">{label}</span>
              </span>
            );
          })()}
        </div>

        {/* Multi-tier offers counter if available */}
        {product.allOffers && Array.isArray(product.allOffers) && product.allOffers.length > 0 && (
          <div className="mb-3 flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 rounded-md">
            <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate font-medium">
              {product.allOffers.length} bundle {product.allOffers.length === 1 ? "tier" : "tiers"} available
            </span>
          </div>
        )}

        {/* Footer info & action buttons */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-xs">
          {onViewCreatives && (product.linkedAdsCount || 0) > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewCreatives(product);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold transition-colors cursor-pointer"
            >
              <Eye className="w-3 h-3" />
              <span>View Ads ({product.linkedAdsCount})</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{formatDate(product.lastScrapedAt || product.createdAt) || "Scraped"}</span>
            </div>
          )}

          <div className="flex items-center gap-1">
            {onRefresh && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
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
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              title="Open Landing Page in New Tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {onDelete && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors cursor-pointer"
                title="Delete Tracked Product"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
