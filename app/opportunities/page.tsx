"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  ShoppingBag,
  RefreshCw,
  Search,
  Flame,
  AlertTriangle,
} from "lucide-react";
import { UnifiedOpportunityReport } from "@/lib/opportunities";
import { OpportunityHero } from "@/components/opportunities/opportunity-hero";
import { SeasonalCalendarRadar } from "@/components/opportunities/seasonal-calendar-radar";
import { ProductOpportunityCard } from "@/components/opportunities/product-opportunity-card";
import { NicheMatrix } from "@/components/opportunities/niche-matrix";
import { RegionalDemandMap } from "@/components/opportunities/regional-demand-map";
import { RedFlagAlerts } from "@/components/opportunities/red-flag-alerts";
import { useWorkspace } from "@/components/workspace-context";

export default function OpportunitiesPage() {
  const { activeWorkspace } = useWorkspace();
  const [report, setReport] = useState<UnifiedOpportunityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPriceBand, setSelectedPriceBand] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 1. Initial Load: Strictly read-only GET for the active workspace ($0 AI spend, no ?auto=true)
  useEffect(() => {
    let ignore = false;
    const workspaceId = activeWorkspace?.id;

    const loadData = async () => {
      if (!workspaceId) {
        if (!ignore) setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/analytics/opportunities", {
          headers: { "x-workspace-id": workspaceId },
          cache: "no-store",
        });
        if (ignore) return;

        if (res.ok) {
          const json = await res.json();
          setReport(json.report || null);
        } else {
          setReport(null);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Failed to load saved opportunity report:", err);
          setReport(null);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      ignore = true;
    };
  }, [activeWorkspace?.id]);

  // 2. On-Demand Generator Trigger (Strictly user-initiated POST to MiniMax pipeline)
  const handleGenerate = async () => {
    if (generating) return;

    try {
      setGenerating(true);
      setError(null);

      const headers: Record<string, string> = {};
      if (activeWorkspace?.id) {
        headers["x-workspace-id"] = activeWorkspace.id;
      }

      const res = await fetch("/api/analytics/opportunities", {
        method: "POST",
        headers,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.message || json.error || "Failed to generate market opportunities");
      }

      if (json.report) {
        setReport(json.report);
      }
    } catch (err: unknown) {
      console.error("Opportunity Generation Error:", err);
      setError((err as Error)?.message || "Error synthesizing market opportunities");
    } finally {
      setGenerating(false);
    }
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!report?.productBlueprints?.highConvictionProducts) return [];

    return report.productBlueprints.highConvictionProducts.filter((p) => {
      // Category filter
      if (selectedCategory !== "all" && !p.niche.toLowerCase().includes(selectedCategory.toLowerCase())) {
        return false;
      }
      // Price band filter
      if (selectedPriceBand === "under_50" && p.recommendedPriceTND >= 50) return false;
      if (selectedPriceBand === "50_80" && (p.recommendedPriceTND < 50 || p.recommendedPriceTND > 80)) return false;
      if (selectedPriceBand === "80_plus" && p.recommendedPriceTND <= 80) return false;

      // Search query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchesName = p.productName.toLowerCase().includes(q);
        const matchesNiche = p.niche.toLowerCase().includes(q);
        const matchesHook = p.creativeBlueprint?.hookDarijaFrench?.toLowerCase().includes(q);
        if (!matchesName && !matchesNiche && !matchesHook) return false;
      }

      return true;
    });
  }, [report, selectedCategory, selectedPriceBand, searchQuery]);

  // Categories list for filter pills
  const availableCategories = useMemo(() => {
    if (!report?.nicheAnalysis?.rankedNiches) return [];
    return report.nicheAnalysis.rankedNiches.map((n) => n.niche);
  }, [report]);

  return (
    <div className="h-full overflow-y-auto space-y-6 pb-16 pr-1 text-slate-900 dark:text-slate-100">
      {/* Top Banner & Hero */}
      <OpportunityHero
        report={report}
        generating={generating}
        onGenerate={handleGenerate}
      />

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </span>
          <button
            onClick={() => setError(null)}
            className="text-xs font-bold underline ml-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading Read State */}
      {loading && !report && (
        <div className="w-full space-y-4 animate-pulse">
          <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-56 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
            <div className="h-56 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          </div>
        </div>
      )}

      {/* On-Demand Welcome / Explicit Empty State */}
      {!loading && !report && (
        <div className="w-full rounded-2xl p-8 sm:p-12 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/50 dark:from-slate-900/80 dark:via-slate-900/40 dark:to-indigo-950/20 border border-indigo-500/20 text-center space-y-4 shadow-sm max-w-3xl mx-auto my-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              Ready to Seek Market Opportunities {activeWorkspace?.name ? `for ${activeWorkspace.name}` : "in Tunisia"}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
              This engine runs strictly <strong>on-demand</strong> powered by MiniMax AI (<code className="text-indigo-600 dark:text-indigo-400 font-mono">minimax-m3.1-flash</code>). Click below to synthesize live creative scaling velocity, catalog price sweet-spots, clone saturation, and seasonal dynamics.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-sm font-extrabold shadow-lg shadow-indigo-500/25 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
            <span>
              {generating
                ? "Analyzing Live Market (3-Stage MiniMax AI)..."
                : "🚀 Launch On-Demand Opportunity Analysis"}
            </span>
          </button>
        </div>
      )}

      {report && (
        <>
          {/* Section 1: Tunisian Seasonality & Consumer Wave Radar */}
          <SeasonalCalendarRadar
            seasonality={report.seasonality}
            seasonalityCtx={report.seasonalityContext}
          />

          {/* Section 2: High-Conviction Product Testing Blueprints */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                    High-Conviction Products to Test Right Now
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Data-grounded testing recipes with realistic TND pricing, Darija/French hooks, and margin forecasts.
                </p>
              </div>

              {/* Filters Bar */}
              <div className="flex items-center flex-wrap gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search product or hook..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-44 sm:w-56 pl-8 pr-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-200"
                  />
                </div>

                {/* Price Band Filter */}
                <select
                  value={selectedPriceBand}
                  onChange={(e) => setSelectedPriceBand(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  <option value="all">All Prices</option>
                  <option value="under_50">Under 50 DT</option>
                  <option value="50_80">50 - 80 DT</option>
                  <option value="80_plus">80+ DT</option>
                </select>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center flex-wrap gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-3 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  selectedCategory === "all"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                }`}
              >
                All Niches
              </button>
              {availableCategories.map((cat, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    selectedCategory === cat
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Products Grid */}
            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {filteredProducts.map((prod, idx) => (
                  <ProductOpportunityCard
                    key={prod.id || idx}
                    product={prod}
                    rankIndex={idx}
                  />
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                <ShoppingBag className="w-8 h-8 text-slate-400 mx-auto" />
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  No products matched the current filters
                </h3>
                <p className="text-[11px] text-slate-500">
                  Try clearing the search query or selecting &quot;All Niches&quot;.
                </p>
                <button
                  onClick={() => {
                    setSelectedCategory("all");
                    setSelectedPriceBand("all");
                    setSearchQuery("");
                  }}
                  className="px-3 py-1 text-xs font-bold rounded-lg bg-indigo-600 text-white shadow-xs cursor-pointer mt-2"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>

          {/* Section 3: Niche Opportunity & Saturation Radar Matrix */}
          <NicheMatrix niches={report.nicheAnalysis?.rankedNiches || []} />

          {/* Section 4: Tunisian Regional Demand & COD Geography Map */}
          <RegionalDemandMap
            strategy={report.seasonality?.regionalDemandStrategy}
            seasonalityCtx={report.seasonalityContext}
          />

          {/* Section 5: Red Flag Alerts & Direct-Response Directives */}
          <RedFlagAlerts
            redFlags={report.nicheAnalysis?.redFlagNiches}
            directives={report.productBlueprints?.winningAngleDirectives}
          />
        </>
      )}
    </div>
  );
}
