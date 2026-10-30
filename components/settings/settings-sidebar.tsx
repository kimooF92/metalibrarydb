"use client";

import React, { useState } from "react";
import {
  Cpu,
  Sparkles,
  Globe,
  Database,
  Shield,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Sliders,
  ChevronRight,
  HardDrive,
  Activity,
  Server,
  Layers,
} from "lucide-react";

export type SettingsTab = "general" | "spy" | "discovery" | "maintenance" | "security";

export interface SettingsTabItem {
  id: SettingsTab;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SETTINGS_TABS: SettingsTabItem[] = [
  {
    id: "general",
    label: "General & Scanning",
    subtitle: "Linking rules & stale refresh",
    icon: Cpu,
  },
  {
    id: "spy",
    label: "Ad Feed & Cloud",
    subtitle: "Delta triggers & B2 storage",
    icon: Sparkles,
  },
  {
    id: "discovery",
    label: "Discovery Engine",
    subtitle: "Domain linking & search depth",
    icon: Globe,
  },
  {
    id: "maintenance",
    label: "Database & Queue",
    subtitle: "Pruning, AI cache & CSV export",
    icon: Database,
  },
  {
    id: "security",
    label: "Security & Access",
    subtitle: "Master gate & staff permissions",
    icon: Shield,
  },
];

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  isDirty?: boolean;
  dirtyTabs?: SettingsTab[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export function SettingsSidebar({
  activeTab,
  onSelectTab,
  isDirty = false,
  dirtyTabs = [],
  isCollapsed = false,
  onToggleCollapse,
  className = "",
}: SettingsSidebarProps) {
  const isCustomFullWidth = className.includes("w-full");
  const widthClass = isCustomFullWidth ? "w-full" : isCollapsed ? "w-14" : "w-64 lg:w-72";

  return (
    <aside
      className={`relative h-full bg-white dark:bg-[#06080D] border-r border-slate-200 dark:border-slate-800/80 shrink-0 flex flex-col select-none z-10 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${widthClass} ${className}`}
    >
      {/* Collapsed Rail (Visible when collapsed on desktop) */}
      {!isCustomFullWidth && (
        <div
          aria-hidden={!isCollapsed}
          className={`absolute inset-y-0 left-0 w-14 p-2 flex flex-col items-center justify-between bg-white dark:bg-[#06080D] z-20 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
            isCollapsed
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none -translate-x-2"
          }`}
        >
          <div className="flex flex-col items-center gap-3 w-full">
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer transition-colors"
                title="Expand settings navigation"
                aria-label="Expand settings navigation"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            <div className="h-px w-6 bg-slate-200 dark:bg-slate-800" />

            {/* Collapsed Tab Icons */}
            <div className="flex flex-col items-center gap-1.5 w-full">
              {SETTINGS_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                const tabDirty = dirtyTabs.includes(tab.id) || (isDirty && active);

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    title={tab.label}
                    className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                      active
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tabDirty && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-[#06080D]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-1 text-slate-400 dark:text-slate-600">
            <Sliders className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* Expanded Sidebar View */}
      <div
        className={`flex flex-col h-full w-full transition-opacity duration-200 ${
          isCollapsed && !isCustomFullWidth ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-slate-200 dark:border-slate-800/80 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs shrink-0">
              <Settings className="w-4 h-4" />
            </div>
            <div className="min-w-0 truncate">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                Settings & System
              </h2>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium block truncate">
                Preferences & Engine
              </span>
            </div>
          </div>

          {!isCustomFullWidth && onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              title="Collapse settings sidebar"
              aria-label="Collapse settings sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Section Navigation Items */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2.5 py-1 block">
            Configuration Modules
          </span>

          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const tabDirty = dirtyTabs.includes(tab.id) || (isDirty && active);

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer group ${
                  active
                    ? "bg-indigo-50 dark:bg-indigo-500/12 text-slate-900 dark:text-white border border-indigo-500/20 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/40 border border-transparent"
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      active
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  <div className="min-w-0 truncate">
                    <span
                      className={`text-xs block truncate ${
                        active ? "font-bold text-slate-900 dark:text-white" : "font-medium"
                      }`}
                    >
                      {tab.label}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate">
                      {tab.subtitle}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0 ml-1">
                  {tabDirty && (
                    <span
                      className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      title="Unsaved changes in this module"
                    >
                      EDITED
                    </span>
                  )}
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${
                      active
                        ? "text-indigo-600 dark:text-indigo-400 translate-x-0.5"
                        : "text-slate-400 dark:text-slate-600 opacity-0 group-hover:opacity-100"
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer System Health Telemetry */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/20 shrink-0">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Core Engine
              </span>
            </div>
            <span className="text-[10px] font-mono font-medium text-slate-400 dark:text-slate-500">
              v2.4.0
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
