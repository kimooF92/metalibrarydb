"use client";

import { useState } from "react";
import {
  Layers,
  Sparkles,
  TrendingUp,
  Flame,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
  Info,
} from "lucide-react";
import { NicheOpportunityScorecard } from "@/lib/opportunity-seeker";

interface NicheMatrixProps {
  niches: NicheOpportunityScorecard[];
}

export function NicheMatrix({ niches }: NicheMatrixProps) {
  const [sortBy, setSortBy] = useState<"score" | "saturation" | "niche">("score");

  if (!niches || niches.length === 0) return null;

  const sorted = [...niches].sort((a, b) => {
    if (sortBy === "score") return b.opportunityScore - a.opportunityScore;
    if (sortBy === "saturation") return a.saturationIndex - b.saturationIndex;
    return a.niche.localeCompare(b.niche);
  });

  const getCompetitionBadge = (comp: string) => {
    if (comp.includes("Blue Ocean")) {
      return (
        <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          🌊 Blue Ocean
        </span>
      );
    }
    if (comp.includes("Red Ocean")) {
      return (
        <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          🔥 Red Ocean
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
        ⚡ Moderate Growth
      </span>
    );
  };

  return (
    <div className="w-full rounded-2xl p-5 bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md space-y-4 shadow-xs">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Niche Opportunity & Saturation Radar</span>
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                {niches.length} Analyzed Niches
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Evaluates creative launch velocity, brand count deltas, and multi-store clone saturation across the Tunisian market.
            </p>
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center space-x-1.5 self-end sm:self-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Sort:</span>
          <button
            onClick={() => setSortBy("score")}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              sortBy === "score"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Highest Score
          </button>
          <button
            onClick={() => setSortBy("saturation")}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              sortBy === "saturation"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Lowest Saturation
          </button>
        </div>
      </div>

      {/* Grid of Niche Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((niche, idx) => {
          const score = niche.opportunityScore;
          const scoreColor =
            score >= 75
              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              : score >= 50
              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
              : "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20";

          return (
            <div
              key={idx}
              className="p-4 rounded-xl bg-white/90 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 space-y-3 hover:border-indigo-500/30 transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                    {niche.niche}
                  </h3>
                  <div className={`px-2 py-0.5 text-xs font-black rounded-lg border ${scoreColor}`}>
                    {score}/100
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {getCompetitionBadge(niche.competitionLevel)}
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                    Sweet Spot: <strong className="text-slate-700 dark:text-slate-200">{niche.sweetSpotPriceTND}</strong>
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">
                  {niche.whyNowRationale}
                </p>
              </div>

              {/* Saturation bar & Velocity */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  <span>Saturation Risk:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{niche.saturationIndex}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      niche.saturationIndex > 65
                        ? "bg-rose-500"
                        : niche.saturationIndex > 40
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${niche.saturationIndex}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight pt-0.5">
                  📡 {niche.velocitySignal}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
