"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { TrackedPage, DashboardStats, SearchTabCounts } from "@/types";
import { HistoryModal } from "./history-modal";
import { DeleteConfirmModal } from "./delete-confirm-modal";
import { ScanRunnerModal } from "./scan-runner-modal";
import { ResolveBrandModal } from "./resolve-brand-modal";
import { ManageDomainModal } from "./manage-domain-modal";
import { MoveWorkspaceModal } from "./move-workspace-modal";
import { BrandLogo } from "./brand-logo";
import { classifyScalingPattern } from "@/lib/scaling-classifier";
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
  Sparkles,
  Clock,
  CheckCircle2,
  Package,
  Globe,
  TrendingUp,
  TrendingDown,
  FlaskConical,
  Copy,
  Pause,
  HelpCircle,
  MoreVertical,
  FolderSync,
  FolderInput,
} from "lucide-react";
import { useToast } from "@/components/toast-context";

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
      <div className="w-12 h-3.5 flex items-center justify-center opacity-25">
        <div className="w-5 h-[1px] bg-slate-400 dark:bg-slate-600 rounded-full" />
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const width = 52;
  const height = 18;
  const padding = 2;

  const coords = points.map((v, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylineStr = coords.join(" ");

  const isUp = (difference ?? 0) > 0;
  const isDown = (difference ?? 0) < 0;

  // Harmonious brand colors: emerald, rose, indigo
  const strokeColor = isUp ? "#10b981" : isDown ? "#f43f5e" : "#818cf8";
  const lastPoint = coords[coords.length - 1].split(",");

  return (
    <div className="flex items-center shrink-0" title={`Trend (last ${points.length} scans): ${points.join(" → ")} ads`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-13 h-4.5 overflow-visible select-none shrink-0"
      >
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
  onRefresh: (ids: string[]) => Promise<void> | void;
  onRetry: (ids?: string[]) => Promise<void> | void;
  onDelete: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  searchTypeFilter: string;
  onSearchTypeFilterChange: (value: string) => void;
  tagFilter?: string;
  onTagFilterChange?: (value: string) => void;
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
  searchTabCounts?: SearchTabCounts | null;
}

export function PagesTable({
  pages,
  loading,
  onRefresh,
  onRetry,
  onDelete,
  onBulkDelete,
  search,
  searchTabCounts,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  searchTypeFilter,
  onSearchTypeFilterChange,
  tagFilter,
  onTagFilterChange,
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
  const { showToast } = useToast();
  const [watchlisted, setWatchlisted] = useState<Record<string, boolean>>(
    Object.fromEntries(pages.map((p) => [p.id, p.isWatchlisted ?? false]))
  );

  const [refreshingPageIds, setRefreshingPageIds] = useState<Set<string>>(new Set());
  const [retryingPageIds, setRetryingPageIds] = useState<Set<string>>(new Set());
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [isRetryingAll, setIsRetryingAll] = useState(false);

  const handleRowRefresh = async (pageId: string) => {
    if (refreshingPageIds.has(pageId)) return;
    setRefreshingPageIds((prev) => new Set(prev).add(pageId));
    try {
      await Promise.all([
        Promise.resolve(onRefresh([pageId])),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    } finally {
      setRefreshingPageIds((prev) => {
        const next = new Set(prev);
        next.delete(pageId);
        return next;
      });
    }
  };

  const handleRowRetry = async (pageId: string) => {
    if (retryingPageIds.has(pageId)) return;
    setRetryingPageIds((prev) => new Set(prev).add(pageId));
    try {
      await Promise.all([
        Promise.resolve(onRetry([pageId])),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    } finally {
      setRetryingPageIds((prev) => {
        const next = new Set(prev);
        next.delete(pageId);
        return next;
      });
    }
  };

  const handleBulkRefresh = async () => {
    if (isBulkRefreshing || selectedIds.length === 0) return;
    setIsBulkRefreshing(true);
    const idsToRefresh = [...selectedIds];
    setRefreshingPageIds((prev) => {
      const next = new Set(prev);
      idsToRefresh.forEach((id) => next.add(id));
      return next;
    });
    try {
      await Promise.all([
        Promise.resolve(onRefresh(idsToRefresh)),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
      setSelectedIds([]);
    } finally {
      setIsBulkRefreshing(false);
      setRefreshingPageIds((prev) => {
        const next = new Set(prev);
        idsToRefresh.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleToolbarRetry = async () => {
    if (isRetryingAll) return;
    setIsRetryingAll(true);
    try {
      await Promise.all([
        Promise.resolve(onRetry()),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    } finally {
      setIsRetryingAll(false);
    }
  };

  const [localSearch, setLocalSearch] = useState(search);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Sync external search updates (e.g. from filter reset or browser navigation)
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  // Debounce search input by 300ms before triggering data fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, search, onSearchChange]);

  // Keyboard shortcut to jump to search: '/' or 'Cmd+K' / 'Ctrl+K'
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.key === "/" &&
          document.activeElement?.tagName !== "INPUT" &&
          document.activeElement?.tagName !== "TEXTAREA") ||
        ((e.metaKey || e.ctrlKey) && e.key === "k")
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const [mounted, setMounted] = useState(false);
  const [openMenuPageId, setOpenMenuPageId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close row actions menu on click outside, scroll, or resize
  useEffect(() => {
    if (!openMenuPageId) return;

    function handleClickOutside(e: MouseEvent) {
      if (rowMenuRef.current && rowMenuRef.current.contains(e.target as Node)) {
        return;
      }
      if ((e.target as HTMLElement)?.closest?.(`[data-menu-trigger="${openMenuPageId}"]`)) {
        return;
      }
      setOpenMenuPageId(null);
      setMenuPos(null);
    }

    function handleScrollOrResize() {
      setOpenMenuPageId(null);
      setMenuPos(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [openMenuPageId]);

  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>, pageId: string) => {
    e.stopPropagation();
    if (openMenuPageId === pageId) {
      setOpenMenuPageId(null);
      setMenuPos(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpwards = spaceBelow < 220;
      setMenuPos({
        top: openUpwards ? undefined : rect.bottom + 4,
        bottom: openUpwards ? window.innerHeight - rect.top + 4 : undefined,
        right: Math.max(8, window.innerWidth - rect.right),
      });
      setOpenMenuPageId(pageId);
    }
  };

  const activeMenuPage = openMenuPageId ? pages.find((p) => p.id === openMenuPageId) : null;

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
        className={`px-2.5 md:px-3.5 xl:px-4 py-2.5 whitespace-nowrap text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 ${className}`}
      >
        <button
          onClick={() => onSortChange(col)}
          className={`flex items-center gap-1 group transition-colors cursor-pointer uppercase tracking-wider ${
            active
              ? "text-indigo-600 dark:text-indigo-400 font-bold"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span className="uppercase tracking-wider">{label}</span>
          <span className="transition-transform">
            {active ? (
              sortOrder === "asc" ? (
                <ChevronUp className="w-3.5 h-3.5 text-indigo-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
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
  const [manageDomainId, setManageDomainId] = useState<string | null>(null);

  const [moveModalPage, setMoveModalPage] = useState<TrackedPage | null>(null);
  const [moveModalPages, setMoveModalPages] = useState<TrackedPage[] | null>(null);
  const [moveModalPageIds, setMoveModalPageIds] = useState<string[] | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const target = params.get("resolveModal");
      if (target) {
        setResolveModalPageId(target);
      }
      const domainParam = params.get("manageDomain");
      if (domainParam) {
        setManageDomainId(domainParam);
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

  const [notePopoverPage, setNotePopoverPage] = useState<TrackedPage | null>(null);
  const [notePopoverPos, setNotePopoverPos] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  } | null>(null);
  const [notePopoverValue, setNotePopoverValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const notePopoverRef = useRef<HTMLDivElement | null>(null);

  // Close note popover on click outside, scroll, or resize
  useEffect(() => {
    if (!notePopoverPage) return;

    function handleClickOutside(e: MouseEvent) {
      if (notePopoverRef.current && notePopoverRef.current.contains(e.target as Node)) {
        return;
      }
      if ((e.target as HTMLElement)?.closest?.(`[data-note-trigger="${notePopoverPage?.id}"]`)) {
        return;
      }
      setNotePopoverPage(null);
      setNotePopoverPos(null);
    }

    function handleScrollOrResize() {
      setNotePopoverPage(null);
      setNotePopoverPos(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [notePopoverPage]);

  const openNotePopoverFromElement = (page: TrackedPage, triggerEl: HTMLElement) => {
    const rect = triggerEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < 250;

    let leftPos: number | undefined = undefined;
    let rightPos: number | undefined = undefined;

    if (rect.left + 328 <= window.innerWidth) {
      leftPos = Math.max(8, rect.left);
    } else {
      rightPos = Math.max(8, window.innerWidth - rect.right);
    }

    setNotePopoverPos({
      top: openUpwards ? undefined : rect.bottom + 6,
      bottom: openUpwards ? window.innerHeight - rect.top + 6 : undefined,
      left: leftPos,
      right: rightPos,
    });
    setNotePopoverPage(page);
    setNotePopoverValue((page as any).notes || "");
    setOpenMenuPageId(null);
    setMenuPos(null);
  };

  const openNotePopoverFromMenu = (page: TrackedPage) => {
    if (menuPos) {
      const right = Math.max(8, Math.min(menuPos.right, window.innerWidth - 328));
      setNotePopoverPos({
        top: menuPos.top,
        bottom: menuPos.bottom,
        right,
      });
    } else {
      setNotePopoverPos({
        top: 100,
        right: 16,
      });
    }
    setOpenMenuPageId(null);
    setMenuPos(null);
    setNotePopoverPage(page);
    setNotePopoverValue((page as any).notes || "");
  };

  const saveNotes = async (id: string, customValue?: string) => {
    const valueToSave = customValue !== undefined ? customValue : notePopoverValue;
    const trimmed = valueToSave.trim() || null;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/page/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: trimmed }),
      });
      if (res.ok) {
        const target = pages.find((p) => p.id === id);
        if (target) (target as any).notes = trimmed;
        setNotePopoverPage(null);
        setNotePopoverPos(null);
        showToast({
          title: trimmed ? "Note Saved" : "Note Cleared",
          message: trimmed
            ? `Note saved for ${target?.displayName || "page"}`
            : `Note removed for ${target?.displayName || "page"}`,
          type: "success",
        });
        onWatchlistToggle?.();
      } else {
        showToast({
          title: "Save Failed",
          message: "Failed to update note",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Failed to save notes", err);
      showToast({
        title: "Error",
        message: "An unexpected error occurred while saving the note",
        type: "error",
      });
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
          className="flex items-center space-x-2 text-xs font-semibold px-3 py-2 rounded-lg bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer w-full justify-between"
        >
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-indigo-500" />
            <span>Filters & Smart Tabs</span>
            {(statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "active" || search !== "") && (
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
          {loading && localSearch ? (
            <Loader2 className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-indigo-500 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500 dark:text-slate-400" />
          )}
          <input
            ref={searchInputRef}
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setLocalSearch("");
                onSearchChange("");
                searchInputRef.current?.blur();
              }
            }}
            placeholder="Search brand, page ID, or domain..."
            className="w-full bg-white dark:bg-slate-950/80 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg pl-8 pr-12 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-all font-medium"
          />
          <div className="absolute right-2.5 top-2 flex items-center space-x-1">
            {localSearch ? (
              <button
                type="button"
                onClick={() => {
                  setLocalSearch("");
                  onSearchChange("");
                  searchInputRef.current?.focus();
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
                title="Clear search (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 rounded border border-slate-200 dark:border-slate-700/60 select-none pointer-events-none">
                /
              </kbd>
            )}
          </div>
        </div>

        {/* Right Side: 1-Click Smart Tabs & Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Smart Tabs */}
          {[
            {
              id: "active",
              label: "Active",
              icon: CheckCircle2,
              iconColor: "text-emerald-500 dark:text-emerald-400 fill-emerald-500/10 dark:fill-emerald-400/20",
            },
            { id: "all", label: "All Pages", icon: null },
            { id: "watchlist", label: "Watchlist", icon: Star, iconColor: "text-yellow-500 dark:text-yellow-400 fill-yellow-500/10 dark:fill-yellow-400/20" },
            { id: "high_volume", label: "High Volume", icon: Flame, iconColor: "text-amber-500 dark:text-amber-400 fill-amber-500/10 dark:fill-amber-400/20" },
            { id: "attention", label: "Attention", icon: ShieldAlert, iconColor: "text-rose-500 dark:text-rose-400" },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id || (tab.id === "attention" && (activeTab === "zero_ads" || activeTab === "needs_review"));
            const tabCount = searchTabCounts && search ? searchTabCounts[tab.id as keyof SearchTabCounts] : undefined;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${active
                    ? "bg-indigo-600/10 dark:bg-indigo-600/20 border-indigo-400/40 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-300 shadow-md shadow-indigo-600/10"
                    : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
              >
                {Icon && <Icon className={`w-3 h-3 ${tab.iconColor || ""}`} />}
                <span>{tab.label}</span>
                {tabCount !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      tabCount > 0
                        ? tab.id === "attention"
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                          : active
                            ? "bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30"
                            : "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {tabCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Consolidated ⚙ Filters Popover */}
          <div className="relative" ref={filterPopoverRef}>
            <button
              type="button"
              onClick={() => setShowFilterPopover((prev) => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                statusFilter !== "all" || searchTypeFilter !== "all" || (tagFilter && tagFilter !== "all")
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shadow-sm"
                  : "bg-white dark:bg-slate-950/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
              }`}
              title="Table filters & options"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
              <span>Filters</span>
              {(statusFilter !== "all" || searchTypeFilter !== "all" || (tagFilter && tagFilter !== "all")) && (
                <span className="bg-indigo-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {(statusFilter !== "all" ? 1 : 0) + (searchTypeFilter !== "all" ? 1 : 0) + (tagFilter && tagFilter !== "all" ? 1 : 0)}
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
                  {(statusFilter !== "all" || searchTypeFilter !== "all" || (tagFilter && tagFilter !== "all")) && (
                    <button
                      onClick={() => {
                        onStatusFilterChange("all");
                        onSearchTypeFilterChange("all");
                        onTagFilterChange?.("all");
                      }}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Archetype Tag Filter */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Archetype Tag</label>
                  <select
                    value={tagFilter || "all"}
                    onChange={(e) => onTagFilterChange?.(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Tags (Any Archetype)</option>
                    <option value="breakout">⚡ Breakout (+12+ impulse launch)</option>
                    <option value="scaling">🚀 Scaling (Multi-day expansion)</option>
                    <option value="burst">🔄 Burst (Sawtooth cycler)</option>
                    <option value="stable">🟢 Stable (Evergreen baseline)</option>
                    <option value="heavy_tester">🧪 Heavy Tester (Creative lab)</option>
                    <option value="descaling">⚠️ Descaling (Budget contraction)</option>
                    <option value="moderate">📊 Moderate (Steady activity)</option>
                    <option value="emerging">🆕 Emerging (&lt; 3 scans)</option>
                    <option value="off_air">⛔ Off-Air (Dropped to 0)</option>
                    <option value="inactive">⚫ Inactive (0 Ads)</option>
                  </select>
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
          {(search !== "" || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "active" || page > 1) && onResetFilters && (
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
              onClick={handleToolbarRetry}
              disabled={isRetryingAll}
              className="group flex items-center space-x-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 transition-all cursor-pointer whitespace-nowrap shrink-0 animate-in fade-in active:scale-95 disabled:opacity-60"
              title="Retry failed scan jobs"
            >
              <RotateCcw
                className={`w-3 h-3 text-amber-600 dark:text-amber-400 transition-transform duration-300 ${
                  isRetryingAll ? "animate-spin" : "group-hover:-rotate-90"
                }`}
              />
              <span>{isRetryingAll ? "Retrying..." : `Retry Failed ${stats?.failed ? `(${stats.failed})` : ""}`}</span>
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
              onClick={handleBulkRefresh}
              disabled={isBulkRefreshing}
              className="group flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-75 text-white font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 transition-transform duration-300 ${
                  isBulkRefreshing ? "animate-spin" : "group-hover:rotate-90"
                }`}
              />
              <span>{isBulkRefreshing ? "Refreshing..." : `Refresh (${selectedIds.length})`}</span>
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

            <button
              onClick={() => {
                const targetPages = pages.filter((p) => selectedIds.includes(p.id));
                setMoveModalPages(targetPages);
                setMoveModalPageIds(selectedIds);
                setMoveModalPage(null);
                setMoveModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <FolderSync className="w-3.5 h-3.5" />
              <span>Move to Workspace ({selectedIds.length})</span>
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
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 flex-1 min-h-[400px] md:min-h-0 flex flex-col overflow-hidden shadow-xs">
        <div className="overflow-y-auto overflow-x-auto md:overflow-x-hidden flex-1 min-h-0 relative">
          <table className="w-full md:table-fixed text-left text-[11px]">
            <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-20 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800/80 select-none shadow-xs">
              <tr>
                <th className="px-2 md:px-2.5 py-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                  />
                </th>
                <th className="px-1 md:px-1.5 py-2.5 w-8 text-center">
                  <Star className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 mx-auto" />
                </th>
                <SortHeader col="displayName" label="Brand" className="w-[30%] min-w-[170px]" />
                <th className="px-2.5 md:px-3.5 xl:px-4 py-2.5 whitespace-nowrap w-[20%] min-w-[155px]">
                  <div className="flex items-center gap-1.5 font-semibold text-[10px] uppercase tracking-wider select-none">
                    <button
                      onClick={() => onSortChange("currentResults")}
                      className={`flex items-center gap-0.5 group transition-colors cursor-pointer uppercase tracking-wider ${
                        sortBy === "currentResults"
                          ? "text-indigo-600 dark:text-indigo-400 font-bold"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                      title="Sort by Total Active Ads volume"
                    >
                      <span className="uppercase tracking-wider">Active Ads</span>
                      {sortBy === "currentResults" ? (
                        sortOrder === "asc" ? (
                          <ChevronUp className="w-3.5 h-3.5 text-indigo-500" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-70" />
                      )}
                    </button>

                    <span className="text-slate-300 dark:text-slate-700 font-normal">/</span>

                    <button
                      onClick={() => onSortChange("difference")}
                      className={`flex items-center gap-0.5 group transition-colors cursor-pointer uppercase tracking-wider ${
                        sortBy === "difference"
                          ? "text-emerald-600 dark:text-emerald-400 font-bold"
                          : "text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-300"
                      }`}
                      title="Sort by Net New Creatives Added (Top Gainers & Scalers)"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span className="uppercase tracking-wider">+Δ New</span>
                      {sortBy === "difference" ? (
                        sortOrder === "asc" ? (
                          <ChevronUp className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-emerald-500" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-70" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="px-2 md:px-2.5 xl:px-3 py-2.5 text-center whitespace-nowrap text-slate-500 dark:text-slate-400 font-semibold text-[10px] uppercase tracking-wider w-[9%] min-w-[65px]" title="Unique products catalog">
                  <span className="inline-flex items-center justify-center gap-1 uppercase tracking-wider">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    <span className="uppercase tracking-wider">Products</span>
                  </span>
                </th>
                <SortHeader col="status" label="Pattern & Status" className="hidden md:table-cell w-[17%] min-w-[135px] whitespace-nowrap" />
                <SortHeader col="lastChecked" label="Last Checked" className="w-[13%] min-w-[100px] whitespace-nowrap" />
                <th className="px-2.5 md:px-3.5 xl:px-4 py-2.5 text-right whitespace-nowrap text-slate-500 dark:text-slate-400 font-semibold text-[10px] uppercase tracking-wider w-[9%] min-w-[75px]">
                  <span className="uppercase tracking-wider">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500 dark:text-indigo-400 mx-auto mb-2" />
                    <span>Loading tracked pages...</span>
                  </td>
                </tr>
              ) : pages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-lg mx-auto space-y-4">
                      {search && searchTabCounts && searchTabCounts.all > 0 ? (
                        <div className="w-full p-5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/90 dark:border-indigo-800/80 shadow-sm space-y-3.5 text-left animate-in fade-in zoom-in-95 duration-150">
                          <div className="flex items-start space-x-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-600/10 dark:bg-indigo-400/20 flex items-center justify-center shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400">
                              <Sparkles className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                Found {searchTabCounts.all} {searchTabCounts.all === 1 ? "match" : "matches"} for &quot;{search}&quot; in other tabs
                              </h4>
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                                No records match in the current <strong>{activeTab === "all" ? "All Pages" : activeTab}</strong> tab, but matching pages exist in:
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-indigo-100 dark:border-indigo-900/50">
                            {searchTabCounts.attention > 0 && activeTab !== "attention" && (
                              <button
                                onClick={() => onTabChange("attention")}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                              >
                                <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                                <span>Switch to Attention ({searchTabCounts.attention})</span>
                              </button>
                            )}
                            {searchTabCounts.active > 0 && activeTab !== "active" && (
                              <button
                                onClick={() => onTabChange("active")}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Switch to Active ({searchTabCounts.active})</span>
                              </button>
                            )}
                            {searchTabCounts.watchlist > 0 && activeTab !== "watchlist" && (
                              <button
                                onClick={() => onTabChange("watchlist")}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                              >
                                <Star className="w-3.5 h-3.5 text-amber-500" />
                                <span>Switch to Watchlist ({searchTabCounts.watchlist})</span>
                              </button>
                            )}
                            {searchTabCounts.high_volume > 0 && activeTab !== "high_volume" && (
                              <button
                                onClick={() => onTabChange("high_volume")}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                              >
                                <Flame className="w-3.5 h-3.5 text-amber-500" />
                                <span>Switch to High Volume ({searchTabCounts.high_volume})</span>
                              </button>
                            )}
                            {activeTab !== "all" && (
                              <button
                                onClick={() => onTabChange("all")}
                                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                              >
                                <span>View All Pages ({searchTabCounts.all})</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400">
                            <Filter className="w-6 h-6 opacity-60" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                              No matching tracked pages found
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {search || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "active" || page > 1
                                ? "Your active filters or smart tab narrowed down results to zero."
                                : "No active tracked Meta Ad Library pages found."}
                            </p>
                          </div>
                        </>
                      )}

                      {/* Active Filter Chips */}
                      {(search || statusFilter !== "all" || searchTypeFilter !== "all" || (tagFilter && tagFilter !== "all") || activeTab !== "active" || page > 1) && (
                        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                          {activeTab !== "active" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                              Tab: {activeTab === "all" ? "All Pages" : activeTab}
                            </span>
                          )}
                          {tagFilter && tagFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              <span>Tag: {tagFilter.toUpperCase()}</span>
                              <button
                                onClick={() => onTagFilterChange?.("all")}
                                className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-200 cursor-pointer ml-0.5"
                                aria-label="Clear tag filter"
                              >
                                ×
                              </button>
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

                      {/* Reset / Switch Actions */}
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                        {activeTab === "active" && !search && statusFilter === "all" && searchTypeFilter === "all" && (
                          <button
                            onClick={() => onTabChange("all")}
                            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 shadow-sm transition-all cursor-pointer"
                          >
                            <span>Switch to All Pages (View 0-Ad Pages)</span>
                          </button>
                        )}
                        {(search || statusFilter !== "all" || searchTypeFilter !== "all" || activeTab !== "active" || page > 1) && onResetFilters && (
                          <button
                            onClick={onResetFilters}
                            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reset Filters</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                pages.map((p) => {
                  const diff = p.difference;
                  const scaling = p.scalingPattern || classifyScalingPattern(p.historyPoints, p.currentResults);

                  const isHighVolume = p.currentResults !== null && p.currentResults >= 50;
                  const isOnHold = p.holdStatus === "on_hold";
                  const isDimmed = !isOnHold && (p.currentResults === 0 || p.status === "unclear");
                  const isSelected = selectedIds.includes(p.id);
                  const isRefreshing = refreshingPageIds.has(p.id);
                  const isScanning = p.status === "scanning" || isRefreshing;

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors group ${
                        isSelected
                          ? "bg-indigo-50 dark:bg-indigo-950/40 border-l-[3px] border-l-indigo-600 dark:border-l-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
                          : isDimmed
                            ? "opacity-60 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-slate-900/60"
                            : "hover:bg-slate-50 dark:hover:bg-slate-900/60"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-2 md:px-2.5 py-2.5 text-center w-10">
                        <label className="relative inline-flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(p.id)}
                            aria-label={`Select ${p.displayName || "tracked page"}`}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center shadow-2xs ${
                            isSelected
                              ? "bg-indigo-600 border-indigo-500 shadow-indigo-600/30"
                              : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-slate-400"
                          }`}>
                            {isSelected && (
                              <Check className="w-3 h-3 text-white stroke-[3]" />
                            )}
                          </div>
                        </label>
                      </td>

                      {/* Watchlist Star */}
                      <td className="px-1 md:px-1.5 py-2.5 text-center w-8">
                        <button
                          onClick={() => toggleWatchlist(p.id)}
                          title={watchlisted[p.id] ? "Remove from watchlist" : "Add to watchlist"}
                          className={`p-0.5 rounded transition-all cursor-pointer ${
                            watchlisted[p.id]
                              ? "text-yellow-500 dark:text-yellow-400"
                              : "text-slate-400 dark:text-slate-600 hover:text-yellow-500 opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <Star className={`w-3.5 h-3.5 ${watchlisted[p.id] ? "fill-yellow-500 dark:fill-yellow-400" : ""}`} />
                        </button>
                      </td>

                      {/* Brand Name & Archetype Badge */}
                      <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 min-w-0">
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
                              className="bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white px-2 py-1 rounded border border-indigo-500 focus:outline-none w-44"
                              autoFocus
                              disabled={savingEdit}
                            />
                            <button
                              onClick={() => saveEditing(p.id)}
                              disabled={savingEdit}
                              className="p-1 text-emerald-500 hover:text-emerald-400 transition-colors cursor-pointer"
                              title="Save Display Name"
                            >
                              {savingEdit ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={savingEdit}
                              className="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <Link
                              href={`/spy/brand/${encodeURIComponent(p.pageId || p.landingPage || p.displayName || "")}`}
                              className="shrink-0"
                              tabIndex={-1}
                              title={`View ${p.displayName || "brand"} logo`}
                            >
                              <BrandLogo
                                name={p.displayName}
                                url={p.profilePicUrl}
                                domain={p.canonicalDomain || p.landingPage || (p.displayName?.includes(".") ? p.displayName : null)}
                                pageId={p.pageId}
                                size="sm"
                                showHoverPreview={true}
                              />
                            </Link>

                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <div className="flex items-center space-x-1.5 min-w-0">
                                <Link
                                  href={`/spy/brand/${encodeURIComponent(p.pageId || p.landingPage || p.displayName || "")}`}
                                  title={`Open ${p.displayName || "brand"} Analytics${p.pageId ? ` (ID: ${p.pageId})` : ""}`}
                                  className="font-bold text-[11px] text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-2 hover:underline transition-colors truncate min-w-0"
                                >
                                  {p.displayName || "Meta Ad Search"}
                                </Link>
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noreferrer"
                                title="Open Meta Ad Library in new tab"
                                className="text-slate-400 hover:text-indigo-400 transition-colors p-0.5 shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>

                              {/* Quick Copy Page ID on row hover (icon only) */}
                              {p.pageId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(p.pageId!);
                                    showToast({
                                      title: "Page ID Copied",
                                      message: `#${p.pageId} copied to clipboard`,
                                      type: "success",
                                    });
                                  }}
                                  className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-700/30 text-slate-400 hover:text-slate-200 cursor-pointer shrink-0"
                                  title={`Meta Page ID: #${p.pageId} (Click to copy)`}
                                  aria-label={`Copy Meta Page ID: #${p.pageId}`}
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}

                              {/* Note Indicator Badge (if note exists) */}
                              {Boolean((p as any).notes) && (
                                <button
                                  type="button"
                                  data-note-trigger={p.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openNotePopoverFromElement(p, e.currentTarget);
                                  }}
                                  className="inline-flex items-center text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 p-0.5 rounded hover:bg-amber-500/10 transition-colors cursor-pointer shrink-0"
                                  title={`Note: ${(p as any).notes}\n(Click to view / edit)`}
                                  aria-label="View or edit note"
                                >
                                  <StickyNote className="w-3 h-3 fill-amber-500/20" />
                                </button>
                              )}
                            </div>

                            {/* Subline: ONLY if multi page! */}
                            {Boolean(
                              (p.brandDomainId && p.brandDomain && (p.brandDomain.linkedPagesCount ?? 0) > 1) ||
                              (p.discoveredPagesCount && p.discoveredPagesCount >= 2) ||
                              (p.searchType !== "page" && p.discoveredPagesCount && p.discoveredPagesCount > 0)
                            ) && (
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 min-w-0 mt-0.5">
                                {p.brandDomainId && p.brandDomain && (p.brandDomain.linkedPagesCount ?? 0) > 1 && (
                                  <button
                                    onClick={() => setManageDomainId(p.brandDomainId!)}
                                    className="inline-flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer group/domain truncate max-w-[200px]"
                                    title={`Part of ${p.brandDomain.domain} portfolio (${p.brandDomain.linkedPagesCount} pages, ${p.brandDomain.totalCombinedAds} combined ads). Click to manage.`}
                                  >
                                    <Globe className="w-2.5 h-2.5 shrink-0 opacity-60 group-hover/domain:opacity-100" />
                                    <span className="truncate">{p.brandDomain.domain}</span>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                      ({p.brandDomain.linkedPagesCount} pages)
                                    </span>
                                  </button>
                                )}

                                {/* Multi-page resolve action if needed */}
                                {Boolean(
                                  (p.discoveredPagesCount && p.discoveredPagesCount >= 2) ||
                                  (p.searchType !== "page" && p.discoveredPagesCount && p.discoveredPagesCount > 0)
                                ) && (
                                  <button
                                    onClick={() => setResolveModalPageId(p.id)}
                                    className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-500 hover:text-amber-400 hover:underline transition-colors shrink-0"
                                    title="Multiple Facebook Pages detected for this domain. Click to review and resolve."
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                    <span>{p.discoveredPagesCount} found</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      </td>

                      {/* Active Ads, Delta & Sparkline (Combined Unified Cell) */}
                      <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="flex items-baseline gap-1.5 shrink-0 min-w-[60px]">
                            {isScanning ? (
                              <div
                                className="flex items-center gap-1.5 py-0.5"
                                title="Scanning Meta Ad Library for live count..."
                              >
                                {/* Ad Count Skeleton */}
                                <div className="h-4 w-9 rounded-md bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
                                {/* Delta Skeleton */}
                                <div className="h-3.5 w-6 rounded-md bg-slate-200/50 dark:bg-slate-800/50 animate-pulse" />
                              </div>
                            ) : isOnHold && p.lastKnownValidResults ? (
                              <span
                                className="text-[11px] font-mono text-amber-500 font-bold"
                                title={`Account hold — was ${p.lastKnownValidResults} ads. Under grace period (${p.consecutiveZeroScans ?? 1}/3 scans).`}
                              >
                                0
                                <span className="text-[9px] font-normal text-amber-500/80 ml-0.5">
                                  (was {p.lastKnownValidResults})
                                </span>
                              </span>
                            ) : p.currentResults !== null ? (
                              <div className="flex items-center gap-1.5">
                                {p.currentResults >= 50 && (
                                  <span title="High Volume: 50+ active ads" className="inline-flex shrink-0">
                                    <Flame className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 fill-amber-500/20" />
                                  </span>
                                )}
                                <span
                                  className={`text-[11px] font-mono tabular-nums ${
                                    p.currentResults >= 50
                                      ? "text-amber-500 dark:text-amber-400 font-black"
                                      : p.currentResults === 0
                                      ? "text-slate-400 dark:text-slate-600 font-normal"
                                      : "text-slate-900 dark:text-slate-100 font-bold"
                                  }`}
                                >
                                  {p.currentResults.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}

                            {/* Clean Delta text */}
                            {!isScanning && diff !== null && diff !== undefined && diff !== 0 && (
                              <span
                                className={`inline-flex items-center text-[10px] font-extrabold ${
                                  diff > 0
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                }`}
                                title={`Previous scan: ${p.previousResults ?? "—"} (${diff > 0 ? "+" : ""}${diff} ads)`}
                              >
                                {diff > 0 ? (
                                  <ArrowUpRight className="w-3 h-3 mr-0.5 stroke-[2.5]" />
                                ) : (
                                  <ArrowDownRight className="w-3 h-3 mr-0.5 stroke-[2.5]" />
                                )}
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            )}
                          </div>

                          {isScanning ? (
                            <div
                              className="w-13 h-4 rounded bg-slate-200/60 dark:bg-slate-800/60 animate-pulse shrink-0"
                              title="Updating trendline..."
                            />
                          ) : (
                            <InlineSparkline points={p.historyPoints} difference={p.difference} />
                          )}
                        </div>
                      </td>

                      {/* Exact Products Count */}
                      <td className="px-2 md:px-2.5 xl:px-3 py-2.5 text-center">
                        <Link
                          href={`/spy/brand/${encodeURIComponent(p.pageId || p.landingPage || p.displayName || "")}?tab=products`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all cursor-pointer"
                          title={`Open ${p.displayName || "brand"} Product Catalog (${p.approxProductCount || 0} products)`}
                        >
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {p.approxProductCount !== null && p.approxProductCount !== undefined && p.approxProductCount > 0
                              ? `${p.approxProductCount}`
                              : "—"}
                          </span>
                        </Link>
                      </td>

                      {/* Pattern & Status Column */}
                      <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 hidden md:table-cell whitespace-nowrap">
                        <div className="flex items-center gap-2 flex-nowrap">
                          {/* 1. Status Indicator Badge (rounded badge with background) */}
                          {p.status === "scanning" || isRefreshing ? (
                            <span
                              title="Scan in progress"
                              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0"
                            >
                              <Loader2 className="w-3 h-3 animate-spin text-cyan-500" />
                            </span>
                          ) : p.status === "pending" ? (
                            <span
                              title="Scan pending in queue"
                              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0"
                            >
                              <Clock className="w-3 h-3 text-amber-500" />
                            </span>
                          ) : p.status === "failed" ? (
                            <span
                              title={p.failureReason || "Scan failed"}
                              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0"
                            >
                              <AlertTriangle className="w-3 h-3 text-rose-500" />
                            </span>
                          ) : p.status === "unclear" ? (
                            <span
                              title="Scan status: Unclear results"
                              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0"
                            >
                              <HelpCircle className="w-3 h-3 text-purple-500" />
                            </span>
                          ) : (
                            <span
                              title="Scan status: Success (Up to date)"
                              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0"
                            >
                              <Check className="w-3 h-3 stroke-[2.5]" />
                            </span>
                          )}

                          {/* 2. Pattern Badge / Special State with trailing pause indicator */}
                          {isScanning ? (
                            <div
                              className="h-5 w-20 rounded-md bg-slate-200/70 dark:bg-slate-800/70 animate-pulse shrink-0"
                              title="Analyzing scaling pattern..."
                            />
                          ) : isOnHold ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 shrink-0"
                              title={`Account hold detected — was ${p.lastKnownValidResults ?? "?"} ads. Grace period verification scan ${p.consecutiveZeroScans ?? 1}/3.`}
                            >
                              <Pause className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                              <span>On Hold ({p.consecutiveZeroScans ?? 1}/3)</span>
                            </span>
                          ) : p.holdStatus === "inactive" ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 shrink-0"
                              title="Brand inactive (0 active ads confirmed over 3 scans)."
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400/80 shrink-0" />
                              <span>Inactive</span>
                              {p.autoCreativeScan === false && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRunnerModalPages([p]);
                                    setRunnerModalOpen(true);
                                  }}
                                  className="text-amber-500 hover:text-amber-400 transition-colors cursor-pointer shrink-0 ml-0.5 p-0.5 rounded hover:bg-amber-500/10"
                                  title="Automatic creative scans paused. Click to open runner."
                                  aria-label="Auto creative scans paused"
                                >
                                  <Pause className="w-2.5 h-2.5 fill-amber-500/30" />
                                </button>
                              )}
                            </span>
                          ) : scaling.archetype !== "inactive" ? (
                            (() => {
                              const isBurst = scaling.archetype === "burst";
                              const isScaling =
                                scaling.archetype === "scaling" ||
                                scaling.archetype === "aggressive" ||
                                scaling.archetype === "breakout";
                              const isDropping = scaling.archetype === "descaling" || scaling.archetype === "off_air";

                              return (
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                    isBurst
                                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                                      : isScaling
                                      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25"
                                      : scaling.archetype === "stable"
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20"
                                      : scaling.archetype === "heavy_tester"
                                      ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20"
                                      : isDropping
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/20"
                                      : "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20"
                                  }`}
                                  title={`${scaling.label} (${scaling.confidence} confidence): ${scaling.description}${
                                    scaling.velocityPerDay !== undefined
                                      ? `\n• Velocity: ${scaling.velocityPerDay > 0 ? "+" : ""}${scaling.velocityPerDay} ads/day`
                                      : ""
                                  }${scaling.volatility !== undefined ? `\n• Volatility: σ=${scaling.volatility}` : ""}${
                                    scaling.reversionRate !== undefined ? `\n• Sawtooth Flips: ${Math.round(scaling.reversionRate * 100)}%` : ""
                                  }`}
                                >
                                  {isBurst ? (
                                    <Flame className="w-3 h-3 text-amber-500 shrink-0" />
                                  ) : isScaling ? (
                                    <TrendingUp className="w-3 h-3 text-indigo-500 shrink-0" />
                                  ) : isDropping ? (
                                    <TrendingDown className="w-3 h-3 text-rose-500 shrink-0" />
                                  ) : scaling.archetype === "heavy_tester" ? (
                                    <FlaskConical className="w-3 h-3 text-cyan-500 shrink-0" />
                                  ) : scaling.archetype === "stable" ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  ) : (
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                                  )}
                                  <span>{scaling.shortLabel}</span>
                                  {p.autoCreativeScan === false && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRunnerModalPages([p]);
                                        setRunnerModalOpen(true);
                                      }}
                                      className="text-amber-500 hover:text-amber-400 transition-colors cursor-pointer shrink-0 ml-0.5 p-0.5 rounded hover:bg-amber-500/10"
                                      title="Automatic creative scans paused. Click to open runner."
                                      aria-label="Auto creative scans paused"
                                    >
                                      <Pause className="w-2.5 h-2.5 fill-amber-500/30" />
                                    </button>
                                  )}
                                </span>
                              );
                            })()
                          ) : (
                            <div className="inline-flex items-center gap-1 shrink-0">
                              <span className="text-slate-400 text-[10px]">—</span>
                              {p.autoCreativeScan === false && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRunnerModalPages([p]);
                                    setRunnerModalOpen(true);
                                  }}
                                  className="text-amber-500 hover:text-amber-400 transition-colors cursor-pointer shrink-0 p-0.5 rounded hover:bg-amber-500/10"
                                  title="Automatic creative scans paused. Click to open runner."
                                  aria-label="Auto creative scans paused"
                                >
                                  <Pause className="w-2.5 h-2.5 fill-amber-500/30" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Last Checked (Relative Timestamps) */}
                      <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                        {isScanning ? (
                          <div className="flex flex-col gap-1 py-0.5" title="Updating scan timestamp...">
                            <div className="h-3.5 w-14 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
                            {p.lastCreativeScan && (
                              <div className="h-3 w-10 rounded bg-slate-200/40 dark:bg-slate-800/40 animate-pulse" />
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-[11px] text-slate-700 dark:text-slate-300" title={p.lastChecked ? `Ad count checked: ${new Date(p.lastChecked).toLocaleString()}` : "Never checked"}>
                              {formatRelativeTime(p.lastChecked)}
                            </span>
                            {p.lastCreativeScan && (
                              <span className="text-[10px] text-purple-600 dark:text-purple-400 flex items-center gap-0.5" title={`Ad Spy scan: ${new Date(p.lastCreativeScan).toLocaleString()}`}>
                                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                {formatRelativeTime(p.lastCreativeScan)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* 1. Refresh Button */}
                          {(() => {
                            const isRefreshing = refreshingPageIds.has(p.id) || p.status === "scanning";
                            return (
                              <button
                                onClick={() => handleRowRefresh(p.id)}
                                disabled={isRefreshing}
                                className={`group/refresh p-1 rounded-md transition-all duration-200 cursor-pointer active:scale-90 ${
                                  isRefreshing
                                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/15"
                                    : "text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-500/10"
                                }`}
                                title={isRefreshing ? "Refreshing scan..." : "Refresh scan"}
                                aria-label={`Refresh scan for ${p.displayName || "tracked page"}`}
                              >
                                <RefreshCw
                                  className={`w-3.5 h-3.5 transition-transform duration-300 ease-out ${
                                    isRefreshing
                                      ? "animate-spin text-indigo-600 dark:text-indigo-400"
                                      : "group-hover/refresh:rotate-90 group-hover/refresh:text-indigo-600 dark:group-hover/refresh:text-indigo-400"
                                  }`}
                                />
                              </button>
                            );
                          })()}

                          {/* 2. Scan Button (Ad Spy Actions) */}
                          <button
                            onClick={() => {
                              setRunnerModalPages([p]);
                              setRunnerModalOpen(true);
                            }}
                            className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-500/10 transition-all cursor-pointer"
                            title={
                              (p as any).lastCreativeScan && new Date((p as any).lastCreativeScan).toDateString() === new Date().toDateString()
                                ? `Scanned today at ${new Date((p as any).lastCreativeScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : "Queue Ad Spy extraction scan"
                            }
                            aria-label={`Queue creative scan for ${p.displayName || "tracked page"}`}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                          </button>

                          {/* 3. Three-dots More Menu Trigger */}
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              data-menu-trigger={p.id}
                              onClick={(e) => handleToggleMenu(e, p.id)}
                              className={`p-1 rounded-md transition-all cursor-pointer ${
                                openMenuPageId === p.id
                                  ? "text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-800"
                                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80"
                              }`}
                              title="More options"
                              aria-label={`More options for ${p.displayName || "tracked page"}`}
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
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
                <span className="ml-1 text-slate-400 dark:text-slate-500">({totalCount} total)</span>
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
                className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-semibold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer text-xs transition-colors hover:border-slate-300 dark:hover:border-slate-700"
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
                      <span key={`ellipsis-${idx}`} className="px-1.5 py-1 text-slate-500 text-xs select-none">
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
        onAutoScanChanged={(pageIds, enabled) => {
          // Optimistically update in-memory pages array
          pageIds.forEach((id) => {
            const target = pages.find((p) => p.id === id);
            if (target) {
              target.autoCreativeScan = enabled;
            }
          });
          onWatchlistToggle?.();
        }}
      />

      {/* Multi-Page Brand Resolution Modal */}
      <ResolveBrandModal
        trackedPageId={resolveModalPageId}
        isOpen={Boolean(resolveModalPageId)}
        onClose={() => setResolveModalPageId(null)}
        onSuccess={() => onWatchlistToggle?.()}
      />

      {/* Multi-Page Brand Domain Portfolio Modal */}
      <ManageDomainModal
        domainOrId={manageDomainId}
        isOpen={Boolean(manageDomainId)}
        onClose={() => setManageDomainId(null)}
        onSuccess={() => onWatchlistToggle?.()}
      />

      {/* Move Page/Brand to Workspace Modal */}
      <MoveWorkspaceModal
        isOpen={moveModalOpen}
        onClose={() => {
          setMoveModalOpen(false);
          setMoveModalPage(null);
          setMoveModalPages(null);
          setMoveModalPageIds(null);
        }}
        page={moveModalPage}
        pages={moveModalPages || undefined}
        pageIds={moveModalPageIds || (moveModalPage ? [moveModalPage.id] : undefined)}
        onSuccess={() => {
          setSelectedIds([]);
          onWatchlistToggle?.();
        }}
      />

      {/* 3-Dots Floating Actions Portal */}
      {mounted && openMenuPageId && menuPos && activeMenuPage && createPortal(
        <div
          ref={rowMenuRef}
          style={{
            position: "fixed",
            top: menuPos.top !== undefined ? `${menuPos.top}px` : undefined,
            bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined,
            right: `${menuPos.right}px`,
          }}
          className="w-36 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-1 z-[100] animate-in fade-in zoom-in-95 text-left divide-y divide-slate-100 dark:divide-slate-800"
        >
          <div className="py-0.5">
            {/* Rename Brand */}
            <button
              type="button"
              onClick={() => {
                setOpenMenuPageId(null);
                setMenuPos(null);
                startEditing(activeMenuPage);
              }}
              className="w-full px-2.5 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
              <span>Rename</span>
            </button>

            {/* View History */}
            <button
              type="button"
              onClick={() => {
                setOpenMenuPageId(null);
                setMenuPos(null);
                openHistory(activeMenuPage);
              }}
              className="w-full px-2.5 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <History className="w-3.5 h-3.5 shrink-0 text-blue-500" />
              <span>History</span>
            </button>

            {/* Notes */}
            <button
              type="button"
              data-note-trigger={activeMenuPage.id}
              onClick={(e) => {
                e.stopPropagation();
                openNotePopoverFromMenu(activeMenuPage);
              }}
              className="w-full px-2.5 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <StickyNote className={`w-3.5 h-3.5 shrink-0 ${(activeMenuPage as any).notes ? "text-amber-500" : "text-slate-400"}`} />
              <span>{(activeMenuPage as any).notes ? "Edit Note" : "Add Note"}</span>
            </button>

            {/* Retry if failed */}
            {activeMenuPage.status === "failed" && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenuPageId(null);
                  setMenuPos(null);
                  handleRowRetry(activeMenuPage.id);
                }}
                disabled={retryingPageIds.has(activeMenuPage.id)}
                className="w-full px-2.5 py-1.5 text-left text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${retryingPageIds.has(activeMenuPage.id) ? "animate-spin" : ""}`} />
                <span>Retry Scan</span>
              </button>
            )}

            {/* Move to Workspace */}
            <button
              type="button"
              onClick={() => {
                setOpenMenuPageId(null);
                setMenuPos(null);
                setMoveModalPage(activeMenuPage);
                setMoveModalPages(null);
                setMoveModalPageIds([activeMenuPage.id]);
                setMoveModalOpen(true);
              }}
              className="w-full px-2.5 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <FolderInput className="w-3.5 h-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
              <span>Move to</span>
            </button>
          </div>

          <div className="py-0.5">
            {/* Delete */}
            <button
              type="button"
              onClick={() => {
                setOpenMenuPageId(null);
                setMenuPos(null);
                setPageToDelete(activeMenuPage);
              }}
              className="w-full px-2.5 py-1.5 text-left text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Delete</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Notes Popover Portal */}
      {mounted && notePopoverPage && notePopoverPos && createPortal(
        <div
          ref={notePopoverRef}
          style={{
            position: "fixed",
            top: notePopoverPos.top !== undefined ? `${notePopoverPos.top}px` : undefined,
            bottom: notePopoverPos.bottom !== undefined ? `${notePopoverPos.bottom}px` : undefined,
            left: notePopoverPos.left !== undefined ? `${notePopoverPos.left}px` : undefined,
            right: notePopoverPos.right !== undefined ? `${notePopoverPos.right}px` : undefined,
          }}
          className="w-80 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl p-3 z-[110] animate-in fade-in zoom-in-95 text-left"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-1.5 min-w-0">
              <StickyNote className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                Notes
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-mono">
                • {notePopoverPage.displayName || notePopoverPage.pageId || "Brand"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setNotePopoverPage(null);
                setNotePopoverPos(null);
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close notes popover"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            value={notePopoverValue}
            onChange={(e) => setNotePopoverValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setNotePopoverPage(null);
                setNotePopoverPos(null);
              } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                saveNotes(notePopoverPage.id);
              }
            }}
            rows={3}
            placeholder="Write a note about this brand..."
            className="w-full bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700/80 focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none resize-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
            autoFocus
            disabled={savingNotes}
          />

          {/* Footer */}
          <div className="mt-2.5 flex items-center justify-between pt-1">
            <div>
              {Boolean((notePopoverPage as any).notes) && (
                <button
                  type="button"
                  onClick={() => saveNotes(notePopoverPage.id, "")}
                  disabled={savingNotes}
                  className="text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 font-medium hover:underline flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 hidden sm:inline mr-1">
                ⌘+Enter
              </span>
              <button
                type="button"
                onClick={() => {
                  setNotePopoverPage(null);
                  setNotePopoverPos(null);
                }}
                disabled={savingNotes}
                className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveNotes(notePopoverPage.id)}
                disabled={savingNotes}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-semibold rounded-md shadow-xs shadow-amber-500/20 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
              >
                {savingNotes ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
