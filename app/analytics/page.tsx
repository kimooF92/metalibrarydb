"use client";

import { useEffect, useState } from "react";
import { TrackedPage, DashboardStats } from "@/types";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Flame,
  RefreshCw,
  FolderInput,
} from "lucide-react";

interface AnalyticsData {
  pages: TrackedPage[];
  loading: boolean;
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-12 text-right">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export default function AnalyticsPage() {
  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [pagesRes, statsRes] = await Promise.all([
        fetch("/api/pages?limit=1000&sortBy=currentResults&sortOrder=desc"),
        fetch("/api/stats"),
      ]);
      
      if (pagesRes.ok) {
        const data = await pagesRes.json();
        setPages(data.data || []);
      }
      
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch analytics data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Computed metrics
  const completed = pages.filter((p) => p.status === "success");
  const withResults = completed.filter((p) => p.currentResults !== null && p.currentResults > 0);
  const highVolume = pages.filter((p) => (p.currentResults ?? 0) >= 50);
  const zeroAds = pages.filter((p) => p.status === "success" && p.currentResults === 0);
  const failed = pages.filter((p) => p.status === "failed");
  const unclear = pages.filter((p) => p.status === "unclear");

  const totalAds = withResults.reduce((sum, p) => sum + (p.currentResults ?? 0), 0);
  const maxResults = Math.max(...withResults.map((p) => p.currentResults ?? 0), 1);

  const top10 = [...withResults]
    .sort((a, b) => (b.currentResults ?? 0) - (a.currentResults ?? 0))
    .slice(0, 10);

  const gainers = pages
    .filter((p) => (p.difference ?? 0) > 0)
    .sort((a, b) => (b.difference ?? 0) - (a.difference ?? 0))
    .slice(0, 5);

  const decliners = pages
    .filter((p) => (p.difference ?? 0) < 0)
    .sort((a, b) => (a.difference ?? 0) - (b.difference ?? 0))
    .slice(0, 5);

  // Status distribution
  const statusData = [
    { label: "Success", count: completed.length, color: "bg-emerald-500", textColor: "text-emerald-400" },
    { label: "Pending", count: pages.filter((p) => p.status === "pending").length, color: "bg-amber-500", textColor: "text-amber-400" },
    { label: "Failed", count: failed.length, color: "bg-rose-500", textColor: "text-rose-400" },
    { label: "Unclear", count: unclear.length, color: "bg-purple-500", textColor: "text-purple-400" },
    { label: "Scanning", count: pages.filter((p) => p.status === "scanning").length, color: "bg-cyan-500", textColor: "text-cyan-400" },
  ];
  const maxStatus = Math.max(...statusData.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Analytics</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Aggregate intelligence across {pages.length} tracked Meta Ad Library pages
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center space-x-2 text-xs font-medium px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-555 dark:text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 dark:text-indigo-400 mr-3" />
          <span>Loading analytics...</span>
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-4">
            {[
              { label: "Total Ads Tracked", value: totalAds.toLocaleString(), icon: BarChart3, color: "text-indigo-650 dark:text-indigo-400", bg: "bg-indigo-500/10" },
              { label: "Average Results", value: stats ? stats.averageResults.toLocaleString() : "0", icon: BarChart3, color: "text-indigo-655 dark:text-indigo-400", bg: "bg-indigo-500/10" },
              { label: "Highest Results", value: stats ? stats.highestResults.toLocaleString() : "0", icon: TrendingUp, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
              { label: "High Volume (50+)", value: highVolume.length, icon: Flame, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
              { label: "Zero Ad Pages", value: zeroAds.length, icon: AlertCircle, color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-500/10" },
              { label: "Success Rate", value: `${pages.length > 0 ? Math.round((completed.length / pages.length) * 100) : 0}%`, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
              { label: "Failed Pages", value: failed.length, icon: TrendingDown, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10" },
              { label: "Unclear Pages", value: unclear.length, icon: ShieldAlert, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
              {
                label: "Last Import",
                value: stats && stats.lastImport ? stats.lastImport.filename : "None",
                subtitle: stats && stats.lastImport ? `${stats.lastImport.totalRows} URLs` : "No imports yet",
                icon: FolderInput,
                color: "text-slate-700 dark:text-slate-300",
                bg: "bg-slate-555/10 dark:bg-slate-500/10",
                isText: true,
              },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="glass-card rounded-xl p-3.5 flex flex-col justify-between transition-all hover:-translate-y-0.5 duration-200 min-h-[90px]">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">{item.label}</span>
                      <div className={`p-1 rounded-lg ${item.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                      </div>
                    </div>
                    <div className={`font-extrabold text-slate-900 dark:text-slate-100 truncate ${item.isText ? "text-xs mt-1 font-mono" : "text-lg"}`} title={String(item.value)}>
                      {item.value}
                    </div>
                  </div>
                  {item.subtitle && (
                    <div className="text-[10px] text-slate-450 dark:text-slate-500 mt-1 truncate">{item.subtitle}</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 10 Pages */}
            <div className="lg:col-span-2 glass-card rounded-xl p-5">
              <div className="flex items-center space-x-2 mb-4">
                <TrendingUp className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Top 10 Pages by Active Ads</span>
              </div>
              <div className="space-y-3">
                {top10.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No completed scan data available.</p>
                ) : (
                  top10.map((p, i) => (
                    <div key={p.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 w-4">{i + 1}</span>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 truncate max-w-[220px] transition-colors"
                          >
                            {p.displayName || "Meta Ad Search"}
                          </a>
                          {(p.currentResults ?? 0) >= 50 && (
                            <Flame className="w-3 h-3 text-amber-500 dark:text-amber-400 fill-amber-550/20 dark:fill-amber-400/40 shrink-0" />
                          )}
                        </div>
                      </div>
                      <MiniBar value={p.currentResults ?? 0} max={maxResults} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Status Distribution */}
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center space-x-2 mb-4">
                <BarChart3 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Status Distribution</span>
              </div>
              <div className="space-y-3">
                {statusData.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${item.textColor}`}>{item.label}</span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{item.count}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all duration-700`}
                        style={{ width: `${Math.min(100, (item.count / maxStatus) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Movers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Gainers */}
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center space-x-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Top Gainers (Since Last Scan)</span>
              </div>
              {gainers.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No gainers detected yet.</p>
              ) : (
                <div className="space-y-2">
                  {gainers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all">
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-800 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-300 truncate max-w-[180px] transition-colors">
                        {p.displayName || "Meta Ad Search"}
                      </a>
                      <span className="inline-flex items-center text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                        <TrendingUp className="w-3 h-3 mr-0.5" />
                        +{p.difference}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Decliners */}
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center space-x-2 mb-3">
                <TrendingDown className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Top Decliners (Since Last Scan)</span>
              </div>
              {decliners.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No decliners detected yet.</p>
              ) : (
                <div className="space-y-2">
                  {decliners.map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all">
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-800 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-300 truncate max-w-[180px] transition-colors">
                        {p.displayName || "Meta Ad Search"}
                      </a>
                      <span className="inline-flex items-center text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 shrink-0">
                        <TrendingDown className="w-3 h-3 mr-0.5" />
                        {p.difference}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
