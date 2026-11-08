"use client";

import type { Ad } from "@/types";
import { calculateWinnerScore } from "@/lib/winner-score";
import { Award } from "lucide-react";

export interface AdCardSignalsProps {
  ad: Ad;
  showScoreTooltip: boolean;
  onToggleScoreTooltip: () => void;
  onOpenClusterModal?: () => void;
  onOpenCreativeClusterModal?: () => void;
}

export function AdCardSignals({
  ad,
  showScoreTooltip,
  onToggleScoreTooltip,
}: AdCardSignalsProps) {
  const duplicationCount = ad.duplicationCount || 1;

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

  if (!showScoreTooltip) return null;

  return (
    <div className="relative z-50 mb-2">
      {/* Score Breakdown Tooltip Popover */}
      <div className="w-full p-2.5 bg-slate-900 text-white dark:bg-slate-950 dark:border-slate-800 border border-slate-700 rounded-xl shadow-2xl text-[10px] space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
        <div className="flex items-center justify-between font-bold border-b border-slate-800 pb-1 text-amber-400">
          <div className="flex items-center gap-1">
            <Award className="w-3.5 h-3.5" />
            <span>Winner Score Breakdown</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black">{winnerMetrics.winnerScore}/100</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleScoreTooltip();
              }}
              className="text-slate-400 hover:text-white cursor-pointer px-1 text-xs"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="space-y-1 text-slate-300">
          <div className="flex justify-between">
            <span className="text-slate-400">Scale ({duplicationCount} copies):</span>
            <strong className="text-emerald-400 font-mono">
              +{winnerMetrics.breakdown.scalePts} pts
            </strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">
              Longevity ({winnerMetrics.daysRunning}d running):
            </span>
            <strong className="text-emerald-400 font-mono">
              +{winnerMetrics.breakdown.longevityPts} pts
            </strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Status & Recency:</span>
            <strong className="text-emerald-400 font-mono">
              +{winnerMetrics.breakdown.recencyPts} pts
            </strong>
          </div>
          {winnerMetrics.breakdown.bonusPts > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-400">Velocity & Angle Bonus:</span>
              <strong className="text-amber-400 font-mono">
                +{winnerMetrics.breakdown.bonusPts} pts
              </strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
