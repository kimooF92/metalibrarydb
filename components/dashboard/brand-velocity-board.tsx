"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Eye, ArrowRight, Building2, AlertTriangle, Moon, Sparkles } from "lucide-react";
import {
  calculateCurvedSparklineGeometry,
  filterTransientZeros,
} from "@/lib/sparkline-utils";

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
  darkCount?: number;
  revivedCount?: number;
  loading?: boolean;
}

// Mini SVG Sparkline Component — smooth Bézier curve downsampled to 3-4 key peaks with subtle area glow
function Sparkline({
  points,
  isUp,
  type = "scaling",
  brandId = "default",
}: {
  points?: number[];
  isUp?: boolean;
  type?: "scaling" | "descaling";
  brandId?: string;
}) {
  const geo = calculateCurvedSparklineGeometry(points, 64, 18, 2, 4);
  if (!geo) {
    return <span className="text-[10px] text-slate-400">---</span>;
  }

  // Scaling tab is always green (#10b981), Descaling is rose (#f43f5e)
  const isPositive = type === "scaling" ? true : type === "descaling" ? false : Boolean(isUp);
  const strokeColor = isPositive ? "#10b981" : "#f43f5e";
  const gradId = `spark-grad-${brandId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      className="w-16 h-4.5 overflow-visible select-none shrink-0"
      viewBox={`0 0 ${geo.width} ${geo.height}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {/* Soft area glow beneath the curve */}
      <path d={geo.areaStr} fill={`url(#${gradId})`} />
      {/* Smooth Catmull-Rom / Bézier trend curve */}
      <path
        d={geo.pathStr}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot for latest value */}
      <circle
        cx={geo.lastPoint.x}
        cy={geo.lastPoint.y}
        r="2"
        fill={strokeColor}
      />
    </svg>
  );
}

export function BrandVelocityBoard({
  scalingBrands = [],
  descalingBrands = [],
  darkCount = 0,
  revivedCount = 0,
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
      <div className="flex border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 p-1 gap-1">
        <button
          onClick={() => setActiveTab("scaling")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "scaling"
              ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs"
              : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          <span>Ramping Up (+)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold">
            {scalingBrands.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("descaling")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "descaling"
              ? "bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-xs"
              : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
          <span>Scaling Down (-)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-extrabold">
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
            const cleanPts = filterTransientZeros(brand.historyPoints);
            const windowDelta = cleanPts.length >= 2
              ? (cleanPts[cleanPts.length - 1] - cleanPts[0])
              : 0;
            const effectiveDiff = brand.difference !== 0 ? brand.difference : windowDelta;
            const isPositive = effectiveDiff > 0;
            const isNegative = effectiveDiff < 0;

            return (
              <div
                key={brand.id}
                className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
              >
                {/* Brand Identity & Label */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xs font-bold text-slate-400 w-4 text-center shrink-0">
                    {idx + 1}
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
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {brand.displayName || "Unknown Brand"}
                      </span>
                      {brand.country && (
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">
                          {brand.country}
                        </span>
                      )}
                    </div>
                    {brand.scalingPattern?.label && brand.scalingPattern.archetype !== "inactive" ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-0.5 truncate">
                          <span>{brand.scalingPattern.icon}</span>
                          <span>{brand.scalingPattern.label}</span>
                        </span>
                      </div>
                    ) : brand.consecutiveZeroScans && brand.consecutiveZeroScans >= 2 ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-1 py-0.2 rounded">
                          {brand.consecutiveZeroScans}x 0 ads
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Sparkline & Counts */}
                <div className="flex items-center gap-3 shrink-0">
                  <div
                    className="hidden sm:block"
                    title={`Trajectory: ${(cleanPts.length > 0 ? cleanPts : [brand.currentResults ?? 0]).join(" → ")} ads`}
                  >
                    <Sparkline
                      points={cleanPts.length > 0 ? cleanPts : brand.historyPoints}
                      type={activeTab}
                      isUp={isPositive}
                      brandId={brand.id}
                    />
                  </div>

                  <div className="text-right min-w-[60px]">
                    <div className="text-xs font-black text-slate-900 dark:text-white">
                      {brand.currentResults?.toLocaleString() ?? 0} ads
                    </div>
                    {brand.difference !== 0 ? (
                      <div className={`text-[10px] font-bold ${brand.difference > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {brand.difference > 0 ? `+${brand.difference}` : brand.difference}
                      </div>
                    ) : windowDelta !== 0 ? (
                      <div className={`text-[10px] font-bold ${windowDelta > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {windowDelta > 0 ? `+${windowDelta} (14d)` : `${windowDelta} (14d)`}
                      </div>
                    ) : (
                      <div className="text-[10px] font-medium text-slate-400">stable</div>
                    )}
                  </div>

                  <Link
                    href={`/spy?trackedPageId=${brand.id}`}
                    title="Spy on brand ads"
                    className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Competitor Status Shifts (Went Dark & Revived) */}
      <div className="grid grid-cols-2 gap-2 p-2.5 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
        <Link
          href="/brands?tab=attention"
          className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 hover:border-rose-400/60 dark:hover:border-rose-600/60 transition-all shadow-2xs group"
          title="View competitors on hold or with 0 active ads"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-md bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <Moon className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block truncate group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                Went Dark
              </span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500 block truncate">
                0 ads / on hold
              </span>
            </div>
          </div>
          <span className="text-xs font-black text-rose-600 dark:text-rose-400 font-mono shrink-0 pl-1">
            {loading ? "--" : darkCount}
          </span>
        </Link>

        <Link
          href="/brands?tab=active"
          className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-400/60 dark:hover:border-emerald-600/60 transition-all shadow-2xs group"
          title="View competitors that relaunched ad campaigns in the last 7 days"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  Revived
                </span>
                <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded">
                  7d
                </span>
              </div>
              <span className="text-[9px] text-slate-400 dark:text-slate-500 block truncate">
                Relaunched ads
              </span>
            </div>
          </div>
          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono shrink-0 pl-1">
            {loading ? "--" : revivedCount}
          </span>
        </Link>
      </div>
    </div>
  );
}
