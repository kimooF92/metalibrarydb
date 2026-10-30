"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  ShoppingBag,
  Search,
  Flame,
  FileText,
  Clock,
} from "lucide-react";
import { UnifiedOpportunityReport } from "@/lib/opportunities";
import { SeasonalCalendarRadar } from "@/components/opportunities/seasonal-calendar-radar";
import { ProductOpportunityCard } from "@/components/opportunities/product-opportunity-card";
import { NicheMatrix } from "@/components/opportunities/niche-matrix";
import { RedFlagAlerts } from "@/components/opportunities/red-flag-alerts";
import { PromptWizard } from "@/components/opportunities/prompt-wizard";
import { useWorkspace } from "@/components/workspace-context";

type OpportunityViewTab = "wizard" | "archived";

export default function OpportunitiesPage() {
  const { activeWorkspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<OpportunityViewTab>("wizard");
  const [report, setReport] = useState<UnifiedOpportunityReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);

  // Filters for archived reports
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPriceBand, setSelectedPriceBand] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Read-only GET for archived opportunity reports ($0 AI spend, strictly saved reports)
  useEffect(() => {
    let ignore = false;
    const workspaceId = activeWorkspace?.id;

    const loadData = async () => {
      if (!workspaceId) {
        if (!ignore) setLoadingReport(false);
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
          setLoadingReport(false);
        }
      }
    };

    void loadData();

    return () => {
      ignore = true;
    };
  }, [activeWorkspace?.id]);

  // Filter products in archived report
  const availableCategories = useMemo(() => {
    if (!report?.productBlueprints?.highConvictionProducts) return [];
    const set = new Set<string>();
    report.productBlueprints.highConvictionProducts.forEach((p) => {
      if (p.niche) set.add(p.niche);
    });
    return Array.from(set);
  }, [report]);

  const filteredProducts = useMemo(() => {
    if (!report?.productBlueprints?.highConvictionProducts) return [];

    return report.productBlueprints.highConvictionProducts.filter((p) => {
      if (selectedCategory !== "all" && p.niche?.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }

      const price = p.recommendedPriceTND || 0;
      if (selectedPriceBand === "under_50" && price >= 50) return false;
      if (selectedPriceBand === "50_80" && (price < 50 || price > 80)) return false;
      if (selectedPriceBand === "80_plus" && price <= 80) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = p.productName?.toLowerCase().includes(q);
        const hookMatch = p.creativeBlueprint?.hookDarijaFrench?.toLowerCase().includes(q);
        if (!titleMatch && !hookMatch) return false;
      }

      return true;
    });
  }, [report, selectedCategory, selectedPriceBand, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* View Switcher Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab("wizard")}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "wizard"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Research Wizard</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("archived")}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "archived"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Saved Reports</span>
            {report && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Saved
              </span>
            )}
          </button>
        </div>

        <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          <span>Active Workspace: <strong>{activeWorkspace?.name || "Tunisia"}</strong></span>
        </div>
      </div>

      {/* Mode 1: Frontier AI Prompt Wizard (Primary) */}
      {activeTab === "wizard" && <PromptWizard />}

      {/* Mode 2: Archived Reports (Secondary / Backward-Compatible) */}
      {activeTab === "archived" && (
        <div className="space-y-6">
          {!report && !loadingReport && (
            <div className="glass-card rounded-2xl p-12 border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 text-center space-y-3">
              <ShoppingBag className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                No Saved Reports Found
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Use the Research Wizard to create comprehensive market research prompts tailored for ChatGPT or Claude.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("wizard")}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-sm cursor-pointer mt-2"
              >
                Open Research Wizard
              </button>
            </div>
          )}

          {report && (
            <>
              {/* Seasonality Radar */}
              <SeasonalCalendarRadar
                seasonality={report.seasonality}
                seasonalityCtx={report.seasonalityContext}
              />

              {/* High-Conviction Product Blueprints */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Flame className="w-4 h-4 text-indigo-500" />
                      <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                        Saved Product Opportunities
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Recommended products with local pricing, ad hooks, and estimated profit margins.
                    </p>
                  </div>

                  {/* Filters Bar */}
                  <div className="flex items-center flex-wrap gap-2">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>
                )}
              </div>

              {/* Niche Matrix */}
              <NicheMatrix niches={report.nicheAnalysis?.rankedNiches || []} />

              {/* Red Flag Alerts */}
              <RedFlagAlerts
                redFlags={report.nicheAnalysis?.redFlagNiches}
                directives={report.productBlueprints?.winningAngleDirectives}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
