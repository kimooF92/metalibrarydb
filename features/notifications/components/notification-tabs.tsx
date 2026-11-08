"use client";

interface NotificationTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const TABS = [
  { id: "all", label: "All" },
  { id: "breakout_alert", label: "Trending" },
  { id: "activity", label: "Activity" },
];

export function NotificationTabs({ activeTab, onTabChange }: NotificationTabsProps) {
  return (
    <div className="flex items-center px-3 py-2 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-900/30 gap-1.5 text-[11px] font-semibold overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-3 py-1 rounded-lg transition-colors shrink-0 cursor-pointer ${
            activeTab === tab.id
              ? "bg-indigo-600 text-white shadow-sm font-bold"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

