"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  TrendingUp,
  ShieldAlert,
  Lightbulb,
  Video,
  RefreshCw,
  Tag,
  Clock,
  ChevronDown,
  ChevronUp,
  Cpu,
  CheckCircle2,
  PlayCircle,
  ExternalLink,
  Flame,
  ShoppingBag,
  Store,
  Users,
  Percent,
} from "lucide-react";
import { MarketForecastData, RecommendedProduct } from "@/lib/market-forecaster";

export function MarketForecastCard() {
  const [forecast, setForecast] = useState<MarketForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"products" | "macro">("products");
  const [error, setError] = useState<string | null>(null);

  // 1. Initial Load: Fetch ONLY previously saved forecast ($0 API cost)
  const fetchExistingForecast = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/analytics/forecast");
      if (res.ok) {
        const json = await res.json();
        if (json.exists && json.forecast) {
          setForecast(json.forecast);
        }
      }
    } catch (err: any) {
      console.error("Failed to load existing forecast:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExistingForecast();
  }, []);

  // 2. On-Demand Trigger: Call OpenRouter ONLY when user clicks the button
  const triggerGenerateForecast = async () => {
    try {
      setGenerating(true);
      setError(null);
      const res = await fetch("/api/analytics/forecast", {
        method: "POST",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate AI forecast");
      }

      const json = await res.json();
      if (json.forecast) {
        setForecast(json.forecast);
        setIsExpanded(true);
      }
    } catch (err: any) {
      console.error("Forecast Generation Error:", err);
      setError(err?.message || "Error generating forecast");
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

  // If no forecast has ever been generated yet, show the compact on-demand invitation banner
  if (!forecast) {
    return (
      <div className="w-full rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-slate-900/40 border border-indigo-500/20 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                DeepSeek AI Market Forecast & Top 10 Winning Products
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                deepseek-v4-pro
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                15–30 Days • Active Stores Only (5+ SKUs)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Rank the top 10 winning products and receive unit economics, bundle recommendations, and creative strategies on-demand.
            </p>
          </div>
        </div>

        <button
          onClick={triggerGenerateForecast}
          disabled={generating}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          {generating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing 15–30D Telemetry...</span>
            </>
          ) : (
            <>
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Generate AI Forecast</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const isDeepSeek = forecast.modelUsed?.toLowerCase().includes("deepseek");
  const winners = forecast.topWinningProducts || [];

  return (
    <div className="w-full rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-indigo-950/30 border border-indigo-500/20 dark:border-indigo-500/30 backdrop-blur-xl shadow-sm space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
                AI Market Intelligence & Top 10 Winning Products
              </h2>
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                <Cpu className="w-3 h-3 text-indigo-500" />
                <span>{isDeepSeek ? "DeepSeek v4-pro Engine" : "OpenRouter AI"}</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                15–30 Days • Active Stores (5+ SKUs)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center space-x-1.5">
              <span>Model: <code className="text-indigo-600 dark:text-indigo-300 font-mono text-[10px]">{forecast.modelUsed}</code></span>
              <span>•</span>
              <Clock className="w-3 h-3 text-slate-400 inline" />
              <span>Generated {new Date(forecast.generatedAt).toLocaleDateString([], { month: "short", day: "numeric" })} at {new Date(forecast.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            onClick={triggerGenerateForecast}
            disabled={generating}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 ${generating ? "animate-spin" : ""}`} />
            <span>{generating ? "Analyzing 15-30D Telemetry..." : "Re-run Forecast"}</span>
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

      {/* Macro Sentiment & Health Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3.5 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80">
        <div className="md:col-span-3 space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Macro Outlook</span>
            <span className={`px-2 py-0.5 text-xs font-extrabold rounded-lg ${
              forecast.marketSentiment.includes("Bullish")
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : forecast.marketSentiment.includes("Saturated")
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
            }`}>
              {forecast.marketSentiment}
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
            {forecast.trendSummary}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-500/20">
          <span className="text-[10px] text-indigo-600 dark:text-indigo-300 uppercase font-bold tracking-wider">Market Health Score</span>
          <div className="flex items-baseline space-x-0.5 mt-0.5">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{forecast.marketHealthScore}</span>
            <span className="text-xs text-indigo-500 font-bold">/100</span>
          </div>
        </div>
      </div>

      {/* View Switcher: Top 10 Winning Products vs Strategic Macro */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800/80 pb-2">
        <button
          onClick={() => setActiveTab("products")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "products"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>Top 10 Winning Products (15–30D)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-mono">
            {winners.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("macro")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "macro"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Niches & Sourcing Directives</span>
        </button>
      </div>

      {/* Expandable Deep Content */}
      {isExpanded && (
        <div className="space-y-4 pt-1">
          {/* TAB 1: TOP 10 RECOMMENDED WINNING PRODUCTS */}
          {activeTab === "products" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  AI-Selected High-Velocity Products from Stores with ≥5 Active Products
                </span>
                <span className="text-[11px] font-mono">Ranked by DeepSeek v4-pro</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {winners.map((product, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-3 shadow-2xs"
                  >
                    {/* Header: Thumbnail + Title + Store + Ad Count */}
                    <div className="flex items-start space-x-3">
                      {/* Product Thumbnail */}
                      <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 overflow-hidden shrink-0 flex items-center justify-center">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback on broken image
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <ShoppingBag className="w-6 h-6 text-slate-400" />
                        )}
                      </div>

                      {/* Info & Badges */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 truncate max-w-[140px]">
                            {product.category || "General"}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            {product.activeAdsCount} Active Ads
                          </span>
                        </div>

                        <h3 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1" title={product.title}>
                          {idx + 1}. {product.title}
                        </h3>

                        <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-900 dark:text-indigo-300 font-mono">
                            {product.currentPrice || "N/A"}
                          </span>
                          <span>•</span>
                          <span className="flex items-center space-x-1 font-mono text-[10px] truncate">
                            <Store className="w-3 h-3 text-slate-400 inline" />
                            <span>{product.domain}</span>
                          </span>
                          {product.productUrl && (
                            <a
                              href={product.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-500 hover:text-indigo-400 inline-flex items-center"
                              title="View product store"
                            >
                              <ExternalLink className="w-3 h-3 ml-0.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* AI Strategic Analysis Box */}
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80 space-y-1.5 text-[11px]">
                      {/* Winning Reason */}
                      <div className="text-slate-700 dark:text-slate-300 leading-snug">
                        <strong className="text-indigo-600 dark:text-indigo-400">Why It&apos;s Winning:</strong>{" "}
                        {product.winningReason}
                      </div>

                      {/* Offer Strategy & Audience */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-slate-200/50 dark:border-slate-800/60 text-[10px]">
                        <div className="flex items-start space-x-1 text-slate-600 dark:text-slate-400">
                          <Percent className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                          <span className="truncate">
                            <strong className="text-slate-700 dark:text-slate-300">Offer:</strong> {product.suggestedOfferStrategy}
                          </span>
                        </div>
                        <div className="flex items-start space-x-1 text-slate-600 dark:text-slate-400">
                          <Users className="w-3 h-3 text-cyan-500 shrink-0 mt-0.5" />
                          <span className="truncate">
                            <strong className="text-slate-700 dark:text-slate-300">Audience:</strong> {product.targetAudience}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: MACRO STRATEGY & SOURCING DIRECTIVES */}
          {activeTab === "macro" && (
            <div className="space-y-4">
              {/* 3 Pillars Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. High-Velocity Niches */}
                <div className="p-3.5 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Top Scaling Niches (7-Day)</span>
                  </div>
                  <div className="space-y-2">
                    {forecast.risingNiches.map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{item.niche}</span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            {item.velocityScore} Vel.
                          </span>
                        </div>
                        <div className="flex items-center space-x-1 text-[10px] text-indigo-600 dark:text-indigo-300 font-mono">
                          <Tag className="w-3 h-3 text-indigo-500" />
                          <span>Target: {item.suggestedPriceRange}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{item.reasoning}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Saturation & Fatigue Alerts */}
                <div className="p-3.5 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-bold text-xs">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Fatigue & Competition Risks</span>
                  </div>
                  <div className="space-y-2">
                    {forecast.saturationWarnings.map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-amber-500/10 dark:border-amber-500/20 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.nicheOrProduct}</span>
                          <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            {item.warningLevel} Risk
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{item.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Creative Playbook */}
                <div className="p-3.5 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center space-x-1.5 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                    <Video className="w-3.5 h-3.5" />
                    <span>Winning Creative Angles</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-500/20 text-xs text-indigo-900 dark:text-indigo-200 space-y-2">
                    <div className="flex items-center justify-between font-bold">
                      <span>Format: {forecast.creativeRecommendations.recommendedFormat}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-indigo-500/20 rounded text-indigo-600 dark:text-indigo-300">
                        CTA: {forecast.creativeRecommendations.dominantCTA}
                      </span>
                    </div>
                    <div className="space-y-1 border-t border-indigo-200/60 dark:border-indigo-500/20 pt-1.5">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Top Hook Angles:</span>
                      <ul className="space-y-1">
                        {forecast.creativeRecommendations.suggestedHooks.map((hook, idx) => (
                          <li key={idx} className="text-[11px] text-slate-700 dark:text-slate-300 flex items-start space-x-1.5 leading-snug">
                            <span className="text-indigo-500 font-bold">•</span>
                            <span>&ldquo;{hook}&rdquo;</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sourcing & Scaling Action Directives */}
              <div className="p-3.5 rounded-xl bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-500/20 space-y-2">
                <div className="flex items-center space-x-1.5 text-indigo-600 dark:text-indigo-300 font-bold text-xs">
                  <Lightbulb className="w-3.5 h-3.5 text-indigo-500" />
                  <span>DeepSeek Strategic Directives for Media Buyers & Sourcing</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {forecast.actionableInsights.map((insight, idx) => (
                    <div key={idx} className="text-xs text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-950/50 p-2.5 rounded-lg border border-slate-200/70 dark:border-slate-800/80 flex items-start space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                      <span className="leading-snug">{insight}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
