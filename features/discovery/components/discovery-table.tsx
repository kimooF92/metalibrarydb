"use client";

import React from "react";
import {
  ExternalLink,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  CheckCircle2,
  Check,
  EyeOff,
  RotateCcw,
  ArrowRight,
  RefreshCw,
  Loader2,
  Sparkles,
} from "lucide-react";
import { DiscoveryProductThumbnailPopover } from "@/components/discovery/discovery-product-thumbnail-popover";
import type { DiscoveredPage } from "@/features/discovery/hooks/use-discovered-pages";

import type { DiscoveryProductPreviewItem } from "@/components/discovery/discovery-product-card";

export interface DiscoveryTableSortConfig {
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (col: string) => void;
}

export interface DiscoveryTableSelectionConfig {
  selectedPageIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelectPage: (id: string) => void;
}

export interface DiscoveryTableActions {
  onVerifyPage: (pageId: string) => void;
  onIgnorePage: (pageId: string, restore?: boolean) => void;
  onMergeSinglePage: (pageId: string) => void;
  onValidateAndMerge: (item: DiscoveryProductPreviewItem) => Promise<void>;
}

export interface DiscoveryTableStateConfig {
  isLoading: boolean;
  isActionPending: boolean;
  totalRunPagesCount: number;
  statusFilter: string;
  country: string;
}

export interface DiscoveryTableProps {
  pages: DiscoveredPage[];
  stateConfig: DiscoveryTableStateConfig;
  sortConfig: DiscoveryTableSortConfig;
  selectionConfig: DiscoveryTableSelectionConfig;
  actions: DiscoveryTableActions;
}

export function DiscoveryTable({
  pages,
  stateConfig,
  sortConfig,
  selectionConfig,
  actions,
}: DiscoveryTableProps) {
  const { isLoading, isActionPending, totalRunPagesCount, statusFilter, country } = stateConfig;
  const { sortBy, sortOrder, onSortChange } = sortConfig;
  const { selectedPageIds, onToggleSelectAll, onToggleSelectPage } = selectionConfig;

  const SortHeader = ({
    col,
    label,
    className = "",
  }: {
    col: string;
    label: string;
    className?: string;
  }) => {
    const active = sortBy === col;
    return (
      <th className={`p-3 whitespace-nowrap ${className}`}>
        <button
          type="button"
          onClick={() => onSortChange(col)}
          className={`flex items-center space-x-1.5 uppercase font-bold text-[10px] tracking-wider transition-colors cursor-pointer ${
            active
              ? "text-indigo-600 dark:text-indigo-400 font-extrabold"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <span>{label}</span>
          <span className="shrink-0">
            {active ? (
              sortOrder === "asc" ? (
                <ChevronUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              )
            ) : (
              <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
            )}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 flex flex-col flex-1 min-h-0 shadow-sm overflow-hidden">
      <div className="overflow-x-auto relative flex-1 min-h-0">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px] tracking-wider sticky top-0 z-10">
            <tr>
              <th className="p-3 w-8 text-center">
                <input
                  type="checkbox"
                  checked={pages.length > 0 && selectedPageIds.size === pages.length}
                  onChange={onToggleSelectAll}
                  className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-indigo-600 focus:ring-0 cursor-pointer"
                />
              </th>
              <th className="p-3 w-12 text-center">Product</th>
              <SortHeader col="displayName" label="Brand & Meta Link" />
              <SortHeader col="matchingAdCount" label="Ads (Active / Verified)" />
              <th className="p-3">Sample CTAs</th>
              <SortHeader col="status" label="Status" />
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 dark:text-indigo-400" />
                  <div>Loading discovered pages...</div>
                </td>
              </tr>
            ) : pages.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-500 dark:text-slate-400">
                  {totalRunPagesCount === 0
                    ? "No discovered pages found for this scan run yet. Launch a new country scan above!"
                    : statusFilter === "verified_high"
                    ? "No verified pages with 10+ ads found yet in this run. Verify more pages to find high-potential brands!"
                    : "No pages match the active filters."}
                </td>
              </tr>
            ) : (
              pages.map((page) => {
                const isSelected = selectedPageIds.has(page.id);
                const metaAdLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${page.country || country}&view_all_page_id=${page.pageId}&search_type=page&media_type=all`;

                return (
                  <tr
                    key={page.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 transition ${
                      isSelected ? "bg-indigo-50/70 dark:bg-indigo-950/40" : ""
                    }`}
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectPage(page.id)}
                        className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                    </td>
                    <td className="p-2 text-center w-12">
                      <DiscoveryProductThumbnailPopover
                        item={page}
                        onValidateAndMerge={actions.onValidateAndMerge}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="font-bold text-slate-900 dark:text-white text-xs flex items-center space-x-1.5 truncate max-w-[200px] sm:max-w-xs">
                          <span className="truncate">{page.displayName || `Page ${page.pageId}`}</span>
                          <a
                            href={metaAdLibraryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 shrink-0"
                            title="Open in Meta Ad Library"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          ID: {page.pageId}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400 w-fit">
                          {page.matchingAdCount} active ads
                        </span>
                        {page.verifiedAdCount !== null ? (
                          page.verifiedAdCount >= 10 ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-600/40 w-fit">
                              <Sparkles className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />
                              <span>{page.verifiedAdCount} verified (High Signal)</span>
                            </span>
                          ) : page.verifiedAdCount > 0 ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span>{page.verifiedAdCount} verified</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <span>0 verified (No active ads)</span>
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Unverified</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {page.sampleCtas && page.sampleCtas.length > 0 ? (
                          page.sampleCtas.slice(0, 3).map((cta, idx) => (
                            <span
                              key={idx}
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80"
                            >
                              {cta}
                            </span>
                          ))
                        ) : (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Shop Now</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {page.status === "ignored" ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400">
                          <EyeOff className="w-3 h-3" />
                          <span>Ignored</span>
                        </span>
                      ) : page.isTracked ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                          <Check className="w-3 h-3" />
                          <span>Already Tracked</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 uppercase">
                          {page.status}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          type="button"
                          onClick={() => actions.onVerifyPage(page.id)}
                          disabled={isActionPending || page.status === "verifying"}
                          className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-300 border border-slate-200 dark:border-indigo-500/30 text-xs font-semibold transition inline-flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
                          title="Verify exact active ad count via worker"
                        >
                          <RefreshCw className={`w-3 h-3 ${page.status === "verifying" ? "animate-spin text-indigo-500" : ""}`} />
                          <span className="hidden sm:inline">{page.status === "verifying" ? "Verifying..." : "Verify"}</span>
                        </button>

                        {/* Ignore or Restore button */}
                        {page.status === "ignored" ? (
                          <button
                            type="button"
                            onClick={() => actions.onIgnorePage(page.id, true)}
                            disabled={isActionPending}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition inline-flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                            title="Restore to active discovery feed"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => actions.onIgnorePage(page.id, false)}
                            disabled={isActionPending}
                            className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-800 text-xs font-medium transition inline-flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                            title="Ignore and hide from discovery feed (remembered on future scans)"
                          >
                            <EyeOff className="w-3 h-3" />
                            <span className="hidden sm:inline">Ignore</span>
                          </button>
                        )}

                        {!page.isTracked && page.status !== "ignored" && (
                          <button
                            type="button"
                            onClick={() => actions.onMergeSinglePage(page.id)}
                            disabled={isActionPending}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition inline-flex items-center space-x-1 shadow-sm cursor-pointer disabled:opacity-50"
                          >
                            <ArrowRight className="w-3 h-3" />
                            <span>Merge</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
