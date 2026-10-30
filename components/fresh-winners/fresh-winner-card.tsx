"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Flame,
  Rocket,
  Trophy,
  ShoppingBag,
  Eye,
  Bookmark,
  Play,
  Image as ImageIcon,
  Globe,
  Search,
  Layers,
  Sparkles,
} from "lucide-react";
import type { FreshWinnerItem } from "@/types";
import { useToast } from "@/components/toast-context";
import { useWorkspace } from "@/components/workspace-context";
import { formatPrice } from "@/lib/format-price";
import { BrandLogo } from "@/components/brand-logo";

interface FreshWinnerCardProps {
  winner: FreshWinnerItem;
  isHighlighted?: boolean;
}

export function FreshWinnerCard({ winner, isHighlighted = false }: FreshWinnerCardProps) {
  const { showToast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const sym = activeWorkspace?.currencySymbol || "DT";
  const [isFavorite, setIsFavorite] = useState(Boolean(winner.product?.isFavorite));
  const [isFavoriting, setIsFavoriting] = useState(false);

  const product = winner.product;
  const brand = winner.brand;
  const isVideo =
    winner.mediaType === "video" ||
    Boolean(winner.mediaUrls?.some((u) => u.includes(".mp4") || u.includes("video")));

  const displayThumbnail =
    winner.signedThumbnailUrl ||
    winner.thumbnailUrl ||
    (winner.mediaUrls && winner.mediaUrls.length > 0 ? winner.mediaUrls[0] : null) ||
    product?.mainImageUrl;

  const metaLibraryUrl = `https://www.facebook.com/ads/library/?id=${encodeURIComponent(
    winner.adArchiveId
  )}`;
  const destinationUrl = product?.url || winner.linkUrl;
  const brandSpyUrl = `/spy/brand/${encodeURIComponent(winner.pageId || winner.pageName || "")}`;

  // Supplier Search Query
  const searchTitle = product?.title || winner.title || "";
  const cleanSearchQuery = searchTitle
    .replace(/[^\w\s\u0600-\u06FF]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliExpressSearchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(
    cleanSearchQuery || "dropshipping winner"
  )}`;

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product?.id || isFavoriting) return;

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
      className={`group relative flex flex-col justify-between rounded-xl border transition-all duration-200 overflow-hidden bg-card shadow-xs hover:shadow-md ${isHighlighted
        ? "border-rose-500 ring-2 ring-rose-500/30 shadow-rose-500/10"
        : winner.isBreakout
          ? "border-rose-500/40 hover:border-rose-500/70"
          : "border-border hover:border-slate-300 dark:hover:border-slate-700/80"
        }`}
    >
      {/* 1. Header Bar: Brand avatar, Name & Favorite Bookmark */}
      <div className="flex items-center justify-between gap-2 p-3 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={brandSpyUrl}
            className="shrink-0 transition-transform active:scale-95 cursor-pointer"
            title={`Inspect ${winner.pageName || "Brand"} in Ad Spy`}
          >
            <BrandLogo
              name={winner.pageName}
              domain={product?.domain}
              pageId={winner.pageId}
              size="xs"
            />
          </Link>
          <div className="min-w-0">
            <Link
              href={brandSpyUrl}
              className="text-xs font-bold text-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors truncate block leading-tight"
              title={winner.pageName || "Brand"}
            >
              {winner.pageName || `Brand #${winner.pageId}`}
            </Link>
          </div>
        </div>

        {/* Favorite Bookmark Button (Matching ProductCard) */}
        {product && (
          <button
            type="button"
            onClick={handleToggleFavorite}
            disabled={isFavoriting}
            className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all duration-200 ease-out hover:scale-105 active:scale-90 cursor-pointer shadow-xs ${isFavorite
              ? "border-amber-500/50 bg-amber-500/15 text-amber-500 hover:bg-amber-500/25"
              : "border-border bg-muted/50 text-muted-foreground hover:text-amber-500 hover:border-amber-500/35 hover:bg-amber-500/10"
              }`}
            title={isFavorite ? "Remove from Favorites" : "Save to Favorites"}
          >
            <Bookmark
              className={`w-3.5 h-3.5 transition-transform duration-200 ease-out ${isFavorite ? "fill-current text-amber-500" : ""
                }`}
            />
          </button>
        )}
      </div>

      {/* 2. Media Hero Section with Badges */}
      <div className="relative aspect-4/3 w-full bg-muted/40 overflow-hidden shrink-0 border-y border-border/70">
        {displayThumbnail ? (
          <img
            src={displayThumbnail}
            alt={product?.title || winner.title || "Winning Ad Creative"}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ImageIcon className="w-8 h-8 opacity-30" />
            <span className="text-[11px]">No media preview</span>
          </div>
        )}

        {/* Video Overlay Badge */}
        {isVideo && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-950/80 text-white backdrop-blur-md shadow-xs">
            <Play className="w-2.5 h-2.5 fill-white" />
            <span>VIDEO</span>
          </div>
        )}

        {/* Breakout / Scaling Indicator Badge */}
        {winner.isBreakout && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-600 text-white shadow-xs animate-pulse">
            <Flame className="w-3 h-3 fill-white" />
            <span>BREAKOUT</span>
          </div>
        )}

        {/* Bottom Media Bar: Copies & Days Running */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2.5 pt-6 flex items-center justify-between text-white">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-600/90 text-white shadow-xs">
              <Layers className="w-2.5 h-2.5" />
              {winner.duplicationCount} {winner.duplicationCount === 1 ? "Copy" : "Copies"}
            </span>
            <span className="text-[10px] font-medium text-slate-200">
              {winner.daysRunning === 0 ? "Today" : `${winner.daysRunning}d old`}
            </span>
          </div>

          {/* Winner Score Gauge */}
          <div
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${winner.winnerScore >= 85
              ? "bg-amber-400 text-slate-950 shadow-xs"
              : winner.winnerScore >= 68
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-indigo-600 text-white shadow-xs"
              }`}
          >
            {winner.winnerScore >= 85 ? (
              <Trophy className="w-2.5 h-2.5 fill-slate-950" />
            ) : (
              <Flame className="w-2.5 h-2.5 fill-white" />
            )}
            <span>{winner.winnerScore} Score</span>
          </div>
        </div>
      </div>

      {/* 3. Card Body: Title, Price & Offer */}
      <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
        <div>
          <h3
            className="text-xs font-bold text-foreground line-clamp-2 leading-snug"
            title={product?.title || winner.title || winner.caption || "Ad Creative"}
          >
            {product?.title || winner.title || winner.caption || "Winning Ad Creative"}
          </h3>

          {/* Pricing & Offer */}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              {product?.currentPrice ? (
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  {formatPrice(product.currentPrice, sym)}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-muted-foreground">Direct Ad Offer</span>
              )}
              {product?.originalPrice && (
                <span className="text-[10px] text-muted-foreground line-through">
                  {formatPrice(product.originalPrice, sym)}
                </span>
              )}
            </div>

            {product?.discountOrOffer && (
              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 truncate max-w-[120px]">
                {product.discountOrOffer}
              </span>
            )}
          </div>
        </div>

        {/* Niche & Domain Info */}
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground pt-1.5 border-t border-border/60">
          {product?.domain && (
            <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
              <Globe className="w-3 h-3 text-slate-400" />
              {product.domain}
            </span>
          )}
          {product?.category && (
            <span className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-semibold truncate max-w-[110px]">
              {product.category}
            </span>
          )}
          {product?.storePlatform && (
            <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold uppercase text-[9px]">
              {product.storePlatform}
            </span>
          )}
        </div>

        {/* 4. Action Buttons (Clean slate styling matching ProductCard / AdCard) */}
        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-border">
          {/* Ad Library */}
          <a
            href={metaLibraryUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View on Meta Ad Library"
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-muted/60 hover:bg-muted hover:text-foreground transition-colors text-center cursor-pointer"
          >
            <Eye className="w-3 h-3" />
            <span>Ad Lib</span>
          </a>

          {/* Store Landing Page */}
          {destinationUrl ? (
            <a
              href={destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open product landing page"
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors text-center cursor-pointer"
            >
              <ShoppingBag className="w-3 h-3" />
              <span>Store</span>
            </a>
          ) : (
            <Link
              href={brandSpyUrl}
              title="View brand ads"
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground bg-muted/60 hover:bg-muted hover:text-foreground transition-colors text-center cursor-pointer"
            >
              <span>Brand</span>
            </Link>
          )}

          {/* Supplier Search */}
          <a
            href={product?.supplierUrls?.[0] || aliExpressSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Search supplier on AliExpress / 1688"
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
