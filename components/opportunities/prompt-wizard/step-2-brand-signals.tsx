"use client";

import React from "react";
import { useWizard } from "./wizard-context";
import { TrendingUp, TrendingDown, ShieldAlert, Check } from "lucide-react";

export function Step2BrandSignals() {
  const { config, updateConfig, telemetry } = useWizard();

  const scalingCount = telemetry?.metrics.scalingBrandsCount || 0;
  const descalingCount = telemetry?.metrics.descalingBrandsCount || 0;
  const cloneTrapCount = telemetry?.metrics.saturatedClonesCount || 0;

  return (
    <div className="space-y-6">
      {/* 1. Scaling Brands */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Include Scaling Brands
                <span className="text-[10px] font-mono font-bold bg-teal-500/10 text-teal-700 dark:text-teal-400 px-2 py-0.5 rounded-full">
                  {scalingCount} brands scaling
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Includes brands actively adding new ads in your chosen timeframe.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.includeScalingBrands}
              onChange={(e) => updateConfig({ includeScalingBrands: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
          </label>
        </div>

        {config.includeScalingBrands && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Sample Limit:
            </span>
            {[10, 25, 50].map((limit) => {
              const active = config.scalingBrandsLimit === limit;
              return (
                <button
                  key={limit}
                  type="button"
                  onClick={() => updateConfig({ scalingBrandsLimit: limit })}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    active
                      ? "bg-teal-500/10 border-teal-500 text-teal-700 dark:text-teal-300"
                      : "bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  Top {limit}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Descaling & Fatigue Brands */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Include Brands Cutting Ads (Ad Fatigue)
                <span className="text-[10px] font-mono font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-full">
                  {descalingCount} brands cutting ads
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Helps the AI identify worn-out ad angles and shrinking margins.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.includeDescalingBrands}
              onChange={(e) => updateConfig({ includeDescalingBrands: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
          </label>
        </div>
      </div>

      {/* 3. Clone Traps & Commoditized Products */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Flag Over-Saturated Products
                <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                  {cloneTrapCount} detected traps
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Warns the AI about generic products caught in low-price wars so it avoids recommending them.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.includeCloneTraps}
              onChange={(e) => updateConfig({ includeCloneTraps: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
          </label>
        </div>
      </div>
    </div>
  );
}
