"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Eye, ArrowRight, Building2, AlertTriangle } from "lucide-react";

export interface BrandVelocityItem {
  id: string;
  displayName: string | null;
  currentResults: number | null;
  difference: number;
  profilePicUrl: string | null;
  lastChecked: string | null;
  status: string;
  country: string | null;
  holdStatus: string | null;
  consecutiveZeroScans: number | null;
  historyPoints: number[];
  scalingPattern: {
    archetype: string;
    label: string;
    badgeClass: string;
    pillClass: string;
    icon: string;
  };
}

interface BrandVelocityBoardProps {
  scalingBrands: BrandVelocityItem[];
  descalingBrands: BrandVelocityItem[];
  loading?: boolean;
}

// Mini SVG Sparkline Component
function Sparkline({ points, isUp }: { points: number[]; isUp: boolean }) {
  if (!points || points.length < 2) {
    return <span className="text-[10px] text-slate-400">---</span>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 64;
  const height = 18;
  const step = width / (points.length - 1);

  const coords = points
    .map((p, idx) => {
      const x = idx * step;
      const y = height - ((p - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="w-16 h-4.5 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={isUp ? "#10b981" : "#f43f5e"}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
}

export function BrandVelocityBoard({
  scalingBrands = [],
  descalingBrands = [],
  loading = false,
}: BrandVelocityBoardProps) {
  const [activeTab, setActiveTab] = useState<"scaling" | "descaling">("scaling");

  const currentList = activeTab === "scaling" ? scalingBrands.slice(0, 5) : descalingBrands.slice(0, 5);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-500">
            {activeTab === "scaling" ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
            )}
          </span>
          <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Competitor Ad Velocity
          </h2>
        </div>

        <Link
          href="/brands"
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
        >
          <span>All brands</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Tabs Selector */}
      <div className="p-1 mx-3 my-2 bg-slate-100/80 dark:bg-slate-900/60 rounded-lg flex gap-1 border border-slate-200/60 dark:border-slate-800/60">
        <button
          onClick={() => setActiveTab("scaling")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs transition-all cursor-pointer ${
            activeTab === "scaling"
              ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs font-bold"
              : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          <span>Ramping Up</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold font-mono">
            {scalingBrands.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("descaling")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs transition-all cursor-pointer ${
            activeTab === "descaling"
              ? "bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-xs font-bold"
              : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium"
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
          <span>Scaling Down</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold font-mono">
            {descalingBrands.length}
          </span>
        </button>
      </div>

      {/* List Body */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {loading ? (
          <div className="p-3 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
            ))}
          </div>
        ) : currentList.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            {activeTab === "scaling" ? (
              <p>All quiet on the scaling front! None of your tracked competitors have added new ads today.</p>
            ) : (
              <p>No brands are cutting or pausing ad campaigns right now.</p>
            )}
          </div>
        ) : (
          currentList.map((brand, idx) => {
            const isPositive = (brand.difference ?? 0) > 0;
            const isNegative = (brand.difference ?? 0) < 0;

            return (
              <div
                key={brand.id}
                className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
              >
                {/* Brand Identity & Label */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 text-center text-xs font-semibold text-slate-400 dark:text-slate-500 font-mono shrink-0">
                    #{idx + 1}
                  </span>

                  <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-300">
                    {brand.profilePicUrl ? (
                      <img src={brand.profilePicUrl} alt={brand.displayName || ""} className="w-full h-full object-cover" />
                    ) : (
                      brand.displayName?.slice(0, 2).toUpperCase() || "BR"
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {brand.displayName || "Unknown Brand"}
                      </span>
                      {brand.country && (
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">
                          {brand.country}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded ${brand.scalingPattern?.pillClass || "bg-slate-100 text-slate-600"}`}>
                        {brand.scalingPattern?.label || (isPositive ? "Scaling" : "Descaling")}
                      </span>
                      {brand.consecutiveZeroScans && brand.consecutiveZeroScans >= 2 ? (
                        <span className="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1 py-0.2 rounded">
                          {brand.consecutiveZeroScans}x 0 ads
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Sparkline & Counts */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:block">
                    <Sparkline points={brand.historyPoints} isUp={isPositive} />
                  </div>

                  <div className="text-right min-w-[60px]">
                    <div className="text-xs font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {brand.currentResults?.toLocaleString() ?? 0} ads
                    </div>
                    {brand.difference !== 0 ? (
                      <div className={`text-[10px] font-semibold font-mono tabular-nums ${isPositive ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`}>
                        {isPositive ? `+${brand.difference}` : brand.difference}
                      </div>
                    ) : (
                      <div className="text-[10px] font-medium text-slate-400">stable</div>
                    )}
                  </div>

                  <Link
                    href={`/spy?trackedPageId=${brand.id}`}
                    title="Spy on brand ads"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
