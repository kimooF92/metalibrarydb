"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Flame,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  Eye,
  CheckCircle2,
  Zap,
  Globe,
  BarChart3,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { useToast } from "@/components/toast-context";
import { ScanProgressWidget } from "@/components/scan-progress-widget";

interface OverviewData {
  kpi: {
    totalBrands: number;
    avgAds: number;
    maxAds: number;
    scanningCount: number;
    failedCount: number;
    completedCount: number;
    onHoldCount: number;
    totalProducts: number;
    successfulProducts: number;
    withOffersCount: number;
    favoritesCount: number;
    totalAds: number;
    activeAds: number;
  };
  freshBreakouts: Array<{
    id: string;
    adArchiveId: string;
    pageId: string;
    pageName: string | null;
    mediaType: string | null;
    thumbnailUrl: string | null;
    startedRunningOn: string | null;
    winnerScore: number;
    winnerTier: string;
    isBreakout: boolean;
    productTitle: string | null;
    productPrice: string | null;
    productCurrency: string | null;
    productImageUrl: string | null;
  }>;
  scalingBrands: Array<{
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
  }>;
  darkBrands: Array<{
    id: string;
    displayName: string | null;
    currentResults: number | null;
    lastKnownValidResults: number | null;
    consecutiveZeroScans: number | null;
    holdStatus: string | null;
    status: string;
    lastChecked: string | null;
    country: string | null;
  }>;
  topCategories: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  worker: {
    isPaused: boolean;
    scansThisHour: number;
    scansToday: number;
    consecutiveFailures: number;
    lastFailureAt: string | null;
    circuitBreakerTripped: boolean;
  };
  queue: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  discovery: {
    discoveredCount: number;
    totalCount: number;
    recent: Array<{
      id: string;
      pageId: string;
      displayName: string | null;
      matchingAdCount: number;
      previewTitle: string | null;
      previewImage: string | null;
      previewPrice: string | null;
      status: string;
    }>;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    severity: string;
    createdAt: string;
  }>;
}

// Mini SVG Sparkline Component matching /products aesthetic
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
        stroke={isUp ? "#10b981" : "#6366f1"}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
}

function DashboardOverviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Backward compatibility: If URL contains old dashboard filters/tabs, smoothly forward to /brands
  useEffect(() => {
    if (
      searchParams.has("tab") ||
      searchParams.has("search") ||
      searchParams.has("status") ||
      searchParams.has("tag") ||
      searchParams.has("sortBy")
    ) {
      router.replace(`/brands?${searchParams.toString()}`);
    }
  }, [searchParams, router]);

  const loadOverview = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const bust = isManual ? `?refresh=true&_t=${Date.now()}` : "";
        const res = await fetch(`/api/dashboard/overview${bust}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          showToast({ type: "error", title: "Failed to load dashboard overview" });
        }
      } catch (err) {
        console.error("Failed to load overview:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview, activeWorkspace?.id]);

  const scanningIds = data?.kpi.scanningCount ? ["scanning-active"] : [];

  return (
    <div className="w-full flex-1 flex flex-col space-y-4 pb-8">
      {/* 1. Ultra-clean minimal header line: Live signal + Subtle Refresh */}
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Market Intelligence Overview
          </span>
          {data?.kpi.scanningCount ? (
            <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800/60 animate-pulse">
              {data.kpi.scanningCount} scanning
            </span>
          ) : null}
        </div>

        <button
          onClick={() => loadOverview(true)}
          disabled={refreshing || loading}
          title="Refresh overview metrics"
          className="flex items-center space-x-1.5 text-xs font-semibold px-2 py-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-500" : "text-slate-400"}`}
          />
          <span className="text-[11px]">{refreshing ? "Updating..." : "Refresh"}</span>
        </button>
      </div>

      {/* 2. Top Executive KPI Strip (Card colors matched with /products) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Monitored Brands */}
        <Link
          href="/brands"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Tracked Brands</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "--" : data?.kpi.totalBrands.toLocaleString()}
            </span>
            {data?.kpi && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                {data.kpi.completedCount} active
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Avg: <strong className="text-slate-700 dark:text-slate-200">{data?.kpi.avgAds ?? 0}</strong> ads/brand</span>
          </div>
        </Link>

        {/* KPI 2: Active Creatives Observed */}
        <Link
          href="/spy"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-indigo-500" />
              <span>Active Creatives</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "--" : data?.kpi.activeAds.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md">
              Observed
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Total library: <strong className="text-slate-700 dark:text-slate-200">{data?.kpi.totalAds.toLocaleString() ?? 0}</strong></span>
          </div>
        </Link>

        {/* KPI 3: Fresh Breakouts */}
        <Link
          href="/fresh-winners"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>Fresh Breakouts</span>
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
              HOT
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "--" : data?.freshBreakouts.length ?? 0}
            </span>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
              Velocity Surge
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Fast-scaling duplicate ads</span>
          </div>
        </Link>

        {/* KPI 4: Catalog Products */}
        <Link
          href="/products"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
              <span>Scraped Products</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "--" : data?.kpi.totalProducts.toLocaleString()}
            </span>
            {data?.kpi && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                {data.kpi.successfulProducts} live
              </span>
            )}
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Offers detected: <strong className="text-slate-700 dark:text-slate-200">{data?.kpi.withOffersCount ?? 0}</strong></span>
          </div>
        </Link>
      </div>

      {/* 3. Core Intelligence Grid (Full width, responsive 12-column layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Wide Intelligence Modules (7 cols on lg, 8 cols on xl) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Module 1: Fresh Breakouts (Hot Ad Creatives) */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 text-amber-500">
                  <Flame className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Fresh Breakout Creatives
                  </h2>
                </div>
              </div>
              <Link
                href="/fresh-winners"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
              >
                <span>View all</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-3.5">
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="h-40 rounded-lg bg-slate-100 dark:bg-slate-900/50 animate-pulse border border-slate-200/60 dark:border-slate-800/60"
                    />
                  ))}
                </div>
              ) : !data?.freshBreakouts || data.freshBreakouts.length === 0 ? (
                <div className="text-center py-8 px-4 text-xs text-slate-500">
                  <Flame className="w-7 h-7 text-amber-500/40 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    No breakout ads detected in the current window
                  </p>
                  <p className="text-slate-400 mt-0.5">
                    When brands duplicate ad copies, they will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.freshBreakouts.map((ad) => (
                    <div
                      key={ad.id}
                      className="group flex flex-col justify-between p-3 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-xs transition-all duration-200"
                    >
                      <div className="flex gap-3">
                        {/* Ad / Product Thumbnail */}
                        <div className="relative w-20 h-24 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-900 shrink-0 border border-slate-200 dark:border-slate-800">
                          {ad.thumbnailUrl || ad.productImageUrl ? (
                            <img
                              src={ad.thumbnailUrl || ad.productImageUrl || ""}
                              alt={ad.productTitle || ad.pageName || "Ad"}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <Eye className="w-5 h-5 opacity-40" />
                            </div>
                          )}
                          {ad.mediaType && (
                            <span className="absolute bottom-1 right-1 text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-black/80 text-white backdrop-blur-xs">
                              {ad.mediaType}
                            </span>
                          )}
                        </div>

                        {/* Ad Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded">
                              Score {ad.winnerScore}
                            </span>
                            {ad.startedRunningOn && (
                              <span className="text-[10px] text-slate-400">
                                {new Date(ad.startedRunningOn).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            )}
                          </div>

                          <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate mt-1.5" title={ad.pageName || ""}>
                            {ad.pageName || "Unknown Brand"}
                          </h3>

                          {ad.productTitle ? (
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5" title={ad.productTitle}>
                              {ad.productTitle}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic line-clamp-2 mt-0.5">
                              Creative in live testing
                            </p>
                          )}

                          {ad.productPrice && (
                            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-1">
                              {ad.productPrice} {ad.productCurrency}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Card Action */}
                      <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
                        <Link
                          href={`/spy?search=${encodeURIComponent(ad.pageName || "")}`}
                          className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View in Feed</span>
                        </Link>
                        <a
                          href={`https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition-colors"
                        >
                          <span>Meta</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Module 2: Brands Scaling Up (Momentum Leaderboard) */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-500">
                  <TrendingUp className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Brands Scaling Up
                  </h2>
                </div>
              </div>
              <Link
                href="/brands"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
              >
                <span>View all brands</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <div className="p-3 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-9 rounded-md bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
                  ))}
                </div>
              ) : !data?.scalingBrands || data.scalingBrands.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  No scaling brands currently detected. Track new brands to monitor trends.
                </div>
              ) : (
                data.scalingBrands.map((brand, idx) => {
                  const isPositive = (brand.difference ?? 0) > 0;
                  return (
                    <div
                      key={brand.id}
                      className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      {/* Left: Brand Identity & Scaling Pattern */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-bold text-slate-400 w-4 text-center">
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
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
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
                              {brand.scalingPattern?.label || "Stable"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Sparkline, Counts & CTA */}
                      <div className="flex items-center gap-4 shrink-0">
                        {/* 14d Sparkline */}
                        <div className="hidden sm:block">
                          <Sparkline points={brand.historyPoints} isUp={isPositive} />
                        </div>

                        {/* Counts */}
                        <div className="text-right min-w-[65px]">
                          <div className="text-xs font-black text-slate-900 dark:text-white">
                            {brand.currentResults?.toLocaleString() ?? 0} ads
                          </div>
                          {brand.difference !== 0 && (
                            <div className={`text-[10px] font-bold ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
                              {isPositive ? `+${brand.difference}` : brand.difference}
                            </div>
                          )}
                        </div>

                        {/* Spy Action */}
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
          </div>

          {/* Module 3: Product Category Distribution */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-purple-500/10 text-purple-500">
                  <BarChart3 className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Market Niches & Category Pulse
                  </h2>
                </div>
              </div>
              <Link
                href="/products"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1"
              >
                <span>Catalog</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {loading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-5 rounded bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
                  ))}
                </div>
              ) : !data?.topCategories || data.topCategories.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">
                  No categorized products extracted yet. Scrape landing pages to view niche distribution.
                </div>
              ) : (
                data.topCategories.map((cat) => (
                  <Link
                    key={cat.category}
                    href={`/products?category=${encodeURIComponent(cat.category)}`}
                    className="group block"
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 group-hover:text-indigo-500 transition-colors">
                        {cat.category}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {cat.count.toLocaleString()} products ({cat.percentage}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${Math.max(5, cat.percentage)}%` }}
                      />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Pipeline, Radar & Operational Controls (5 cols on lg, 4 cols on xl) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Module 4: Ingestion & Scan Health */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs p-3.5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-500">
                  <Zap className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Ingestion Engine Health
                  </h2>
                </div>
              </div>

              {/* Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  data?.worker.isPaused
                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    : data?.worker.circuitBreakerTripped
                    ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                    : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                <span>{data?.worker.isPaused ? "Paused" : "Running"}</span>
              </span>
            </div>

            {/* Health Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50/60 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block">
                  Scans This Hour
                </span>
                <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                  {data?.worker.scansThisHour ?? 0}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50/60 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/60">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block">
                  Scans Today
                </span>
                <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                  {data?.worker.scansToday ?? 0}
                </span>
              </div>
            </div>

            {/* Queue Breakdown Pills */}
            <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">Pending Queue:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-700 dark:text-slate-300 font-bold">
                  {data?.queue.pending ?? 0} pending
                </span>
                {data?.queue.running ? (
                  <span className="text-cyan-500 font-bold animate-pulse">
                    ({data.queue.running} active)
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Module 5: Brands Needing Attention / Going Dark */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-rose-500/10 text-rose-500">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Brands Going Dark
                  </h2>
                </div>
              </div>
              <Link
                href="/brands?tab=attention"
                className="text-xs font-semibold text-rose-500 hover:text-rose-400"
              >
                Review
              </Link>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <div className="p-3 space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-7 rounded bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
                  ))}
                </div>
              ) : !data?.darkBrands || data.darkBrands.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500/60 mx-auto mb-1" />
                  All monitored brands are healthy.
                </div>
              ) : (
                data.darkBrands.map((brand) => (
                  <div
                    key={brand.id}
                    className="px-3.5 py-2 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {brand.displayName || "Unknown Brand"}
                        </span>
                        {brand.holdStatus === "on_hold" && (
                          <span className="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-amber-500/10 text-amber-500">
                            Hold
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {brand.consecutiveZeroScans
                          ? `${brand.consecutiveZeroScans} consecutive 0-ad scans`
                          : "Status: " + brand.status}
                      </span>
                    </div>

                    <Link
                      href={`/brands?search=${encodeURIComponent(brand.displayName || "")}`}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                    >
                      Inspect
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Module 6: Competitor Discovery Radar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500/10 text-blue-500">
                  <Globe className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Discovery Radar
                  </h2>
                </div>
              </div>
              <Link
                href="/discovery"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1"
              >
                <span>Discovery</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-2">
              {data?.discovery.recent && data.discovery.recent.length > 0 ? (
                data.discovery.recent.map((page) => (
                  <div
                    key={page.id}
                    className="p-2 rounded-lg border border-slate-200/80 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">
                        {page.displayName || `Page ID: ${page.pageId}`}
                      </span>
                      {page.previewTitle && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block">
                          {page.previewTitle}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                      {page.matchingAdCount} ads
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-3 text-xs text-slate-500">
                  Run a discovery crawler to find new local competitors automatically.
                </div>
              )}
            </div>
          </div>

          {/* Module 7: Quick Launchpad Shortcuts */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs p-3.5">
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2.5">
              Intelligence Launchpads
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link
                href="/fresh-winners"
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-50/60 dark:bg-slate-950/30 hover:bg-slate-100 dark:hover:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/60 font-semibold text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">Fresh Winners</span>
              </Link>

              <Link
                href="/opportunities"
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-50/60 dark:bg-slate-950/30 hover:bg-slate-100 dark:hover:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/60 font-semibold text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">Opportunity AI</span>
              </Link>

              <Link
                href="/spy"
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-50/60 dark:bg-slate-950/30 hover:bg-slate-100 dark:hover:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/60 font-semibold text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Eye className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                <span className="truncate">Ad Spy Feed</span>
              </Link>

              <Link
                href="/analytics"
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-50/60 dark:bg-slate-950/30 hover:bg-slate-100 dark:hover:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/60 font-semibold text-slate-700 dark:text-slate-200 transition-colors"
              >
                <BarChart3 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate">Analytics Hub</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Feature: Live Scraper Progress Floating Bar */}
      <ScanProgressWidget
        scanningPageIds={scanningIds}
        onScanFinished={() => {
          loadOverview(true);
        }}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardOverviewContent />
    </Suspense>
  );
}
