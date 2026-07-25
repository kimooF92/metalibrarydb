"use client";

import { useEffect, useState, useCallback } from "react";
import { TrackedPage, DashboardStats } from "@/types";
import { StatsCards } from "@/components/stats-cards";
import { AddUrlForm } from "@/components/add-url-form";
import { PagesTable } from "@/components/pages-table";
import { RefreshCw, LayoutGrid, ChevronDown, ChevronUp } from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [isOverviewCollapsed, setIsOverviewCollapsed] = useState(false);

  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTypeFilter, setSearchTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchPages = useCallback(async () => {
    setPagesLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "25");
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchTypeFilter !== "all") params.set("searchType", searchTypeFilter);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/pages?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPages(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to fetch pages", err);
    } finally {
      setPagesLoading(false);
    }
  }, [page, search, statusFilter, searchTypeFilter, sortBy, sortOrder]);

  const loadData = useCallback(() => {
    fetchStats();
    fetchPages();
  }, [fetchStats, fetchPages]);

  const handleSortChange = (col: string) => {
    if (col === sortBy) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
    setPage(1);
  };

  // Initial load on mount and when filters/pagination change
  useEffect(() => {
    loadData();
  }, [loadData]);

  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleRefresh = async (ids: string[]) => {
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        showToast("info", "Scan refresh queued successfully.");
        loadData();
      }
    } catch (err) {
      console.error("Refresh action failed", err);
      showToast("error", "Failed to queue refresh.");
    }
  };

  const handleRetry = async (ids?: string[]) => {
    try {
      const res = await fetch("/api/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        showToast("info", "Failed scans queued for retry.");
        loadData();
      }
    } catch (err) {
      console.error("Retry action failed", err);
      showToast("error", "Failed to queue retry.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/page/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("success", "Tracked page deleted successfully.");
        loadData();
      } else {
        showToast("error", "Failed to delete tracked page.");
      }
    } catch (err) {
      console.error("Delete action failed", err);
      showToast("error", "Network error while deleting page.");
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => fetch(`/api/page/${id}`, { method: "DELETE" })));
      showToast("success", `Deleted ${ids.length} page(s) successfully.`);
      loadData();
    } catch (err) {
      console.error("Bulk delete failed", err);
      showToast("error", "Failed to delete some pages.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert Banner */}
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center space-x-3 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold backdrop-blur-md animate-in slide-in-from-top-5 duration-200 ${
            toast.type === "success"
              ? "bg-emerald-950/95 text-emerald-300 border-emerald-500/40"
              : toast.type === "error"
              ? "bg-rose-950/95 text-rose-300 border-rose-500/40"
              : "bg-indigo-950/95 text-indigo-300 border-indigo-500/40"
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Ad Library Monitoring Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track visible active result counts across Meta Ad Library search URLs
          </p>
        </div>

        <button
          onClick={loadData}
          className="self-start sm:self-auto flex items-center space-x-2 text-xs font-medium px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${pagesLoading ? "animate-spin" : ""}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Unified Overview & Controls Block (Collapsed Together) */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <LayoutGrid className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Overview & Quick Add
            </span>
          </div>
          <button
            onClick={() => setIsOverviewCollapsed(!isOverviewCollapsed)}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-800 transition-all cursor-pointer"
          >
            <span>{isOverviewCollapsed ? "Expand Overview" : "Collapse"}</span>
            {isOverviewCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {!isOverviewCollapsed && (
          <div className="space-y-4 transition-all">
            <StatsCards stats={stats} loading={statsLoading} />
            <AddUrlForm onSuccess={loadData} />
          </div>
        )}
      </div>

      {/* Main Tracked Pages Table */}
      <PagesTable
        pages={pages}
        loading={pagesLoading}
        onRefresh={handleRefresh}
        onRetry={handleRetry}
        onDelete={handleDelete}
        onBulkDelete={handleBulkDelete}
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        statusFilter={statusFilter}
        onStatusFilterChange={(val) => {
          setStatusFilter(val);
          setPage(1);
        }}
        searchTypeFilter={searchTypeFilter}
        onSearchTypeFilterChange={(val) => {
          setSearchTypeFilter(val);
          setPage(1);
        }}
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => setPage(p)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
      />
    </div>
  );
}
