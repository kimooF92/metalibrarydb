"use client";

import React from "react";
import { useWizard } from "./wizard-context";
import { DollarSign, Percent, Truck, Calculator } from "lucide-react";

const PRICE_TIERS = [
  { id: "< 30 TND", label: "< 30 TND", sub: "Micro-impulse / High refusal risk" },
  { id: "30 - 59.99 TND", label: "30 - 59.99 TND", sub: "National Volume Sweet Spot" },
  { id: "60 - 99.99 TND", label: "60 - 99.99 TND", sub: "Mid-Ticket Bundles" },
  { id: "100+ TND", label: "100+ TND", sub: "High-Ticket / Call confirmation" },
];

export function Step3CodParameters() {
  const { config, updateConfig } = useWizard();
  const cod = config.codParameters;

  const togglePriceBand = (tierId: string) => {
    let next = [...cod.targetPriceBands];
    if (next.includes(tierId)) {
      next = next.filter((id) => id !== tierId);
      if (next.length === 0) next = [tierId]; // Always keep at least one
    } else {
      next.push(tierId);
    }
    updateConfig({
      codParameters: { ...cod, targetPriceBands: next },
    });
  };

  const updateCod = (updates: Partial<typeof cod>) => {
    updateConfig({
      codParameters: { ...cod, ...updates },
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Target Price Bands */}
      <div>
        <div className="flex items-center space-x-2 mb-2">
          <DollarSign className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Target Price Ranges
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Select which price ranges the AI should focus on for product recommendations.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PRICE_TIERS.map((tier) => {
            const isChecked = cod.targetPriceBands.includes(tier.id);
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => togglePriceBand(tier.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isChecked
                    ? "bg-indigo-500/10 border-indigo-500 text-slate-900 dark:text-slate-100 ring-1 ring-indigo-500"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{tier.label}</span>
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                      isChecked
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    {isChecked ? "✓" : ""}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{tier.sub}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Margin Goal */}
      <div>
        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-2">
          Target Profit per Delivered Order
        </h4>
        <div className="flex items-center gap-3">
          {[15, 25, 35].map((margin) => {
            const active = cod.minUnitMarginTnd === margin;
            return (
              <button
                key={margin}
                type="button"
                onClick={() => updateCod({ minUnitMarginTnd: margin })}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  active
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                }`}
              >
                {margin} TND / unit
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Operational Friction Variables */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center space-x-2">
          <Truck className="w-4 h-4 text-indigo-500" />
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Cash-on-Delivery Assumptions
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-400">Order Confirmation</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {cod.confirmationRatePct}%
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={cod.confirmationRatePct}
              onChange={(e) => updateCod({ confirmationRatePct: Number(e.target.value) })}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-400">Successful Delivery</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {cod.deliveryRatePct}%
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="90"
              step="5"
              value={cod.deliveryRatePct}
              onChange={(e) => updateCod({ deliveryRatePct: Number(e.target.value) })}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-400">Return Cost Buffer</span>
              <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                {cod.returnBufferTnd} TND / return
              </span>
            </div>
            <input
              type="range"
              min="4"
              max="15"
              step="1"
              value={cod.returnBufferTnd}
              onChange={(e) => updateCod({ returnBufferTnd: Number(e.target.value) })}
              className="w-full accent-rose-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Formula Callout */}
        <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 flex items-start space-x-2.5">
          <Calculator className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
          <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Estimated Profit Calculation:
            </span>
            <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
              Est. Net Profit = (Selling Price * Conf% * Del%) - COGS - (Selling Price * Conf% * (1 - Del%) * ReturnBuffer) - Est. AdCost
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
