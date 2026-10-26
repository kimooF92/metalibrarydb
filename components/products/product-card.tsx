"use client";

import { useState, useRef, useEffect, memo } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { ScrapedProduct } from "@/types";
import {
  ExternalLink,
  ShoppingBag,
  Sparkles,
  RotateCw,
  Trash2,
  AlertCircle,
  Clock,
  Rocket,
  Calendar,
  Pause,
  Layers,
  Bookmark,
  MoreVertical,
  Copy,
  Coins,
  Flame,
  ArrowUpRight,
} from "lucide-react";
import { formatDiscoveryDate } from "@/lib/format-date";
import { useWorkspace } from "@/components/workspace-context";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/components/toast-context";
import { formatPrice } from "@/lib/format-price";
import { BrandLogo } from "@/components/brand-logo";
import { MetaIcon } from "@/components/icons/custom-icons";

export interface ProductCardProps {
  product: ScrapedProduct;
  onRefresh?: (productId: string, product?: ScrapedProduct) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
  onToggleFavorite?: (productId: string, nextFavorite: boolean) => Promise<void>;
  onViewDetails?: (product: ScrapedProduct) => void;
  onViewCreatives?: (product: ScrapedProduct) => void;
  onFilterBrand?: (brandName: string) => void;
  isRecentlyViewed?: boolean;
}

export const ProductCard = memo(function ProductCard({
  product,
  onRefresh,
  onDelete,
  onToggleFavorite,
  onViewDetails,
  onViewCreatives,
  onFilterBrand,
  isRecentlyViewed,
}: ProductCardProps) {
  const { activeWorkspace } = useWorkspace();
  const { isStaff } = useAuth();
  const { showToast } = useToast();
  const sym = activeWorkspace?.currencySymbol || "DT";

  const [imgError, setImgError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncingPrice, setIsSyncingPrice] = useState(false);
  const [localPrice, setLocalPrice] = useState(product.currentPrice);
  const isFavorite = Boolean(product.isFavorite);
  const [isTogglingFav, setIsTogglingFav] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Sync local price if parent updates
  useEffect(() => {
    setLocalPrice(product.currentPrice);
  }, [product.currentPrice]);

  // Close 3-dots menu on outside click or Escape
  useEffect(() => {
    if (!isMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTogglingFav) return;
    const nextState = !isFavorite;
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
    } finally {
      setIsTogglingFav(false);
    }
  };

  const handleRefresh = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsMenuOpen(false);
    if (!onRefresh || isRefreshing || isStaff) return;
    setIsRefreshing(true);
    try {
      await onRefresh(product.id, product);
    } catch {
      // Parent handler already shows appropriate error toasts
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    if (!product.url) return;
    try {
      await navigator.clipboard.writeText(product.url);
      showToast({
        type: "success",
        title: "Link Copied",
        message: "Product landing page URL copied to clipboard.",
      });
    } catch {
      showToast({
        type: "error",
        title: "Copy Failed",
        message: "Could not copy link to clipboard.",
      });
    }
  };

  const handleSyncPrice = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    const targetPrice = localPrice || product.currentPrice;
    if (!targetPrice || isSyncingPrice) return;
    setIsSyncingPrice(true);
    const normalizedPrice = formatPrice(targetPrice, sym);
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, currentPrice: normalizedPrice }),
      });
      if (res.ok) {
        setLocalPrice(normalizedPrice);
        showToast({
          type: "success",
          title: "Price Synced",
          message: `Product price normalized with ${sym} currency symbol.`,
        });
      } else {
        showToast({
          type: "error",
          title: "Sync Failed",
          message: "Failed to update price currency.",
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Network Error",
        message: "Could not connect to update price.",
      });
    } finally {
      setIsSyncingPrice(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(product.id);
      showToast({
        type: "info",
        title: "Product Deleted",
        message: "Product removed from tracking hub.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper date formatter
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

  const isPageOnHold = product.brandHoldStatus === "on_hold";
  const isPageInactive = product.brandHoldStatus === "inactive";
  const isBreakout = Boolean(
    !isPageOnHold &&
    !isPageInactive &&
    (product.isBreakout ||
      ((product.activeAdsCount || 0) > 0 &&
        (product.daysRunning || 1) <= 7 &&
        (product.maxDuplications || 1) >= 3))
  );
  const isWinning = !isBreakout && !isPageOnHold && !isPageInactive && (product.linkedAdsCount || 0) >= 3 && (product.activeAdsCount || 0) > 0;
  const isInactive = isPageInactive || (typeof product.activeAdsCount === "number" && product.activeAdsCount === 0 && (product.linkedAdsCount || 0) > 0);
  const isPendingScrape = product.scrapeStatus === "pending";
  const isFailedScrape = product.scrapeStatus === "failed";

  // Brand navigation target
  const isUuid = (s?: string | null) => Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
  const rawPageId = (product.pageId && !isUuid(product.pageId) ? product.pageId : null) ||
    (product.brandPageId && !isUuid(product.brandPageId) && product.brandPageId !== "0" ? product.brandPageId : null);

  const brandTarget = rawPageId || product.domain || (product.brandName && !isUuid(product.brandName) ? product.brandName : null);
  const brandDisplayName = product.brandName || product.domain || "Brand";

  // Meta Ad Library URL (numeric page ID preferred, brand name fallback)
  const metaAdLibraryUrl = rawPageId
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(rawPageId)}`
    : (product.brandName && !isUuid(product.brandName)
      ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&q=${encodeURIComponent(product.brandName)}`
      : null);

  // Price formatting
  const rawPrice = (localPrice ?? product.currentPrice ?? "").trim();
  const isZeroPrice = !rawPrice || /^0(\.0+)?\s*(dt|dh|mad|tnd|usd|eur)?$/i.test(rawPrice);
  const cleanPrice = !isZeroPrice ? formatPrice(rawPrice, sym) : "";

  return (
    <div
      onClick={() => onViewDetails?.(product)}
      className={`group relative flex flex-col justify-between rounded-xl border px-3.5 py-[19px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg cursor-pointer ${
        isPageOnHold
          ? "border-amber-500/40 dark:border-amber-500/40 hover:border-amber-400 bg-white dark:bg-slate-950/40"
          : isInactive
          ? "border-slate-200/90 dark:border-slate-800/60 bg-slate-100/50 dark:bg-slate-950/20 opacity-80 hover:opacity-100 hover:border-slate-300 dark:hover:border-slate-700/80"
          : isBreakout
          ? "border-pink-500/30 dark:border-pink-500/40 hover:border-pink-500/70 shadow-pink-500/5 bg-white dark:bg-slate-950/40"
          : "border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700/80"
      }`}
    >
      {/* ======================================================== */}
      {/* TOP SECTION: HEADER + MEDIA + TITLE + PRICE              */}
      {/* ======================================================== */}
      <div>
        {/* Brand Name & Action Icons (Seamless, matching AdCard header style) */}
        <div className="flex items-center justify-between gap-2 mb-2.5 min-h-[32px]">
          {/* Left: Brand Avatar & Name */}
          <div className="flex items-center gap-2 min-w-0">
            <BrandLogo
              name={product.brandName}
              domain={product.domain}
              pageId={rawPageId}
              size="xs"
              className="shrink-0"
            />
            <div className="flex items-center gap-1.5 min-w-0">
              {isStaff ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterBrand?.(brandDisplayName);
                  }}
                  className="text-[13px] font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors truncate leading-tight"
                  title={`Filter by ${brandDisplayName}`}
                >
                  {brandDisplayName}
                </button>
              ) : brandTarget ? (
                <Link
                  href={`/spy/brand/${encodeURIComponent(brandTarget)}?tab=products`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[13px] font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors truncate leading-tight"
                  title={`View ${brandDisplayName} catalog`}
                >
                  {brandDisplayName}
                </Link>
              ) : (
                <span className="text-[13px] font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                  {brandDisplayName}
                </span>
              )}
            </div>
          </div>

          {/* Right: Bookmark + 3-Dots Action Menu (Boxed w-8 h-8 with Micro-Interactions) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Bookmark Toggle (Boxed) */}
            <button
              type="button"
              onClick={handleToggleFavorite}
              disabled={isTogglingFav}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 ease-out hover:scale-105 active:scale-90 group/fav cursor-pointer shadow-xs ${
                isFavorite
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-500 dark:text-amber-400 hover:bg-amber-500/25 hover:border-amber-500/70 shadow-amber-500/10 hover:shadow-sm"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-400 hover:text-amber-500 hover:border-amber-500/35 hover:bg-amber-500/10 dark:hover:bg-amber-500/15"
              }`}
              title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Bookmark className={`w-4 h-4 transition-transform duration-200 ease-out group-hover/fav:scale-115 group-hover/fav:-rotate-12 group-active/fav:scale-90 ${isFavorite ? "fill-current text-amber-500" : ""}`} />
            </button>

            {/* 3-Dots Menu Trigger (Boxed) */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen((prev) => !prev);
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 ease-out hover:scale-105 active:scale-90 shadow-xs group/more cursor-pointer ${
                  isMenuOpen ? "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-200 ring-2 ring-indigo-500/20" : ""
                }`}
                title="More options"
              >
                <MoreVertical className={`w-4 h-4 transition-transform duration-300 ease-out group-hover/more:rotate-90 group-hover/more:scale-110 ${isMenuOpen ? "rotate-90 text-indigo-500 dark:text-indigo-400" : ""}`} />
              </button>

              {/* 3-Dots Dropdown Popover */}
              {isMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 py-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                >
                  {!isStaff && onRefresh && (
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className="group/item w-full flex items-center gap-2 px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                    >
                      <RotateCw className={`w-4 h-4 text-indigo-500 shrink-0 transition-transform duration-300 ease-out group-hover/item:rotate-180 ${isRefreshing ? "animate-spin" : ""}`} />
                      <span>{isRefreshing ? "Re-scraping..." : "Re-scrape Landing Page"}</span>
                    </button>
                  )}

                  {cleanPrice && (
                    <button
                      type="button"
                      onClick={handleSyncPrice}
                      disabled={isSyncingPrice}
                      className="group/item w-full flex items-center gap-2 px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                    >
                      <Coins className="w-4 h-4 text-amber-500 shrink-0 transition-transform duration-200 ease-out group-hover/item:scale-115 group-hover/item:-rotate-12" />
                      <span>Sync Local Price ({sym})</span>
                    </button>
                  )}

                  {product.url && (
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="group/item w-full flex items-center gap-2 px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all duration-150 active:scale-[0.98] cursor-pointer"
                    >
                      <Copy className="w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ease-out group-hover/item:scale-115 group-hover/item:rotate-6" />
                      <span>Copy Product Link</span>
                    </button>
                  )}

                  {onDelete && (
                    <>
                      <div className="my-1 border-t border-slate-100 dark:border-slate-800/60" />
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="group/item w-full flex items-center gap-2 px-3 py-2 text-left font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500 shrink-0 transition-transform duration-200 ease-out group-hover/item:scale-115 group-hover/item:-rotate-6" />
                        <span>{isDeleting ? "Deleting..." : "Delete Product"}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Media Container (with Ambient Glowing Blur, exactly like AdCard) */}
        <div
          className={`relative w-full aspect-square overflow-hidden rounded-xl border mb-2.5 flex items-center justify-center transition-all ${isInactive
              ? "border-slate-200/70 dark:border-slate-800/50 bg-slate-100/70 dark:bg-slate-950/60"
              : "border-slate-200 dark:border-slate-800/80 bg-slate-900/95 dark:bg-slate-950"
            }`}
        >
          {product.mainImageUrl && !imgError ? (
            <>
              {/* Ambient Blurred Background Canvas */}
              <NextImage
                src={product.mainImageUrl}
                alt=""
                fill
                unoptimized
                referrerPolicy="no-referrer"
                className={`object-cover blur-2xl scale-125 select-none pointer-events-none transition-all ${isInactive ? "grayscale opacity-15" : "opacity-40 dark:opacity-30"
                  }`}
              />

              {/* Main Crisp Uncropped Image (p-1 allows maximum image display size) */}
              <div className="relative w-full h-full p-1 flex items-center justify-center z-10">
                <NextImage
                  src={product.mainImageUrl}
                  alt={product.title || "Product image"}
                  fill
                  unoptimized
                  referrerPolicy="no-referrer"
                  className={`object-contain transition-all duration-300 group-hover:scale-[1.03] drop-shadow-md ${isInactive
                      ? "grayscale contrast-90 opacity-70 group-hover:grayscale-0 group-hover:opacity-100"
                      : ""
                    }`}
                  onError={() => setImgError(true)}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400 font-medium">
              <ShoppingBag className="w-10 h-10 opacity-40 stroke-[1.5]" />
              <span className="text-[11px] text-slate-400">
                {isPendingScrape ? "Pending Scrape" : "No Image Available"}
              </span>
            </div>
          )}

          {/* Top-Left Dynamic Status Pill (High contrast dark-glass pill for 100% readability over white images) */}
          <div className="absolute top-2 left-2 z-20">
            {isPageOnHold ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-black/80 border border-amber-500/50 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
                title="Brand account is paused / on hold under grace period recheck"
              >
                <Pause className="w-3 h-3 text-amber-400" />
                <span>Paused</span>
              </span>
            ) : isBreakout ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold text-pink-300 bg-black/80 border border-pink-500/50 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
                title={`Breakout product: ${product.maxDuplications || 3}x copies running in first week`}
              >
                <Rocket className="w-3 h-3 text-pink-400" />
                <span>Breakout</span>
              </span>
            ) : isWinning ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-black/80 border border-amber-500/50 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
                title={`Winning product with ${product.linkedAdsCount || 0} active ads`}
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Winning</span>
              </span>
            ) : isInactive ? (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-300 bg-black/80 border border-slate-600/60 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
                title="All ads for this product are currently inactive (off-air)"
              >
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>Inactive</span>
              </span>
            ) : isPendingScrape ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-300 bg-black/80 border border-slate-600/60 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
                title="Landing page extraction queued"
              >
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Pending</span>
              </span>
            ) : isFailedScrape ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-300 bg-black/80 border border-rose-500/50 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
                title="Failed to extract product landing page"
              >
                <AlertCircle className="w-3 h-3 text-rose-400" />
                <span>Failed</span>
              </span>
            ) : null}
          </div>

          {/* Top-Right Discovery Date Pill (Matching high contrast dark glass) */}
          <div className="absolute top-2 right-2 z-20">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-200 bg-black/80 border border-white/20 px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-md"
              title={`Discovered: ${formatDate(product.createdAt || product.lastScrapedAt)}`}
            >
              <Calendar className="w-3 h-3 text-slate-400" />
              <span>{formatDiscoveryDate(product.createdAt || product.lastScrapedAt)}</span>
            </span>
          </div>
        </div>

        {/* Product Title (Fixed 2-line height ensures identical baseline) */}
        <div className="h-11 flex items-start mb-2">
          <h4
            className={`text-[13px] sm:text-sm font-bold line-clamp-2 leading-snug transition-colors ${isPageOnHold || isInactive
                ? "text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"
                : "text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
              }`}
            title={product.title || "Product Landing Page"}
          >
            {product.hasCarouselAd && (
              <span title="Active in Meta Carousel Ad format" className="inline-flex items-center">
                <Layers className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0 mr-1.5 -mt-0.5" />
              </span>
            )}
            {product.title || "Untitled Product Landing Page"}
          </h4>
        </div>
      </div>

      {/* ======================================================== */}
      {/* BOTTOM SECTION: PRICE ROW + FOOTER (Pinned to Bottom)     */}
      {/* ======================================================== */}
      <div className="mt-auto">
        {/* Price & External Action Buttons (100% horizontally aligned across all cards) */}
        <div className="flex items-center justify-between gap-2 mb-2">
          {/* Bold Clean Price */}
          <div className="flex items-baseline">
            {cleanPrice ? (
              <span
                className={`text-base sm:text-lg font-black tracking-tight ${isPageOnHold || isInactive
                    ? "text-slate-600 dark:text-slate-400"
                    : "text-slate-900 dark:text-slate-100"
                  }`}
              >
                {cleanPrice}
              </span>
            ) : isPendingScrape ? (
              <span className="text-xs text-amber-500 font-medium">Scrape to get price</span>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400 italic">Price not detected</span>
            )}
          </div>

          {/* External Action Buttons (Matching height & rounded-lg with header buttons) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Meta Ad Library Quick Jump Button */}
            {metaAdLibraryUrl && (
              <a
                href={metaAdLibraryUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="group/meta h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 active:bg-blue-500/30 border border-blue-500/25 hover:border-blue-500/50 text-[#0081FB] dark:text-blue-400 shadow-xs hover:shadow-md hover:shadow-blue-500/15 transition-all duration-200 ease-out hover:scale-105 active:scale-95 cursor-pointer"
                title="View brand in Meta Ad Library"
              >
                <MetaIcon className="w-5 h-5 shrink-0 transition-transform duration-200 ease-out group-hover/meta:scale-110 drop-shadow-xs" />
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 transition-transform duration-200 ease-out group-hover/meta:translate-x-0.5 group-hover/meta:-translate-y-0.5" />
              </a>
            )}

            {/* Direct Store Landing Page Link (w-8 h-8 matching Meta & Header button heights) */}
            {product.url && (
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="group/store w-8 h-8 inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 shadow-xs hover:shadow-sm rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-90 cursor-pointer"
                title="Open live store landing page"
              >
                <ExternalLink className="w-4 h-4 transition-transform duration-200 ease-out group-hover/store:scale-110 group-hover/store:translate-x-0.5 group-hover/store:-translate-y-0.5" />
              </a>
            )}
          </div>
        </div>

        {/* Footer (Velocity Left + Longevity Timeline Right, horizontally aligned & matched across cards) */}
        <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 min-h-[26px]">
          {/* Velocity: Green Dot (1-4 ads) vs Pulsing Flame (5+ ads) */}
          <div className="flex items-center min-w-0 shrink-0">
            {(() => {
              const activeCount = product.activeAdsCount || 0;
              const hasLinkedAds = (product.linkedAdsCount || 0) > 0;
              const canViewAds = !isStaff && Boolean(onViewCreatives) && hasLinkedAds;

              const velocityContent = activeCount >= 5 ? (
                <span className="inline-flex items-center gap-1 font-bold text-amber-500 dark:text-amber-400 leading-none">
                  <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 animate-pulse transition-transform duration-200 ease-out group-hover/vel:scale-125 group-hover/vel:-rotate-6" />
                  <span className="group-hover/vel:underline">{activeCount} Active</span>
                </span>
              ) : activeCount >= 1 ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 leading-none">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0 transition-transform duration-200 ease-out group-hover/vel:scale-125 group-hover/vel:ring-2 group-hover/vel:ring-emerald-500/30" />
                  <span className="group-hover/vel:underline">{activeCount} Active</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-400 dark:text-slate-500 leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block shrink-0" />
                  <span>0 Active</span>
                </span>
              );

              if (canViewAds) {
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewCreatives?.(product);
                    }}
                    className="group/vel inline-flex items-center gap-1.5 py-1 px-1.5 -mx-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/60 transition-all duration-200 ease-out hover:scale-[1.03] active:scale-95 cursor-pointer leading-none"
                    title={`${activeCount} active ads running — click to view creatives`}
                  >
                    {velocityContent}
                  </button>
                );
              }

              return velocityContent;
            })()}
          </div>

          {/* Longevity / Launch Timeline (Active: -> Today, Shut down: -> shut down date) */}
          <div className="flex items-center justify-end truncate font-medium leading-none">
            {product.earliestAdDate ? (
              (() => {
                const isProductActive = (product.activeAdsCount || 0) > 0 && !isInactive && !isPageOnHold;
                const earliest = product.earliestAdDate;
                const shutDownDate = product.latestAdDate || product.lastScrapedAt || product.updatedAt;

                let days = product.daysRunning || 1;
                if (!isProductActive && shutDownDate) {
                  const startMs = new Date(earliest).getTime();
                  const endMs = new Date(shutDownDate).getTime();
                  if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
                    days = Math.max(1, Math.round((endMs - startMs) / 86400000));
                  }
                }

                const timelineText = isProductActive
                  ? (days <= 1 ? "Today (1d)" : `${formatDiscoveryDate(earliest)} → Today (${days}d)`)
                  : (shutDownDate
                    ? `${formatDiscoveryDate(earliest)} → ${formatDiscoveryDate(shutDownDate)} (${days}d)`
                    : `${formatDiscoveryDate(earliest)} (${days}d)`);

                const tooltipText = isProductActive
                  ? `Active since ${formatDate(earliest)} (${days}d running)`
                  : `Ran from ${formatDate(earliest)} to ${formatDate(shutDownDate)} (${days}d)`;

                return (
                  <span
                    className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 truncate leading-none"
                    title={tooltipText}
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-500/80 shrink-0" />
                    <span className="truncate">{timelineText}</span>
                  </span>
                );
              })()
            ) : (
              <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 truncate leading-none">
                <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="truncate">Scraped {formatDiscoveryDate(product.lastScrapedAt || product.createdAt)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
