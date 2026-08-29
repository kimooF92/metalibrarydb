"use client";

import Link from "next/link";
import { TopMover, TrackedPage } from "@/types";
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Flame, Sparkles } from "lucide-react";
import { classifyScalingPattern } from "@/lib/scaling-classifier";

interface TopMoversProps {
  pages: TrackedPage[] | Array<{
    id: string;
    pageId?: string | null;
    displayName: string | null;
    url: string;
    currentResults: number | null;
    difference?: number | null;
    historyPoints?: number[];
    scalingPattern?: any;
  }>;
}

export function TopMovers({ pages }: TopMoversProps) {
  const withDiff = pages.filter(
    (p) => p.difference !== null && p.difference !== undefined && p.difference !== 0
  );

  const gainers = withDiff
    .filter((p) => (p.difference ?? 0) > 0)
    .sort((a, b) => (b.difference ?? 0) - (a.difference ?? 0))
    .slice(0, 5)
    .map((p) => {
      const scaling = p.scalingPattern || classifyScalingPattern(p.historyPoints, p.currentResults);
      return {
        id: p.id,
        pageId: p.pageId,
        displayName: p.displayName,
        url: p.url,
        currentResults: p.currentResults,
        difference: p.difference as number,
        scaling,
      };
    });

  const losers = withDiff
    .filter((p) => (p.difference ?? 0) < 0)
    .sort((a, b) => (a.difference ?? 0) - (b.difference ?? 0))
    .slice(0, 5)
    .map((p) => {
      const scaling = p.scalingPattern || classifyScalingPattern(p.historyPoints, p.currentResults);
      return {
        id: p.id,
        pageId: p.pageId,
        displayName: p.displayName,
        url: p.url,
        currentResults: p.currentResults,
        difference: p.difference as number,
        scaling,
      };
    });

  if (gainers.length === 0 && losers.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* Top Gainers */}
      {gainers.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              Top Gainers
            </span>
          </div>
          <div className="space-y-2">
            {gainers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all group"
              >
                <div className="flex items-center space-x-2 min-w-0 mr-2">
                  <Link
                    href={`/spy/brand/${encodeURIComponent(p.pageId || p.id)}`}
                    className="text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[150px] transition-colors"
                    title={`Open ${p.displayName || "brand"} Analytics`}
                  >
                    {p.displayName || "Meta Ad Search"}
                  </Link>
                  {p.scaling && p.scaling.archetype !== "emerging" && p.scaling.archetype !== "inactive" && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.2 rounded border shrink-0 ${p.scaling.badgeClass}`}
                      title={`${p.scaling.label}: ${p.scaling.description}`}
                    >
                      <span>{p.scaling.icon}</span>
                      <span>{p.scaling.shortLabel}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-mono font-medium">
                    {p.currentResults?.toLocaleString() ?? "—"}
                  </span>
                  <span className="inline-flex items-center text-xs font-bold text-emerald-800 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/20">
                    <ArrowUpRight className="w-3 h-3 mr-0.5" />
                    +{p.difference}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Losers */}
      {losers.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-3">
            <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              Top Decliners
            </span>
          </div>
          <div className="space-y-2">
            {losers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all group"
              >
                <div className="flex items-center space-x-2 min-w-0 mr-2">
                  <Link
                    href={`/spy/brand/${encodeURIComponent(p.pageId || p.id)}`}
                    className="text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[150px] transition-colors"
                    title={`Open ${p.displayName || "brand"} Analytics`}
                  >
                    {p.displayName || "Meta Ad Search"}
                  </Link>
                  {p.scaling && p.scaling.archetype !== "emerging" && p.scaling.archetype !== "inactive" && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.2 rounded border shrink-0 ${p.scaling.badgeClass}`}
                      title={`${p.scaling.label}: ${p.scaling.description}`}
                    >
                      <span>{p.scaling.icon}</span>
                      <span>{p.scaling.shortLabel}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-mono font-medium">
                    {p.currentResults?.toLocaleString() ?? "—"}
                  </span>
                  <span className="inline-flex items-center text-xs font-bold text-rose-800 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 px-2 py-0.5 rounded border border-rose-300 dark:border-rose-500/20">
                    <ArrowDownRight className="w-3 h-3 mr-0.5" />
                    {p.difference}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
