"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Flame,
  ShoppingBag,
  TrendingUp,
  Tag,
  RefreshCw,
  Plus,
  ChevronRight,
  Clock,
  Zap,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { useAddUrlModal } from "@/components/add-url-modal";
import { useToast } from "@/components/toast-context";
import { ApifyCreditBadge } from "@/components/apify-credit-badge";
import { ScanProgressWidget } from "@/components/scan-progress-widget";
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
  inflow24h: Inflow24hData;
  scanOperations: ScanOperationsData;
  activeScanningPageIds?: string[];
  // Legacy / fallback fields:
  scalingProducts?: any[];
  hotOffers?: any[];
  darkBrands?: any[];
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

  const scanningIds = data?.activeScanningPageIds || [];

  return (
    <div className="w-full flex-1 flex flex-col space-y-4 pb-8">
      {/* 1. Header Line: Live Signal + Apify Keys Badge + Add Page CTA + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Product Intelligence Overview
          </span>
          {data?.kpi.scanningCount ? (
            <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800/60 animate-pulse">
              {data.kpi.scanningCount} scanning
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
            className="flex items-center space-x-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all cursor-pointer active:scale-95"
            title="Track new competitor page or domain"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Page</span>
          </button>

          {/* Subtle Refresh Action */}
          <button
            onClick={() => loadOverview(true)}
            disabled={refreshing || loading}
            title="Refresh overview metrics"
            className="flex items-center space-x-1 text-xs font-semibold px-2 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50"
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
        {/* KPI 1: New in 24h */}
        <Link
          href="/products"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-500" />
              <span>New in 24h</span>
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25">
              FRESH
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "--" : data?.inflow24h?.totalAdded ?? 0}
            </span>
            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-md">
              Catalog Inflow
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {data?.inflow24h?.offerPercentage ?? 0}% with bundle offers
            </span>
          </div>
        </Link>

        {/* KPI 2: Fresh Breakout Winners */}
        <Link
          href="/fresh-winners"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>Fresh Winners</span>
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
              HOT
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "--" : data?.freshBreakouts?.length ? `${data.freshBreakouts.length}` : "0"}
            </span>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
              Top Breakouts
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Surging active creatives</span>
          </div>
        </Link>

        {/* KPI 3: Scaling Competitors */}
        <Link
          href="/brands"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>Scaling Brands</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "--" : data?.scalingBrands?.length ?? 0}
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

        {/* KPI 4: Scan Operations Health */}
        <Link
          href="/brands"
          className="group p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer block"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-blue-500" />
              <span>Scans Today</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "--" : data?.scanOperations?.scansToday ?? 0}
            </span>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
              {data?.scanOperations?.successRate ?? 100}% health
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>+{data?.scanOperations?.scansThisHour ?? 0} scans this hour</span>
          </div>
        </Link>
      </div>

      {/* 3. Core Intelligence Grid (12-column responsive layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Fresh Winners & 24h Inflow (7 cols on lg, 8 cols on xl) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Section 1: Fresh Winner Products (Top 5 Breakouts) */}
          <FreshWinnersList
            products={data?.freshBreakouts || []}
            loading={loading}
            currencySymbol={currencySymbol}
          />

          {/* Section 2: Last 24 Hours Market Inflow & Niche Analytics */}
          <Inflow24hCard
            data={data?.inflow24h}
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
