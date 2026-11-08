"use client";

import type React from "react";
import Link from "next/link";
import type { Ad } from "@/types";
import { BrandLogo } from "@/components/brand-logo";
import { useToast } from "@/components/toast-context";
import {
  Archive,
  RotateCw,
  Download,
  Ban,
  Copy,
  MoreVertical,
  Layers,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface AdCardHeaderHandlers {
  onToggleArchive: () => void;
  onRefreshMedia?: (e?: React.MouseEvent) => void;
  onExcludeBrand?: (pageId: string) => void;
  onOpenClusterModal?: () => void;
  onOpenCreativeClusterModal?: () => void;
}

export interface AdCardHeaderProps {
  ad: Ad;
  isArchived: boolean;
  isArchiving?: boolean;
  isRefreshingMedia?: boolean;
  canPlayVideo?: boolean;
  firstVideoUrl?: string | null;
  displayThumbnail?: string | null;
  handlers: AdCardHeaderHandlers;
}

export function AdCardHeader({
  ad,
  isArchived,
  isArchiving = false,
  isRefreshingMedia = false,
  canPlayVideo = false,
  firstVideoUrl = null,
  displayThumbnail = null,
  handlers,
}: AdCardHeaderProps) {
  const { showToast } = useToast();

  const brandIdentifier =
    ad.pageId && ad.pageId !== "0" && !ad.pageId.includes("-")
      ? ad.pageId
      : ad.pageName || "";

  const brandDisplayName = ad.pageName || `Page ${ad.pageId}`;

  const creativeCount = ad.productCreativeCount || 1;
  const hasMultipleAngles = creativeCount > 1;
  const hasCreativeSets = Boolean(
    ad.creativeMetrics &&
      (ad.creativeMetrics.totalAdSets > 1 || ad.creativeMetrics.isCrossBrand)
  );

  const handleCopyArchiveId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ad.adArchiveId) return;
    try {
      await navigator.clipboard.writeText(ad.adArchiveId);
      showToast({
        type: "success",
        title: "Ad ID Copied",
        message: `ID ${ad.adArchiveId} copied to clipboard.`,
      });
    } catch {
      showToast({
        type: "error",
        title: "Copy Failed",
        message: "Could not copy Ad Archive ID.",
      });
    }
  };

  const handleRefreshClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshingMedia || !handlers.onRefreshMedia) return;
    handlers.onRefreshMedia(e);
  };

  const handleArchiveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isArchiving) return;
    handlers.onToggleArchive();
  };

  return (
    <div className="flex items-center justify-between gap-2 mb-2.5 min-h-[32px]">
      {/* Left: Brand Avatar, Name & Status Dot */}
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href={`/spy/brand/${encodeURIComponent(brandIdentifier)}`}
          className="shrink-0 transition-transform active:scale-95"
          tabIndex={-1}
          title={`View ${brandDisplayName} catalog`}
        >
          <BrandLogo
            name={ad.pageName}
            domain={ad.linkUrl || (ad.pageName?.includes(".") ? ad.pageName : null)}
            pageId={ad.pageId}
            size="xs"
          />
        </Link>

        <div className="flex items-center gap-1.5 min-w-0">
          <Link
            href={`/spy/brand/${encodeURIComponent(brandIdentifier)}`}
            className="text-[13px] font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors truncate leading-tight"
            title={`Open ${brandDisplayName} Analytics`}
          >
            {brandDisplayName}
          </Link>

          {/* Status Indicator */}
          {isArchived ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.2 rounded-full shrink-0"
              title="Archived in your ad vault"
            >
              <Archive className="w-2.5 h-2.5" />
              <span>Archived</span>
            </span>
          ) : ad.isActive === true ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-full shrink-0"
              title="Active ad currently delivering impressions"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Active</span>
            </span>
          ) : ad.isActive === false ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-1.5 py-0.2 rounded-full shrink-0"
              title="Ad campaign has completed or been turned off"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>Ended</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Right: Archive Quick Toggle + 3-Dots Dropdown Menu (Matches ProductCardActions) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Archive / Vault Toggle Button */}
        <button
          type="button"
          onClick={handleArchiveClick}
          disabled={isArchiving}
          className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 ease-out hover:scale-105 active:scale-90 group/archive cursor-pointer shadow-xs ${
            isArchived
              ? "border-purple-500/50 bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 hover:border-purple-500/70 shadow-purple-500/10 hover:shadow-sm"
              : "border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-400 hover:text-purple-600 hover:border-purple-500/35 hover:bg-purple-500/10 dark:hover:bg-purple-500/15"
          }`}
          title={isArchived ? "Unarchive Ad (Move to Active Feed)" : "Archive Ad (Save to Vault)"}
        >
          <Archive
            className={`w-4 h-4 transition-transform duration-200 ease-out group-hover/archive:scale-110 ${
              isArchived ? "fill-current text-purple-600 dark:text-purple-400" : ""
            }`}
          />
        </button>

        {/* 3-Dots Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isRefreshingMedia}
            onClick={(e) => e.stopPropagation()}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 ease-out hover:scale-105 active:scale-90 shadow-xs group/more cursor-pointer disabled:opacity-75 disabled:cursor-wait ${
              isRefreshingMedia ? "border-indigo-500/50 text-indigo-500" : ""
            }`}
            title="More options"
          >
            {isRefreshingMedia ? (
              <RotateCw className="w-4 h-4 text-indigo-500 animate-spin" />
            ) : (
              <MoreVertical className="w-4 h-4 transition-transform duration-300 ease-out group-hover/more:rotate-90 group-hover/more:scale-110" />
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-52">
            {handlers.onRefreshMedia && (
              <DropdownMenuItem onClick={handleRefreshClick} disabled={isRefreshingMedia}>
                <RotateCw
                  className={`w-4 h-4 text-indigo-500 shrink-0 transition-transform duration-300 ease-out ${
                    isRefreshingMedia ? "animate-spin" : ""
                  }`}
                />
                <span>
                  {isRefreshingMedia
                    ? "Refreshing..."
                    : ad.mediaType === "video" && !firstVideoUrl
                    ? "Fetch Full Video"
                    : "Refresh Media Links"}
                </span>
              </DropdownMenuItem>
            )}

            {/* Download Media */}
            {canPlayVideo && firstVideoUrl ? (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(firstVideoUrl, "_blank");
                }}
              >
                <Download className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Download Video (.mp4)</span>
              </DropdownMenuItem>
            ) : displayThumbnail ? (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(displayThumbnail, "_blank");
                }}
              >
                <Download className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Download Creative (.jpg)</span>
              </DropdownMenuItem>
            ) : null}

            {/* Copy Ad Archive ID */}
            {ad.adArchiveId && (
              <DropdownMenuItem onClick={handleCopyArchiveId}>
                <Copy className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Copy Ad Archive ID</span>
              </DropdownMenuItem>
            )}

            {/* View Creative Angles */}
            {hasMultipleAngles && handlers.onOpenClusterModal && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handlers.onOpenClusterModal?.();
                }}
              >
                <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>View {creativeCount} Angles</span>
              </DropdownMenuItem>
            )}

            {/* View Creative Saturation */}
            {hasCreativeSets && handlers.onOpenCreativeClusterModal && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handlers.onOpenCreativeClusterModal?.();
                }}
              >
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <span>View Creative Copies</span>
              </DropdownMenuItem>
            )}

            {/* Hide Brand */}
            {handlers.onExcludeBrand && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handlers.onExcludeBrand?.(ad.pageId);
                  }}
                  className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 data-highlighted:bg-rose-50 dark:data-highlighted:bg-rose-950/40 data-highlighted:text-rose-700 dark:data-highlighted:text-rose-300"
                >
                  <Ban className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>Hide Brand From Feed</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
