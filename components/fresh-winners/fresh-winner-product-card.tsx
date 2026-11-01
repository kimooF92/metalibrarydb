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
  Globe,
  Search,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import type { FreshWinnerProduct } from "@/types";
import { useToast } from "@/components/toast-context";
import { useWorkspace } from "@/components/workspace-context";
import { formatPrice } from "@/lib/format-price";
import { BrandLogo } from "@/components/brand-logo";

interface FreshWinnerProductCardProps {
  product: FreshWinnerProduct;
  onInspectCreatives: (product: FreshWinnerProduct) => void;
  isHighlighted?: boolean;
}

export function FreshWinnerProductCard({
  product,
  onInspectCreatives,
  isHighlighted = false,
}: FreshWinnerProductCardProps) {
  const { showToast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const sym = product.currency || activeWorkspace?.currencySymbol || "DT";

  const [isFavorite, setIsFavorite] = useState(Boolean(product.isFavorite));
  const [isFavoriting, setIsFavoriting] = useState(false);

  const brand = product.brand;
  const metrics = product.metrics;
  const creatives = product.creatives || [];

  const brandSpyUrl = brand.pageId
    ? `/spy/brand/${encodeURIComponent(brand.pageId)}`
    : `/brands?search=${encodeURIComponent(brand.displayName || "")}`;

  // Supplier Search Query
  const cleanSearchQuery = (product.title || "")
    .replace(/[^\w\s\u0600-\u06FF]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliExpressSearchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(
    cleanSearchQuery || "dropshipping winner"
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
    <div
      className={`group relative flex flex-col justify-between rounded-xl border transition-all duration-200 overflow-hidden bg-card shadow-xs hover:shadow-md ${
        isHighlighted
          ? "border-rose-500 ring-2 ring-rose-500/30 shadow-rose-500/10"
          : metrics.activeCreativesCount >= 3 || metrics.totalCopies >= 10
          ? "border-rose-500/30 hover:border-rose-500/60"
          : "border-border hover:border-slate-300 dark:hover:border-slate-700/80"
      }`}
    >
      {/* 1. Header Bar: Brand identity & Favorite bookmark */}
      <div className="flex items-center justify-between gap-2 p-3 pb-2.5 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={brandSpyUrl}
            className="shrink-0 transition-transform active:scale-95 cursor-pointer"
            title={`Inspect ${brand.displayName} in Ad Spy`}
          >
            <BrandLogo
              name={brand.displayName}
              domain={brand.domain || product.domain}
              pageId={brand.pageId || undefined}
              size="xs"
            />
          </Link>
          <div className="min-w-0">
            <Link
              href={brandSpyUrl}
              className="text-xs font-bold text-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors truncate block leading-tight"
              title={brand.displayName}
            >
              {brand.displayName}
            </Link>
            {product.domain && (
              <span className="text-[10px] text-muted-foreground truncate block font-mono">
                {product.domain}
              </span>
            )}
          </div>
        </div>

        {/* Favorite Bookmark */}
        <button
          type="button"
          onClick={handleToggleFavorite}
          disabled={isFavoriting}
          className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all duration-200 ease-out hover:scale-105 active:scale-90 cursor-pointer shadow-xs ${
            isFavorite
              ? "border-amber-500/50 bg-amber-500/15 text-amber-500 hover:bg-amber-500/25"
              : "border-border bg-muted/50 text-muted-foreground hover:text-amber-500 hover:border-amber-500/35 hover:bg-amber-500/10"
          }`}
          title={isFavorite ? "Remove from Favorites" : "Save to Favorites"}
        >
          <Bookmark
            className={`w-3.5 h-3.5 transition-transform duration-200 ease-out ${
              isFavorite ? "fill-current text-amber-500" : ""
            }`}
          />
        </button>
      </div>

      {/* 2. Visual Creative Portfolio Filmstrip (The Core Feature) */}
      <div className="relative bg-muted/30 p-2.5 border-b border-border/70">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <span className="text-[10.5px] font-bold text-foreground flex items-center gap-1">
            <Layers className="w-3 h-3 text-indigo-500" />
            <span>Creative Angles ({metrics.activeCreativesCount})</span>
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {metrics.videoCount > 0 && `${metrics.videoCount} Video${metrics.videoCount > 1 ? "s" : ""}`}
            {metrics.videoCount > 0 && metrics.imageCount > 0 && " • "}
            {metrics.imageCount > 0 && `${metrics.imageCount} Static`}
          </span>
        </div>

        {/* Visual Filmstrip Grid */}
        <div
          onClick={() => onInspectCreatives(product)}
          className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 cursor-pointer group/filmstrip"
          title="Click to inspect all active creatives & copy"
        >
          {creatives.length > 0 ? (
            creatives.slice(0, 4).map((creative, idx) => {
              const isVideo = creative.mediaType === "video";
              const thumb = creative.thumbnailUrl || product.mainImageUrl;

              return (
                <div
                  key={creative.id || idx}
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border/80 group-hover/filmstrip:border-indigo-500/50 transition-colors shadow-xs"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={creative.headline || product.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover/filmstrip:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-4 h-4 opacity-40" />
                    </div>
                  )}

                  {/* Video Play Badge */}
                  {isVideo && (
                    <div className="absolute top-1 left-1 flex items-center justify-center w-4 h-4 rounded bg-slate-950/80 text-white backdrop-blur-xs">
                      <Play className="w-2 h-2 fill-white" />
                    </div>
                  )}

                  {/* Copy Count Badge */}
                  <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded text-[9px] font-black bg-rose-600/90 text-white shadow-xs">
                    x{creative.duplicationCount}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-3 sm:col-span-4 h-24 flex flex-col items-center justify-center text-muted-foreground gap-1.5 rounded-lg border border-dashed border-border">
              <ImageIcon className="w-6 h-6 opacity-30" />
              <span className="text-[11px]">No active preview</span>
            </div>
          )}
        </div>

        {/* Aggregate Creative Volume Bar */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground bg-background/80 rounded-lg px-2 py-1 border border-border/60">
          <span className="font-semibold text-foreground flex items-center gap-1">
            <Flame className="w-3 h-3 text-rose-500 fill-rose-500/30" />
            <span>{metrics.totalCopies} Total Copies Scaled</span>
          </span>
          <span className="font-medium text-slate-500 dark:text-slate-400">
            Peak: <strong className="text-foreground">x{metrics.maxCopies}</strong> •{" "}
            {metrics.daysRunning === 0 ? "Today" : `${metrics.daysRunning}d old`}
          </span>
        </div>
      </div>

      {/* 3. Product Body: Title, Price, Offer */}
      <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
        <div>
          <h3
            className="text-xs font-bold text-foreground line-clamp-2 leading-snug hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
            onClick={() => onInspectCreatives(product)}
            title={product.title}
          >
            {product.title}
          </h3>

          {/* Pricing & Offer */}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              {product.currentPrice ? (
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  {formatPrice(product.currentPrice, sym)}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-muted-foreground">Direct Ad Offer</span>
              )}
              {product.originalPrice && (
                <span className="text-[10px] text-muted-foreground line-through">
                  {formatPrice(product.originalPrice, sym)}
                </span>
              )}
            </div>

            {product.discountOrOffer && (
              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 truncate max-w-[120px]">
                {product.discountOrOffer}
              </span>
            )}
          </div>
        </div>

        {/* Niche & Platform */}
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground pt-1.5 border-t border-border/60">
          {product.category && (
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold truncate max-w-[120px]">
              {product.category}
            </span>
          )}
          {product.storePlatform && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold uppercase text-[9px]">
              {product.storePlatform}
            </span>
          )}
        </div>

        {/* 4. Action Row */}
        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-border">
          {/* Inspect Creatives Trigger */}
          <button
            type="button"
            onClick={() => onInspectCreatives(product)}
            title="Inspect all creative angles & videos"
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors text-center cursor-pointer shadow-xs"
          >
            <Eye className="w-3 h-3" />
            <span>Creatives</span>
          </button>

          {/* Store Landing Page */}
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open product store page"
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-muted/60 hover:bg-muted hover:text-foreground transition-colors text-center cursor-pointer"
          >
            <ShoppingBag className="w-3 h-3" />
            <span>Store</span>
          </a>

          {/* Sourcing Search */}
          <a
            href={product.supplierUrls?.[0] || aliExpressSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Search product suppliers on AliExpress"
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors text-center cursor-pointer"
          >
            <Search className="w-3 h-3" />
            <span>Source</span>
          </a>
        </div>
      </div>
    </div>
  );
}

