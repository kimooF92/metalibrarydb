"use client";

import React from "react";
import Link from "next/link";
import { TrackedPage } from "@/types";
import { BrandLogo } from "@/components/brand-logo";
import { InlineSparkline } from "@/features/brands/components/table/sparkline-cell";
import { classifyScalingPattern } from "@/lib/scaling-classifier";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Star,
  ExternalLink,
  Copy,
  StickyNote,
  Store,
  AlertTriangle,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Loader2,
  Clock,
  HelpCircle,
  Check,
  Pause,
  TrendingUp,
  TrendingDown,
  FlaskConical,
  Sparkles,
  RefreshCw,
  MoreVertical,
  X,
} from "lucide-react";

export interface TableRowProps {
  page: TrackedPage;
  isSelected: boolean;
  isWatchlisted: boolean;
  isRefreshing: boolean;
  isMenuOpen: boolean;
  editing: {
    isEditing: boolean;
    name: string;
    saving: boolean;
    onChangeName: (name: string) => void;
    onSave: (id: string) => void;
    onCancel: () => void;
  };
  actions: {
    onToggleSelect: (id: string) => void;
    onToggleWatchlist: (id: string) => void;
    onRefresh: (id: string) => void;
    onOpenRunner: (page: TrackedPage) => void;
    onToggleMenu: (e: React.MouseEvent<HTMLButtonElement>, pageId: string) => void;
    onOpenNotePopover: (page: TrackedPage, triggerEl: HTMLElement) => void;
    onResolveMultiPage: (pageId: string) => void;
    onManageDomain: (domainId: string) => void;
    onCopyPageId: (pageId: string) => void;
  };
}

export function TableRow({
  page: p,
  isSelected,
  isWatchlisted,
  isRefreshing,
  isMenuOpen,
  editing,
  actions,
}: TableRowProps) {
  const diff = p.difference;
  const scaling = p.scalingPattern || classifyScalingPattern(p.historyPoints, p.currentResults);

  const isHighVolume = p.currentResults !== null && p.currentResults >= 50;
  const isOnHold = p.holdStatus === "on_hold";
  const isDimmed = !isOnHold && (p.currentResults === 0 || p.status === "unclear");
  const isScanning = p.status === "scanning" || isRefreshing;

  return (
    <tr
      className={`transition-colors group border-b border-slate-200/80 dark:border-slate-800/50 ${
        isSelected
          ? "bg-indigo-50/70 dark:bg-indigo-950/40 border-l-[3px] border-l-indigo-600 dark:border-l-indigo-500 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/60"
          : isDimmed
            ? "opacity-60 hover:opacity-100 hover:bg-slate-50/80 dark:hover:bg-slate-900/50"
            : "hover:bg-slate-50/80 dark:hover:bg-slate-900/50"
      }`}
    >
      {/* Checkbox */}
      <td className="px-2 md:px-2.5 py-3 text-center w-10">
        <div className="flex items-center justify-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => actions.onToggleSelect(p.id)}
            aria-label={`Select ${p.displayName || "tracked page"}`}
          />
        </div>
      </td>

      {/* Watchlist Star */}
      <td className="px-1 md:px-1.5 py-3 text-center w-8">
        <button
          type="button"
          onClick={() => actions.onToggleWatchlist(p.id)}
          title={isWatchlisted ? "Remove from watchlist" : "Add to watchlist"}
          className={`p-1 rounded transition-all cursor-pointer ${
            isWatchlisted
              ? "text-yellow-500 dark:text-yellow-400"
              : "text-slate-400 dark:text-slate-600 hover:text-yellow-500 opacity-0 group-hover:opacity-100"
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${isWatchlisted ? "fill-yellow-500 dark:fill-yellow-400" : ""}`} />
        </button>
      </td>

      {/* Brand Name & Archetype Badge */}
      <td className="px-3 md:px-3.5 xl:px-4 py-3 min-w-0">
        {editing.isEditing ? (
          <div className="flex items-center space-x-1.5">
            <input
              type="text"
              value={editing.name}
              onChange={(e) => editing.onChangeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") editing.onSave(p.id);
                if (e.key === "Escape") editing.onCancel();
              }}
              className="bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white px-2 py-1 rounded border border-indigo-500 focus:outline-none w-44"
              autoFocus
              disabled={editing.saving}
            />
            <button
              type="button"
              onClick={() => editing.onSave(p.id)}
              disabled={editing.saving}
              className="p-1 text-emerald-500 hover:text-emerald-400 transition-colors cursor-pointer"
              title="Save Display Name"
            >
              {editing.saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={editing.onCancel}
              disabled={editing.saving}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href={`/spy/brand/${encodeURIComponent(p.pageId || p.landingPage || p.displayName || "")}`}
              className="shrink-0 transition-transform active:scale-95"
              tabIndex={-1}
              title={`Open ${p.displayName || "brand"} Analytics`}
            >
              <BrandLogo
                name={p.displayName}
                url={p.profilePicUrl}
                domain={p.canonicalDomain || p.landingPage || (p.displayName?.includes(".") ? p.displayName : null)}
                pageId={p.pageId}
                size="sm"
              />
            </Link>

            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <div className="flex items-center space-x-1.5 min-w-0">
                <Link
                  href={`/spy/brand/${encodeURIComponent(p.pageId || p.landingPage || p.displayName || "")}`}
                  title={`Open ${p.displayName || "brand"} Analytics${p.pageId ? ` (ID: ${p.pageId})` : ""}`}
                  className="font-semibold text-[13px] text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate min-w-0"
                >
                  {p.displayName || "Meta Ad Search"}
                </Link>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open Meta Ad Library in new tab"
                  className="text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors p-0.5 shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>

                {/* Quick Copy Page ID on row hover */}
                {p.pageId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.onCopyPageId(p.pageId!);
                    }}
                    className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200/50 dark:hover:bg-slate-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0"
                    title={`Meta Page ID: #${p.pageId} (Click to copy)`}
                    aria-label={`Copy Meta Page ID: #${p.pageId}`}
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                )}

                {/* Note Indicator Badge */}
                {Boolean((p as any).notes) && (
                  <button
                    type="button"
                    data-note-trigger={p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.onOpenNotePopover(p, e.currentTarget);
                    }}
                    className="inline-flex items-center text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 p-0.5 rounded hover:bg-amber-500/10 transition-colors cursor-pointer shrink-0"
                    title={`Note: ${(p as any).notes}\n(Click to view / edit)`}
                    aria-label="View or edit note"
                  >
                    <StickyNote className="w-3 h-3 fill-amber-500/20" />
                  </button>
                )}
              </div>

              {/* Subline: ONLY if multi page or linked portfolio */}
              {Boolean(
                (p.brandDomainId && p.brandDomain && (p.brandDomain.linkedPagesCount ?? 0) > 1) ||
                (p.discoveredPagesCount && p.discoveredPagesCount >= 2) ||
                (p.searchType !== "page" && p.discoveredPagesCount && p.discoveredPagesCount > 0)
              ) && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
                  {p.brandDomainId && p.brandDomain && (p.brandDomain.linkedPagesCount ?? 0) > 1 && (
                    <button
                      type="button"
                      onClick={() => actions.onManageDomain(p.brandDomainId!)}
                      className="inline-flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer group/domain truncate max-w-[200px]"
                      title={`Part of ${p.brandDomain.domain} portfolio (${p.brandDomain.linkedPagesCount} pages, ${p.brandDomain.totalCombinedAds} combined ads). Click to manage.`}
                    >
                      <Store className="w-2.5 h-2.5 shrink-0 opacity-60 group-hover/domain:opacity-100" />
                      <span className="truncate">{p.brandDomain.domain}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        ({p.brandDomain.linkedPagesCount}p)
                      </span>
                    </button>
                  )}

                  {/* Multi-page resolve action if needed */}
                  {Boolean(
                    (p.discoveredPagesCount && p.discoveredPagesCount >= 2) ||
                    (p.searchType !== "page" && p.discoveredPagesCount && p.discoveredPagesCount > 0)
                  ) && (
                    <button
                      type="button"
                      onClick={() => actions.onResolveMultiPage(p.id)}
                      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-500 hover:text-amber-400 hover:underline transition-colors shrink-0"
                      title="Multiple Facebook Pages detected for this domain. Click to review and resolve."
                    >
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                      <span>{p.discoveredPagesCount} found</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </td>

      {/* Active Ads, Delta & Sparkline */}
      <td className="px-3 md:px-3.5 xl:px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0 min-w-[70px]">
            {isScanning ? (
              <div
                className="flex items-center gap-1.5 py-0.5"
                title="Scanning Meta Ad Library for live count..."
              >
                <div className="h-4 w-9 rounded-md bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
                <div className="h-3.5 w-6 rounded-md bg-slate-200/50 dark:bg-slate-800/50 animate-pulse" />
              </div>
            ) : isOnHold && p.lastKnownValidResults ? (
              <span
                className="text-[12px] font-mono text-amber-500 font-bold"
                title={`Account hold — was ${p.lastKnownValidResults} ads. Under grace period (${p.consecutiveZeroScans ?? 1}/3 scans).`}
              >
                0
                <span className="text-[10px] font-normal text-amber-500/80 ml-0.5">
                  (was {p.lastKnownValidResults})
                </span>
              </span>
            ) : p.currentResults !== null ? (
              <div className="flex items-center gap-1.5">
                {isHighVolume && (
                  <span title="High Volume: 50+ active ads" className="inline-flex shrink-0">
                    <Flame className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 fill-amber-500/20" />
                  </span>
                )}
                <span
                  className={`text-[13px] font-mono tabular-nums ${
                    isHighVolume
                      ? "text-amber-500 dark:text-amber-400 font-bold"
                      : p.currentResults === 0
                      ? "text-slate-400 dark:text-slate-600 font-normal"
                      : "text-slate-900 dark:text-slate-100 font-semibold"
                  }`}
                >
                  {p.currentResults.toLocaleString()}
                </span>
              </div>
            ) : (
              <span className="text-slate-400 text-xs">—</span>
            )}

            {/* Micro-Pill Delta */}
            {!isScanning && diff !== null && diff !== undefined && diff !== 0 && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums shrink-0 ${
                  diff > 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                }`}
                title={`Previous scan: ${p.previousResults ?? "—"} (${diff > 0 ? "+" : ""}${diff} ads)`}
              >
                {diff > 0 ? (
                  <ArrowUpRight className="w-2.5 h-2.5 mr-0.5 stroke-[2.5]" />
                ) : (
                  <ArrowDownRight className="w-2.5 h-2.5 mr-0.5 stroke-[2.5]" />
                )}
                {diff > 0 ? `+${diff}` : diff}
              </span>
            )}
          </div>

          {isScanning ? (
            <div
              className="w-13 h-4 rounded bg-slate-200/60 dark:bg-slate-800/60 animate-pulse shrink-0"
              title="Updating trendline..."
            />
          ) : (
            <InlineSparkline points={p.historyPoints} difference={p.difference} />
          )}
        </div>
      </td>

      {/* Products Count */}
      <td className="px-2 md:px-2.5 xl:px-3 py-3 text-center">
        <Link
          href={`/spy/brand/${encodeURIComponent(p.pageId || p.landingPage || p.displayName || "")}?tab=products`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer font-mono"
          title={`Open ${p.displayName || "brand"} Product Catalog (${p.approxProductCount || 0} products)`}
        >
          <Package className="w-3.5 h-3.5 text-slate-400" />
          <span>
            {p.approxProductCount !== null && p.approxProductCount !== undefined && p.approxProductCount > 0
              ? `${p.approxProductCount}`
              : "—"}
          </span>
        </Link>
      </td>

      {/* Pattern & Status Column */}
      <td className="px-3 md:px-3.5 xl:px-4 py-3 hidden md:table-cell whitespace-nowrap">
        <div className="flex items-center gap-1.5 flex-nowrap">
          {/* Operational Anomaly Indicator (ONLY if not normal success) */}
          {p.status === "scanning" || isRefreshing ? (
            <span
              title="Scan in progress"
              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0"
            >
              <Loader2 className="w-3 h-3 animate-spin text-cyan-500" />
            </span>
          ) : p.status === "pending" ? (
            <span
              title="Scan pending in queue"
              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0"
            >
              <Clock className="w-3 h-3 text-amber-500" />
            </span>
          ) : p.status === "failed" ? (
            <span
              title={p.failureReason || "Scan failed"}
              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0"
            >
              <AlertTriangle className="w-3 h-3 text-rose-500" />
            </span>
          ) : p.status === "unclear" ? (
            <span
              title="Scan status: Unclear results"
              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0"
            >
              <HelpCircle className="w-3 h-3 text-purple-500" />
            </span>
          ) : null}

          {/* Archetype Badge */}
          {isScanning ? (
            <div
              className="h-5 w-20 rounded-md bg-slate-200/70 dark:bg-slate-800/70 animate-pulse shrink-0"
              title="Analyzing scaling pattern..."
            />
          ) : isOnHold ? (
            <Badge
              variant="alert"
              className="shrink-0"
              title={`Account hold detected — was ${p.lastKnownValidResults ?? "?"} ads. Grace period verification scan ${p.consecutiveZeroScans ?? 1}/3.`}
            >
              <Pause className="w-2.5 h-2.5 text-amber-500 shrink-0" />
              <span>On Hold ({p.consecutiveZeroScans ?? 1}/3)</span>
            </Badge>
          ) : p.holdStatus === "inactive" ? (
            <Badge
              variant="inactive"
              className="shrink-0"
              title="Brand inactive (0 active ads confirmed over 3 scans)."
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
              <span>Inactive</span>
              {p.autoCreativeScan === false && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.onOpenRunner(p);
                  }}
                  className="text-amber-500 hover:text-amber-400 transition-colors cursor-pointer shrink-0 ml-0.5 p-0.5 rounded hover:bg-amber-500/10"
                  title="Automatic creative scans paused. Click to open runner."
                  aria-label="Auto creative scans paused"
                >
                  <Pause className="w-2.5 h-2.5 fill-amber-500/30" />
                </button>
              )}
            </Badge>
          ) : scaling.archetype !== "inactive" ? (
            (() => {
              const isBurst = scaling.archetype === "burst";
              const isBreakout = scaling.archetype === "breakout";
              const isScaling =
                scaling.archetype === "scaling" ||
                scaling.archetype === "aggressive";
              const isDropping = scaling.archetype === "descaling" || scaling.archetype === "off_air";

              const badgeVariant = isBurst
                ? "burst"
                : isBreakout
                ? "breakout"
                : isScaling
                ? "scaling"
                : scaling.archetype === "stable"
                ? "stable"
                : scaling.archetype === "heavy_tester"
                ? "tester"
                : isDropping
                ? "descaling"
                : "secondary";

              return (
                <Badge
                  variant={badgeVariant}
                  className="shrink-0"
                  title={`${scaling.label} (${scaling.confidence} confidence): ${scaling.description}${
                    scaling.velocityPerDay !== undefined
                      ? `\n• Velocity: ${scaling.velocityPerDay > 0 ? "+" : ""}${scaling.velocityPerDay} ads/day`
                      : ""
                  }${scaling.volatility !== undefined ? `\n• Volatility: σ=${scaling.volatility}` : ""}${
                    scaling.reversionRate !== undefined ? `\n• Sawtooth Flips: ${Math.round(scaling.reversionRate * 100)}%` : ""
                  }`}
                >
                  {isBurst ? (
                    <Flame className="w-3 h-3 text-amber-500 shrink-0" />
                  ) : isBreakout ? (
                    <TrendingUp className="w-3 h-3 text-purple-500 shrink-0" />
                  ) : isScaling ? (
                    <TrendingUp className="w-3 h-3 text-indigo-500 shrink-0" />
                  ) : isDropping ? (
                    <TrendingDown className="w-3 h-3 text-rose-500 shrink-0" />
                  ) : scaling.archetype === "heavy_tester" ? (
                    <FlaskConical className="w-3 h-3 text-cyan-500 shrink-0" />
                  ) : scaling.archetype === "stable" ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  )}
                  <span>{scaling.shortLabel}</span>
                  {p.autoCreativeScan === false && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.onOpenRunner(p);
                      }}
                      className="text-amber-500 hover:text-amber-400 transition-colors cursor-pointer shrink-0 ml-0.5 p-0.5 rounded hover:bg-amber-500/10"
                      title="Automatic creative scans paused. Click to open runner."
                      aria-label="Auto creative scans paused"
                    >
                      <Pause className="w-2.5 h-2.5 fill-amber-500/30" />
                    </button>
                  )}
                </Badge>
              );
            })()
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-xs">—</span>
              {p.autoCreativeScan === false && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.onOpenRunner(p);
                  }}
                  className="text-amber-500 hover:text-amber-400 transition-colors cursor-pointer shrink-0 p-0.5 rounded hover:bg-amber-500/10"
                  title="Automatic creative scans paused. Click to open runner."
                  aria-label="Auto creative scans paused"
                >
                  <Pause className="w-2.5 h-2.5 fill-amber-500/30" />
                </button>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Last Checked */}
      <td className="px-3 md:px-3.5 xl:px-4 py-3 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
        {isScanning ? (
          <div className="flex flex-col gap-1 py-0.5" title="Updating scan timestamp...">
            <div className="h-3.5 w-14 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
            {p.lastCreativeScan && (
              <div className="h-3 w-10 rounded bg-slate-200/40 dark:bg-slate-800/40 animate-pulse" />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span
              className="font-medium text-slate-700 dark:text-slate-300"
              title={p.lastChecked ? `Ad count checked: ${new Date(p.lastChecked).toLocaleString()}` : "Never checked"}
            >
              {formatRelativeTime(p.lastChecked)}
            </span>
            {p.lastCreativeScan && (
              <span
                className="text-[10px] text-purple-600 dark:text-purple-400 flex items-center gap-0.5"
                title={`Ad Spy scan: ${new Date(p.lastCreativeScan).toLocaleString()}`}
              >
                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                <span>Spy: {formatRelativeTime(p.lastCreativeScan)}</span>
              </span>
            )}
          </div>
        )}
      </td>

      {/* Actions */}
      <td className="px-3 md:px-3.5 xl:px-4 py-3 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          {/* Refresh Button */}
          {(() => {
            const isRefreshingRow = isRefreshing || p.status === "scanning";
            return (
              <button
                type="button"
                onClick={() => actions.onRefresh(p.id)}
                disabled={isRefreshingRow}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                  isRefreshingRow
                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/15"
                    : "text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                title={isRefreshingRow ? "Refreshing scan..." : "Refresh scan"}
                aria-label={`Refresh scan for ${p.displayName || "tracked page"}`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 transition-transform duration-300 ease-out ${
                    isRefreshingRow
                      ? "animate-spin text-indigo-600 dark:text-indigo-400"
                      : "hover:rotate-90 hover:text-indigo-600 dark:hover:text-indigo-400"
                  }`}
                />
              </button>
            );
          })()}

          {/* Ad Spy Runner Scan */}
          <button
            type="button"
            onClick={() => actions.onOpenRunner(p)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            title={
              (p as any).lastCreativeScan && new Date((p as any).lastCreativeScan).toDateString() === new Date().toDateString()
                ? `Scanned today at ${new Date((p as any).lastCreativeScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : "Queue Ad Spy extraction scan"
            }
            aria-label={`Queue creative scan for ${p.displayName || "tracked page"}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
          </button>

          {/* More Actions Trigger */}
          <div className="relative inline-block text-left">
            <button
              type="button"
              data-menu-trigger={p.id}
              onClick={(e) => actions.onToggleMenu(e, p.id)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                isMenuOpen
                  ? "text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-800"
                  : "text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              title="More options"
              aria-label={`More options for ${p.displayName || "tracked page"}`}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
