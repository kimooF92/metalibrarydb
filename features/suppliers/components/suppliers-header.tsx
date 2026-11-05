"use client";

import { SuppliersStats } from "@/types";
import { RefreshCw, Plus, Truck, Sparkles } from "lucide-react";

interface SuppliersHeaderProps {
  stats: SuppliersStats | null;
  isRefreshing: boolean;
  onAddClick: () => void;
  onRefreshClick: () => void;
}

export function SuppliersHeader({
  stats,
  isRefreshing,
  onAddClick,
  onRefreshClick,
}: SuppliersHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800/40">
      <div className="flex items-center flex-wrap gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              Suppliers
              {stats && stats.unseenDropsCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-500/30 animate-pulse">
                  <Sparkles className="w-2.5 h-2.5" />
                  {stats.unseenDropsCount} New Drop{stats.unseenDropsCount > 1 ? "s" : ""}
                </span>
              )}
            </h1>
          </div>
        </div>

        {stats && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-semibold">
              <span className="text-slate-400 font-normal">Active:</span>
              <span>{stats.activeSuppliers}</span>
            </span>

            <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md font-semibold">
              <span className="text-indigo-600/70 dark:text-indigo-400/70 font-normal">Photos (30d):</span>
              <span>{stats.photosThisMonth}</span>
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onAddClick}
          className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Supplier</span>
        </button>

        <button
          onClick={onRefreshClick}
          disabled={isRefreshing}
          title="Refresh suppliers list"
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`} />
        </button>
      </div>
    </div>
  );
}

