"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { TrackedPage, DashboardStats } from "@/types";
import { HistoryModal } from "./history-modal";
import { DeleteConfirmModal } from "./delete-confirm-modal";
import { ScanRunnerModal } from "./scan-runner-modal";
import { ResolveBrandModal } from "./resolve-brand-modal";
import {
  Search,
  Filter,
  SlidersHorizontal,
  RefreshCw,
  History,
  RotateCcw,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ExternalLink,
  Loader2,
  ShieldAlert,
  Pencil,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Flame,
  Star,
  AlertTriangle,
  StickyNote,
  Eye,
  Sparkles,
  Clock,
  CheckCircle2,
  Package,
} from "lucide-react";

function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Never";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Never";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function InlineSparkline({
  points,
  difference,
}: {
  points?: number[] | null;
  difference?: number | null;
}) {
  if (!points || points.length < 2) {
    return (
      <div className="w-14 h-4 flex items-center justify-center opacity-40">
        <div className="w-6 h-[1.5px] bg-slate-300 dark:bg-slate-700 rounded-full" />
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const width = 56;
  const height = 18;
  const padding = 2;

  const coords = points.map((v, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylineStr = coords.join(" ");
  const areaStr = `${padding},${height - padding} ${polylineStr} ${width - padding},${height - padding}`;

  const isUp = (difference ?? 0) > 0;
  const isDown = (difference ?? 0) < 0;

  const strokeColor = isUp ? "#10b981" : isDown ? "#f43f5e" : "#818cf8";
  const fillColor = isUp
    ? "rgba(16, 185, 129, 0.15)"
    : isDown
      ? "rgba(244, 63, 94, 0.15)"
      : "rgba(129, 140, 248, 0.15)";

  const lastPoint = coords[coords.length - 1].split(",");

  return (
    <div className="flex items-center" title={`Trend (last ${points.length} scans): ${points.join(" → ")} ads`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-14 h-4.5 overflow-visible select-none shrink-0"
      >
        <polygon points={areaStr} fill={fillColor} />
        <polyline
          points={polylineStr}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={lastPoint[0]} cy={lastPoint[1]} r="2" fill={strokeColor} />
      </svg>
    </div>
  );
}

interface PagesTableProps {
  pages: TrackedPage[];
  loading: boolean;
  onRefresh: (ids: string[]) => void;
  onRetry: (ids?: string[]) => void;
  onDelete: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  searchTypeFilter: string;
  onSearchTypeFilterChange: (value: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount?: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (col: string) => void;
  onBulkDelete?: (ids: string[]) => void;
  onWatchlistToggle?: () => void;
  onResetFilters?: () => void;
  stats?: DashboardStats | null;
}

export function PagesTable({
  pages,
  loading,
  onRefresh,
  onRetry,
  onDelete,
  onBulkDelete,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  searchTypeFilter,
  onSearchTypeFilterChange,
  activeTab,
  onTabChange,
  page,
  pageSize,
  totalPages,
  totalCount,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder,
  onSortChange,
  onWatchlistToggle,
  onResetFilters,
  stats,
}: PagesTableProps) {
  const [watchlisted, setWatchlisted] = useState<Record<string, boolean>>(
    Object.fromEntries(pages.map((p) => [p.id, p.isWatchlisted ?? false]))
  );

  const [toast, setToast] = useState<{
    type: "success" | "error" | "info" | "warning";
    title: string;
    message: string;
  } | null>(null);

  const triggerToast = (type: "success" | "error" | "info" | "warning", title: string, message: string) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 4500);
  };

  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);

  // Close filter popover on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setShowFilterPopover(false);
      }
    }
    if (showFilterPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showFilterPopover]);

  useEffect(() => {
    setWatchlisted(Object.fromEntries(pages.map((p) => [p.id, p.isWatchlisted ?? false])));
  }, [pages]);

  const toggleWatchlist = useCallback(async (id: string) => {
    const next = !watchlisted[id];
    setWatchlisted((prev) => ({ ...prev, [id]: next }));
    const target = pages.find((p) => p.id === id);
    if (target) target.isWatchlisted = next;

    try {
      const res = await fetch(`/api/page/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatchlisted: next }),
      });
      if (res.ok) {
        onWatchlistToggle?.();
      } else {
        if (target) target.isWatchlisted = !next;
        setWatchlisted((prev) => ({ ...prev, [id]: !next }));
      }
    } catch {
      if (target) target.isWatchlisted = !next;
      setWatchlisted((prev) => ({ ...prev, [id]: !next }));
    }
  }, [watchlisted, pages, onWatchlistToggle]);
  const SortHeader = ({
    col,
    label,
    className = "",
  }: {
    col: string;
    label: string;
    className?: string;
  }) => {
    const active = sortBy === col;
    return (
      <th
        className={`px-3 py-1.5 whitespace-nowrap ${className}`}
      >
        <button
          onClick={() => onSortChange(col)}
          className={`flex items-center gap-1 group transition-colors ${active ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
            }`}
        >
          <span>{label}</span>
          <span className="transition-transform">
            {active ? (
              sortOrder === "asc" ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )
            ) : (
              <ChevronsUpDown className="w-3 h-3 opacity-40 group-hover:opacity-80" />
            )}
          </span>
        </button>
      </th>
    );
  };
  const [selectedHistoryPage, setSelectedHistoryPage] = useState<TrackedPage | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const [selectedDrawerPage, setSelectedDrawerPage] = useState<TrackedPage | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [runnerModalPages, setRunnerModalPages] = useState<TrackedPage[]>([]);
  const [runnerModalOpen, setRunnerModalOpen] = useState(false);

  const [resolveModalPageId, setResolveModalPageId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const target = params.get("resolveModal");
      if (target) {
        setResolveModalPageId(target);
      }
    }
  }, []);

  const handleLaunchScan = async (runner: "local" | "apify") => {
    if (runnerModalPages.length === 0) return;
    const targetIds = runnerModalPages.map((p) => p.id);

    try {
      const res = await fetch("/api/spy/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackedPageIds: targetIds, runner }),
      });
      const data = await res.json();

      if (res.ok) {
        if (targetIds.length === 1) {
          const statusItem = data.pageStatuses?.[0];
          const brandName = runnerModalPages[0].displayName || runnerModalPages[0].pageId || runnerModalPages[0].id;

          if (statusItem?.status === "apify_launched") {
            triggerToast(
              "success",
              "⚡ Apify Scan Launched",
              `Launched Apify Delta Cloud scan for "${brandName}" (${statusItem.message})`
            );
          } else if (statusItem?.status === "already_queued") {
            triggerToast(
              "warning",
              "Already Queued",
              `Creative scan for "${brandName}" is already pending/running in queue.`
            );
          } else {
            triggerToast(
              "success",
              "Local Scan Queued",
              `Local Playwright creative scan queued for "${brandName}".`
            );
          }
        } else {
          triggerToast(
            "success",
            "Bulk Creative Scans Started",
            `Started ${data.enqueuedCount || 0} scan job(s) via ${runner === "apify" ? "Apify Cloud" : "Local Worker"}.`
          );
        }
        onWatchlistToggle?.();
        setSelectedIds([]);
      } else {
        triggerToast("error", "Scan Failed", data.error || "Could not launch creative scan");
      }
    } catch {
      triggerToast("error", "Network Error", "Failed to launch creative scan");
    }
  };

  const [pageToDelete, setPageToDelete] = useState<TrackedPage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async (id: string) => {
    setDeleting(true);
    try {
      await onDelete(id);
      setPageToDelete(null);
    } catch (err) {
      console.error("Failed to delete page", err);
    } finally {
      setDeleting(false);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);

  const startEditing = (p: TrackedPage) => {
    setEditingId(p.id);
    setEditingName(p.displayName || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEditing = async (id: string) => {
    if (!editingName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/page/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: editingName.trim() }),
      });
      if (res.ok) {
        const targetPage = pages.find((p) => p.id === id);
        if (targetPage) targetPage.displayName = editingName.trim();
        cancelEditing();
      }
    } catch (err) {
      console.error("Failed to update display name", err);
    } finally {
      setSavingEdit(false);
    }
  };

  const openHistory = (p: TrackedPage) => {
    setSelectedHistoryPage(p);
    setHistoryModalOpen(true);
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allVisibleSelected =
    pages.length > 0 && pages.every((p) => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pages.map((p) => p.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const saveNotes = async (id: string) => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/page/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editingNotesValue }),
      });
      if (res.ok) {
        const target = pages.find((p) => p.id === id);
        if (target) (target as any).notes = editingNotesValue;
        setEditingNotes(null);
      }
    } catch (err) {
      console.error("Failed to save notes", err);
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4">
      {/* Mobile Toggle Button for Filters */}
      <div className="flex lg:hidden items-center justify-between gap-2 p-1.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/80">
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="flex items-center space-x-2 text-xs font-semibold px-3 py-2 rounded-lg bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-250 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer w-full justify-between"
        >
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-indigo-500" />
            <span>Filters & Smart Tabs</span>
            {(statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "all" || search !== "") && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            )}
          </div>
          {showMobileFilters ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
      </div>

      {/* Search, Tabs, & Filters Combined Toolbar */}
      <div className={`${showMobileFilters ? "flex" : "hidden lg:flex"} flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/40`}>
        {/* Left Side: Global Search Bar */}
        <div className="relative w-full sm:w-64 md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500 dark:text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search brand, page ID, or keyword..."
            className="w-full bg-white dark:bg-slate-950/80 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg pl-8 pr-8 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-all font-medium"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Side: 1-Click Smart Tabs & Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Smart Tabs */}
          {[
            { id: "all", label: "All Pages", icon: null },
            { id: "watchlist", label: "Watchlist", icon: Star, iconColor: "text-yellow-500 dark:text-yellow-400 fill-yellow-500/10 dark:fill-yellow-400/20" },
            { id: "high_volume", label: "High Volume", icon: Flame, iconColor: "text-amber-500 dark:text-amber-400 fill-amber-500/10 dark:fill-amber-400/20" },
            { id: "attention", label: "Attention", icon: ShieldAlert, iconColor: "text-rose-500 dark:text-rose-400" },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id || (tab.id === "attention" && (activeTab === "zero_ads" || activeTab === "needs_review"));
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${active
                    ? "bg-indigo-655/10 dark:bg-indigo-600/20 border-indigo-400/40 dark:border-indigo-500/40 text-indigo-650 dark:text-indigo-300 shadow-md shadow-indigo-600/10"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
              >
                {Icon && <Icon className={`w-3 h-3 ${tab.iconColor || ""}`} />}
                <span>{tab.label}</span>
              </button>
            );
          })}

          {/* Consolidated ⚙ Filters Popover */}
          <div className="relative" ref={filterPopoverRef}>
            <button
              type="button"
              onClick={() => setShowFilterPopover((prev) => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                statusFilter !== "all" || searchTypeFilter !== "all"
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shadow-sm"
                  : "bg-white dark:bg-slate-950/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
              }`}
              title="Table filters & options"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
              <span>Filters</span>
              {(statusFilter !== "all" || searchTypeFilter !== "all") && (
                <span className="bg-indigo-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {(statusFilter !== "all" ? 1 : 0) + (searchTypeFilter !== "all" ? 1 : 0)}
                </span>
              )}
              {showFilterPopover ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {showFilterPopover && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3.5 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Table Filters</span>
                  </div>
                  {(statusFilter !== "all" || searchTypeFilter !== "all") && (
                    <button
                      onClick={() => {
                        onStatusFilterChange("all");
                        onSearchTypeFilterChange("all");
                      }}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Scan Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => onStatusFilterChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="success">Success</option>
                    <option value="pending">Pending</option>
                    <option value="scanning">Scanning</option>
                    <option value="failed">Failed</option>
                    <option value="unclear">Unclear</option>
                  </select>
                </div>

                {/* Search Type Filter */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Search Type</label>
                  <select
                    value={searchTypeFilter}
                    onChange={(e) => onSearchTypeFilterChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    <option value="page">Page ID</option>
                    <option value="keyword_exact_phrase">Exact Phrase</option>
                    <option value="keyword_unordered">Unordered Keyword</option>
                  </select>
                </div>

                {/* Rows Limit Select Menu */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Rows per Page</label>
                  <select
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    aria-label="Select rows per page"
                  >
                    <option value={25}>25 rows</option>
                    <option value={50}>50 rows</option>
                    <option value={100}>100 rows</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Reset Filters Toolbar Button */}
          {(search !== "" || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "all" || page > 1) && onResetFilters && (
            <button
              onClick={onResetFilters}
              className="flex items-center space-x-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer whitespace-nowrap shrink-0"
              title="Reset all filters and search to default"
            >
              <X className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>Reset</span>
            </button>
          )}

          {/* Retry Failed - conditionally rendered if failed jobs exist */}
          {((stats?.failed ?? 0) > 0 || pages.some((p) => p.status === "failed")) && (
            <button
              onClick={() => onRetry()}
              className="flex items-center space-x-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 transition-all cursor-pointer whitespace-nowrap shrink-0 animate-in fade-in"
              title="Retry failed scan jobs"
            >
              <RotateCcw className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>Retry Failed {stats?.failed ? `(${stats.failed})` : ""}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/90 border border-indigo-200 dark:border-indigo-500/40 px-4 py-2.5 rounded-xl text-xs text-indigo-800 dark:text-indigo-200 mb-4 animate-in fade-in duration-150">
          <div className="flex items-center space-x-2 font-medium">
            <span className="font-bold text-indigo-700 dark:text-white px-2 py-0.5 rounded bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30">
              {selectedIds.length}
            </span>
            <span>
              {selectedIds.length === 1 ? "page selected" : "pages selected"}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                onRefresh(selectedIds);
                setSelectedIds([]);
              }}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh ({selectedIds.length})</span>
            </button>

            <button
              onClick={() => {
                const targetPages = pages.filter((p) => selectedIds.includes(p.id));
                setRunnerModalPages(targetPages);
                setRunnerModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-md shadow-purple-600/30 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Extract Ad Spy ({selectedIds.length})</span>
            </button>

            {onBulkDelete && (
              <button
                onClick={() => {
                  if (confirm(`Delete ${selectedIds.length} selected page(s)? This cannot be undone.`)) {
                    onBulkDelete(selectedIds);
                    setSelectedIds([]);
                  }
                }}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-md shadow-rose-600/30 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedIds.length})</span>
              </button>
            )}

            <button
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 flex-1 min-h-[400px] md:min-h-0 flex flex-col overflow-hidden">
        <div className="overflow-auto flex-1 min-h-0 relative">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-20 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800/80 uppercase tracking-wider select-none shadow-sm">
              <tr>
                <th className="px-3 py-1.5 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                  />
                </th>
                <th className="px-2 py-1.5 w-7 text-center">
                  <Star className="w-3 h-3 text-slate-400 dark:text-slate-500 mx-auto" />
                </th>
                <SortHeader col="displayName" label="Brand / Page Name" className="min-w-[180px]" />
                <SortHeader col="currentResults" label="Active Ads" className="w-36" />
                <th className="px-3 py-1.5 whitespace-nowrap text-slate-400 font-medium" title="Approximate number of unique products advertised by this brand (clustered by landing page URLs and ad copy fingerprints)">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3 text-indigo-400" />
                    Approx Products
                  </span>
                </th>
                <th className="px-3 py-1.5 whitespace-nowrap text-slate-400 font-medium">Prev Ads</th>
                <SortHeader col="difference" label="Difference" className="w-32" />
                <SortHeader col="status" label="Status" className="w-28" />
                <SortHeader col="lastChecked" label="Last Checked" className="w-36" />
                <th className="px-3 py-1.5 text-right whitespace-nowrap text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500 dark:text-indigo-400 mx-auto mb-2" />
                    <span>Loading tracked pages...</span>
                  </td>
                </tr>
              ) : pages.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400">
                        <Filter className="w-6 h-6 opacity-60" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          No matching tracked pages found
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {search || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "all" || page > 1
                            ? "Your active filters or smart tab narrowed down results to zero."
                            : "No tracked Meta Ad Library pages have been added yet."}
                        </p>
                      </div>

                      {/* Active Filter Chips */}
                      {(search || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "all" || page > 1) && (
                        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                          {activeTab !== "all" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                              Tab: {activeTab}
                            </span>
                          )}
                          {statusFilter !== "all" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              Status: {statusFilter}
                            </span>
                          )}
                          {searchTypeFilter !== "all" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                              Type: {searchTypeFilter}
                            </span>
                          )}
                          {search && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              Search: &quot;{search}&quot;
                            </span>
                          )}
                          {page > 1 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              Page {page}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Reset Button */}
                      {(search || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "all" || page > 1) && onResetFilters && (
                        <button
                          onClick={onResetFilters}
                          className="mt-2 inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Clear Filters & Show All Pages</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pages.map((p) => {
                  const diff = p.difference;
                  let diffBadge = (
                    <span className="text-slate-400 dark:text-slate-600 font-medium text-xs">—</span>
                  );

                  if (diff === 0) {
                    diffBadge = (
                      <span className="inline-flex items-center text-xs text-slate-500 dark:text-slate-400 font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                        <Minus className="w-3 h-3 mr-1 text-slate-400" /> 0
                      </span>
                    );
                  } else if (diff !== null && diff !== undefined) {
                    if (diff >= 20) {
                      diffBadge = (
                        <span className="inline-flex items-center gap-1 font-extrabold text-xs text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md shadow-sm shadow-amber-500/10" title="Rapidly Scaling (+20 or more ads)">
                          <Flame className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 fill-amber-500/20 animate-pulse shrink-0" />
                          <span>+{diff}</span>
                          <span className="text-[9px] uppercase tracking-wide font-black px-1 py-0.2 bg-amber-500/25 rounded text-amber-800 dark:text-amber-200">Scaling</span>
                        </span>
                      );
                    } else if (diff > 0) {
                      diffBadge = (
                        <span className="inline-flex items-center gap-0.5 font-bold text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/12 border border-emerald-500/25 px-2 py-0.5 rounded-md shadow-sm">
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                          <span>+{diff}</span>
                        </span>
                      );
                    } else if (diff <= -20) {
                      diffBadge = (
                        <span className="inline-flex items-center gap-1 font-extrabold text-xs text-rose-800 dark:text-rose-200 bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 rounded-md shadow-sm" title="Heavy Descaling (-20 or more ads)">
                          <ArrowDownRight className="w-3.5 h-3.5 text-rose-500 stroke-[3]" />
                          <span>{diff}</span>
                          <span className="text-[9px] uppercase tracking-wide font-black px-1 py-0.2 bg-rose-500/30 rounded text-rose-300">Dropped</span>
                        </span>
                      );
                    } else {
                      diffBadge = (
                        <span className="inline-flex items-center gap-0.5 font-bold text-xs text-rose-700 dark:text-rose-300 bg-rose-500/12 border border-rose-500/25 px-2 py-0.5 rounded-md shadow-sm">
                          <ArrowDownRight className="w-3.5 h-3.5 text-rose-500 stroke-[2.5]" />
                          <span>{diff}</span>
                        </span>
                      );
                    }
                  }

                  const isHighVolume = p.currentResults !== null && p.currentResults >= 50;
                  const isDimmed = p.currentResults === 0 || p.status === "unclear";

                  const isSelected = selectedIds.includes(p.id);

                  return (
                    <tr
                      key={p.id}
                      className={`transition-all group ${isSelected
                          ? "bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
                          : watchlisted[p.id]
                            ? "bg-amber-500/[0.03] border-l-2 border-l-yellow-500 dark:border-l-yellow-400/70 hover:bg-amber-500/[0.07]"
                            : isHighVolume
                              ? "bg-amber-500/[0.02] dark:bg-amber-500/[0.04] hover:bg-amber-500/[0.05] dark:hover:bg-amber-500/[0.08] border-l-2 border-l-amber-500 dark:border-l-amber-400"
                              : isDimmed
                                ? "opacity-60 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-900/40"
                                : "hover:bg-slate-50 dark:hover:bg-slate-900/60"
                        }`}
                    >
                      {/* Watchlist Star */}
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => toggleWatchlist(p.id)}
                          title={watchlisted[p.id] ? "Remove from watchlist" : "Add to watchlist"}
                          className={`p-0.5 rounded transition-all ${watchlisted[p.id]
                              ? "text-yellow-500 dark:text-yellow-400"
                              : "text-slate-400 dark:text-slate-700 hover:text-yellow-500 dark:hover:text-yellow-400/60 opacity-0 group-hover:opacity-100"
                            }`}
                        >
                          <Star className={`w-3 h-3 ${watchlisted[p.id] ? "fill-yellow-500 dark:fill-yellow-400" : ""}`} />
                        </button>
                      </td>
                      {/* Checkbox */}
                      <td className="px-2.5 py-1.5 text-center">
                        <label className="relative inline-flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(p.id)}
                            aria-label={`Select ${p.displayName || "tracked page"}`}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center shadow-sm ${isSelected
                              ? "bg-indigo-600 border-indigo-500 shadow-indigo-600/30"
                              : "bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-700/80 hover:border-slate-450 dark:hover:border-slate-500"
                            }`}>
                            {isSelected && (
                              <Check className="w-3 h-3 text-white stroke-[3]" />
                            )}
                          </div>
                        </label>
                      </td>

                      {/* Display Name & Link */}
                      <td className="px-3 py-1.5">
                        {editingId === p.id ? (
                          <div className="flex items-center space-x-1.5">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEditing(p.id);
                                if (e.key === "Escape") cancelEditing();
                              }}
                              className="bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white px-2 py-1 rounded border border-slate-200 dark:border-indigo-500 focus:outline-none w-44"
                              autoFocus
                              disabled={savingEdit}
                            />
                            <button
                              onClick={() => saveEditing(p.id)}
                              disabled={savingEdit}
                              className="p-1 text-emerald-500 dark:text-emerald-400 hover:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
                              title="Save Display Name"
                            >
                              {savingEdit ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500 dark:text-indigo-400" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={savingEdit}
                              className="p-1 text-slate-550 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5 min-w-0">
                            <Link
                              href={`/spy/brand/${encodeURIComponent(p.id || p.pageId || "")}`}
                              title={`Open ${p.displayName || "brand"} Analytics & Ad Library`}
                              className="font-semibold text-slate-800 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-300 underline-offset-2 hover:underline transition-colors truncate max-w-[180px]"
                            >
                              {p.displayName || "Meta Ad Search"}
                            </Link>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              title="Open Meta Ad Library in new tab"
                              className="text-slate-400 hover:text-indigo-500 transition-colors p-0.5 shrink-0"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              onClick={() => startEditing(p)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-indigo-650 dark:hover:text-indigo-400 transition-all p-0.5 flex-shrink-0"
                              title="Edit Display Name"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {p.pageId && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                            ID: {p.pageId}
                          </div>
                        )}
                        {Boolean(
                          (p.discoveredPagesCount && p.discoveredPagesCount >= 2) ||
                          (p.searchType !== "page" && p.discoveredPagesCount && p.discoveredPagesCount > 0)
                        ) && (
                          <div>
                            <button
                              onClick={() => setResolveModalPageId(p.id)}
                              className="mt-1 inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 text-[10px] font-bold border border-amber-500/25 transition-all shadow-sm active:scale-95 cursor-pointer"
                              title="Multiple Facebook Pages detected for this domain. Click to review and resolve."
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>{p.discoveredPagesCount} Pages Found — Review</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Current Results & Inline Sparkline */}
                      <td className="px-3 py-1.5 text-sm">
                        <div className="flex items-center gap-2.5">
                          {p.currentResults !== null ? (
                            p.currentResults >= 50 ? (
                              <span
                                className="inline-flex items-center space-x-1 font-extrabold text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-md shadow-sm text-xs shrink-0"
                                title="High Volume Brand (50+ active ads)"
                              >
                                <Flame className="w-3 h-3 text-amber-500 dark:text-amber-400 fill-amber-500/20 animate-pulse shrink-0" />
                                <span>{p.currentResults.toLocaleString()}</span>
                              </span>
                            ) : p.currentResults === 0 ? (
                              <span className="font-semibold text-slate-400 dark:text-slate-500 text-xs shrink-0">0 ads</span>
                            ) : (
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs shrink-0">{p.currentResults.toLocaleString()}</span>
                            )
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600 text-xs shrink-0">—</span>
                          )}

                          <InlineSparkline points={p.historyPoints} difference={p.difference} />
                        </div>
                      </td>

                      {/* Approx Products Count (Clustered by Landing Page URLs & Ad Copy) */}
                      <td className="px-3 py-1.5 text-center">
                        {p.approxProductCount !== null && p.approxProductCount !== undefined && p.approxProductCount > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                            title={`~${p.approxProductCount} distinct product(s) identified across ${(p as any).extractedAdCount || 0} active ad creative(s)`}
                          >
                            <Package className="w-2.5 h-2.5 shrink-0" />
                            ~{p.approxProductCount} {p.approxProductCount === 1 ? "prod" : "prods"}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Previous Results */}
                      <td className="px-3 py-1.5 text-slate-550 dark:text-slate-400 font-medium">
                        {p.previousResults !== null && p.previousResults !== undefined
                          ? p.previousResults.toLocaleString()
                          : "—"}
                      </td>

                      {/* Difference */}
                      <td className="px-3 py-1.5">{diffBadge}</td>

                      {/* Status */}
                      <td className="px-3 py-1.5">
                        <div className="flex flex-col gap-0.5">
                          {p.status === "success" && p.currentResults === 0 ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-900/80 text-slate-500 border border-slate-200 dark:border-slate-800/80"
                              title="Confirmed 0 active ads found on Meta Ad Library"
                            >
                              0 Active Ads
                            </span>
                          ) : p.status === "unclear" ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400/70 border border-purple-250 dark:border-purple-500/15 cursor-help"
                              title="Unclear: Page layout pattern not recognized automatically. Verify URL or click Refresh."
                            >
                              Unclear
                            </span>
                          ) : p.status === "scanning" ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 animate-pulse shadow-sm"
                              title="Apify creative extraction scan is actively running for this brand"
                            >
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-500" />
                              <span>Scanning...</span>
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${p.status === "success"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : p.status === "pending"
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                }`}
                            >
                              {p.status}
                            </span>
                          )}
                          {/* Failure reason micro-badge */}
                          {p.status === "failed" && p.failureReason && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9px] text-rose-500 dark:text-rose-400/70 font-mono"
                              title={`Failure reason: ${p.failureReason}`}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              {p.failureReason}
                            </span>
                          )}

                          {/* Ad Spy Creative Badges */}
                          {p.isCreativeQueued && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse mt-0.5"
                              title="Ad Spy creative extraction scan is queued in progress"
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>Spy Queued</span>
                            </span>
                          )}

                          {p.lastCreativeScan &&
                            new Date(p.lastCreativeScan).toDateString() === new Date().toDateString() &&
                            !p.isCreativeQueued && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 mt-0.5"
                                title={`Ad Spy creative scan completed today at ${new Date(p.lastCreativeScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                              >
                                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                <span>Scanned Today</span>
                              </span>
                            )}
                        </div>
                      </td>

                      {/* Last Checked (Count & Spy) */}
                      <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        <div className="flex flex-col gap-0.5 whitespace-nowrap">
                          {/* Ad Count Check */}
                          <div
                            className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-medium"
                            title={p.lastChecked ? `Ad Count checked: ${new Date(p.lastChecked).toLocaleString()}` : "Count never checked"}
                          >
                            <span className="text-[9.5px] uppercase tracking-wider text-slate-400 font-sans font-semibold">Count:</span>
                            <span>{formatRelativeTime(p.lastChecked)}</span>
                          </div>

                          {/* Ad Spy Scan */}
                          <div
                            className={`flex items-center gap-1.5 text-[10.5px] ${
                              p.lastCreativeScan ? "text-purple-600 dark:text-purple-400 font-medium" : "text-slate-400 dark:text-slate-500"
                            }`}
                            title={p.lastCreativeScan ? `Ad Spy scan: ${new Date(p.lastCreativeScan).toLocaleString()}` : "Ad Spy never scanned"}
                          >
                            <span className="text-[9.5px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans font-semibold">Spy:</span>
                            <span className="inline-flex items-center gap-1">
                              <Sparkles className={`w-2.5 h-2.5 shrink-0 ${p.lastCreativeScan ? "text-purple-500 dark:text-purple-400" : "text-slate-400 opacity-60"}`} />
                              {formatRelativeTime(p.lastCreativeScan)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {/* Notes button */}
                          <button
                            onClick={() => {
                              setEditingNotes(p.id);
                              setEditingNotesValue((p as any).notes || "");
                            }}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${(p as any).notes
                                ? "text-yellow-500 dark:text-yellow-400 hover:text-yellow-600 dark:hover:text-yellow-300 hover:bg-yellow-500/10"
                                : "text-slate-500 dark:text-slate-400 hover:text-yellow-650 dark:hover:text-yellow-300 hover:bg-yellow-500/10 opacity-0 group-hover:opacity-100"
                              }`}
                            title={(p as any).notes || "Add note"}
                            aria-label={`Notes for ${p.displayName || "tracked page"}`}
                          >
                            <StickyNote className="w-3.5 h-3.5" />
                          </button>

                          {/* Ad Spy Actions */}
                          <button
                            onClick={() => {
                              setRunnerModalPages([p]);
                              setRunnerModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-500/10 transition-all cursor-pointer"
                            title={
                              (p as any).lastCreativeScan && new Date((p as any).lastCreativeScan).toDateString() === new Date().toDateString()
                                ? `Scanned today at ${new Date((p as any).lastCreativeScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : "Queue Ad Spy extraction scan"
                            }
                            aria-label={`Queue creative scan for ${p.displayName || "tracked page"}`}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                          </button>

                          <Link
                            href={`/spy/brand/${encodeURIComponent(p.id || p.pageId || "")}`}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-500/10 transition-all cursor-pointer inline-flex items-center justify-center"
                            title="Open Brand Deep-Dive & Analytics"
                            aria-label={`Open Brand Deep-Dive & Analytics for ${p.displayName || "tracked page"}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>

                          <button
                            onClick={() => onRefresh([p.id])}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-650 dark:hover:text-indigo-300 hover:bg-indigo-500/10 transition-all cursor-pointer"
                            title="Refresh scan"
                            aria-label={`Refresh scan for ${p.displayName || "tracked page"}`}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => openHistory(p)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-500/10 transition-all cursor-pointer"
                            title="View scan history"
                            aria-label={`View scan history for ${p.displayName || "tracked page"}`}
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Retry — escalate after 3+ attempts */}
                          {p.status === "failed" && (p.attempts ?? 0) >= 3 ? (
                            <button
                              onClick={() => openHistory(p)}
                              className="p-1.5 rounded-lg text-amber-500 dark:text-amber-400/80 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-500/10 transition-all cursor-pointer"
                              title={`Failed ${p.attempts} times — click to review history`}
                              aria-label={`Review failure history for ${p.displayName || "tracked page"}`}
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onRetry([p.id])}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-500/10 transition-all cursor-pointer"
                              title="Retry scan"
                              aria-label={`Retry scan for ${p.displayName || "tracked page"}`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setPageToDelete(p)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-405 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="Delete tracked page"
                            aria-label={`Delete ${p.displayName || "tracked page"}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Inline Notes Editor */}
                        {editingNotes === p.id && (
                          <div className="mt-1.5 flex items-start space-x-1.5 justify-end">
                            <textarea
                              value={editingNotesValue}
                              onChange={(e) => setEditingNotesValue(e.target.value)}
                              rows={2}
                              placeholder="Add a note..."
                              className="bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white px-2 py-1 rounded border border-yellow-500/40 focus:outline-none resize-none w-48"
                              autoFocus
                              disabled={savingNotes}
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => saveNotes(p.id)}
                                disabled={savingNotes}
                                className="p-1 text-emerald-500 dark:text-emerald-400 hover:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
                                title="Save note"
                              >
                                {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => setEditingNotes(null)}
                                disabled={savingNotes}
                                className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center space-x-4">
            <span>
              Page <strong className="text-slate-800 dark:text-slate-200">{page}</strong> of{" "}
              <strong className="text-slate-800 dark:text-slate-200">{totalPages}</strong>
              {totalCount !== undefined && totalCount > 0 && (
                <span className="ml-1 text-slate-450 dark:text-slate-500">({totalCount} total)</span>
              )}
            </span>

            {/* Rows Per Page Select */}
            <div className="flex items-center space-x-1.5">
              <label htmlFor="rows-per-page-select" className="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                Show:
              </label>
              <select
                id="rows-per-page-select"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-200 font-semibold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer text-xs transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                aria-label="Select number of rows per page"
              >
                <option value={25} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">25 rows</option>
                <option value={50} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">50 rows</option>
                <option value={100} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">100 rows</option>
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed text-xs font-medium"
                aria-label="Previous page"
              >
                Previous
              </button>

              {(() => {
                const getPageNumbers = () => {
                  if (totalPages <= 7) {
                    return Array.from({ length: totalPages }, (_, i) => i + 1);
                  }
                  if (page <= 4) {
                    return [1, 2, 3, 4, 5, "...", totalPages];
                  }
                  if (page >= totalPages - 3) {
                    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
                  }
                  return [1, "...", page - 1, page, page + 1, "...", totalPages];
                };

                return getPageNumbers().map((p, idx) => {
                  if (p === "...") {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-1.5 py-1 text-slate-550 text-xs select-none">
                        ...
                      </span>
                    );
                  }
                  const pageNum = p as number;
                  const isActive = pageNum === page;
                  return (
                    <button
                      key={`page-${pageNum}`}
                      onClick={() => onPageChange(pageNum)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-500"
                          : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                });
              })()}

              <button
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed text-xs font-medium"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scan History Modal */}
      <HistoryModal
        page={selectedHistoryPage}
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          setSelectedHistoryPage(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        page={pageToDelete}
        isOpen={!!pageToDelete}
        onClose={() => setPageToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />

      {/* Animated Toast Notification Popup */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 rounded-xl shadow-2xl border max-w-sm animate-in slide-in-from-bottom-5 duration-200 bg-slate-900 text-slate-100 border-slate-800">
          {toast.type === "warning" && <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
          {toast.type === "info" && <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />}
          {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
          {toast.type === "error" && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold text-white">{toast.title}</span>
            <span className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{toast.message}</span>
          </div>

          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Scan Runner Engine Selection Modal */}
      <ScanRunnerModal
        isOpen={runnerModalOpen}
        onClose={() => {
          setRunnerModalOpen(false);
          setRunnerModalPages([]);
        }}
        trackedPages={runnerModalPages}
        onConfirm={handleLaunchScan}
      />

      {/* Multi-Page Brand Resolution Modal */}
      <ResolveBrandModal
        trackedPageId={resolveModalPageId}
        isOpen={Boolean(resolveModalPageId)}
        onClose={() => setResolveModalPageId(null)}
        onSuccess={() => onWatchlistToggle?.()}
      />
    </div>
  );
}
