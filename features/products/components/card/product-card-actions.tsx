"use client";

import { useState } from "react";
import Link from "next/link";
import { ScrapedProduct } from "@/types";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/components/auth-context";
import { useWorkspace } from "@/components/workspace-context";
import {
  Bookmark,
  MoreVertical,
  RotateCw,
  Coins,
  Copy,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface ProductCardActionHandlers {
  onFilterBrand?: (brandName: string) => void;
  onToggleFavorite: (e: React.MouseEvent) => Promise<void> | void;
  onRefresh?: (e?: React.MouseEvent) => Promise<void> | void;
  onSyncPrice?: (e: React.MouseEvent) => Promise<void> | void;
  onCopyLink?: (e: React.MouseEvent) => Promise<void> | void;
  onDelete?: (e: React.MouseEvent) => Promise<void> | void;
}

export interface ProductCardActionsProps {
  product: ScrapedProduct;
  brandDisplayName: string;
  brandTarget: string | null;
  rawPageId: string | null;
  cleanPrice: string;
  isSlideFavorite: boolean;
  isRefreshing?: boolean;
  handlers: ProductCardActionHandlers;
}

export function ProductCardActions({
  product,
  brandDisplayName,
  brandTarget,
  rawPageId,
  cleanPrice,
  isSlideFavorite,
  isRefreshing = false,
  handlers,
}: ProductCardActionsProps) {
  const { isStaff } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const sym = activeWorkspace?.currencySymbol || "DT";

  const [isTogglingFav, setIsTogglingFav] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncingPrice, setIsSyncingPrice] = useState(false);

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTogglingFav) return;
    setIsTogglingFav(true);
    try {
      await handlers.onToggleFavorite(e);
    } finally {
      setIsTogglingFav(false);
    }
  };

  const handleRefreshClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!handlers.onRefresh || isRefreshing) return;
    await handlers.onRefresh(e);
  };

  const handleSyncPriceClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!handlers.onSyncPrice || isSyncingPrice) return;
    setIsSyncingPrice(true);
    try {
      await handlers.onSyncPrice(e);
    } finally {
      setIsSyncingPrice(false);
    }
  };

  const handleCopyLinkClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await handlers.onCopyLink?.(e);
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!handlers.onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await handlers.onDelete(e);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 mb-2.5 min-h-[32px]">
      {/* Left: Brand Avatar & Name */}
      <div className="flex items-center gap-2 min-w-0">
        {isStaff ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlers.onFilterBrand?.(brandDisplayName);
            }}
            className="shrink-0 transition-transform active:scale-95 cursor-pointer"
            title={`Filter by ${brandDisplayName}`}
          >
            <BrandLogo
              name={product.brandName}
              url={product.brandProfilePic || null}
              domain={product.domain}
              pageId={rawPageId}
              size="xs"
            />
          </button>
        ) : brandTarget ? (
          <Link
            href={`/spy/brand/${encodeURIComponent(brandTarget)}?tab=products`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 transition-transform active:scale-95 cursor-pointer"
            tabIndex={-1}
            title={`View ${brandDisplayName} catalog`}
          >
            <BrandLogo
              name={product.brandName}
              url={product.brandProfilePic || null}
              domain={product.domain}
              pageId={rawPageId}
              size="xs"
            />
          </Link>
        ) : (
          <BrandLogo
            name={product.brandName}
            url={product.brandProfilePic || null}
            domain={product.domain}
            pageId={rawPageId}
            size="xs"
            className="shrink-0"
          />
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          {isStaff ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlers.onFilterBrand?.(brandDisplayName);
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

      {/* Right: Bookmark + 3-Dots Action Menu */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Bookmark Toggle */}
        <button
          type="button"
          onClick={handleFavoriteClick}
          disabled={isTogglingFav}
          className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 ease-out hover:scale-105 active:scale-90 group/fav cursor-pointer shadow-xs ${
            isSlideFavorite
              ? "border-amber-500/50 bg-amber-500/15 text-amber-500 dark:text-amber-400 hover:bg-amber-500/25 hover:border-amber-500/70 shadow-amber-500/10 hover:shadow-sm"
              : "border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-400 hover:text-amber-500 hover:border-amber-500/35 hover:bg-amber-500/10 dark:hover:bg-amber-500/15"
          }`}
          title={isSlideFavorite ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Bookmark
            className={`w-4 h-4 transition-transform duration-200 ease-out group-hover/fav:scale-115 group-hover/fav:-rotate-12 group-active/fav:scale-90 ${
              isSlideFavorite ? "fill-current text-amber-500" : ""
            }`}
          />
        </button>

        {/* shadcn Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isRefreshing}
            onClick={(e) => e.stopPropagation()}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 ease-out hover:scale-105 active:scale-90 shadow-xs group/more cursor-pointer disabled:opacity-75 disabled:cursor-wait ${
              isRefreshing
                ? "border-indigo-500/50 text-indigo-500"
                : ""
            }`}
            title={isRefreshing ? "Re-scraping live product landing page..." : "More options"}
          >
            {isRefreshing ? (
              <RotateCw className="w-4 h-4 text-indigo-500 animate-spin" />
            ) : (
              <MoreVertical className="w-4 h-4 transition-transform duration-300 ease-out group-hover/more:rotate-90 group-hover/more:scale-110" />
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-48">
            {!isStaff && handlers.onRefresh && (
              <DropdownMenuItem onClick={handleRefreshClick} disabled={isRefreshing}>
                <RotateCw
                  className={`w-4 h-4 text-indigo-500 shrink-0 transition-transform duration-300 ease-out ${
                    isRefreshing ? "animate-spin" : ""
                  }`}
                />
                <span>{isRefreshing ? "Refreshing..." : "Refresh Product Data"}</span>
              </DropdownMenuItem>
            )}

            {cleanPrice && handlers.onSyncPrice && (
              <DropdownMenuItem onClick={handleSyncPriceClick} disabled={isSyncingPrice}>
                <Coins className="w-4 h-4 text-amber-500 shrink-0 transition-transform duration-200 ease-out" />
                <span>Update Currency ({sym})</span>
              </DropdownMenuItem>
            )}

            {product.url && handlers.onCopyLink && (
              <DropdownMenuItem onClick={handleCopyLinkClick}>
                <Copy className="w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ease-out" />
                <span>Copy Product Link</span>
              </DropdownMenuItem>
            )}

            {handlers.onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDeleteClick}
                  disabled={isDeleting}
                  className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 data-highlighted:bg-rose-50 dark:data-highlighted:bg-rose-950/40 data-highlighted:text-rose-700 dark:data-highlighted:text-rose-300"
                >
                  <Trash2 className="w-4 h-4 text-rose-500 shrink-0 transition-transform duration-200 ease-out" />
                  <span>{isDeleting ? "Deleting..." : "Delete Product"}</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}


