"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Flame,
  ShoppingBag,
  Eye,
  Bookmark,
  Play,
  Image as ImageIcon,
  Search,
  Layers,
  Sparkles,
} from "lucide-react";
import type { FreshWinnerProduct } from "@/types";
import { useToast } from "@/components/toast-context";
import { useWorkspace } from "@/components/workspace-context";
import { formatPrice } from "@/lib/format-price";
import { BrandLogo } from "@/components/brand-logo";

interface FreshWinnerProductRowProps {
  product: FreshWinnerProduct;
  onInspectCreatives: (product: FreshWinnerProduct) => void;
}

export function FreshWinnerProductRow({
  product,
  onInspectCreatives,
}: FreshWinnerProductRowProps) {
  const { showToast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const sym = product.currency || activeWorkspace?.currencySymbol || "DT";

  const [isFavorite, setIsFavorite] = useState(Boolean(product.isFavorite));
  const [isFavoriting, setIsFavoriting] = useState(false);

  const brand = product.brand;
  const metrics = product.metrics;
  const heroThumb =
    product.mainImageUrl || product.creatives?.[0]?.thumbnailUrl;
  const isHeroVideo = product.creatives?.[0]?.mediaType === "video";

  const brandSpyUrl = brand.pageId
    ? `/spy/brand/${encodeURIComponent(brand.pageId)}`
    : `/brands?search=${encodeURIComponent(brand.displayName || "")}`;

  const cleanSearchQuery = (product.title || "")
    .replace(/[^\w\s\u0600-\u06FF]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliExpressSearchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(
    cleanSearchQuery || "dropshipping"
  )}`;

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.id || isFavoriting) return;

    setIsFavoriting(true);
    const newFav = !isFavorite;
    setIsFavorite(newFav);

    try {
      const res = await fetch("/api/products/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, isFavorite: newFav }),
      });
      if (res.ok) {
        showToast({
          type: "success",
          title: newFav ? "Saved to Favorites" : "Removed from Favorites",
          message: `${product.title || "Product"} updated in your catalog.`,
        });
      } else {
        setIsFavorite(!newFav);
      }
    } catch {
      setIsFavorite(!newFav);
    } finally {
      setIsFavoriting(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-xs transition-all group">
      {/* 1. Left side: Thumbnail & Product Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Product / Hero Thumbnail */}
        <div
          onClick={() => onInspectCreatives(product)}
          className="relative w-14 h-14 rounded-lg bg-muted/50 overflow-hidden shrink-0 border border-border cursor-pointer group-hover:border-indigo-500/50 transition-colors"
          title="Click to view all creative angles"
        >
          {heroThumb ? (
            <img
              src={heroThumb}
              alt={product.title}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ImageIcon className="w-4 h-4 opacity-40" />
            </div>
          )}
          {isHeroVideo && (
            <div className="absolute top-1 left-1 flex items-center justify-center w-4 h-4 rounded bg-slate-950/80 text-white">
              <Play className="w-2 h-2 fill-white" />
            </div>
          )}
          <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded text-[8.5px] font-black bg-rose-600/90 text-white shadow-xs">
            {metrics.activeCreativesCount} Cr
          </div>
        </div>

        {/* Title, Brand, Niche */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={brandSpyUrl}
              className="text-[11px] font-bold text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate"
            >
              {brand.displayName}
            </Link>
            {product.category && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-semibold">
                {product.category}
              </span>
            )}
          </div>

          <h4
            onClick={() => onInspectCreatives(product)}
            className="text-xs font-bold text-foreground truncate hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors mt-0.5"
            title={product.title}
          >
            {product.title}
          </h4>

          {/* Pricing */}
          <div className="flex items-center gap-2 mt-1">
            {product.currentPrice && (
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                {formatPrice(product.currentPrice, sym)}
              </span>
            )}
            {product.discountOrOffer && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 truncate max-w-[120px]">
                {product.discountOrOffer}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Middle: Creative Volume Badges */}
      <div className="flex items-center gap-3 shrink-0 py-1 sm:py-0 border-t sm:border-t-0 border-border/50">
        <div className="flex flex-col text-right">
          <span className="text-xs font-black text-foreground flex items-center justify-end gap-1">
            <Flame className="w-3.5 h-3.5 text-rose-500 fill-rose-500/30" />
            <span>{metrics.totalCopies} Total Copies</span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {metrics.activeCreativesCount} Creatives ({metrics.videoCount}V / {metrics.imageCount}S) • Peak x{metrics.maxCopies}
          </span>
        </div>
      </div>

      {/* 3. Right: Action Buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onInspectCreatives(product)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer shadow-xs"
          title="Inspect creatives"
        >
          <Eye className="w-3 h-3" />
          <span>Creatives</span>
        </button>

        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open product store"
          className="flex items-center justify-center p-1.5 rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <ShoppingBag className="w-3.5 h-3.5" />
        </a>

        <a
          href={product.supplierUrls?.[0] || aliExpressSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Source on AliExpress"
          className="flex items-center justify-center p-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
        </a>

        <button
          type="button"
          onClick={handleToggleFavorite}
          disabled={isFavoriting}
          className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all cursor-pointer ${
            isFavorite
              ? "border-amber-500/50 bg-amber-500/15 text-amber-500"
              : "border-border bg-muted/40 text-muted-foreground hover:text-amber-500"
          }`}
          title={isFavorite ? "Remove from Favorites" : "Save to Favorites"}
        >
          <Bookmark
            className={`w-3.5 h-3.5 ${isFavorite ? "fill-current text-amber-500" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}

