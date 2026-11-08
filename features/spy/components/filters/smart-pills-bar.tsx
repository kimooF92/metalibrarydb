"use client";

import {
  Layers,
  Trophy,
  Rocket,
  Target,
  Sparkles,
  Video,
  Star,
} from "lucide-react";
import type { SmartPill } from "../../types";

export const SMART_PILLS: SmartPill[] = [
  {
    id: "all",
    label: "All Ads",
    icon: Layers,
    colorClass: "hover:border-slate-400 dark:hover:border-slate-600",
    activeColorClass:
      "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm",
    description: "Browse all active and discovered ads",
  },
  {
    id: "top_winners",
    label: "Top Winners",
    icon: Trophy,
    colorClass: "hover:border-amber-400 dark:hover:border-amber-600 text-amber-600 dark:text-amber-400",
    activeColorClass:
      "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold border-amber-400 shadow-sm shadow-amber-500/25",
    description: "Highest scoring ads combining scale and longevity",
  },
  {
    id: "breakout",
    label: "Trending",
    icon: Rocket,
    colorClass: "hover:border-pink-400 dark:hover:border-pink-600 text-pink-600 dark:text-pink-400",
    activeColorClass:
      "bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 text-white border-pink-500 shadow-sm shadow-pink-500/25",
    description: "New ads launched in last 7 days scaling up with multiple copies",
  },
  {
    id: "multi_angle",
    label: "Multiple Angles",
    icon: Target,
    colorClass: "hover:border-cyan-400 dark:hover:border-cyan-600 text-cyan-600 dark:text-cyan-400",
    activeColorClass:
      "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-500 shadow-sm shadow-cyan-500/25",
    description: "Products where the brand is running 3 or more creative angles",
  },
  {
    id: "evergreen",
    label: "Evergreen",
    icon: Sparkles,
    colorClass: "hover:border-emerald-400 dark:hover:border-emerald-600 text-emerald-600 dark:text-emerald-400",
    activeColorClass:
      "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-sm shadow-emerald-500/25",
    description: "Proven ads running continuously for 30+ days",
  },
  {
    id: "viral_videos",
    label: "Videos",
    icon: Video,
    colorClass: "hover:border-purple-400 dark:hover:border-purple-600 text-purple-600 dark:text-purple-400",
    activeColorClass:
      "bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-500 shadow-sm shadow-purple-500/25",
    description: "Video ads and reels",
  },
  {
    id: "watchlist",
    label: "Saved Brands",
    icon: Star,
    colorClass: "hover:border-yellow-400 dark:hover:border-yellow-600 text-yellow-600 dark:text-yellow-400",
    activeColorClass:
      "bg-gradient-to-r from-amber-500 to-yellow-600 text-white border-yellow-500 shadow-sm shadow-yellow-500/25",
    description: "Ads from your saved and favorite brands",
  },
];

interface SmartPillsBarProps {
  activePreset?: string;
  onPillClick: (pillId: string) => void;
}

export function SmartPillsBar({ activePreset = "all", onPillClick }: SmartPillsBarProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1 hidden md:inline-block">
        Quick Filters:
      </span>
      {SMART_PILLS.map((pill) => {
        const Icon = pill.icon;
        const isActive =
          (pill.id === "all" && (!activePreset || activePreset === "all")) ||
          activePreset === pill.id;

        return (
          <button
            key={pill.id}
            type="button"
            onClick={() => onPillClick(pill.id)}
            title={pill.description}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer select-none ${
              isActive
                ? pill.activeColorClass
                : `bg-slate-50 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 border-slate-200/90 dark:border-slate-800 ${pill.colorClass}`
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{pill.label}</span>
          </button>
        );
      })}
    </div>
  );
}

