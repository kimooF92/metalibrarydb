"use client";

import { useState } from "react";
import {
  MapPin,
  Truck,
  TrendingUp,
  CreditCard,
  PhoneCall,
  CheckCircle2,
  Building,
  Compass,
} from "lucide-react";
import { Stage2SeasonalityAnalysis, TunisianSeasonalityContext } from "@/lib/opportunity-seeker";

interface RegionalDemandMapProps {
  strategy?: Stage2SeasonalityAnalysis["regionalDemandStrategy"];
  seasonalityCtx?: TunisianSeasonalityContext;
}

export function RegionalDemandMap({
  strategy,
  seasonalityCtx,
}: RegionalDemandMapProps) {
  const [selectedRegionIndex, setSelectedRegionIndex] = useState(0);

  if (!strategy || strategy.length === 0) return null;

  const demographics = seasonalityCtx?.regionalDemographics || [];

  return (
    <div className="w-full rounded-2xl p-5 bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md space-y-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Tunisian Regional Demand & COD Geography</span>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Governorate Targeting Rules
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Purchasing power, delivery timeframes, and consumer behavior guidelines across Grand Tunis, Sahel, Cap Bon, Sfax, and Interior Governorates.
            </p>
          </div>
        </div>
      </div>

      {/* Region Selector Pills */}
      <div className="flex items-center flex-wrap gap-2 pt-1 border-b border-slate-100 dark:border-slate-800 pb-3">
        {strategy.map((item, idx) => {
          const isActive = selectedRegionIndex === idx;
          return (
            <button
              key={idx}
              onClick={() => setSelectedRegionIndex(idx)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20 scale-[1.02]"
                  : "bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700"
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{item.region}</span>
            </button>
          );
        })}
      </div>

      {/* Active Region Deep Dive Card */}
      {strategy[selectedRegionIndex] && (
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/50 via-white to-slate-50 dark:from-slate-950 dark:via-emerald-950/20 dark:to-slate-900 border border-emerald-500/30 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {strategy[selectedRegionIndex].region}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  {demographics[selectedRegionIndex]?.purchasingPower || "Standard"} Purchasing Power
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                <strong className="text-slate-900 dark:text-white">Governorates: </strong>
                {Array.isArray(strategy[selectedRegionIndex].targetGovernorates)
                  ? (strategy[selectedRegionIndex].targetGovernorates as any).join(", ")
                  : strategy[selectedRegionIndex].targetGovernorates}
              </p>
            </div>

            <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
              <Truck className="w-3.5 h-3.5 text-emerald-500" />
              <span>{demographics[selectedRegionIndex]?.deliverySpeed || "24-48h Delivery"}</span>
            </div>
          </div>

          {/* Actionable Directive */}
          <div className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-emerald-500/20 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            <span className="font-bold text-slate-900 dark:text-white mr-1">📍 Strategic Media Buying Directive:</span>
            {strategy[selectedRegionIndex].actionableDirective}
          </div>

          {/* Hot Categories Tag Row */}
          <div className="flex items-center flex-wrap gap-2 text-xs pt-1">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Top Converting Categories:
            </span>
            {strategy[selectedRegionIndex].hotCategories.map((cat, cIdx) => (
              <span
                key={cIdx}
                className="px-2 py-0.5 text-xs font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* COD Economics Insight Banner */}
      {seasonalityCtx?.codEconomics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/70">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">COD Confirmation</span>
            <span className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 block">
              {seasonalityCtx.codEconomics.avgConfirmationRate}
            </span>
            <span className="text-[10px] text-slate-500">Call/WhatsApp verification</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/70">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Delivery Success</span>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {seasonalityCtx.codEconomics.avgDeliverySuccessRate}
            </span>
            <span className="text-[10px] text-slate-500">Aramex / Yalidine / First Delivery</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800/70">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">National Sweet Spot</span>
            <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 block">
              35 - 59 TND
            </span>
            <span className="text-[10px] text-slate-500">Optimal volume & low return friction</span>
          </div>
        </div>
      )}
    </div>
  );
}
