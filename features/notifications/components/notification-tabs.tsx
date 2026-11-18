"use client";

import { ShoppingBag, Flame, AlertCircle, Sparkles } from "lucide-react";
import type { NotificationTab } from "../types";

interface NotificationTabsProps {
  activeTab: string;
  onTabChange: (tabId: NotificationTab | string) => void;
}

const TABS: { id: NotificationTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "all", label: "All", icon: Sparkles },
  { id: "products", label: "Products", icon: ShoppingBag },
  { id: "scaling", label: "Scaling", icon: Flame },
  { id: "alerts", label: "Alerts", icon: AlertCircle },
];

export function NotificationTabs({ activeTab, onTabChange }: NotificationTabsProps) {
  return (
    <div className="flex items-center px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 gap-1.5 text-[11px] font-semibold overflow-x-auto scrollbar-none">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer ${
              isActive
                ? "bg-indigo-600 text-white shadow-sm font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
            }`}
          >
            <Icon className={`w-3 h-3 ${isActive ? "text-white" : "text-slate-400 dark:text-slate-500"}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

