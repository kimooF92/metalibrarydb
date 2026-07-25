"use client";

import { useState } from "react";
import { TrackedPage } from "@/types";
import { HistoryModal } from "./history-modal";
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
} from "lucide-react";

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
}

export function PagesTable({
  pages,
  loading,
  onRefresh,
  onRetry,
  onDelete,
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
        className={`px-4 py-3.5 whitespace-nowrap ${className}`}
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

  return (
    <div className="glass-card rounded-xl p-5 shadow-xl">
      {/* Search & Filters Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-6">
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

      {/* Main Table */}
      <div className="rounded-xl border border-slate-800/80 overflow-hidden bg-slate-950/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <SortHeader col="displayName" label="Display Name" />
                <th className="px-4 py-3.5 whitespace-nowrap">Type</th>
                <SortHeader col="currentResults" label="Current Results" />
                <th className="px-4 py-3.5 whitespace-nowrap">Previous Results</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Difference</th>
                <SortHeader col="status" label="Status" />
                <SortHeader col="lastChecked" label="Last Checked" />
                <th className="px-4 py-3.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
                    <span>Loading tracked pages...</span>
                  </td>
                </tr>
              ) : pages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
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

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-900/60 transition-all group"
                    >
                      {/* Display Name & Link */}
                      <td className="px-4 py-3">
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
                              className="font-semibold text-slate-100 hover:text-indigo-300 underline-offset-2 hover:underline transition-colors truncate max-w-[200px]"
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
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60">
                          {p.searchType || "page"}
                        </span>
                      </td>

                      {/* Current Results */}
                      <td className="px-4 py-3 font-bold text-slate-100 text-sm">
                        {p.currentResults !== null
                          ? p.currentResults.toLocaleString()
                          : "—"}
                      </td>

                      {/* Previous Results */}
                      <td className="px-4 py-3 text-slate-400 font-medium">
                        {p.previousResults !== null && p.previousResults !== undefined
                          ? p.previousResults.toLocaleString()
                          : "—"}
                      </td>

                      {/* Difference */}
                      <td className="px-4 py-3">{diffBadge}</td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            p.status === "success"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : p.status === "scanning"
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse"
                              : p.status === "pending"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : p.status === "unclear"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>

                      {/* Last Checked */}
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                        {p.lastChecked
                          ? new Date(p.lastChecked).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Never"}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => onRefresh([p.id])}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all cursor-pointer"
                            title="Refresh scan"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => openHistory(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition-all cursor-pointer"
                            title="View scan history"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onRetry([p.id])}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all cursor-pointer"
                            title="Retry scan"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onDelete(p.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="Delete tracked page"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Page <strong className="text-slate-200">{page}</strong> of{" "}
              <strong className="text-slate-200">{totalPages}</strong>
            </span>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                <span>Go to page:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  defaultValue={page}
                  key={page}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                      if (val >= 1 && val <= totalPages) {
                        onPageChange(val);
                      }
                    }
                  }}
                  className="w-12 bg-slate-950/80 text-center text-slate-200 rounded border border-slate-800 py-1 focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
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
    </div>
  );
}
