"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  CheckCircle2,
  Video,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  PlayCircle,
  BarChart3,
  Layers,
} from "lucide-react";
import { MarketAnalysisData } from "@/lib/market-forecaster";

export function MarketForecastCard() {
  const [research, setResearch] = useState<MarketAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // 1. Initial Load: Load persistent forecast with 0ms localStorage cache
  useEffect(() => {
    try {
      const cached = localStorage.getItem("ai_market_intelligence_data");
      if (cached) {
        setResearch(JSON.parse(cached));
        setLoading(false);
      }
    } catch {}

    const fetchPersistedResearch = async () => {
      try {
        const res = await fetch("/api/analytics/forecast?auto=true");
        if (res.ok) {
          const json = await res.json();
          if (json.forecast) {
            setResearch(json.forecast);
            try {
              localStorage.setItem("ai_market_intelligence_data", JSON.stringify(json.forecast));
            } catch {}
          }
        }
      } catch (err) {
        console.error("Failed to load persisted intelligence:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPersistedResearch();
  }, []);

  // 2. On-Demand Trigger: Call OpenRouter DeepSeek
  const triggerGenerateResearch = async () => {
    try {
      setGenerating(true);
      setError(null);
      const res = await fetch("/api/analytics/forecast", {
        method: "POST",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate market intelligence");
      }

      const json = await res.json();
      if (json.forecast) {
        setResearch(json.forecast);
        setIsExpanded(true);
        try {
          localStorage.setItem("ai_market_intelligence_data", JSON.stringify(json.forecast));
        } catch {}
      }
    } catch (err: any) {
      console.error("Intelligence Generation Error:", err);
      setError(err?.message || "Error generating market analysis");
    } finally {
      setGenerating(false);
    }
  };

  if (loading && !research) {
    return (
      <div className="w-full rounded-2xl p-4 bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 animate-pulse flex items-center justify-between">
        <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  // Invitation Banner if no research generated yet
  if (!research) {
    return (
      <div className="w-full flex flex-col gap-2">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} className="text-xs font-bold underline ml-2 cursor-pointer">Dismiss</button>
          </div>
        )}
        <div className="w-full rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-slate-900/40 border border-indigo-500/20 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  AI Market Health & Scaling Velocity Intelligence
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                  DeepSeek
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Real Scaling Counts • Market Health • Video %
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Analyze live scale vs descale velocity, platform creative shifts, and actionable media buying directives on demand.
              </p>
            </div>
          </div>

          <button
            onClick={triggerGenerateResearch}
            disabled={generating}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            {generating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing Live Market Counts...</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Generate Market Analysis</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const isDeepSeek = research.modelUsed?.toLowerCase().includes("deepseek");
  const isNetPositive = (research.telemetrySnapshot?.netAdDelta ?? 0) >= 0;
  const healthScore = research.marketHealthScore;

  const scoreColor =
    healthScore >= 70
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : healthScore >= 45
      ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
      : "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20";

  return (
    <div className="w-full rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-white via-slate-50 to-indigo-50/20 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-indigo-950/20 border border-indigo-500/20 dark:border-indigo-500/30 backdrop-blur-xl shadow-sm space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                AI Market Intelligence & Velocity Analysis
              </h2>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${scoreColor}`}>
                Score {healthScore}/100 • {research.marketSentiment}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                {isDeepSeek ? "deepseek" : "heuristic"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Telemetry grounded analysis based on {research.telemetrySnapshot?.scalingPagesCount ?? 0} scaling vs {research.telemetrySnapshot?.descalingPagesCount ?? 0} descaling pages
              {research.generatedAt && (
                <span className="ml-1 opacity-75">• {new Date(research.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={triggerGenerateResearch}
            disabled={generating}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
            title="Re-run market analysis with fresh telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
            <span>{generating ? "Analyzing..." : "Re-run Analysis"}</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-xs font-bold underline ml-2 cursor-pointer">Dismiss</button>
        </div>
      )}

      {isExpanded && (
        <div className="space-y-3.5 pt-1">
          {/* Key Metrics Quick Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80">
              <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Net Ad Momentum
              </div>
              <div className={`text-sm font-extrabold mt-0.5 flex items-center gap-1 ${isNetPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {isNetPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span>{isNetPositive ? `+${research.telemetrySnapshot?.netAdDelta ?? 0}` : `${research.telemetrySnapshot?.netAdDelta ?? 0}`} ads</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80">
              <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Scaling Pages
              </div>
              <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {research.telemetrySnapshot?.scalingPagesCount ?? 0} pages <span className="text-[11px] font-normal text-slate-500">(+{research.telemetrySnapshot?.totalAdsScaled ?? 0} ads)</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80">
              <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Descaling Pages
              </div>
              <div className="text-sm font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                {research.telemetrySnapshot?.descalingPagesCount ?? 0} pages <span className="text-[11px] font-normal text-slate-500">(-{research.telemetrySnapshot?.totalAdsDescaled ?? 0} ads)</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80">
              <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Format Share
              </div>
              <div className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 flex items-center gap-1">
                <Video className="w-3.5 h-3.5" />
                <span>{research.telemetrySnapshot?.videoPercent ?? 60}% Video / {research.telemetrySnapshot?.imagePercent ?? 40}% Image</span>
              </div>
            </div>
          </div>

          {/* Executive Overview */}
          <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            <span className="font-bold text-slate-900 dark:text-white mr-1.5">⚡ Executive Summary:</span>
            {research.executiveOverview}
          </div>

          {/* Velocity Dynamics & Creative Insights (2-Column Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Scaling vs Descaling Dynamics */}
            <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Scaling Velocity & Competition</span>
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Pressure: {research.velocityAnalysis?.competitivePressure ?? "Moderate"}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">
                {research.velocityAnalysis?.scalingVsDescalingSummary}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Churn Analysis: </span>
                {research.velocityAnalysis?.churnRateAssessment}
              </p>
            </div>

            {/* Creative Format & Platform Signals */}
            <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 space-y-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-indigo-500" />
                <span>Creative Format & CTA Signals</span>
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">
                {research.creativeFormatInsight?.videoDominanceNote}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-300">CTA Strategy: </span>
                {research.creativeFormatInsight?.topCtaRecommendation}
              </p>
            </div>
          </div>

          {/* Actionable Directives */}
          {research.actionableDirectives && research.actionableDirectives.length > 0 && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-slate-900/20 border border-indigo-500/20 space-y-2">
              <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-indigo-500" />
                <span>Actionable Directives for Media Buying</span>
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {research.actionableDirectives.map((directive, idx) => (
                  <li
                    key={idx}
                    className="p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800/60 text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-2 leading-relaxed"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <span>{directive}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Live Telemetry Grounding Snapshot */}
          <div className="flex items-center flex-wrap gap-2 pt-1 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Grounded in Live Telemetry:</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {research.telemetrySnapshot?.totalActiveAds?.toLocaleString() ?? 0} Total Active Ads
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {research.telemetrySnapshot?.newAdsLast7Days?.toLocaleString() ?? 0} New (7D)
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {research.telemetrySnapshot?.monitoredPages ?? 0} Monitored Stores
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {research.telemetrySnapshot?.stablePagesCount ?? 0} Stable Stores
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
