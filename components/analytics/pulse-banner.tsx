import Link from "next/link";
import { Flame, ShoppingBag, Zap, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { DateRange, getDateRangeDescription } from "./date-range-filter";

interface PulseBannerProps {
  breakoutCount?: number;
  topNiche?: string;
  topNichePrice?: number;
  dominantCTA?: string;
  dominantCTAPct?: number;
  catalogHealthPct?: number;
  dateRange?: DateRange;
  isLoading?: boolean;
}

export function PulseBanner({
  breakoutCount = 0,
  topNiche = "Beauty & Care",
  topNichePrice = 0,
  dominantCTA = "Shop Now",
  dominantCTAPct = 0,
  catalogHealthPct = 100,
  dateRange = "7d",
  isLoading = false,
}: PulseBannerProps) {
  if (isLoading) {
    return (
      <div className="w-full h-12 rounded-2xl bg-slate-100 dark:bg-slate-900/60 animate-pulse border border-slate-200 dark:border-slate-800" />
    );
  }

  return (
    <div className="w-full rounded-2xl p-3 sm:p-3.5 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20 backdrop-blur-md shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
      {/* Title & Live Signal Indicator */}
      <div className="flex items-center space-x-2.5 shrink-0">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        <div className="flex items-center space-x-1.5 font-extrabold text-slate-900 dark:text-white">
          <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
          <span>Market Intelligence Pulse</span>
        </div>
      </div>

      {/* Highlights Strip */}
      <div className="flex items-center flex-wrap gap-2 sm:gap-4 text-slate-700 dark:text-slate-200">
        {/* Signal 1: Breakout Scalers */}
        <div className="flex items-center space-x-1.5 bg-white/70 dark:bg-slate-900/70 px-2.5 py-1 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>
            <strong>{breakoutCount}</strong> Breakout Ads ({getDateRangeDescription(dateRange)})
          </span>
        </div>

        {/* Signal 2: Top Niche */}
        <div className="flex items-center space-x-1.5 bg-white/70 dark:bg-slate-900/70 px-2.5 py-1 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
          <ShoppingBag className="w-3.5 h-3.5 text-indigo-500" />
          <span>
            Top Niche: <strong className="text-indigo-600 dark:text-indigo-400">{topNiche}</strong>{" "}
            {topNichePrice > 0 && <span className="text-[11px] text-slate-500 font-mono">({topNichePrice} TND avg)</span>}
          </span>
        </div>

        {/* Opportunity Seeker CTA Link */}
        <Link
          href="/opportunities"
          className="flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xs transition-all"
        >
          <Sparkles className="w-3 h-3" />
          <span>Opportunity Seeker</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
