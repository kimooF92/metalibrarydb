"use client";

import React, { memo, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { formatRelativeTime } from "@/lib/utils";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Star,
  Clock,
  Sparkles,
  Globe,
  MoreVertical,
  Copy,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface BrandDeepDiveHeaderProps {
  brand: {
    id: string | null;
    pageId: string;
    displayName: string;
    profilePicUrl?: string | null;
    url: string;
    country: string | null;
    landingPage: string | null;
    isWatchlisted: boolean;
    lastChecked: string | null;
    lastCreativeScan: string | null;
    status: string;
    currentResults: number;
    isTracked: boolean;
    holdStatus?: string | null;
    lastKnownValidResults?: number | null;
    consecutiveZeroScans?: number | null;
    lastSuccessAt?: string | null;
  };
  effectiveResults: number;
  totalAdsCaptured: number;
  scalingPattern: {
    archetype: string;
    label: string;
    confidence: string;
    description: string;
    badgeClass: string;
    icon: string;
  };
  isWatchlisted: boolean;
  isTogglingWatchlist: boolean;
  onToggleWatchlist: () => void;
  isCheckingStatus: boolean;
  onCheckAdLibraryNow: () => void;
  isRefreshingMedia: boolean;
  onBulkRefreshMedia: () => void;
  onOpenDossierModal: () => void;
  // Domain portfolio
  sisterPages?: Array<{
    id: string;
    pageId: string;
    displayName: string;
    pageRole: "primary" | "satellite" | "backup" | null;
    currentResults: number;
  }>;
  brandDomain?: {
    id: string;
    domain: string;
    displayName: string;
  } | null;
  selectedSisterPageId: string | null;
  onSelectSisterPage: (targetSisterId: string | null) => void;
  onOpenManageDomainModal: () => void;
  onBack?: () => void;
}

export const BrandDeepDiveHeader = memo(function BrandDeepDiveHeader({
  brand,
  effectiveResults,
  totalAdsCaptured,
  scalingPattern,
  isWatchlisted,
  isTogglingWatchlist,
  onToggleWatchlist,
  isCheckingStatus,
  onCheckAdLibraryNow,
  isRefreshingMedia,
  onBulkRefreshMedia,
  onOpenDossierModal,
  sisterPages,
  brandDomain,
  selectedSisterPageId,
  onSelectSisterPage,
  onOpenManageDomainModal,
  onBack,
}: BrandDeepDiveHeaderProps) {
  const [hasCopiedId, setHasCopiedId] = useState(false);

  const handleCopyPageId = () => {
    if (!brand.pageId) return;
    navigator.clipboard.writeText(brand.pageId);
    setHasCopiedId(true);
    setTimeout(() => setHasCopiedId(false), 2000);
  };

  const isBackgroundJobRunning = isCheckingStatus || isRefreshingMedia;

  return (
    <div className="flex flex-col gap-4">
      {/* Top Banner Row: Identity & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-950/50 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-start gap-3.5 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 mt-0.5"
              title="Back to Meta Ad Tracker"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <BrandLogo
            name={brand.displayName}
            url={brand.profilePicUrl}
            domain={brand.landingPage || (brand.displayName?.includes(".") ? brand.displayName : null)}
            pageId={brand.pageId}
            size="lg"
            className="mt-0.5 shrink-0"
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                {brand.displayName}
              </h1>

              {brand.holdStatus === "on_hold" && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 shadow-2xs"
                  title={
                    (brand.currentResults ?? 0) === 0
                      ? "Brand account is on pause / hold (under grace period recheck)"
                      : "Ad volume drop under review (under grace period recheck)"
                  }
                >
                  <span>⏸️</span>
                  <span>{(brand.currentResults ?? 0) === 0 ? "On Hold / Paused" : "Volume Drop Under Review"}</span>
                </span>
              )}
              {brand.holdStatus === "inactive" && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 shadow-2xs"
                  title="Brand account is confirmed inactive (0 active ads)"
                >
                  <span>⚫</span>
                  <span>Off-Air / Inactive</span>
                </span>
              )}

              {/* Primary Archetype Badge */}
              {scalingPattern.archetype !== "inactive" && (
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border shadow-2xs ${scalingPattern.badgeClass}`}
                  title={`${scalingPattern.label} (${scalingPattern.confidence} confidence): ${scalingPattern.description}`}
                >
                  <span>{scalingPattern.icon}</span>
                  <span>{scalingPattern.label}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              {/* 1. Official Ad Count */}
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-700/80">
                <span className={`w-1.5 h-1.5 rounded-full ${effectiveResults > 0 ? "bg-emerald-500" : "bg-slate-400"}`} />
                <span>{effectiveResults} active ads</span>
                {totalAdsCaptured > 0 && (
                  <span className="text-slate-400 dark:text-slate-500 font-normal text-[11px]">
                    ({totalAdsCaptured} captured)
                  </span>
                )}
              </span>

              <span className="text-slate-300 dark:text-slate-700">•</span>

              {/* 2. Ad Count Scan Date */}
              <span
                className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400"
                title={brand.lastChecked ? `Ad count scan: ${new Date(brand.lastChecked).toLocaleString()}` : "Count not checked yet"}
              >
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Count scan: <strong className="font-semibold text-slate-700 dark:text-slate-300">{formatRelativeTime(brand.lastChecked)}</strong></span>
              </span>

              <span className="text-slate-300 dark:text-slate-700">•</span>

              {/* 3. Creative Scan Date */}
              <span
                className="inline-flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400"
                title={brand.lastCreativeScan ? `Creative scan (Apify): ${new Date(brand.lastCreativeScan).toLocaleString()}` : "Creatives not scanned yet"}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>Creative scan: <strong className="font-semibold">{formatRelativeTime(brand.lastCreativeScan)}</strong></span>
              </span>

              <span className="text-slate-300 dark:text-slate-700">•</span>
              <a
                href={brand.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors cursor-pointer"
                title="Open brand on Meta Ad Library in new tab"
              >
                <span>ID: {brand.pageId}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </a>
              {brand.country && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span>{brand.country}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Button Group */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Watchlist Star Icon Toggle */}
          <button
            type="button"
            onClick={onToggleWatchlist}
            disabled={isTogglingWatchlist}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isWatchlisted
                ? "bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                : "bg-white dark:bg-slate-900 text-slate-400 hover:text-yellow-500 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
            title={isWatchlisted ? "Remove from Starred Competitors" : "Star Competitor"}
          >
            <Star className={`w-4 h-4 ${isWatchlisted ? "fill-amber-500 dark:fill-amber-400" : ""}`} />
          </button>

          {/* Primary Action: Export LLM Intelligence Dossier */}
          <button
            type="button"
            onClick={onOpenDossierModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/25 transition-all cursor-pointer shrink-0"
            title="Export structured LLM intelligence prompt"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Export Dossier</span>
          </button>

          {/* Secondary Actions: 3-dots Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="relative p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 data-popup-open:bg-slate-100 dark:data-popup-open:bg-slate-800 data-popup-open:text-slate-900 dark:data-popup-open:text-white transition-all cursor-pointer outline-none shrink-0"
              title={isBackgroundJobRunning ? "Sync running..." : "More actions"}
              aria-label="More brand options"
            >
              {isBackgroundJobRunning ? (
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              ) : (
                <MoreVertical className="w-4 h-4" />
              )}
              {isBackgroundJobRunning && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                </span>
              )}
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={6}
              className="w-56 p-1.5 divide-y-0 text-left"
            >
              <div className="py-0.5 space-y-0.5">
                {/* Meta Ad Library External Link */}
                <DropdownMenuItem
                  onClick={() => window.open(brand.url, "_blank", "noopener,noreferrer")}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Meta Ad Library</span>
                    <span className="text-[10px] text-slate-400">View live on Meta</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />

                {/* Live Count Check Button */}
                <DropdownMenuItem
                  onClick={onCheckAdLibraryNow}
                  disabled={isCheckingStatus}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 text-indigo-500 shrink-0 ${isCheckingStatus ? "animate-spin" : ""}`} />
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {isCheckingStatus ? "Checking Live..." : "Check Count"}
                    </span>
                    <span className="text-[10px] text-slate-400">Verify active ad count</span>
                  </div>
                </DropdownMenuItem>

                {/* Refresh Brand Media */}
                <DropdownMenuItem
                  onClick={onBulkRefreshMedia}
                  disabled={isRefreshingMedia}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 text-purple-500 shrink-0 ${isRefreshingMedia ? "animate-spin" : ""}`} />
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {isRefreshingMedia ? "Refreshing Media..." : "Refresh Media"}
                    </span>
                    <span className="text-[10px] text-slate-400">Scrape creative assets</span>
                  </div>
                </DropdownMenuItem>

                {/* Manage Sister Pages / Domain Portfolio */}
                {brandDomain && (
                  <>
                    <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                    <DropdownMenuItem
                      onClick={onOpenManageDomainModal}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Globe className="w-4 h-4 text-cyan-500 shrink-0" />
                      <div className="flex flex-col text-left">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">Sister Pages</span>
                        <span className="text-[10px] text-slate-400">Manage domain portfolio</span>
                      </div>
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />

                {/* Copy Brand ID */}
                <DropdownMenuItem
                  onClick={handleCopyPageId}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {hasCopiedId ? (
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {hasCopiedId ? "Copied ID!" : "Copy Page ID"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                      {brand.pageId}
                    </span>
                  </div>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* On Hold Notification Banner */}
      {brand.holdStatus === "on_hold" && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs">
          <span className="text-base shrink-0">⏸️</span>
          <div>
            {(brand.currentResults ?? 0) === 0 ? (
              <>
                <strong>Brand on Hold:</strong> Meta Ad Library returned 0 active ads during the last scan, but existing ads and products are temporarily preserved under grace period ({brand.consecutiveZeroScans || 1}/3 scans).
              </>
            ) : (
              <>
                <strong>Ad Volume Drop Under Review:</strong> Meta Ad Library reported a sudden drop in visible creatives during the last scan ({brand.currentResults} ads vs {brand.lastKnownValidResults || brand.currentResults} baseline). Existing ads and products are preserved under grace period ({brand.consecutiveZeroScans || 1}/2 scans).
              </>
            )}
          </div>
        </div>
      )}

      {/* Inactive Brand Notification Banner */}
      {brand.holdStatus === "inactive" && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-base shrink-0">💤</span>
            <div>
              <strong>Brand Inactive (Confirmed Dark):</strong> 0 active ads detected over 3 consecutive scans. The system rechecks this brand adaptively for ad relaunches.
            </div>
          </div>
          <button
            type="button"
            onClick={onCheckAdLibraryNow}
            disabled={isCheckingStatus}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
            title="Trigger immediate live count check on Meta Ad Library"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? "animate-spin" : ""}`} />
            <span>{isCheckingStatus ? "Checking..." : "Check Ad Library Now"}</span>
          </button>
        </div>
      )}

      {/* Domain Portfolio Sister Pages Filter */}
      {brandDomain && (
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <Globe className="w-3 h-3" />
                <span>Domain Portfolio ({brandDomain?.domain})</span>
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {(sisterPages?.length || 1)} linked Facebook {(sisterPages?.length || 1) === 1 ? "page" : "pages"} driving traffic to this store
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenManageDomainModal}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 hover:underline cursor-pointer"
            >
              <span>⚙️ Manage Portfolio</span>
            </button>
          </div>

          {sisterPages && sisterPages.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-1">
              <button
                type="button"
                onClick={() => onSelectSisterPage(null)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  selectedSisterPageId === null
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>All Pages (Combined)</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    selectedSisterPageId === null
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {totalAdsCaptured}
                </span>
              </button>

              {sisterPages.map((sp) => {
                const isSelected = selectedSisterPageId === sp.pageId || selectedSisterPageId === sp.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => onSelectSisterPage(sp.pageId || sp.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <span className="truncate max-w-[130px]">{sp.displayName}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                      }`}
                    >
                      {sp.currentResults}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
