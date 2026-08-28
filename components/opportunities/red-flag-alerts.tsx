"use client";

import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Zap,
  Info,
  Flame,
} from "lucide-react";
import { Stage1NicheAnalysis, Stage3ProductBlueprints } from "@/lib/opportunity-seeker";

interface RedFlagAlertsProps {
  redFlags?: Stage1NicheAnalysis["redFlagNiches"];
  directives?: Stage3ProductBlueprints["winningAngleDirectives"];
}

export function RedFlagAlerts({ redFlags, directives }: RedFlagAlertsProps) {
  if ((!redFlags || redFlags.length === 0) && (!directives || directives.length === 0)) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Red Flag Caution Box */}
      {redFlags && redFlags.length > 0 && (
        <div className="rounded-2xl p-5 bg-rose-500/[0.04] dark:bg-rose-950/20 border border-rose-500/20 backdrop-blur-md space-y-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Red Ocean Alerts & Niches to Avoid</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  Caution
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Products experiencing aggressive copycat price wars, ad fatigue, or high COD return rates.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {redFlags.map((flag, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-rose-500/20 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                    ⚠️ {flag.niche}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                  {flag.riskReason}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                  <strong className="text-slate-600 dark:text-slate-300">Churn Note: </strong>
                  {flag.descalingRateNote}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actionable Winning Directives Box */}
      {directives && directives.length > 0 && (
        <div className="rounded-2xl p-5 bg-indigo-500/[0.04] dark:bg-indigo-950/20 border border-indigo-500/20 backdrop-blur-md space-y-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Direct-Response Execution Directives</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                  Tactics
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Core creative, offer, and COD confirmation guidelines proven to boost ROAS in Tunisia.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {directives.map((directive, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-indigo-500/20 flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                  {directive}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
