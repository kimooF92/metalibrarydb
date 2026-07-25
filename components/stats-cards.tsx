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
} from "lucide-react";

interface StatsCardsProps {
  stats: DashboardStats | null;
  loading: boolean;
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="h-24 glass-card rounded-xl animate-pulse bg-slate-900/40"
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
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      title: "Pending",
      value: stats.pending.toLocaleString(),
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      title: "Running",
      value: stats.scanning.toLocaleString(),
      icon: RefreshCw,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      animate: stats.scanning > 0,
    },
    {
      title: "Completed",
      value: stats.completed.toLocaleString(),
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      title: "Failed",
      value: stats.failed.toLocaleString(),
      icon: AlertCircle,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    },
    {
      title: "Average Results",
      value: stats.averageResults.toLocaleString(),
      icon: BarChart3,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
    },
    {
      title: "Highest Results",
      value: stats.highestResults.toLocaleString(),
      icon: TrendingUp,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
    {
      title: "Last Import",
      value: stats.lastImport ? stats.lastImport.filename : "None",
      subtitle: stats.lastImport
        ? `${stats.lastImport.totalRows} URLs`
        : "No imports yet",
      icon: FolderInput,
      color: "text-slate-300",
      bg: "bg-slate-500/10",
      border: "border-slate-500/20",
      isText: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4 mb-8">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={index}
            className="glass-card rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400 truncate">
                {item.title}
              </span>
              <div className={`p-1.5 rounded-lg ${item.bg} ${item.color}`}>
                <Icon
                  className={`w-3.5 h-3.5 ${
                    item.animate ? "animate-spin" : ""
                  }`}
                />
              </div>
            </div>

            <div className="mt-1">
              <div
                className={`font-bold tracking-tight text-slate-100 truncate ${
                  item.isText ? "text-xs" : "text-lg sm:text-xl"
                }`}
                title={item.value}
              >
                {item.value}
              </div>
              {item.subtitle && (
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {item.subtitle}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
