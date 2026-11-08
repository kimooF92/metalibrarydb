"use client";

import type { Ad } from "@/types";
import { calculateWinnerScore } from "@/lib/winner-score";
import {
  Calendar,
  Layers,
  Flame,
  Clock,
  Award,
  Rocket,
  Zap,
  Sparkles,
  Trophy,
  Crown,
} from "lucide-react";

export interface AdCardSignalsProps {
  ad: Ad;
  showScoreTooltip: boolean;
  onToggleScoreTooltip: () => void;
  onOpenClusterModal: () => void;
  onOpenCreativeClusterModal: () => void;
}

export function AdCardSignals({
  ad,
  showScoreTooltip,
  onToggleScoreTooltip,
  onOpenClusterModal,
  onOpenCreativeClusterModal,
}: AdCardSignalsProps) {
  const duplicationCount = ad.duplicationCount || 1;
  const isScaled = duplicationCount >= 5;

  const winnerMetrics = calculateWinnerScore({
    startedRunningOn: ad.startedRunningOn,
    firstSeenAt: ad.firstSeenAt,
    lastSeenAt: ad.lastSeenAt,
    duplicationCount,
    isActive: ad.isActive,
    isArchived: ad.isArchived,
    mediaType: ad.mediaType,
    productCreativeCount: ad.productCreativeCount || 1,
  });

  const creativeCount = ad.productCreativeCount || 1;
  const isMultiCreative = creativeCount > 1;

  const formatLaunchDate = (dateStr: string | null, firstSeenStr?: string | null) => {
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

  const formatFreshnessDate = (dateStr?: string | Date | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const diffHours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return "Verified just now";
    if (diffHours < 24) return `Verified ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Verified ${diffDays}d ago`;
  };

  const freshnessLabel = formatFreshnessDate(ad.lastSeenAt);

  return (
    <>
      {/* Row 1: High-Signal Intelligence Pills */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {/* Winner Score / Breakout Pill with Breakdown Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={onToggleScoreTooltip}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold cursor-pointer transition-all ${
              winnerMetrics.isBreakout
                ? "bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 text-white shadow-sm shadow-pink-500/20 border border-pink-400/40 animate-pulse"
                : winnerMetrics.winnerScore >= 85
                ? "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 text-slate-950 shadow-sm shadow-amber-500/20 border border-amber-300"
                : winnerMetrics.winnerScore >= 68
                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20"
                : winnerMetrics.winnerScore >= 45
                ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
            }`}
          >
            {winnerMetrics.isBreakout ? (
              <Rocket className="w-3 h-3 text-white fill-white/20" />
            ) : winnerMetrics.winnerScore >= 85 ? (
              <Trophy className="w-3 h-3 fill-slate-950" />
            ) : winnerMetrics.winnerScore >= 68 ? (
              <Flame className="w-3 h-3 fill-white" />
            ) : winnerMetrics.winnerScore >= 45 ? (
              <Zap className="w-3 h-3 text-indigo-500" />
            ) : (
              <Sparkles className="w-3 h-3 text-slate-400" />
            )}
            <span>
              {winnerMetrics.isBreakout
                ? `Breakout (${winnerMetrics.winnerScore})`
                : winnerMetrics.winnerScore >= 85
                ? `${winnerMetrics.winnerScore} Super Winner`
                : winnerMetrics.winnerScore >= 68
                ? `${winnerMetrics.winnerScore} Winner Score`
                : `${winnerMetrics.winnerScore} Score`}
            </span>
          </button>

          {/* Score Breakdown Tooltip */}
          {showScoreTooltip && (
            <div className="absolute left-0 top-full mt-1.5 w-60 p-2.5 bg-slate-900 text-white dark:bg-slate-950 dark:border-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 text-[10px] space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between font-bold border-b border-slate-800 pb-1 text-amber-400">
                <div className="flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" />
                  <span>Winner Score Breakdown</span>
                </div>
                <span className="text-xs font-black">{winnerMetrics.winnerScore}/100</span>
              </div>
              <div className="space-y-1 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">📈 Scale ({duplicationCount} copies):</span>
                  <strong className="text-emerald-400 font-mono">+{winnerMetrics.breakdown.scalePts} pts</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">⏳ Longevity ({winnerMetrics.daysRunning}d running):</span>
                  <strong className="text-emerald-400 font-mono">+{winnerMetrics.breakdown.longevityPts} pts</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">⚡ Status & Recency:</span>
                  <strong className="text-emerald-400 font-mono">+{winnerMetrics.breakdown.recencyPts} pts</strong>
                </div>
                {winnerMetrics.breakdown.bonusPts > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">🚀 Velocity & Angle Bonus:</span>
                    <strong className="text-amber-400 font-mono">+{winnerMetrics.breakdown.bonusPts} pts</strong>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Product Creative Angle & Flagship Trigger Pill */}
        {(isMultiCreative || ad.isFlagshipProduct) && (
          <button
            type="button"
            onClick={onOpenClusterModal}
            title="Click to view all sister creative angles tested for this product"
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-all cursor-pointer shadow-sm"
          >
            <Layers className="w-3 h-3 text-indigo-500 shrink-0" />
            <span>{creativeCount} Angles</span>
            {ad.isFlagshipProduct && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 ml-0.5">
                <Crown className="w-2.5 h-2.5 text-amber-500 fill-amber-500/20" />
                Hero
              </span>
            )}
          </button>
        )}

        {/* Creative Scale & Copycat Saturation Pill */}
        {ad.creativeMetrics && (ad.creativeMetrics.totalAdSets > 1 || ad.creativeMetrics.isCrossBrand) && (
          <button
            type="button"
            onClick={onOpenCreativeClusterModal}
            title="Click to view all copycats, ad variations, and brands running this visual creative"
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold cursor-pointer transition-all shadow-sm ${
              ad.creativeMetrics.isCrossBrand
                ? "bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900"
                : "bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900"
            }`}
          >
            <Zap className={`w-3 h-3 ${ad.creativeMetrics.isCrossBrand ? "text-purple-500 fill-purple-500/20" : "text-amber-500 fill-amber-500/20"}`} />
            <span>
              {ad.creativeMetrics.isCrossBrand
                ? `🔥 ${ad.creativeMetrics.totalAdSets} Ads (${ad.creativeMetrics.distinctBrandsCount} Brands)`
                : `⚡ ${ad.creativeMetrics.totalAdSets} Scaled Sets`}
            </span>
          </button>
        )}

        {/* Evergreen Badge (Subtle inline pill) */}
        {winnerMetrics.isEvergreen && !winnerMetrics.isBreakout && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full shadow-sm">
            <Sparkles className="w-2.5 h-2.5 text-emerald-500 fill-emerald-500/20" />
            <span>Evergreen</span>
          </span>
        )}
      </div>

      {/* Row 2: Unified Metadata Line */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-2.5 flex-wrap">
        <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
          <Calendar className="w-3 h-3 text-indigo-500/80" />
          <span>{formatLaunchDate(ad.startedRunningOn, ad.firstSeenAt)}</span>
        </span>

        <span className="text-slate-300 dark:text-slate-700">•</span>

        <span className={`inline-flex items-center gap-1 font-semibold ${isScaled ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"}`}>
          {isScaled ? <Flame className="w-3 h-3 text-amber-500 fill-amber-500/20 animate-pulse" /> : <Layers className="w-3 h-3 text-slate-400" />}
          <span>{duplicationCount} {duplicationCount === 1 ? "copy" : "copies running"}</span>
          {isScaled && (
            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-1 py-0.2 rounded uppercase tracking-wider">
              Scaled
            </span>
          )}
        </span>

        {freshnessLabel && (
          <>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">{freshnessLabel}</span>
          </>
        )}
      </div>
    </>
  );
}

