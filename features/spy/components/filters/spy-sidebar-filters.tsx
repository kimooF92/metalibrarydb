"use client";

import React, { useState } from "react";
import {
  Filter,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
  Video,
  Image as ImageIcon,
  Layers,
  Flame,
  Zap,
  Rocket,
  Trophy,
  Sparkles,
  Calendar,
  ChevronDown,
  X,
  Search,
  Check,
} from "lucide-react";
import type { AdFilterParams } from "@/types";
import { useSpyBrands } from "@/hooks/use-spy";

export interface SpySidebarFiltersProps {
  filters: AdFilterParams;
  onFilterChange: (newFilters: Partial<AdFilterParams>) => void;
  onReset: () => void;
  activeFilterCount: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export function SpySidebarFilters({
  filters,
  onFilterChange,
  onReset,
  activeFilterCount,
  isCollapsed = false,
  onToggleCollapse,
  className = "",
}: SpySidebarFiltersProps) {
  const { brands } = useSpyBrands();
  const [brandSearchInput, setBrandSearchInput] = useState("");
  const [showCustomDates, setShowCustomDates] = useState(
    Boolean(filters.dateFrom || filters.dateTo)
  );

  const [openSections, setOpenSections] = useState({
    format: true,
    velocity: true,
    winner: true,
    status: true,
    recency: false,
    brands: false,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const currentMedia = filters.mediaType || "all";
  const currentStatus = filters.status || "all";
  const currentMinDup = filters.minDuplications || 1;
  const currentMinScore = filters.minWinnerScore || 0;
  const currentMinDays = filters.minDaysRunning || 0;
  const excludedIds = filters.excludePageIds || [];

  const handleDatePreset = (preset: "all" | "today" | "7d" | "30d") => {
    if (preset === "all") {
      setShowCustomDates(false);
      onFilterChange({ dateFrom: undefined, dateTo: undefined });
      return;
    }

    const now = new Date();
    const toStr = now.toISOString().split("T")[0];
    let fromDate = new Date();

    if (preset === "today") {
      fromDate.setDate(now.getDate());
    } else if (preset === "7d") {
      fromDate.setDate(now.getDate() - 7);
    } else if (preset === "30d") {
      fromDate.setDate(now.getDate() - 30);
    }

    const fromStr = fromDate.toISOString().split("T")[0];
    setShowCustomDates(false);
    onFilterChange({ dateFrom: fromStr, dateTo: toStr });
  };

  const handleRemoveExcludedBrand = (pageId: string) => {
    onFilterChange({
      excludePageIds: excludedIds.filter((id) => id !== pageId),
    });
  };

  return (
    <aside
      className={`flex flex-col h-full shrink-0 border-r border-border bg-card/40 dark:bg-slate-950/40 backdrop-blur-md transition-all duration-300 ease-in-out select-none overflow-hidden ${
        isCollapsed ? "w-[52px]" : "w-64 xl:w-72"
      } ${className}`}
    >
      {isCollapsed ? (
        <div className="flex flex-col items-center py-4 w-full h-full">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition cursor-pointer"
            title="Expand Filter Sidebar"
          >
            <PanelLeftOpen className="w-4 h-4 text-indigo-500" />
          </button>

          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="relative p-2 rounded-md bg-muted/60 text-muted-foreground" title="Filters">
              <Filter className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                  {activeFilterCount}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ─── Sidebar Header ─── */}
          <div className="p-3.5 border-b border-border flex items-center justify-between shrink-0 bg-card/60 dark:bg-slate-950/60">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Filter className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                Filters
              </span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  {activeFilterCount}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400 px-2 py-1 rounded hover:bg-rose-500/10 transition cursor-pointer"
                  title="Reset all filters"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}

              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition cursor-pointer"
                  title="Collapse Filter Sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* ─── Scrollable Filter Sections ─── */}
          <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-4 text-xs">
            {/* ─── 1. MEDIA FORMAT ─── */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => toggleSection("format")}
                className="flex items-center justify-between w-full text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition cursor-pointer"
              >
                <span>Creative Format</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    openSections.format ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openSections.format && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {[
                    { id: "all", label: "All Formats", icon: Layers },
                    { id: "video", label: "Video", icon: Video },
                    { id: "image", label: "Image", icon: ImageIcon },
                    { id: "carousel", label: "Carousel", icon: Layers },
                  ].map((fmt) => {
                    const Icon = fmt.icon;
                    const isSelected = currentMedia === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() =>
                          onFilterChange({
                            mediaType: fmt.id as any,
                          })
                        }
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-card hover:bg-accent text-foreground border-border/80"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{fmt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ─── 2. VELOCITY & SCALING ─── */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => toggleSection("velocity")}
                className="flex items-center justify-between w-full text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition cursor-pointer"
              >
                <span>Velocity & Scale</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    openSections.velocity ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openSections.velocity && (
                <div className="space-y-1 pt-1">
                  {[
                    { minDup: 1, label: "All Scaling Levels", icon: Layers },
                    { minDup: 5, label: "Scaled (5+ Copies)", icon: Flame, badgeClass: "text-amber-500" },
                    { minDup: 10, label: "Mega-Scaled (10+)", icon: Zap, badgeClass: "text-indigo-500" },
                  ].map((tier) => {
                    const Icon = tier.icon;
                    const isSelected = currentMinDup === tier.minDup;
                    return (
                      <button
                        key={tier.minDup}
                        type="button"
                        onClick={() =>
                          onFilterChange({
                            minDuplications: tier.minDup === 1 ? undefined : tier.minDup,
                          })
                        }
                        className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                          isSelected
                            ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold"
                            : "hover:bg-accent text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`w-3.5 h-3.5 ${tier.badgeClass || "text-muted-foreground"}`} />
                          <span>{tier.label}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ─── 3. PERFORMANCE & QUALITY ─── */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => toggleSection("winner")}
                className="flex items-center justify-between w-full text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition cursor-pointer"
              >
                <span>Performance & Quality</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    openSections.winner ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openSections.winner && (
                <div className="space-y-1 pt-1">
                  {[
                    { id: "all", label: "All Creative Scores", icon: Layers, score: 0, days: 0 },
                    { id: "breakout", label: "Breakout Ads", icon: Rocket, score: 75, days: 0, color: "text-rose-500" },
                    { id: "winner", label: "Super Winners (85+)", icon: Trophy, score: 85, days: 0, color: "text-amber-500" },
                    { id: "evergreen", label: "Evergreen (30d+)", icon: Sparkles, score: 0, days: 30, color: "text-emerald-500" },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSelected =
                      item.id === "all"
                        ? currentMinScore === 0 && currentMinDays === 0
                        : item.id === "evergreen"
                        ? currentMinDays >= 30
                        : currentMinScore >= item.score && currentMinDays === 0;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.id === "all") {
                            onFilterChange({ minWinnerScore: undefined, minDaysRunning: undefined });
                          } else if (item.id === "evergreen") {
                            onFilterChange({ minDaysRunning: 30, minWinnerScore: undefined });
                          } else {
                            onFilterChange({ minWinnerScore: item.score, minDaysRunning: undefined });
                          }
                        }}
                        className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                          isSelected
                            ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold"
                            : "hover:bg-accent text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`w-3.5 h-3.5 ${item.color || "text-muted-foreground"}`} />
                          <span>{item.label}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ─── 4. AD STATUS ─── */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => toggleSection("status")}
                className="flex items-center justify-between w-full text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition cursor-pointer"
              >
                <span>Delivery Status</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    openSections.status ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openSections.status && (
                <div className="grid grid-cols-3 gap-1 pt-1">
                  {[
                    { id: "all", label: "All" },
                    { id: "active", label: "Active", dot: "bg-emerald-500" },
                    { id: "inactive", label: "Ended", dot: "bg-slate-400" },
                  ].map((st) => {
                    const isSelected = currentStatus === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => onFilterChange({ status: st.id as any })}
                        className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-card hover:bg-accent text-foreground border-border/80"
                        }`}
                      >
                        {st.dot && <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />}
                        <span>{st.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ─── 5. LAUNCH DATE & RECENCY ─── */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => toggleSection("recency")}
                className="flex items-center justify-between w-full text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition cursor-pointer"
              >
                <span>Launch Recency</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    openSections.recency ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openSections.recency && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: "all", label: "All Time" },
                      { id: "today", label: "Today" },
                      { id: "7d", label: "Last 7 Days" },
                      { id: "30d", label: "Last 30 Days" },
                    ].map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => handleDatePreset(rec.id as any)}
                        className="py-1 px-2 text-[11px] font-medium rounded-md border border-border/70 hover:bg-accent text-foreground transition cursor-pointer text-center"
                      >
                        {rec.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCustomDates((p) => !p)}
                    className="flex items-center gap-1 text-[11px] text-indigo-500 font-medium hover:underline cursor-pointer"
                  >
                    <Calendar className="w-3 h-3" />
                    <span>{showCustomDates ? "Hide Custom Dates" : "Set Custom Date Range"}</span>
                  </button>

                  {showCustomDates && (
                    <div className="space-y-1.5 p-2 rounded-lg bg-muted/40 border border-border/60">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-muted-foreground font-semibold">From:</label>
                        <input
                          type="date"
                          value={filters.dateFrom || ""}
                          onChange={(e) => onFilterChange({ dateFrom: e.target.value || undefined })}
                          className="px-2 py-1 text-xs rounded border border-border bg-background text-foreground"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-muted-foreground font-semibold">To:</label>
                        <input
                          type="date"
                          value={filters.dateTo || ""}
                          onChange={(e) => onFilterChange({ dateTo: e.target.value || undefined })}
                          className="px-2 py-1 text-xs rounded border border-border bg-background text-foreground"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── 6. BRAND EXCLUSIONS ─── */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => toggleSection("brands")}
                className="flex items-center justify-between w-full text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition cursor-pointer"
              >
                <span>Brand Filters</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    openSections.brands ? "rotate-180" : ""
                  }`}
                />
              </button>

              {openSections.brands && (
                <div className="space-y-2 pt-1">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Find brand to exclude..."
                      value={brandSearchInput}
                      onChange={(e) => setBrandSearchInput(e.target.value)}
                      className="w-full pl-8 pr-2 py-1 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  {brandSearchInput.trim() && (
                    <div className="max-h-28 overflow-y-auto space-y-1 p-1 bg-muted/40 rounded-md border border-border/60">
                      {brands
                        .filter((b) =>
                          (b.displayName || "").toLowerCase().includes(brandSearchInput.toLowerCase())
                        )
                        .slice(0, 5)
                        .map((b) => (
                          <button
                            key={b.id || b.pageId}
                            type="button"
                            onClick={() => {
                              const pageId = b.pageId || b.id;
                              if (pageId && !excludedIds.includes(pageId)) {
                                onFilterChange({ excludePageIds: [...excludedIds, pageId] });
                              }
                              setBrandSearchInput("");
                            }}
                            className="flex items-center justify-between w-full text-left px-2 py-1 rounded text-[11px] hover:bg-accent text-foreground cursor-pointer"
                          >
                            <span className="truncate">{b.displayName}</span>
                            <span className="text-[10px] text-rose-500 font-semibold">+ Exclude</span>
                          </button>
                        ))}
                    </div>
                  )}

                  {excludedIds.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        Excluded ({excludedIds.length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {excludedIds.map((id) => (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          >
                            <span className="truncate max-w-[90px]">{id}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveExcludedBrand(id)}
                              className="hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
