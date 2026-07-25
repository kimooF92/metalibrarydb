"use client";

import { useState, useCallback } from "react";
import { TrackedPage } from "@/types";
import { HistoryModal } from "./history-modal";
import { DeleteConfirmModal } from "./delete-confirm-modal";
import {
  Search,
  Filter,
  RefreshCw,
  History,
  RotateCcw,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
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
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (col: string) => void;
  onBulkDelete?: (ids: string[]) => void;
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
  page,
  totalPages,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
}: PagesTableProps) {
  const [watchlisted, setWatchlisted] = useState<Record<string, boolean>>(
    Object.fromEntries(pages.map((p) => [p.id, p.isWatchlisted ?? false]))
  );

  const toggleWatchlist = useCallback(async (id: string) => {
    const next = !watchlisted[id];
    setWatchlisted((prev) => ({ ...prev, [id]: next }));
    try {
      await fetch(`/api/page/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatchlisted: next }),
      });
    } catch {
      setWatchlisted((prev) => ({ ...prev, [id]: !next }));
    }
  }, [watchlisted]);
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
        className={`px-3 py-2.5 whitespace-nowrap ${className}`}
      >
        <button
          onClick={() => onSortChange(col)}
          className={`flex items-center gap-1 group transition-colors ${
            active ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
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
    <div className="glass-card rounded-xl p-5 shadow-xl">
      {/* Search & Filters Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-4">
        {/* Global Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by Display Name, Page ID, or URL..."
            className="w-full bg-slate-950/80 text-sm text-slate-100 placeholder-slate-500 rounded-lg pl-9 pr-4 py-2 border border-slate-800 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center space-x-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Statuses</option>
              <option value="success" className="bg-slate-900">Success</option>
              <option value="pending" className="bg-slate-900">Pending</option>
              <option value="scanning" className="bg-slate-900">Scanning</option>
              <option value="failed" className="bg-slate-900">Failed</option>
              <option value="unclear" className="bg-slate-900">Unclear</option>
            </select>
          </div>

          {/* Search Type Filter */}
          <div className="flex items-center space-x-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-400">Type:</span>
            <select
              value={searchTypeFilter}
              onChange={(e) => onSearchTypeFilterChange(e.target.value)}
              className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Types</option>
              <option value="page" className="bg-slate-900">Page ID</option>
              <option value="keyword_exact_phrase" className="bg-slate-900">Exact Phrase</option>
              <option value="keyword_unordered" className="bg-slate-900">Unordered Keyword</option>
            </select>
          </div>

          {/* Global Actions */}
          <button
            onClick={() => onRetry()}
            className="flex items-center space-x-1 text-xs font-medium px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-all cursor-pointer"
            title="Retry all failed scan jobs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Retry Failed</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-indigo-950/90 border border-indigo-500/40 px-4 py-2.5 rounded-xl text-xs text-indigo-200 mb-4 animate-in fade-in duration-150">
          <div className="flex items-center space-x-2 font-medium">
            <span className="font-bold text-white px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30">
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
              className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="rounded-xl border border-slate-800/80 overflow-hidden bg-slate-950/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="px-2.5 py-2.5 text-center w-8">
                  {/* Watchlist */}
                </th>
                <th className="px-2.5 py-2.5 text-center w-8">
                  <label className="relative inline-flex items-center justify-center cursor-pointer" title="Select all visible pages">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all pages on current view"
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center shadow-sm ${
                      allVisibleSelected
                        ? "bg-indigo-600 border-indigo-500"
                        : "bg-slate-900/90 border-slate-700 hover:border-slate-500"
                    }`}>
                      {allVisibleSelected && (
                        <Check className="w-3 h-3 text-white stroke-[3]" />
                      )}
                    </div>
                  </label>
                </th>
                <SortHeader col="displayName" label="Display Name" />
                <th className="px-3 py-2.5 whitespace-nowrap">Type</th>
                <SortHeader col="currentResults" label="Current Results" />
                <th className="px-3 py-2.5 whitespace-nowrap">Previous Results</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Difference</th>
                <SortHeader col="status" label="Status" />
                <SortHeader col="lastChecked" label="Last Checked" />
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
                    <span>Loading tracked pages...</span>
                  </td>
                </tr>
              ) : pages.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No tracked Meta Ad Library URLs match your filter criteria.
                  </td>
                </tr>
              ) : (
                pages.map((p) => {
                  const diff = p.difference;
                  let diffBadge = (
                    <span className="inline-flex items-center text-slate-400">
                      <Minus className="w-3 h-3 mr-1" /> 0
                    </span>
                  );

                  if (diff !== null && diff !== undefined && diff !== 0) {
                    if (diff > 0) {
                      diffBadge = (
                        <span className="inline-flex items-center font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +{diff}
                        </span>
                      );
                    } else {
                      diffBadge = (
                        <span className="inline-flex items-center font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                          <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" /> {diff}
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
                      className={`transition-all group ${
                        isSelected
                          ? "bg-indigo-950/40 hover:bg-indigo-950/60"
                          : watchlisted[p.id]
                          ? "bg-amber-500/[0.03] border-l-2 border-l-yellow-400/70 hover:bg-amber-500/[0.07]"
                          : isHighVolume
                          ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08] border-l-2 border-l-amber-400"
                          : isDimmed
                          ? "opacity-60 hover:opacity-100 hover:bg-slate-900/40"
                          : "hover:bg-slate-900/60"
                      }`}
                    >
                      {/* Watchlist Star */}
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => toggleWatchlist(p.id)}
                          title={watchlisted[p.id] ? "Remove from watchlist" : "Add to watchlist"}
                          className={`p-0.5 rounded transition-all ${
                            watchlisted[p.id]
                              ? "text-yellow-400"
                              : "text-slate-700 hover:text-yellow-400/60 opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <Star className={`w-3 h-3 ${watchlisted[p.id] ? "fill-yellow-400" : ""}`} />
                        </button>
                      </td>
                      {/* Checkbox */}
                      <td className="px-2.5 py-2.5 text-center">
                        <label className="relative inline-flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(p.id)}
                            aria-label={`Select ${p.displayName || "tracked page"}`}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center shadow-sm ${
                            isSelected
                              ? "bg-indigo-600 border-indigo-500 shadow-indigo-600/30"
                              : "bg-slate-900/90 border-slate-700/80 hover:border-slate-500"
                          }`}>
                            {isSelected && (
                              <Check className="w-3 h-3 text-white stroke-[3]" />
                            )}
                          </div>
                        </label>
                      </td>

                      {/* Display Name & Link */}
                      <td className="px-3 py-2.5">
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
                              className="bg-slate-950 text-xs text-white px-2 py-1 rounded border border-indigo-500 focus:outline-none w-44"
                              autoFocus
                              disabled={savingEdit}
                            />
                            <button
                              onClick={() => saveEditing(p.id)}
                              disabled={savingEdit}
                              className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                              title="Save Display Name"
                            >
                              {savingEdit ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={savingEdit}
                              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              title={p.url}
                              className="font-semibold text-slate-100 hover:text-indigo-300 underline-offset-2 hover:underline transition-colors truncate max-w-[180px]"
                            >
                              {p.displayName || "Meta Ad Search"}
                            </a>
                            <button
                              onClick={() => startEditing(p)}
                              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-indigo-400 transition-all p-0.5 flex-shrink-0"
                              title="Edit Display Name"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {p.pageId && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            ID: {p.pageId}
                          </div>
                        )}
                      </td>

                      {/* Search Type */}
                      <td className="px-3 py-2.5">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60">
                          {p.searchType || "page"}
                        </span>
                      </td>

                      {/* Current Results */}
                      <td className="px-3 py-2.5 text-sm">
                        {p.currentResults !== null ? (
                          p.currentResults >= 50 ? (
                            <span
                              className="inline-flex items-center space-x-1.5 font-extrabold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg shadow-sm shadow-amber-500/10 text-xs"
                              title="High Volume Competitor (50+ active ads)"
                            >
                              <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400/40 animate-pulse shrink-0" />
                              <span>{p.currentResults.toLocaleString()}</span>
                            </span>
                          ) : p.currentResults === 0 ? (
                            <span className="font-semibold text-slate-500">0</span>
                          ) : (
                            <span className="font-bold text-slate-100">{p.currentResults.toLocaleString()}</span>
                          )
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Previous Results */}
                      <td className="px-3 py-2.5 text-slate-400 font-medium">
                        {p.previousResults !== null && p.previousResults !== undefined
                          ? p.previousResults.toLocaleString()
                          : "—"}
                      </td>

                      {/* Difference */}
                      <td className="px-3 py-2.5">{diffBadge}</td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          {p.status === "success" && p.currentResults === 0 ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-900/80 text-slate-500 border border-slate-800/80"
                              title="Confirmed 0 active ads found on Meta Ad Library"
                            >
                              0 Active Ads
                            </span>
                          ) : p.status === "unclear" ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-950/30 text-purple-400/70 border border-purple-500/15 cursor-help"
                              title="Unclear: Page layout pattern not recognized automatically. Verify URL or click Refresh."
                            >
                              Unclear
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                p.status === "success"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : p.status === "scanning"
                                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse"
                                  : p.status === "pending"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              {p.status}
                            </span>
                          )}
                          {/* Failure reason micro-badge */}
                          {p.status === "failed" && p.failureReason && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9px] text-rose-400/70 font-mono"
                              title={`Failure reason: ${p.failureReason}`}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              {p.failureReason}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Last Checked */}
                      <td className="px-3 py-2.5 text-slate-400 font-mono text-[11px]" title={p.lastChecked ? new Date(p.lastChecked).toLocaleString() : undefined}>
                        {formatRelativeTime(p.lastChecked)}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {/* Notes button */}
                          <button
                            onClick={() => {
                              setEditingNotes(p.id);
                              setEditingNotesValue((p as any).notes || "");
                            }}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                              (p as any).notes
                                ? "text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                                : "text-slate-400 hover:text-yellow-300 hover:bg-yellow-500/10 opacity-0 group-hover:opacity-100"
                            }`}
                            title={(p as any).notes || "Add note"}
                            aria-label={`Notes for ${p.displayName || "tracked page"}`}
                          >
                            <StickyNote className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onRefresh([p.id])}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all cursor-pointer"
                            title="Refresh scan"
                            aria-label={`Refresh scan for ${p.displayName || "tracked page"}`}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => openHistory(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition-all cursor-pointer"
                            title="View scan history"
                            aria-label={`View scan history for ${p.displayName || "tracked page"}`}
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Retry — escalate after 3+ attempts */}
                          {p.status === "failed" && (p.attempts ?? 0) >= 3 ? (
                            <button
                              onClick={() => openHistory(p)}
                              className="p-1.5 rounded-lg text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 transition-all cursor-pointer"
                              title={`Failed ${p.attempts} times — click to review history`}
                              aria-label={`Review failure history for ${p.displayName || "tracked page"}`}
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onRetry([p.id])}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all cursor-pointer"
                              title="Retry scan"
                              aria-label={`Retry scan for ${p.displayName || "tracked page"}`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setPageToDelete(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
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
                              className="bg-slate-950 text-xs text-white px-2 py-1 rounded border border-yellow-500/40 focus:outline-none resize-none w-48"
                              autoFocus
                              disabled={savingNotes}
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => saveNotes(p.id)}
                                disabled={savingNotes}
                                className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                                title="Save note"
                              >
                                {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => setEditingNotes(null)}
                                disabled={savingNotes}
                                className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
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
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-900/60 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Page <strong className="text-slate-200">{page}</strong> of{" "}
              <strong className="text-slate-200">{totalPages}</strong>
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed text-xs font-medium"
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
                          : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
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
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed text-xs font-medium"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
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
    </div>
  );
}
