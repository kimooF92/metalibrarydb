"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  TrendingUp,
  Lightbulb,
  Video,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Cpu,
  PlayCircle,
  Compass,
  DollarSign,
  Calendar,
  CheckCircle2,
  Zap,
  Target,
  Layers,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { MarketOpportunityResearch } from "@/lib/market-forecaster";

export function MarketForecastCard() {
  const [research, setResearch] = useState<MarketOpportunityResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"opportunities" | "playbook" | "roadmap">("opportunities");
  const [error, setError] = useState<string | null>(null);

  // 1. Initial Load: Fetch ONLY previously saved research ($0 API cost)
  const fetchExistingResearch = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/analytics/forecast");
      if (res.ok) {
        const json = await res.json();
        if (json.exists && json.forecast) {
          setResearch(json.forecast);
        }
      }
    } catch (err: any) {
      console.error("Failed to load existing research:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExistingResearch();
  }, []);

  // 2. On-Demand Trigger: Call OpenRouter DeepSeek v4 pro ONLY when user clicks the button
  const triggerGenerateResearch = async () => {
    try {
      setGenerating(true);
      setError(null);
      const res = await fetch("/api/analytics/forecast", {
        method: "POST",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate market opportunity research");
      }

      const json = await res.json();
      if (json.forecast) {
        setResearch(json.forecast);
        setIsExpanded(true);
      }
    } catch (err: any) {
      console.error("Research Generation Error:", err);
      setError(err?.message || "Error generating market research");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
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
      <div className="w-full rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-slate-900/40 border border-indigo-500/20 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                DeepSeek AI Market Opportunity Deep Dive & Strategy
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                deepseek-v4-pro
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                Wave Strategy • Untapped Gaps • Unit Economics
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Analyze the 5 top winning market drivers, formulate high-growth opportunity vectors, and build the 14-day scaling roadmap on demand.
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
              <span>Analyzing Market Wave Dynamics...</span>
            </>
          ) : (
            <>
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Generate Market Deep Dive</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const isDeepSeek = research.modelUsed?.toLowerCase().includes("deepseek");

  return (
    <div className="w-full rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-indigo-950/30 border border-indigo-500/20 dark:border-indigo-500/30 backdrop-blur-xl shadow-sm space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Compass className="w-4 h-4 animate-pulse text-indigo-500" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
                Market Opportunity Deep Dive & Strategic Blueprint
              </h2>
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                <Cpu className="w-3 h-3 text-indigo-500" />
                <span>{isDeepSeek ? "DeepSeek v4-pro Engine" : "OpenRouter AI"}</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                5 Wave Drivers • Strategy Playbook
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center space-x-1.5">
              <span>Model: <code className="text-indigo-600 dark:text-indigo-300 font-mono text-[10px]">{research.modelUsed}</code></span>
              <span>•</span>
              <Clock className="w-3 h-3 text-slate-400 inline" />
              <span>Generated {new Date(research.generatedAt).toLocaleDateString([], { month: "short", day: "numeric" })} at {new Date(research.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            onClick={triggerGenerateResearch}
            disabled={generating}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 ${generating ? "animate-spin" : ""}`} />
            <span>{generating ? "Deep Diving Market Dynamics..." : "Re-run Strategy Deep Dive"}</span>
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-pointer"
            aria-label="Toggle details"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Executive Macro Summary & Market Health Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3.5 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
        <div className="md:col-span-3 space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Executive Market Synthesis</span>
            <span className={`px-2 py-0.5 text-xs font-extrabold rounded-lg ${
              research.marketSentiment.includes("Bullish")
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : research.marketSentiment.includes("Saturated")
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
            }`}>
              {research.marketSentiment}
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
            {research.executiveSummary}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-500/20">
          <span className="text-[10px] text-indigo-600 dark:text-indigo-300 uppercase font-bold tracking-wider">Opportunity Index</span>
          <div className="flex items-baseline space-x-0.5 mt-0.5">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{research.marketHealthScore}</span>
            <span className="text-xs text-indigo-500 font-bold">/100</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800/80 pb-2">
        <button
          onClick={() => setActiveTab("opportunities")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "opportunities"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Market Opportunities & Wave Drivers</span>
        </button>

        <button
          onClick={() => setActiveTab("playbook")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "playbook"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          <span>Economics & Media Buying Playbook</span>
        </button>

        <button
          onClick={() => setActiveTab("roadmap")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "roadmap"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
          <span>14-Day Tactical Execution Roadmap</span>
        </button>
      </div>

      {/* Expandable Deep Content */}
      {isExpanded && (
        <div className="space-y-4 pt-1">
          {/* TAB 1: OPPORTUNITIES & 5 WAVE DRIVERS */}
          {activeTab === "opportunities" && (
            <div className="space-y-4">
              {/* Wave Drivers Box */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-slate-900/30 border border-indigo-500/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      🌊 The 5 Wave Drivers (Why Current Winners Dominate)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    Sweet-Spot: {research.waveDriversAnalysis?.averageWinningPriceRange || "25 - 55 TND"}
                  </span>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                  {research.waveDriversAnalysis?.underlyingPattern}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-indigo-500/10">
                  {(research.waveDriversAnalysis?.consumerTriggers || []).map((trigger, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-white/70 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/80 text-[11px] text-slate-700 dark:text-slate-300 flex items-start space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{trigger}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* High-Growth Market Opportunity Vectors */}
              <div className="space-y-2.5">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <Target className="w-4 h-4 text-emerald-500" />
                  <span>Unexploited Market Opportunities & Gaps</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(research.unexploitedOpportunities || []).map((opp, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 space-y-2 flex flex-col justify-between shadow-2xs hover:border-indigo-500/30 transition-all"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {opp.potentialScore}/100 Potential
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[130px]">
                            {opp.targetNiche}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          {opp.opportunityName}
                        </h4>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          <strong className="text-rose-500">Market Gap:</strong> {opp.marketGap}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-500/20 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                          Launch Entry Strategy
                        </span>
                        <p className="leading-snug">{opp.entryStrategy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: UNIT ECONOMICS & MEDIA BUYING PLAYBOOK */}
          {activeTab === "playbook" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Unit Economics & Landed Cost Blueprint */}
              <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                  <span>Unit Economics & COD Blueprint</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Target Margin Multiplier</span>
                    <p className="font-extrabold text-slate-900 dark:text-white font-mono text-sm">
                      {research.unitEconomicsBlueprint?.targetCogsMultiplier}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Optimal Price Bands</span>
                    <p className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-xs">
                      {research.unitEconomicsBlueprint?.optimalPriceBands}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">85%+ COD Delivery Rate Tactics</span>
                  <div className="space-y-1">
                    {(research.unitEconomicsBlueprint?.codDeliveryTactics || []).map((tactic, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800/80 text-[11px] text-slate-700 dark:text-slate-300 flex items-start space-x-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{tactic}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-500/20 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Bundle & Upsell Architecture</span>
                  <p className="text-[11px] leading-snug">{research.unitEconomicsBlueprint?.bundleArchitecture}</p>
                </div>
              </div>

              {/* Media Buying & Creative Scaling Strategy */}
              <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center space-x-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  <Video className="w-4 h-4" />
                  <span>Media Buying & Creative Playbook</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Recommended Format</span>
                    <p className="font-bold text-slate-900 dark:text-white text-xs">
                      {research.mediaBuyingStrategy?.recommendedFormat}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Testing Budget Split</span>
                    <p className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-xs">
                      {research.mediaBuyingStrategy?.testingBudgetSplit}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top High-Converting Hook Formulas</span>
                  <div className="space-y-1">
                    {(research.mediaBuyingStrategy?.winningHookScripts || []).map((hook, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-500/20 text-[11px] text-slate-700 dark:text-slate-300 flex items-start space-x-1.5">
                        <span className="text-indigo-500 font-bold font-mono">#{idx + 1}</span>
                        <span className="leading-snug italic">&ldquo;{hook}&rdquo;</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-500/20 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">Creative Fatigue Defense</span>
                  <p className="text-[11px] leading-snug">{research.mediaBuyingStrategy?.fatigueDefensePlan}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 14-DAY TACTICAL EXECUTION ROADMAP */}
          {activeTab === "roadmap" && (
            <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                <Calendar className="w-4 h-4" />
                <span>14-Day Step-by-Step Market Scaling Roadmap</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Phase 1 */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      Phase 1: Day 1–3
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Validation & Angle Testing</h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {research.executionRoadmap?.phase1_Day1to3}
                  </p>
                </div>

                {/* Phase 2 */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                      Phase 2: Day 4–7
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Horizontal Scaling & Offer Polish</h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {research.executionRoadmap?.phase2_Day4to7}
                  </p>
                </div>

                {/* Phase 3 */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Phase 3: Day 8–14
                    </span>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Vertical Scale & Recovery</h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {research.executionRoadmap?.phase3_Day8to14}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
