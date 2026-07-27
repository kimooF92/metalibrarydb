"use client";

import { TopMover } from "@/types";
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from "lucide-react";

interface TopMoversProps {
  pages: Array<{
    id: string;
    displayName: string | null;
    url: string;
    currentResults: number | null;
    difference?: number | null;
  }>;
}

export function TopMovers({ pages }: TopMoversProps) {
  const withDiff = pages.filter(
    (p) => p.difference !== null && p.difference !== undefined && p.difference !== 0
  );

  const gainers: TopMover[] = withDiff
    .filter((p) => (p.difference ?? 0) > 0)
    .sort((a, b) => (b.difference ?? 0) - (a.difference ?? 0))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      url: p.url,
      currentResults: p.currentResults,
      difference: p.difference as number,
    }));

  const losers: TopMover[] = withDiff
    .filter((p) => (p.difference ?? 0) < 0)
    .sort((a, b) => (a.difference ?? 0) - (b.difference ?? 0))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      url: p.url,
      currentResults: p.currentResults,
      difference: p.difference as number,
    }));

  if (gainers.length === 0 && losers.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* Top Gainers */}
      {gainers.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider">
              Top Gainers
            </span>
          </div>
          <div className="space-y-2">
            {gainers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all group"
              >
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-slate-800 dark:text-slate-200 hover:text-emerald-650 dark:hover:text-emerald-300 truncate max-w-[160px] transition-colors"
                  title={p.url}
                >
                  {p.displayName || "Meta Ad Search"}
                </a>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {p.currentResults?.toLocaleString() ?? "—"}
                  </span>
                  <span className="inline-flex items-center text-xs font-bold text-emerald-650 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
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
            <TrendingDown className="w-4 h-4 text-rose-500 dark:text-rose-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider">
              Top Decliners
            </span>
          </div>
          <div className="space-y-2">
            {losers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all group"
              >
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-slate-800 dark:text-slate-200 hover:text-rose-650 dark:hover:text-rose-300 truncate max-w-[160px] transition-colors"
                  title={p.url}
                >
                  {p.displayName || "Meta Ad Search"}
                </a>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {p.currentResults?.toLocaleString() ?? "—"}
                  </span>
                  <span className="inline-flex items-center text-xs font-bold text-rose-650 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
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
