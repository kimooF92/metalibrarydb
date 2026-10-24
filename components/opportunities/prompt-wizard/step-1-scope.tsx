"use client";

import React from "react";
import { useWizard } from "./wizard-context";
import { TimeWindow } from "@/lib/opportunities/prompt-types";
import { Clock, Layers, Filter, Check, Loader2 } from "lucide-react";

const TIME_WINDOWS: { value: TimeWindow; label: string; desc: string }[] = [
  { value: "7d", label: "7 Days (Velocity)", desc: "Fastest breakout signals & recent ad tests" },
  { value: "14d", label: "14 Days (Balanced)", desc: "Campaign stability & sustained growth trends" },
  { value: "30d", label: "30 Days (Macro)", desc: "High-conviction catalog & seasonal durability" },
];

export function Step1Scope() {
  const { config, updateConfig, telemetry, loadingTelemetry } = useWizard();

  const toggleCategory = (cat: string) => {
    if (cat === "all") {
      updateConfig({ selectedCategories: ["all"] });
      return;
    }

    let next = config.selectedCategories.filter((c) => c !== "all");
    if (next.includes(cat)) {
      next = next.filter((c) => c !== cat);
      if (next.length === 0) next = ["all"];
    } else {
      next.push(cat);
    }
    updateConfig({ selectedCategories: next });
  };

  const isAllSelected = config.selectedCategories.includes("all");

  return (
    <div className="space-y-6">
      {/* Section 1: Time Window */}
      <div>
        <div className="flex items-center space-x-2 mb-3">
          <Clock className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Observation Time Window
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Select the timeframe used to evaluate ad volume growth, new campaigns, and descaling drops.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIME_WINDOWS.map((tw) => {
            const active = config.timeWindow === tw.value;
            return (
              <button
                key={tw.value}
                type="button"
                onClick={() => updateConfig({ timeWindow: tw.value })}
                className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                  active
                    ? "bg-indigo-500/10 border-indigo-500 text-slate-900 dark:text-slate-100 ring-1 ring-indigo-500"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{tw.label}</span>
                  {active && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{tw.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Category Scope */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Category Focus Matrix
            </h3>
          </div>
          {loadingTelemetry && (
            <span className="flex items-center text-[11px] text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              Loading categories...
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Include all categories or narrow your prompt down to specific high-potential niches.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center space-x-1.5 ${
              isAllSelected
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <span>All Categories</span>
            {telemetry && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isAllSelected ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                }`}
              >
                {telemetry.metrics.totalActiveAds} ads
              </span>
            )}
          </button>

          {telemetry?.categories.map((cat) => {
            const isSelected = !isAllSelected && config.selectedCategories.includes(cat.category);
            return (
              <button
                key={cat.category}
                type="button"
                onClick={() => toggleCategory(cat.category)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center space-x-1.5 ${
                  isSelected
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <span>{cat.category}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                  }`}
                >
                  {cat.activeAdsCount} ads
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: Volume Thresholds */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
        <div className="flex items-center space-x-2 mb-3">
          <Filter className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Niche Filtering Thresholds
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80">
            <div className="flex items-center justify-between text-xs font-medium mb-1.5">
              <span className="text-slate-700 dark:text-slate-300">Min. Active Ads per Niche</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                &ge; {config.minActiveAdsThreshold}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={config.minActiveAdsThreshold}
              onChange={(e) => updateConfig({ minActiveAdsThreshold: Number(e.target.value) })}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Filters out sub-niches with negligible active ad presence.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80">
            <div className="flex items-center justify-between text-xs font-medium mb-1.5">
              <span className="text-slate-700 dark:text-slate-300">Min. Competitor Stores</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                &ge; {config.minStoreCountThreshold}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={config.minStoreCountThreshold}
              onChange={(e) => updateConfig({ minStoreCountThreshold: Number(e.target.value) })}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Ensures multi-store validation rather than single-store anomalies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
