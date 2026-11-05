"use client";

import React from "react";
import { Sliders, Zap, Target, Flame, Settings2 } from "lucide-react";

export interface ScanDepthPickerProps {
  scanDepthPreset: "quick" | "balanced" | "deep" | "custom";
  onScanDepthPresetChange: (val: "quick" | "balanced" | "deep" | "custom") => void;
  customMaxAds: string;
  onCustomMaxAdsChange: (val: string) => void;
  customMaxScrolls: string;
  onCustomMaxScrollsChange: (val: string) => void;
  effectiveTargetMaxAds: number;
  effectiveMaxScrolls: number;
}

export function ScanDepthPicker({
  scanDepthPreset,
  onScanDepthPresetChange,
  customMaxAds,
  onCustomMaxAdsChange,
  customMaxScrolls,
  onCustomMaxScrollsChange,
  effectiveTargetMaxAds,
  effectiveMaxScrolls,
}: ScanDepthPickerProps) {
  return (
    <div className="space-y-1.5 pt-1">
      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-indigo-500" />
          Scan Depth Limit
        </span>
        <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-extrabold">
          {effectiveTargetMaxAds.toLocaleString()} ads · {effectiveMaxScrolls} scrolls max
        </span>
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => onScanDepthPresetChange("quick")}
          className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
            scanDepthPreset === "quick"
              ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-slate-900 dark:text-white shadow-xs ring-1 ring-indigo-500/30"
              : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <div className="font-extrabold text-xs flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Quick</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
            300 ads · 30 scrolls
          </div>
        </button>

        <button
          type="button"
          onClick={() => onScanDepthPresetChange("balanced")}
          className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
            scanDepthPreset === "balanced"
              ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-slate-900 dark:text-white shadow-xs ring-1 ring-indigo-500/30"
              : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <div className="font-extrabold text-xs flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Balanced</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
            1,000 ads · 75 scrolls
          </div>
        </button>

        <button
          type="button"
          onClick={() => onScanDepthPresetChange("deep")}
          className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
            scanDepthPreset === "deep"
              ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-slate-900 dark:text-white shadow-xs ring-1 ring-indigo-500/30"
              : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <div className="font-extrabold text-xs flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Deep</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
            2,500 ads · 150 scrolls
          </div>
        </button>

        <button
          type="button"
          onClick={() => onScanDepthPresetChange("custom")}
          className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
            scanDepthPreset === "custom"
              ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-slate-900 dark:text-white shadow-xs ring-1 ring-indigo-500/30"
              : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <div className="font-extrabold text-xs flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Custom</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
            Configure...
          </div>
        </button>
      </div>

      {scanDepthPreset === "custom" && (
        <div className="p-3 bg-slate-50 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3 animate-in fade-in duration-150">
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Target Ads Limit</label>
            <input
              type="number"
              min="50"
              max="10000"
              step="50"
              value={customMaxAds}
              onChange={(e) => onCustomMaxAdsChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Max Scroll Attempts</label>
            <input
              type="number"
              min="5"
              max="500"
              step="5"
              value={customMaxScrolls}
              onChange={(e) => onCustomMaxScrollsChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}

