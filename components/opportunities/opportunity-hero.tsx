"use client";

import {
  Sparkles,
  RefreshCw,
  Calendar,
  Flame,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { UnifiedOpportunityReport } from "@/lib/opportunities";

interface OpportunityHeroProps {
  report: UnifiedOpportunityReport | null;
  generating: boolean;
  onGenerate: () => void;
  lastUpdated?: string | null;
}

export function OpportunityHero({
  report,
  generating,
  onGenerate,
}: OpportunityHeroProps) {
  const oppIndex = report?.marketOpportunityIndex ?? 82;

  const isAi =
    report?.generationMeta?.generationMode === "ai" ||
    (report?.modelUsed && report.modelUsed.toLowerCase().includes("minimax"));
  const isOffline =
    report?.generationMeta?.generationMode === "offline" ||
    (report?.modelUsed && report.modelUsed.toLowerCase().includes("deterministic"));

  const provenanceLabel = isAi
    ? "AI Insights"
    : isOffline
    ? "Rule-Based"
    : report?.modelUsed
    ? report.modelUsed
    : "Market Insights";

  const scoreColor =
    oppIndex >= 75
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 ring-emerald-500/20"
      : oppIndex >= 50
      ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20 ring-amber-500/20"
      : "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20 ring-rose-500/20";

  const formattedGeneratedAt = report?.generatedAt
    ? new Date(report.generatedAt).toLocaleString("fr-FR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const hasCoverageNotice =
    report?.telemetrySnapshot?.coverage &&
    !report.telemetrySnapshot.coverage.hasEnoughDataForInference;

  return (
    <div className="w-full rounded-2xl p-5 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-indigo-950/30 border border-indigo-500/20 dark:border-indigo-500/30 backdrop-blur-xl shadow-xs space-y-4">
      {/* Top Banner Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                Market Opportunities
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-xs">
                Tunisia Market
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Live Data
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border ${
                  isAi
                    ? "bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border-indigo-500/20"
                    : "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/20"
                }`}
              >
                {provenanceLabel}
              </span>
              {formattedGeneratedAt && (
                <span className="flex items-center space-x-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  <Clock className="w-3 h-3" />
                  <span>{formattedGeneratedAt}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
              Smart recommendations based on rising ads, optimal pricing, Tunisian seasonal events (Ramadan, Eid, Summer, Back-to-school), and local cash-on-delivery trends.
            </p>
          </div>
        </div>

        {/* Action Controls & Index Badge */}
        <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
          {/* Opportunity Index Badge */}
          {report && (
            <div className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl border ring-1 ${scoreColor}`}>
              <Flame className="w-4 h-4" />
              <div className="text-left">
                <div className="text-[9px] uppercase font-extrabold tracking-wider opacity-80 leading-none">
                  Opportunity Index
                </div>
                <div className="text-sm font-black mt-0.5 leading-none">
                  {oppIndex} / 100
                </div>
              </div>
            </div>
          )}

          {/* On-Demand Trigger Button */}
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-extrabold shadow-md shadow-indigo-500/25 transition-all cursor-pointer disabled:opacity-50"
            title="Analyze current market opportunities"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
            <span>
              {generating
                ? "Analyzing Market..."
                : report
                ? "Refresh Analysis"
                : "Analyze Market"}
            </span>
          </button>
        </div>
      </div>

      {/* Warnings & Coverage Banners */}
      {hasCoverageNotice && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
          <span>
            <strong>Limited ad history:</strong> This workspace has few active ads so far.
            Recommendations are supplemented with broader market patterns.
          </span>
        </div>
      )}

      {report?.generationMeta?.warnings && report.generationMeta.warnings.length > 0 && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
          <span>{report.generationMeta.warnings.join("; ")}</span>
        </div>
      )}

      {/* Market Summary Grid */}
      {report?.telemetrySnapshot && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 text-xs">
          <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block uppercase tracking-wider">
                Active Ads
              </span>
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                {report.telemetrySnapshot.totalActiveAds.toLocaleString()}
              </span>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded-md">
              +{report.telemetrySnapshot.newAdsLast7Days} 7D
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block uppercase tracking-wider">
                Scaling Brands
              </span>
              <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                {report.telemetrySnapshot.scalingBrandsCount} Stores
              </span>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-md">
              +{report.telemetrySnapshot.totalAdsScaled} Ads
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block uppercase tracking-wider">
                Top Ad Format
              </span>
              <span className="text-sm font-extrabold text-purple-600 dark:text-purple-400">
                {report.telemetrySnapshot.videoPercent !== null
                  ? `${report.telemetrySnapshot.videoPercent}% Video`
                  : "No Video Data"}
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
              {report.telemetrySnapshot.imagePercent !== null
                ? `${report.telemetrySnapshot.imagePercent}% Image`
                : "No Image Data"}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block uppercase tracking-wider">
                Current Season
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px] block">
                {report.seasonality?.currentSeasonalPhase || "Standard Trading"}
              </span>
            </div>
            <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
