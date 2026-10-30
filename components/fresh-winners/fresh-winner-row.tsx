"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Flame,
  Trophy,
  ShoppingBag,
  Eye,
  Bookmark,
  Play,
  Image as ImageIcon,
  Search,
  Layers,
} from "lucide-react";
import type { FreshWinnerItem } from "@/types";
import { useToast } from "@/components/toast-context";
import { useWorkspace } from "@/components/workspace-context";
import { formatPrice } from "@/lib/format-price";
import { BrandLogo } from "@/components/brand-logo";

interface FreshWinnerRowProps {
  winner: FreshWinnerItem;
}

export function FreshWinnerRow({ winner }: FreshWinnerRowProps) {
  const { showToast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const sym = activeWorkspace?.currencySymbol || "DT";
  const [isFavorite, setIsFavorite] = useState(Boolean(winner.product?.isFavorite));
  const product = winner.product;
  const isVideo =
    winner.mediaType === "video" ||
    Boolean(winner.mediaUrls?.some((u) => u.includes(".mp4")));

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

  const searchTitle = product?.title || winner.title || "";
  const cleanSearchQuery = searchTitle
    .replace(/[^\w\s\u0600-\u06FF]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliExpressSearchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(
    cleanSearchQuery || "dropshipping"
  )}`;

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product?.id) return;
    const newFav = !isFavorite;
    setIsFavorite(newFav);
    try {
      await fetch("/api/products/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, isFavorite: newFav }),
      });
      showToast({
        type: "success",
        title: newFav ? "Saved to Favorites" : "Removed from Favorites",
        message: `${product.title || "Product"} updated.`,
      });
    } catch {
      setIsFavorite(!newFav);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-xl border border-border bg-card hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-xs transition-all group">
      {/* Left: Thumbnail & Badges */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="relative w-12 h-12 rounded-lg bg-muted/50 overflow-hidden shrink-0 border border-border">
          {displayThumbnail ? (
            <img
              src={displayThumbnail}
              alt={product?.title || winner.title || "Ad"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ImageIcon className="w-4 h-4 opacity-40" />
            </div>
          )}
          {isVideo && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Play className="w-3 h-3 text-white fill-white" />
            </div>
          )}
        </div>

        {/* Product Title & Brand */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={brandSpyUrl}
              className="text-[11px] font-bold text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[140px]"
            >
              {winner.pageName || "Brand"}
            </Link>
            {winner.isBreakout && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                🔥 BREAKOUT
              </span>
            )}
            {product?.category && (
              <span className="hidden sm:inline-block px-1.5 py-0.2 rounded bg-muted text-muted-foreground text-[10px] font-medium truncate max-w-[120px]">
                {product.category}
              </span>
            )}
          </div>

          <h4
            className="text-xs font-bold text-foreground truncate mt-0.5"
            title={product?.title || winner.title || "Ad creative"}
          >
            {product?.title || winner.title || winner.caption || "Winning Ad Creative"}
          </h4>

          {/* Pricing & Scale */}
          <div className="flex items-center gap-2 mt-0.5 text-[11px]">
            {product?.currentPrice && (
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                {formatPrice(product.currentPrice, sym)}
              </span>
            )}
            <span className="text-muted-foreground">•</span>
            <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
              <Layers className="w-2.5 h-2.5" />
              {winner.duplicationCount} copies
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">
              {winner.daysRunning === 0 ? "Today" : `${winner.daysRunning}d old`}
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Winner Score Badge */}
      <div className="hidden md:flex items-center shrink-0">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${winner.winnerScore >= 85
            ? "bg-amber-400 text-slate-950"
            : winner.winnerScore >= 68
              ? "bg-rose-600 text-white"
              : "bg-indigo-600 text-white"
            }`}
        >
          {winner.winnerScore >= 85 ? (
            <Trophy className="w-3 h-3" />
          ) : (
            <Flame className="w-3 h-3 fill-white" />
          )}
          <span>{winner.winnerScore}</span>
        </span>
      </div>

      {/* Right: Quick Action Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {product && (
          <button
            type="button"
            onClick={handleToggleFavorite}
            title={isFavorite ? "Remove favorite" : "Add to favorites"}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 transition-colors cursor-pointer"
          >
            <Bookmark
              className={`w-3.5 h-3.5 ${isFavorite ? "fill-current text-amber-500" : ""
                }`}
            />
          </button>
        )}

        <a
          href={metaLibraryUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Meta Ad Library"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
        </a>

        {destinationUrl && (
          <a
            href={destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Landing Page"
            className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
          </a>
        )}

        <a
          href={product?.supplierUrls?.[0] || aliExpressSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Source on AliExpress / 1688"
          className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
