"use client";

import { useState } from "react";
import NextImage from "next/image";
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
} from "lucide-react";

interface ProductCardProps {
  product: ScrapedProduct;
  onRefresh?: (productId: string) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
  onViewDetails?: (product: ScrapedProduct) => void;
}

export function ProductCard({
  product,
  onRefresh,
  onDelete,
  onViewDetails,
}: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
            <span className="text-xs font-medium text-slate-400">No Image Available</span>
          </div>
        )}

        {/* Winning Product Badge */}
        {isWinning && (
          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-bold shadow-md">
            <Sparkles className="w-3 h-3 fill-current" />
            <span>Winning ({product.linkedAdsCount} Ads)</span>
          </div>
        )}

        {/* Domain Badge */}
        {product.domain && (
          <div className="absolute top-2.5 right-2.5 z-10 px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-semibold border border-white/10 shadow-sm truncate max-w-[140px]">
            {product.domain}
          </div>
        )}

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
        {/* Product Title */}
        <h3
          className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2 mb-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
          title={product.title || "Product Landing Page"}
        >
          {product.title || "Untitled Scraped Product"}
        </h3>

        {/* Price & Offers */}
        <div className="flex items-center justify-between gap-2 mb-3 mt-auto flex-wrap">
          <div className="flex items-baseline gap-2">
            {product.currentPrice ? (
              <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">
                {product.currentPrice}
              </span>
            ) : (
              <span className="text-xs text-slate-400 italic">Price not detected</span>
            )}

            {product.originalPrice && (
              <span className="text-xs text-slate-600 dark:text-slate-400 line-through">
                {product.originalPrice}
              </span>
            )}
          </div>

          {product.deliveryCost && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                product.deliveryCost.toLowerCase().includes("gratuit") ||
                product.deliveryCost.toLowerCase().includes("free") ||
                product.deliveryCost.toLowerCase().includes("مجاني") ||
                product.deliveryCost.toLowerCase().includes("0 dt") ||
                product.deliveryCost.toLowerCase().includes("0dt")
                  ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              }`}
              title={`Delivery Policy: ${product.deliveryCost}`}
            >
              <Truck className="w-2.5 h-2.5" />
              <span className="truncate max-w-[110px]">{product.deliveryCost}</span>
            </span>
          )}
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
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <Clock className="w-3 h-3 shrink-0" />
            <span>{formatDate(product.lastScrapedAt || product.createdAt) || "Scraped"}</span>
          </div>

          <div className="flex items-center gap-1">
            {onRefresh && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
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
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
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
