"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Flame,
  Rocket,
  Trophy,
  Zap,
  ExternalLink,
  ShoppingBag,
  Eye,
  Star,
  Play,
  Image as ImageIcon,
  Tag,
  Globe,
  Search,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import type { FreshWinnerItem } from "@/types";
import { useToast } from "@/components/toast-context";

interface FreshWinnerCardProps {
  winner: FreshWinnerItem;
  isHighlighted?: boolean;
}

export function FreshWinnerCard({ winner, isHighlighted = false }: FreshWinnerCardProps) {
  const { showToast } = useToast();
  const [isFavorite, setIsFavorite] = useState(Boolean(winner.product?.isFavorite));
  const [isFavoriting, setIsFavoriting] = useState(false);

  const product = winner.product;
  const brand = winner.brand;
  const isVideo = winner.mediaType === "video" || Boolean(winner.mediaUrls?.some((u) => u.includes(".mp4") || u.includes("video")));

  const displayThumbnail =
    winner.signedThumbnailUrl ||
    winner.thumbnailUrl ||
    (winner.mediaUrls && winner.mediaUrls.length > 0 ? winner.mediaUrls[0] : null) ||
    product?.mainImageUrl;

  const firstVideoUrl = winner.mediaUrls?.find(
    (url) => url.includes(".mp4") || url.includes("/videos/") || url.includes("fbcdn.net/o1/v/")
  );

  const metaLibraryUrl = `https://www.facebook.com/ads/library/?id=${encodeURIComponent(winner.adArchiveId)}`;
  const destinationUrl = product?.url || winner.linkUrl;
  const brandSpyUrl = `/spy/brand/${encodeURIComponent(winner.pageId || winner.pageName || "")}`;

  // Supplier Search Query
  const searchTitle = product?.title || winner.title || "";
  const cleanSearchQuery = searchTitle
    .replace(/[^\w\s\u0600-\u06FF]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliExpressSearchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(cleanSearchQuery || "dropshipping winner")}`;

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
      className={`group relative flex flex-col justify-between rounded-2xl border transition-all duration-200 overflow-hidden bg-white dark:bg-slate-900/60 shadow-xs hover:shadow-xl ${
        isHighlighted
          ? "border-rose-500 ring-2 ring-rose-500/40 shadow-rose-500/10"
          : winner.isBreakout
          ? "border-rose-500/40 hover:border-rose-500 dark:border-rose-500/30"
          : "border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700"
      }`}
    >
      {/* Top Media & Visual Hero */}
      <div className="relative aspect-4/3 w-full bg-slate-100 dark:bg-slate-950 overflow-hidden shrink-0">
        {displayThumbnail ? (
          <img
            src={displayThumbnail}
            alt={product?.title || winner.title || "Winning Ad Creative"}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
            <ImageIcon className="w-10 h-10 opacity-30" />
            <span className="text-xs">No media preview</span>
          </div>
        )}

        {/* Video Play Overlay Badge */}
        {isVideo && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-black/70 text-white backdrop-blur-md shadow-xs">
            <Play className="w-3 h-3 fill-white" />
            <span>VIDEO</span>
          </div>
        )}

        {/* Favorite Button */}
        {product && (
          <button
            onClick={handleToggleFavorite}
            disabled={isFavoriting}
            title={isFavorite ? "Remove from Favorites" : "Save to Favorites"}
            className="absolute top-2.5 right-2.5 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-transform active:scale-90 cursor-pointer shadow-md"
          >
            <Star
              className={`w-3.5 h-3.5 transition-colors ${
                isFavorite ? "fill-amber-400 text-amber-400" : "text-white"
              }`}
            />
          </button>
        )}

        {/* Bottom Banner inside Media: Scale count & Days running */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-6 flex items-center justify-between text-white">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-black bg-rose-600 text-white shadow-sm shadow-rose-600/30">
              <Layers className="w-3 h-3" />
              {winner.duplicationCount} {winner.duplicationCount === 1 ? "Copy" : "Copies"}
            </span>
            <span className="text-[10px] font-bold text-slate-300">
              {winner.daysRunning === 0 ? "⚡ Today" : `⚡ ${winner.daysRunning}d old`}
            </span>
          </div>

          {/* Winner Score Gauge */}
          <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold ${
              winner.isBreakout
                ? "bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white shadow-sm"
                : winner.winnerScore >= 85
                ? "bg-amber-400 text-slate-950 font-black shadow-sm"
                : winner.winnerScore >= 68
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-indigo-600 text-white"
            }`}
          >
            {winner.isBreakout ? (
              <Rocket className="w-3 h-3 text-white fill-white/20 animate-pulse" />
            ) : winner.winnerScore >= 85 ? (
              <Trophy className="w-3 h-3 fill-slate-950" />
            ) : (
              <Flame className="w-3 h-3 fill-white" />
            )}
            <span>{winner.winnerScore} Score</span>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between space-y-3">
        {/* Brand & Archetype Row */}
        <div className="flex items-center justify-between gap-2">
          <Link
            href={brandSpyUrl}
            className="text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-rose-600 dark:hover:text-rose-400 hover:underline truncate"
            title={`Inspect ${winner.pageName || "Brand"} in Ad Spy`}
          >
            {winner.pageName || `Brand #${winner.pageId}`}
          </Link>

          {brand?.scalingPattern && (
            <span
              className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded-md shrink-0 ${brand.scalingPattern.badgeClass}`}
              title={brand.scalingPattern.description}
            >
              {brand.scalingPattern.shortLabel}
            </span>
          )}
        </div>

        {/* Product Title & Offer */}
        <div>
          <h3
            className="text-sm font-extrabold text-slate-900 dark:text-white line-clamp-2 leading-snug"
            title={product?.title || winner.title || winner.caption || "Ad Creative"}
          >
            {product?.title || winner.title || winner.caption || "Winning Ad Creative"}
          </h3>

          {/* Pricing & Offer */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              {product?.currentPrice ? (
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                  {product.currentPrice}
                </span>
              ) : (
                <span className="text-xs font-bold text-slate-400">Direct Ad Offer</span>
              )}
              {product?.originalPrice && (
                <span className="text-xs text-slate-400 line-through">
                  {product.originalPrice}
                </span>
              )}
            </div>

            {/* Offer / Free Delivery Badge */}
            {product?.discountOrOffer && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 truncate max-w-[130px]">
                {product.discountOrOffer}
              </span>
            )}
          </div>
        </div>

        {/* E-Commerce Platform & Niche Pills */}
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          {product?.domain && (
            <span className="inline-flex items-center gap-1 font-mono font-medium text-slate-600 dark:text-slate-300">
              <Globe className="w-3 h-3 text-slate-400" />
              {product.domain}
            </span>
          )}
          {product?.category && (
            <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold truncate max-w-[120px]">
              {product.category}
            </span>
          )}
          {product?.storePlatform && (
            <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-bold uppercase text-[9px]">
              {product.storePlatform}
            </span>
          )}
        </div>

        {/* 1-Click Action Buttons */}
        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Action 1: Meta Ad Library */}
          <a
            href={metaLibraryUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View live ad on Meta Ad Library"
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-center"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Ad Lib</span>
          </a>

          {/* Action 2: Store Landing Page */}
          {destinationUrl ? (
            <a
              href={destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open product sales landing page"
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors text-center"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Store</span>
            </a>
          ) : (
            <Link
              href={brandSpyUrl}
              title="View all brand ads"
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 transition-colors text-center"
            >
              <span>Brand</span>
            </Link>
          )}

          {/* Action 3: 1-Click Supplier Search */}
          <a
            href={product?.supplierUrls?.[0] || aliExpressSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Find supplier on AliExpress or 1688"
            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors text-center"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Source</span>
          </a>
        </div>
      </div>
    </div>
  );
}
