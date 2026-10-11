"use client";

import React, { useState } from "react";
import {
  Filter,
  RotateCcw,
  Layers,
  Zap,
  Calendar,
  Globe2,
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  Tag,
  Flame,
  TrendingUp,
  Clock,
  Sparkles,
  X,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { NicheTreeSelect, NicheCountItem } from "./niche-tree-select";
import type { SmartPreset } from "./products-kpi-bar";

export interface ProductsSidebarFiltersProps {
  // Niches
  selectedNiches: string[];
  onChangeNiches: (niches: string[]) => void;
  selectedSubNiches: string[];
  onChangeSubNiches: (subs: string[]) => void;
  nicheCounts?: NicheCountItem[];

  // Signals / Presets
  hideInactive: boolean;
  onToggleHideInactive: () => void;
  smartPreset: SmartPreset;
  onSelectPreset: (preset: SmartPreset) => void;

  // Longevity & Dates
  adLaunchFilter: string;
  onChangeAdLaunchFilter: (val: string) => void;
  adLaunchFrom: string;
  onChangeAdLaunchFrom: (val: string) => void;
  adLaunchTo: string;
  onChangeAdLaunchTo: (val: string) => void;
  stillRunningOnly: boolean;
  onToggleStillRunningOnly: () => void;
  adLaunchLabels?: Record<string, string>;

  discoveryFilter: string;
  onChangeDiscoveryFilter: (val: string) => void;
  discoveryFrom: string;
  onChangeDiscoveryFrom: (val: string) => void;
  discoveryTo: string;
  onChangeDiscoveryTo: (val: string) => void;
  discoveryLabels?: Record<string, string>;

  // Platform
  platform: string;
  onChangePlatform: (val: string) => void;
  platformCounts?: { shopify: number; youcan: number; woocommerce: number };

  // Brand
  brandInput: string;
  onChangeBrand: (val: string) => void;
  onClearBrand: () => void;

  // Global Controls
  activeFilterCount: number;
  onResetFilters: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export function ProductsSidebarFilters({
  selectedNiches,
  onChangeNiches,
  selectedSubNiches,
  onChangeSubNiches,
  nicheCounts = [],
  hideInactive,
  onToggleHideInactive,
  smartPreset,
  onSelectPreset,
  adLaunchFilter,
  onChangeAdLaunchFilter,
  adLaunchFrom,
  onChangeAdLaunchFrom,
  adLaunchTo,
  onChangeAdLaunchTo,
  stillRunningOnly,
  onToggleStillRunningOnly,
  adLaunchLabels = {
    all: "All Launch Windows",
    last_7d: "Launched in Last 7 Days",
    last_14d: "Launched in Last 14 Days",
    last_30d: "Launched in Last 30 Days",
    last_60d: "Launched in Last 60 Days",
    last_90d: "Launched 90+ Days Ago (Evergreen)",
    custom: "Custom Launch Range",
  },
  discoveryFilter,
  onChangeDiscoveryFilter,
  discoveryFrom,
  onChangeDiscoveryFrom,
  discoveryTo,
  onChangeDiscoveryTo,
  discoveryLabels = {
    all: "All Discovery Dates",
    today: "Discovered Today",
    last_7d: "Discovered Last 7 Days",
    last_30d: "Discovered Last 30 Days",
    custom: "Custom Discovery Range",
  },
  platform,
  onChangePlatform,
  platformCounts = { shopify: 0, youcan: 0, woocommerce: 0 },
  brandInput,
  onChangeBrand,
  onClearBrand,
  activeFilterCount,
  onResetFilters,
  isCollapsed = false,
  onToggleCollapse,
  className = "",
}: ProductsSidebarFiltersProps) {
  // Accordion section collapse state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    niches: true,
    signals: true,
    longevity: false,
    platform: false,
    brand: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Count active filters per section
  const sectionActiveCounts = {
    niches: selectedNiches.length + selectedSubNiches.length,
    signals: (hideInactive ? 1 : 0) + (smartPreset !== "all" ? 1 : 0),
    longevity:
      (adLaunchFilter !== "all" ? 1 : 0) +
      (discoveryFilter !== "all" ? 1 : 0) +
      (!stillRunningOnly ? 1 : 0),
    platform: platform !== "all" ? 1 : 0,
    brand: brandInput.trim().length > 0 ? 1 : 0,
  };

  if (isCollapsed) {
    return (
      <aside
        className={`w-14 h-full bg-card border-r border-border p-2 flex flex-col items-center gap-3 shrink-0 select-none z-10 ${className}`}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          title="Expand filters sidebar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>

        <div className="h-px w-6 bg-border" />

        <div className="relative">
          <Filter className="w-4 h-4 text-indigo-500" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-2 px-1 py-0.2 rounded-full text-[9px] font-black bg-indigo-600 text-white">
              {activeFilterCount}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="writing-mode-vertical text-[11px] font-bold text-muted-foreground hover:text-foreground tracking-wider uppercase py-4 cursor-pointer"
          style={{ writingMode: "vertical-rl" }}
        >
          Filters ({activeFilterCount})
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`w-72 h-full bg-card border-r border-border shrink-0 flex flex-col select-none z-10 ${className}`}
    >
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-border flex items-center justify-between shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Filter className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Filters
            </h2>
            <span className="text-[10px] text-muted-foreground">
              {activeFilterCount > 0
                ? `${activeFilterCount} active filter${activeFilterCount > 1 ? "s" : ""}`
                : "Refine catalog"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-2 py-1 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer transition-colors"
              title="Clear all active filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Filters Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* SECTION 1: Niches & Categories */}
        <div className="rounded-xl border border-border/80 bg-background/50 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("niches")}
            className="w-full flex items-center justify-between p-2.5 text-xs font-bold text-foreground hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>Niches &amp; Categories</span>
              {sectionActiveCounts.niches > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                  {sectionActiveCounts.niches}
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${
                openSections.niches ? "rotate-180" : ""
              }`}
            />
          </button>

          {openSections.niches && (
            <div className="p-2.5 pt-0 border-t border-border/40">
              <NicheTreeSelect
                selectedNiches={selectedNiches}
                onChangeNiches={onChangeNiches}
                selectedSubNiches={selectedSubNiches}
                onChangeSubNiches={onChangeSubNiches}
                nicheCounts={nicheCounts}
              />
            </div>
          )}
        </div>

        {/* SECTION 2: Signals & Performance */}
        <div className="rounded-xl border border-border/80 bg-background/50 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("signals")}
            className="w-full flex items-center justify-between p-2.5 text-xs font-bold text-foreground hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Signals &amp; Status</span>
              {sectionActiveCounts.signals > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                  {sectionActiveCounts.signals}
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${
                openSections.signals ? "rotate-180" : ""
              }`}
            />
          </button>

          {openSections.signals && (
            <div className="p-2.5 pt-1 border-t border-border/40 space-y-2">
              {/* Active Ads Only Switch */}
              <button
                type="button"
                onClick={onToggleHideInactive}
                className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                  hideInactive
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "border-border hover:bg-accent text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  {hideInactive ? (
                    <EyeOff className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span>Active Ads Only</span>
                </div>
                <div
                  className={`w-7 h-4 rounded-full transition-colors relative ${
                    hideInactive ? "bg-emerald-500" : "bg-muted"
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                      hideInactive ? "right-0.5" : "left-0.5"
                    }`}
                  />
                </div>
              </button>

              {/* Smart Signal Pills */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {[
                  { id: "breakout" as SmartPreset, label: "Breakout", icon: Flame, color: "text-amber-500" },
                  { id: "scaled" as SmartPreset, label: "Most Scaled", icon: TrendingUp, color: "text-emerald-500" },
                  { id: "new" as SmartPreset, label: "New This Week", icon: Sparkles, color: "text-blue-500" },
                  { id: "evergreen" as SmartPreset, label: "Evergreen", icon: Clock, color: "text-purple-500" },
                  { id: "with_offers" as SmartPreset, label: "Discounts & Offers", icon: Tag, color: "text-rose-500" },
                  { id: "favorites" as SmartPreset, label: "Favorites", icon: Sparkles, color: "text-amber-400" },
                ].map((item) => {
                  const isActive = smartPreset === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectPreset(isActive ? "all" : item.id)}
                      className={`flex items-center gap-1.5 p-2 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                        isActive
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                          : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className={`w-3 h-3 ${isActive ? "text-white" : item.color}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: Longevity & Date Ranges */}
        <div className="rounded-xl border border-border/80 bg-background/50 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("longevity")}
            className="w-full flex items-center justify-between p-2.5 text-xs font-bold text-foreground hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              <span>Longevity &amp; Dates</span>
              {sectionActiveCounts.longevity > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                  {sectionActiveCounts.longevity}
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${
                openSections.longevity ? "rotate-180" : ""
              }`}
            />
          </button>

          {openSections.longevity && (
            <div className="p-2.5 pt-1 border-t border-border/40 space-y-3">
              {/* Ad Launch Date Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Ad Launch Window
                </label>
                <div className="space-y-1">
                  {[
                    { id: "all", label: "All Time" },
                    { id: "last_7d", label: "Last 7 Days" },
                    { id: "last_14d", label: "Last 14 Days" },
                    { id: "last_30d", label: "Last 30 Days" },
                    { id: "last_60d", label: "Last 60 Days" },
                    { id: "last_90d", label: "90+ Days (Evergreen)" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeAdLaunchFilter(opt.id)}
                      className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                        adLaunchFilter === opt.id
                          ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold"
                          : "hover:bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {adLaunchFilter === opt.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Still Running Switch */}
              <div className="pt-1 border-t border-border/40">
                <label className="flex items-center justify-between cursor-pointer py-1 text-[11px] font-medium text-foreground">
                  <span>Only if Still Running</span>
                  <input
                    type="checkbox"
                    checked={stillRunningOnly}
                    onChange={onToggleStillRunningOnly}
                    className="w-3.5 h-3.5 rounded border-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Discovery Date Range */}
              <div className="space-y-1 pt-1 border-t border-border/40">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  First Seen Discovery
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { id: "all", label: "Any Time" },
                    { id: "today", label: "Today" },
                    { id: "last_7d", label: "7 Days" },
                    { id: "last_30d", label: "30 Days" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeDiscoveryFilter(opt.id)}
                      className={`p-1 rounded-md text-[10px] font-medium text-center border cursor-pointer transition-colors ${
                        discoveryFilter === opt.id
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "border-border hover:bg-accent text-muted-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 4: E-Commerce Platform */}
        <div className="rounded-xl border border-border/80 bg-background/50 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("platform")}
            className="w-full flex items-center justify-between p-2.5 text-xs font-bold text-foreground hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Globe2 className="w-3.5 h-3.5 text-cyan-500" />
              <span>Store Platform</span>
              {sectionActiveCounts.platform > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                  {sectionActiveCounts.platform}
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${
                openSections.platform ? "rotate-180" : ""
              }`}
            />
          </button>

          {openSections.platform && (
            <div className="p-2.5 pt-1 border-t border-border/40 space-y-1">
              {[
                { id: "all", label: "All Platforms", count: 0 },
                { id: "shopify", label: "Shopify", count: platformCounts.shopify },
                { id: "youcan", label: "YouCan", count: platformCounts.youcan },
                { id: "woocommerce", label: "WooCommerce", count: platformCounts.woocommerce },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangePlatform(item.id)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    platform === item.id
                      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums text-muted-foreground bg-muted">
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 5: Brand & Domain */}
        <div className="rounded-xl border border-border/80 bg-background/50 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("brand")}
            className="w-full flex items-center justify-between p-2.5 text-xs font-bold text-foreground hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-violet-500" />
              <span>Brand &amp; Domain</span>
              {sectionActiveCounts.brand > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                  {sectionActiveCounts.brand}
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${
                openSections.brand ? "rotate-180" : ""
              }`}
            />
          </button>

          {openSections.brand && (
            <div className="p-2.5 pt-1 border-t border-border/40 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  value={brandInput}
                  onChange={(e) => onChangeBrand(e.target.value)}
                  placeholder="e.g. Nike, Apple, brand domain..."
                  className="w-full bg-background text-foreground text-xs rounded-lg pl-8 pr-7 py-1.5 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
                {brandInput && (
                  <button
                    type="button"
                    onClick={onClearBrand}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
