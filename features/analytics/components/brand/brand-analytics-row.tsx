"use client";

import type { TrackedPage } from "@/types";
import { BrandMiniBar } from "./brand-mini-bar";
import { Star, ArrowUpRight, ArrowDownRight, Minus, ExternalLink } from "lucide-react";

interface BrandAnalyticsRowProps {
  page: TrackedPage;
  rank: number;
  maxResults: number;
  isUpdatingWatchlist: boolean;
  onToggleWatchlist: (pageId: string, currentStatus?: boolean) => void;
}

export function BrandAnalyticsRow({
  page,
  rank,
  maxResults,
  isUpdatingWatchlist,
  onToggleWatchlist,
}: BrandAnalyticsRowProps) {
  const diff = page.windowDelta ?? page.difference ?? 0;
  const prev = page.previousResults;
  const curr = page.currentResults ?? 0;
  const pctChange =
    prev && prev > 0 && diff !== 0 ? Math.round((diff / prev) * 100) : null;

  return (
    <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors">
      <td className="py-3 px-3.5 text-center font-mono font-semibold text-slate-600 dark:text-slate-400">
        #{rank}
      </td>

      <td className="py-3 px-3.5">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => onToggleWatchlist(page.id, page.isWatchlisted)}
            disabled={isUpdatingWatchlist}
            title={page.isWatchlisted ? "Remove from watchlist" : "Add to watchlist"}
            className="text-slate-500 hover:text-amber-500 cursor-pointer transition-colors disabled:opacity-40"
          >
            <Star
              className={`w-3.5 h-3.5 ${
                page.isWatchlisted
                  ? "fill-amber-400 text-amber-400"
                  : "text-slate-400 dark:text-slate-600"
              }`}
            />
          </button>

          <div className="truncate max-w-[240px]">
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 truncate block transition-colors"
            >
              {page.displayName || "Meta Ad Search"}
            </a>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate block">
              {page.pageId || page.url}
            </span>
          </div>
        </div>
      </td>

      <td className="py-3 px-3.5">
        <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          {page.searchType === "page_id" || (!page.searchType && page.pageId)
            ? "Page ID"
            : "Keyword"}
        </span>
      </td>

      <td className="py-3 px-3.5 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100 text-sm">
        {curr.toLocaleString()}
      </td>

      <td className="py-3 px-3.5 text-right font-mono text-slate-600 dark:text-slate-400 font-medium">
        {prev !== null && prev !== undefined ? prev.toLocaleString() : "—"}
      </td>

      <td className="py-3 px-3.5 text-right">
        {diff > 0 ? (
          <span className="inline-flex items-center text-xs font-extrabold text-emerald-800 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-300 dark:border-emerald-500/20">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            +{diff} {pctChange !== null && `(+${pctChange}%)`}
          </span>
        ) : diff < 0 ? (
          <span className="inline-flex items-center text-xs font-extrabold text-rose-800 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-300 dark:border-rose-500/20">
            <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
            {diff} {pctChange !== null && `(${pctChange}%)`}
          </span>
        ) : (
          <span className="inline-flex items-center text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
            <Minus className="w-3 h-3 mr-0.5" />
            0
          </span>
        )}
      </td>

      <td className="py-3 px-3.5 min-w-[140px]">
        <BrandMiniBar
          value={curr}
          max={maxResults || 1}
          colorClass={diff > 0 ? "bg-emerald-500" : diff < 0 ? "bg-rose-500" : "bg-indigo-500"}
        />
      </td>

      <td className="py-3 px-3.5 text-right">
        <a
          href={page.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center space-x-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <span>View Ad Library</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </td>
    </tr>
  );
}

