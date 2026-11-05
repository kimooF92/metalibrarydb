"use client";

import { Search, X, Sparkles, Filter } from "lucide-react";

interface SuppliersFilterBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  statusFilter: string;
  onStatusChange: (val: string) => void;
  unseenDropsCount?: number;
}

export function SuppliersFilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  unseenDropsCount = 0,
}: SuppliersFilterBarProps) {
  const tabs = [
    { id: "all", label: "All Suppliers" },
    {
      id: "has_drop",
      label: "New Drops",
      badge: unseenDropsCount > 0 ? unseenDropsCount : undefined,
      isDrop: true,
    },
    { id: "active", label: "Active" },
    { id: "paused", label: "Paused" },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search suppliers by name or Facebook URL..."
          className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Status Segmented Buttons */}
      <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 shrink-0 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onStatusChange(tab.id)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                isActive
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {tab.isDrop && <Sparkles className="w-3 h-3 text-fuchsia-500" />}
              <span>{tab.label}</span>
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-fuchsia-500 text-white leading-none">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

