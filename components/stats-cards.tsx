"use client";

import { DashboardStats } from "@/types";
import {
  FileText,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  TrendingUp,
  FolderInput,
  ShieldAlert,
} from "lucide-react";

interface StatsCardsProps {
  stats: DashboardStats | null;
  loading: boolean;
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  if (loading || !stats) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 py-0.5">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-7 w-28 rounded-lg animate-pulse bg-slate-200/50 dark:bg-slate-800/50"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold py-0.5 select-none">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-sm">
        <FileText className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-slate-500 dark:text-slate-400 font-medium">Monitored:</span>
        <strong className="text-slate-900 dark:text-white font-bold">{stats.totalPages.toLocaleString()}</strong>
      </span>

      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 shadow-sm">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-emerald-600/80 dark:text-emerald-400/80 font-medium">Completed:</span>
        <strong className="font-bold">{stats.completed.toLocaleString()}</strong>
      </span>

      {stats.scanning > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60 text-cyan-700 dark:text-cyan-300 animate-pulse shadow-sm">
          <RefreshCw className="w-3.5 h-3.5 text-cyan-500 animate-spin" />
          <span className="text-cyan-600/80 dark:text-cyan-400/80 font-medium">Scanning:</span>
          <strong className="font-bold">{stats.scanning.toLocaleString()}</strong>
        </span>
      )}

      {stats.pending > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 shadow-sm">
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-amber-600/80 dark:text-amber-400/80 font-medium">Pending:</span>
          <strong className="font-bold">{stats.pending.toLocaleString()}</strong>
        </span>
      )}

      {stats.failed > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 shadow-sm">
          <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-rose-600/80 dark:text-rose-400/80 font-medium">Failed:</span>
          <strong className="font-bold">{stats.failed.toLocaleString()}</strong>
        </span>
      )}

      {stats.unclear > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 shadow-sm">
          <ShieldAlert className="w-3.5 h-3.5 text-purple-500" />
          <span className="text-purple-600/80 dark:text-purple-400/80 font-medium">Unclear:</span>
          <strong className="font-bold">{stats.unclear.toLocaleString()}</strong>
        </span>
      )}
    </div>
  );
}

