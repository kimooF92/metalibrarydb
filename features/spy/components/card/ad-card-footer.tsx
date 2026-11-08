"use client";

import type React from "react";
import type { AdActionsConfig } from "../../types";
import {
  Globe,
  ExternalLink,
  ShoppingBag,
  RotateCw,
  Clock,
  Archive,
  ArchiveRestore,
  Download,
} from "lucide-react";

export interface AdCardFooterProps {
  config: AdActionsConfig;
  onFetchProduct: (e: React.MouseEvent) => void;
  onRefreshMedia: (e?: React.MouseEvent) => void;
  onToggleArchive: () => void;
}

export function AdCardFooter({
  config,
  onFetchProduct,
  onRefreshMedia,
  onToggleArchive,
}: AdCardFooterProps) {
  const {
    destinationUrl,
    targetDomain,
    ctaText,
    extractedProduct,
    isExtractingProduct,
    isRefreshingMedia,
    isArchiving,
    isArchived,
    canPlayVideo,
    firstVideoUrl,
    displayThumbnail,
    isVideoAd,
    adArchiveId,
    startedRunningOn,
    firstSeenAt,
  } = config;

  const formatLaunchDate = (dateStr?: string | null, firstSeenStr?: string | null) => {
    const isFirstSeen = !dateStr;
    const targetStr = dateStr || firstSeenStr;
    if (!targetStr) return "Unknown launch date";
    const date = new Date(targetStr);
    if (isNaN(date.getTime())) return "Unknown launch date";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const launchDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diffTime = today.getTime() - launchDay.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const prefix = isFirstSeen ? "First seen " : "Launched ";

    if (diffDays <= 0) return `${prefix}today`;
    if (diffDays === 1) return `${prefix}yesterday`;
    if (diffDays < 30) return `${prefix}${diffDays}d ago`;
    return `${prefix}${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  };

  return (
    <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/60 flex flex-col gap-2 mt-auto text-xs">
      {/* Tier 1: Main Action Buttons (Visit Store & Fetch Product) */}
      {destinationUrl ? (
        <div className="flex items-center gap-2 w-full">
          <a
            href={destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg shadow-sm transition-all truncate"
            title={`Direct Brand Website: ${destinationUrl}`}
          >
            <Globe className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
            <span className="truncate">
              {ctaText || "Visit Store"} {targetDomain ? `• ${targetDomain}` : ""}
            </span>
            <ExternalLink className="w-3 h-3 text-indigo-200 shrink-0 ml-0.5" />
          </a>

          {!extractedProduct && (
            <button
              type="button"
              onClick={onFetchProduct}
              disabled={isExtractingProduct}
              className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200/60 dark:border-indigo-800/60 px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer shrink-0 disabled:opacity-50"
              title="Scan landing page to save product details, price & offers"
            >
              {isExtractingProduct ? (
                <>
                  <RotateCw className="w-3 h-3 animate-spin text-indigo-500" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Save Product</span>
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 italic font-medium py-0.5">
          No store website link
        </div>
      )}

      {/* Tier 2: Metadata & Quick Tools Row */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1 truncate font-medium">
          <Clock className="w-3 h-3 shrink-0 text-slate-400" />
          <span className="truncate">
            {formatLaunchDate(startedRunningOn, firstSeenAt)}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onRefreshMedia}
            disabled={isRefreshingMedia}
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors cursor-pointer"
            title="Refresh Single Ad Media Links"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshingMedia ? "animate-spin text-indigo-500" : ""}`} />
          </button>

          <button
            type="button"
            onClick={onToggleArchive}
            disabled={isArchiving}
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              isArchived
                ? "text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                : "text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            }`}
            title={isArchived ? "Unarchive Ad (Move to Active Feed)" : "Archive Ad (Move to Vault)"}
          >
            {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          </button>

          {canPlayVideo && firstVideoUrl ? (
            <a
              href={firstVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors"
              title="Download Video Creative (.mp4)"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          ) : displayThumbnail ? (
            <a
              href={displayThumbnail}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors"
              title={isVideoAd ? "Download Snapshot Thumbnail (.jpg)" : "Download Media File"}
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          ) : null}

          <a
            href={`https://www.facebook.com/ads/library/?id=${adArchiveId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
            title="Open in Meta Ad Library"
          >
            <span>Meta</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

