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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-20 glass-card rounded-xl animate-pulse bg-slate-200/40 dark:bg-slate-900/40"
          />
        ))}
      </div>
    );
  }

  const items = [
    {
      title: "Total Pages",
      value: stats.totalPages.toLocaleString(),
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      title: "Pending",
      value: stats.pending.toLocaleString(),
      icon: Clock,
      color: "text-amber-700 dark:text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      title: "Running",
      value: stats.scanning.toLocaleString(),
      icon: RefreshCw,
      color: "text-cyan-700 dark:text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      animate: stats.scanning > 0,
    },
    {
      title: "Completed",
      value: stats.completed.toLocaleString(),
      icon: CheckCircle2,
      color: "text-emerald-700 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      title: "Failed",
      value: stats.failed.toLocaleString(),
      icon: AlertCircle,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    },
    {
      title: "Unclear",
      value: stats.unclear.toLocaleString(),
      icon: ShieldAlert,
      color: "text-purple-700 dark:text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={index}
            className="glass-card rounded-xl p-3.5 transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 truncate">
                {item.title}
              </span>
              <div className={`p-1 rounded-lg ${item.bg} ${item.color}`}>
                <Icon
                  className={`w-3.5 h-3.5 ${
                    item.animate ? "animate-spin" : ""
                  }`}
                />
              </div>
            </div>

            <div className="mt-1">
              <div
                className="font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate text-lg sm:text-xl"
                title={item.value}
              >
                {item.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

