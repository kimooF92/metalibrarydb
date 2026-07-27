"use client";

import { useEffect, useState, useCallback } from "react";
import { TrackedPage, DashboardStats } from "@/types";
import { StatsCards } from "@/components/stats-cards";
import { AddUrlForm } from "@/components/add-url-form";
import { PagesTable } from "@/components/pages-table";
import { SidebarTrigger } from "@/components/sidebar-context";
import { RefreshCw, X, Plus, BarChart3 } from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTypeFilter, setSearchTypeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setStatsLoading(true);
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats", err);
    } finally {
      if (!silent) setStatsLoading(false);
    }
  }, []);

  const fetchPages = useCallback(async (silent = false) => {
    if (!silent) setPagesLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchTypeFilter !== "all") params.set("searchType", searchTypeFilter);
      if (activeTab !== "all") params.set("tab", activeTab);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/pages?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPages(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch pages", err);
    } finally {
      if (!silent) setPagesLoading(false);
    }
  }, [page, pageSize, search, statusFilter, searchTypeFilter, activeTab, sortBy, sortOrder]);

  const loadData = useCallback((silent = false) => {
    fetchStats(silent);
    fetchPages(silent);
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

  // Determine if there are active scans running or pending
  const isScanningActive =
    (stats && (stats.scanning > 0 || stats.pending > 0)) ||
    pages.some((p) => p.status === "scanning" || p.status === "pending");

  // Real-time polling when scraper jobs are active
  useEffect(() => {
    if (!isScanningActive) return;

    const interval = setInterval(() => {
      loadData(true); // Silent reload
    }, 2500);

    return () => clearInterval(interval);
  }, [isScanningActive, loadData]);

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
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/40">
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <SidebarTrigger />
            <h1 className="text-base font-extrabold text-white tracking-tight">
              Dashboard
            </h1>
          </div>
          {stats && (
            <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-medium hidden md:inline-block">
              {stats.totalPages} monitored • {stats.completed} completed • {stats.failed} failed
            </span>
          )}
          {stats && stats.scanning > 0 && (
            <span className="flex items-center space-x-1.5 text-[10px] bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded-full font-semibold animate-pulse shrink-0">
              <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-400" />
              <span>Scanning {stats.scanning} {stats.scanning === 1 ? "page" : "pages"}...</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStatsModal(true)}
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Show Stats</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Track URL</span>
          </button>

          <button
            onClick={() => loadData()}
            title="Refresh dashboard data"
            className="flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pagesLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
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
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setPage(1);
        }}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
      />

      {/* Stats Modal */}
      {showStatsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-950 border border-slate-800/80 p-6 rounded-2xl max-w-4xl w-full shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowStatsModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">System Overview Stats</h3>
            <StatsCards stats={stats} loading={statsLoading} />
          </div>
        </div>
      )}

      {/* Track URL Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-950 border border-slate-800/80 p-6 rounded-2xl max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Track New Ad Library URL</h3>
            <AddUrlForm onSuccess={() => {
              setShowAddModal(false);
              loadData();
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
