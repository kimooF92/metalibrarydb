"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Flame,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Plus,
  ChevronRight,
  Clock,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { useAddUrlModal } from "@/components/add-url-modal";
import { useToast } from "@/components/toast-context";
import { ApifyCreditBadge } from "@/components/apify-credit-badge";
import { ScanProgressWidget } from "@/components/scan-progress-widget";
import { getSupabase } from "@/lib/supabase";
import {
  SCAN_TELEMETRY_CHANNEL,
  CATALOG_INFLOW_EVENT,
  type CatalogInflowBroadcastPayload,
} from "@/lib/realtime-scan-types";
import { FreshWinnersList, type FreshBreakout } from "@/components/dashboard/fresh-winners-list";
import { Inflow24hCard, type Inflow24hData } from "@/components/dashboard/inflow-24h-card";
import { BrandVelocityBoard, type BrandVelocityItem } from "@/components/dashboard/brand-velocity-board";
import { ScanOperationsCard, type ScanOperationsData } from "@/components/dashboard/scan-operations-card";

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
  freshBreakouts: FreshBreakout[];
  scalingBrands: BrandVelocityItem[];
  descalingBrands: BrandVelocityItem[];
  scalingSummary?: {
    count: number;
    netAds: number;
    avgAds: number;
  };
  descalingSummary?: {
    count: number;
    netAds: number;
    avgAds: number;
  };
  freshWinnersSummary?: {
    totalCount: number;
  };
  inflow24h: Inflow24hData;
  inflowToday?: Inflow24hData;
  scanOperations: ScanOperationsData;
  activeScanningPageIds?: string[];
  // Legacy / fallback fields:
  scalingProducts?: Record<string, unknown>[];
  hotOffers?: Record<string, unknown>[];
  darkBrands?: Record<string, unknown>[];
  topCategories?: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
}

function DashboardOverviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeWorkspace } = useWorkspace();
  const { openAddUrlModal } = useAddUrlModal();
  const { showToast } = useToast();
  const currencySymbol = activeWorkspace?.currencySymbol || "DT";

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newProductGlow, setNewProductGlow] = useState(false);

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
    async (isManual = false, silent = false) => {
      if (isManual && !silent) setRefreshing(true);
      try {
        const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
        const params = new URLSearchParams();
        if (isManual) {
          params.set("refresh", "true");
          params.set("_t", String(Date.now()));
        }
        if (tz) {
          params.set("tz", tz);
        }
        const qs = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(`/api/dashboard/overview${qs}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else if (!silent) {
          showToast({ type: "error", title: "Failed to load dashboard overview" });
        }
      } catch (err) {
        if (!silent) console.error("Failed to load overview:", err);
      } finally {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview();
  }, [loadOverview, activeWorkspace?.id]);

  // Proactively poll overview while scans are in flight so the banner clears automatically
  useEffect(() => {
    const hasActiveScans = Boolean(
      (data?.kpi?.scanningCount && data.kpi.scanningCount > 0) ||
      (data?.activeScanningPageIds && data.activeScanningPageIds.length > 0)
    );
    if (!hasActiveScans) return;

    const interval = setInterval(() => {
      if (!document.hidden) {
        loadOverview(true, true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [data?.kpi?.scanningCount, data?.activeScanningPageIds?.length, loadOverview]);

  // Real-time Catalog Inflow updates via Supabase Broadcast (Method A: zero DB queries)
  useEffect(() => {
    let channel: any = null;
    try {
      const supabase = getSupabase();
      channel = supabase
        .channel(SCAN_TELEMETRY_CHANNEL)
        .on(
          "broadcast",
          { event: CATALOG_INFLOW_EVENT },
          (msg: { payload: CatalogInflowBroadcastPayload }) => {
            if (!msg?.payload) return;
            const { workspaceId, isNewProduct, hasOffer } = msg.payload;

            // Strict workspace isolation guard
            if (workspaceId && activeWorkspace?.id && workspaceId !== activeWorkspace.id) return;

            setNewProductGlow(true);
            setTimeout(() => setNewProductGlow(false), 3000);

            setData((prev) => {
              if (!prev) return prev;
              const currentInflow = prev.inflowToday || prev.inflow24h || {
                totalAdded: 0,
                withOffersCount: 0,
                offerPercentage: 0,
                topPlatform: "Shopify",
                avgPrice: 0,
                nicheShare: [],
              };

              const prevTotal = currentInflow.totalAdded ?? 0;
              const prevOffers = currentInflow.withOffersCount ?? 0;

              const newTotal = isNewProduct ? prevTotal + 1 : prevTotal;
              const newOffers = hasOffer ? prevOffers + 1 : prevOffers;
              const newPct = newTotal > 0 ? Math.round((newOffers / newTotal) * 100) : 0;

              const updatedInflow = {
                ...currentInflow,
                totalAdded: newTotal,
                withOffersCount: newOffers,
                offerPercentage: newPct,
              };

              return {
                ...prev,
                inflowToday: updatedInflow,
                inflow24h: updatedInflow,
                kpi: {
                  ...prev.kpi,
                  totalProducts: isNewProduct ? (prev.kpi?.totalProducts ?? 0) + 1 : (prev.kpi?.totalProducts ?? 0),
                  withOffersCount: hasOffer ? (prev.kpi?.withOffersCount ?? 0) + 1 : (prev.kpi?.withOffersCount ?? 0),
                },
              };
            });
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[Dashboard] Telemetry subscription warning:", err);
    }

    return () => {
      if (channel) {
        try {
          const supabase = getSupabase();
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [activeWorkspace?.id]);

  const scanningIds = data?.activeScanningPageIds || [];

  return (
    <div className="w-full flex-1 flex flex-col space-y-4 pb-8">
      {/* 1. Header Line: Live Signal + Apify Keys Badge + Add Page CTA + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <div>
            <h1 className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>Live Competitor Radar</span>
              <span className="hidden md:inline text-[11px] font-normal text-slate-400">
                • Real-time pulse on products & scaling brands
              </span>
            </h1>
          </div>
          {data?.kpi.scanningCount ? (
            <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800/60 animate-pulse">
              {data.kpi.scanningCount} {data.kpi.scanningCount === 1 ? "brand" : "brands"} scanning right now...
            </span>
          ) : null}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Apify Keys / Balance Indicator */}
          <ApifyCreditBadge />

          {/* Add Page / Track Brand Button */}
          <button
            onClick={openAddUrlModal}
            className="flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all cursor-pointer active:scale-95"
            title="Track a new competitor store or Facebook page"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Track Brand</span>
          </button>

          {/* Subtle Refresh Action */}
          <button
            onClick={() => loadOverview(true)}
            disabled={refreshing || loading}
            title="Sync latest dashboard metrics from database"
            className="flex items-center space-x-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-500" : "text-slate-400"}`}
            />
            <span className="hidden sm:inline text-[11px]">{refreshing ? "Updating..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* 2. Top Executive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Found Today (Live Catalog Inflow) */}
        <Link
          href="/products?discovery=today"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block relative overflow-hidden"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">Found Today</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-transform duration-300 ${
                  newProductGlow ? "scale-110 text-cyan-500 dark:text-cyan-400 inline-block" : ""
                }`}
              >
                {loading ? "--" : (data?.inflowToday?.totalAdded ?? data?.inflow24h?.totalAdded ?? 0)}
              </span>
              {newProductGlow && (
                <span className="text-[10px] font-bold text-cyan-500 animate-pulse">
                  +1 live!
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-md">
              New products
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {(data?.inflowToday?.offerPercentage ?? data?.inflow24h?.offerPercentage ?? 0)}% have special offers or bundles
            </span>
          </div>
        </Link>

        {/* KPI 2: Breakout Winners */}
        <Link
          href="/fresh-winners"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">Breakout Winners</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading
                ? "--"
                : (data?.freshWinnersSummary?.totalCount ?? data?.freshBreakouts?.length ?? 0)}
            </span>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
              Scaling fast
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Winning products with surging ad creatives</span>
          </div>
        </Link>

        {/* KPI 3: Scaling Brands */}
        <Link
          href="/analytics?tab=pages&sub=scaling"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">Scaling Brands</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {loading ? "--" : (data?.scalingSummary?.count ?? data?.scalingBrands?.length ?? 0)}
            </span>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
              +{data?.scalingSummary?.netAds ?? 0} ads added
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Brands ramping up spend (<strong className="text-emerald-600 dark:text-emerald-400">+{data?.scalingSummary?.avgAds ?? 0}</strong> avg)
            </span>
          </div>
        </Link>

        {/* KPI 4: Descaling Brands */}
        <Link
          href="/analytics?tab=pages&sub=descaling"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">Descaling Brands</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
              {loading ? "--" : (data?.descalingSummary?.count ?? data?.descalingBrands?.length ?? 0)}
            </span>
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-md">
              -{data?.descalingSummary?.netAds ?? 0} ads cut
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Brands pausing or cutting ads (<strong className="text-rose-600 dark:text-rose-400">-{data?.descalingSummary?.avgAds ?? 0}</strong> avg)
            </span>
          </div>
        </Link>
      </div>

      {/* 3. Core Intelligence Grid (12-column responsive layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Fresh Winners & Today's Inflow (7 cols on lg, 8 cols on xl) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Section 1: Fresh Winner Products (Top 5 Breakouts) */}
          <FreshWinnersList
            products={data?.freshBreakouts || []}
            loading={loading}
            currencySymbol={currencySymbol}
          />

          {/* Section 2: Today's Market Inflow & Niche Analytics */}
          <Inflow24hCard
            data={data?.inflowToday || data?.inflow24h}
            loading={loading}
            currencySymbol={currencySymbol}
          />
        </div>

        {/* RIGHT COLUMN: Brand Ad Velocity & Scan Operations (5 cols on lg, 4 cols on xl) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Section 3: Brand Ad Velocity (Scaling vs Descaling) */}
          <BrandVelocityBoard
            scalingBrands={data?.scalingBrands || []}
            descalingBrands={data?.descalingBrands || []}
            darkCount={data?.scanOperations?.darkCount ?? 0}
            revivedCount={data?.scanOperations?.revivedCount ?? 0}
            loading={loading}
          />

          {/* Section 4: Scan Operations & Coverage Hub */}
          <ScanOperationsCard
            data={data?.scanOperations}
            loading={loading}
            onRefresh={() => loadOverview(true)}
            refreshing={refreshing}
          />
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
