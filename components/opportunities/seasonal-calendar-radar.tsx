"use client";

import {
  Calendar,
  Clock,
  Flame,
  ArrowRight,
  Sparkles,
  Zap,
  ShoppingBag,
  Gift,
  Sun,
  GraduationCap,
  HeartHandshake,
} from "lucide-react";
import { Stage2SeasonalityAnalysis, TunisianSeasonalityContext } from "@/lib/opportunity-seeker";

interface SeasonalCalendarRadarProps {
  seasonality?: Stage2SeasonalityAnalysis;
  seasonalityCtx?: TunisianSeasonalityContext;
}

export function SeasonalCalendarRadar({
  seasonality,
  seasonalityCtx,
}: SeasonalCalendarRadarProps) {
  if (!seasonality || !seasonalityCtx) return null;

  const getEventIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("rentrée") || lower.includes("school")) {
      return <GraduationCap className="w-4 h-4 text-amber-500" />;
    }
    if (lower.includes("black friday") || lower.includes("vendredi blanc") || lower.includes("soldes")) {
      return <Flame className="w-4 h-4 text-rose-500" />;
    }
    if (lower.includes("ramadan") || lower.includes("eid")) {
      return <Gift className="w-4 h-4 text-emerald-500" />;
    }
    if (lower.includes("mariage") || lower.includes("wedding")) {
      return <HeartHandshake className="w-4 h-4 text-purple-500" />;
    }
    if (lower.includes("summer") || lower.includes("beach")) {
      return <Sun className="w-4 h-4 text-amber-400" />;
    }
    return <Sparkles className="w-4 h-4 text-indigo-500" />;
  };

  return (
    <div className="w-full rounded-2xl p-5 bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md space-y-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Tunisian Seasonality & Buying Wave Timeline</span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20">
                {seasonality.seasonalUrgency}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Active Date: {new Date(seasonalityCtx.currentDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} • Aligned with Tunisian cultural calendar and COD consumer velocity.
            </p>
          </div>
        </div>
      </div>

      {/* 3-Step Seasonal Wave Progression Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Step 1: Active Wave This Week */}
        <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-50/80 to-white dark:from-slate-900 dark:to-indigo-950/30 border border-indigo-500/30 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              <span>Step 1 • Active Wave (Scale Now)</span>
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
            {seasonality.seasonalRoadmap?.activeWaveThisWeek}
          </p>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 flex items-center gap-1 border-t border-indigo-100 dark:border-slate-800">
            <Clock className="w-3 h-3 text-indigo-500" />
            <span>Launch video creatives immediately</span>
          </div>
        </div>

        {/* Step 2: Next 30 Days Wave */}
        <div className="p-3.5 rounded-xl bg-gradient-to-br from-purple-50/80 to-white dark:from-slate-900 dark:to-purple-950/30 border border-purple-500/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" />
              <span>Step 2 • Next 30 Days (Start Sourcing)</span>
            </span>
          </div>
          <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
            {seasonality.seasonalRoadmap?.next30DaysWave}
          </p>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 flex items-center gap-1 border-t border-purple-100 dark:border-slate-800">
            <Clock className="w-3 h-3 text-purple-500" />
            <span>Source inventory with local/air suppliers</span>
          </div>
        </div>

        {/* Step 3: Next 60 Days Wave */}
        <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-50/80 to-white dark:from-slate-900 dark:to-amber-950/30 border border-amber-500/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Step 3 • Next 60 Days (Macro Horizon)</span>
            </span>
          </div>
          <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
            {seasonality.seasonalRoadmap?.next60DaysWave}
          </p>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 flex items-center gap-1 border-t border-amber-100 dark:border-slate-800">
            <Clock className="w-3 h-3 text-amber-500" />
            <span>Plan bundle offers & landing page funnels</span>
          </div>
        </div>
      </div>

      {/* Upcoming Key Events Horizon Cards */}
      {seasonalityCtx.upcomingKeyEvents && seasonalityCtx.upcomingKeyEvents.length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Upcoming Tunisian Cultural & Consumer Milestones</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {seasonalityCtx.upcomingKeyEvents.map((evt, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-white/90 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5 hover:border-indigo-500/40 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    {getEventIcon(evt.eventName)}
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {evt.eventName}
                    </span>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                    in {evt.daysRemaining}d
                  </span>
                </div>

                <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                  {evt.buyingBehaviorNote}
                </p>

                <div className="flex flex-wrap gap-1 pt-1">
                  {evt.relevantCategories.map((cat, cIdx) => (
                    <span
                      key={cIdx}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
