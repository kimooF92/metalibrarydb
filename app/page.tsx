"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { TrackedPage, DashboardStats } from "@/types";
import { StatsCards } from "@/components/stats-cards";
import { AddUrlForm } from "@/components/add-url-form";
import { ImportDropzone } from "@/components/import-dropzone";
import { PagesTable } from "@/components/pages-table";
import { RefreshCw, X, Plus, UploadCloud } from "lucide-react";

function getInitialDashboardState() {
  const defaults = {
    search: "",
    statusFilter: "all",
    searchTypeFilter: "all",
    activeTab: "all",
    sortBy: "createdAt",
    sortOrder: "desc" as "asc" | "desc",
    page: 1,
    pageSize: 25,
  };

  if (typeof window === "undefined") return defaults;

  try {
    // 1. Load saved state from localStorage or sessionStorage
    let saved: Partial<typeof defaults> = {};
    const rawSaved =
      localStorage.getItem("dashboard_filters") ||
      sessionStorage.getItem("dashboard_filters");

    if (rawSaved) {
      try {
        saved = JSON.parse(rawSaved);
      } catch {}
    }

    const state = {
      ...defaults,
      ...saved,
    };

    // 2. Overlay individual URL query parameters if present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("search")) state.search = urlParams.get("search") || "";
    if (urlParams.has("status")) state.statusFilter = urlParams.get("status") || "all";
    if (urlParams.has("searchType")) state.searchTypeFilter = urlParams.get("searchType") || "all";
    if (urlParams.has("tab")) state.activeTab = urlParams.get("tab") || "all";
    if (urlParams.has("sortBy")) state.sortBy = urlParams.get("sortBy") || "createdAt";
    if (urlParams.has("sortOrder")) state.sortOrder = (urlParams.get("sortOrder") as "asc" | "desc") || "desc";
    if (urlParams.has("page")) state.page = Number(urlParams.get("page")) || 1;
    if (urlParams.has("limit")) state.pageSize = Number(urlParams.get("limit")) || 25;

    return state;
  } catch (e) {
    console.error("Error reading dashboard params:", e);
  }

  return defaults;
}

function syncDashboardStateToUrl(state: {
  search: string;
  statusFilter: string;
  searchTypeFilter: string;
  activeTab: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: number;
}) {
  if (typeof window === "undefined") return;
  try {
    const query = new URLSearchParams();
    if (state.search) query.set("search", state.search);
    if (state.statusFilter && state.statusFilter !== "all") query.set("status", state.statusFilter);
    if (state.searchTypeFilter && state.searchTypeFilter !== "all") query.set("searchType", state.searchTypeFilter);
    if (state.activeTab && state.activeTab !== "all") query.set("tab", state.activeTab);
    if (state.sortBy && state.sortBy !== "createdAt") query.set("sortBy", state.sortBy);
    if (state.sortOrder && state.sortOrder !== "desc") query.set("sortOrder", state.sortOrder);
    if (state.page && state.page > 1) query.set("page", String(state.page));
    if (state.pageSize && state.pageSize !== 25) query.set("limit", String(state.pageSize));

    const queryString = query.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);

    const payload = JSON.stringify(state);
    sessionStorage.setItem("dashboard_filters", payload);
    localStorage.setItem("dashboard_filters", payload);
  } catch (e) {
    console.error("Error syncing dashboard state:", e);
  }
}

export default function DashboardPage() {
  const [initialLoaded] = useState(() => getInitialDashboardState());

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalTab, setAddModalTab] = useState<"single" | "bulk">("single");

  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const isFetchingRef = useRef(false);

  const [search, setSearch] = useState(initialLoaded.search);
  const [statusFilter, setStatusFilter] = useState(initialLoaded.statusFilter);
  const [searchTypeFilter, setSearchTypeFilter] = useState(initialLoaded.searchTypeFilter);
  const [activeTab, setActiveTab] = useState(initialLoaded.activeTab);
  const [sortBy, setSortBy] = useState(initialLoaded.sortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initialLoaded.sortOrder);

  const [page, setPage] = useState(initialLoaded.page);
  const [pageSize, setPageSize] = useState(initialLoaded.pageSize);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Sync state to URL and session storage
  useEffect(() => {
    syncDashboardStateToUrl({
      search,
      statusFilter,
      searchTypeFilter,
      activeTab,
      sortBy,
      sortOrder,
      page,
      pageSize,
    });
  }, [search, statusFilter, searchTypeFilter, activeTab, sortBy, sortOrder, page, pageSize]);

  // Sync on browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const init = getInitialDashboardState();
      setSearch(init.search);
      setStatusFilter(init.statusFilter);
      setSearchTypeFilter(init.searchTypeFilter);
      setActiveTab(init.activeTab);
      setSortBy(init.sortBy);
      setSortOrder(init.sortOrder);
      setPage(init.page);
      setPageSize(init.pageSize);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

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
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
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
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast("error", errData.error || "Failed to load table pages.");
      }
    } catch (err) {
      console.error("Failed to fetch pages", err);
      showToast("error", "Network error loading table pages.");
    } finally {
      isFetchingRef.current = false;
      if (!silent) setPagesLoading(false);
    }
  }, [page, pageSize, search, statusFilter, searchTypeFilter, activeTab, sortBy, sortOrder, showToast]);

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

  const handleResetFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setSearchTypeFilter("all");
    setActiveTab("all");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
    try {
      sessionStorage.removeItem("dashboard_filters");
      window.history.replaceState(null, "", window.location.pathname);
    } catch {}
  }, []);

  // Initial load on mount and when filters/pagination change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Determine if there are active scans currently running
  const isScanningActive =
    (stats && stats.scanning > 0) ||
    pages.some((p) => p.status === "scanning");

  // Bounded real-time polling when scraper jobs are actively scanning (max 6 cycles = 30s)
  useEffect(() => {
    if (!isScanningActive) return;

    let pollCount = 0;
    const interval = setInterval(() => {
      pollCount++;
      loadData(true);
      if (pollCount >= 6) {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isScanningActive, loadData]);


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
    <div className="h-full flex flex-col space-y-4 overflow-y-auto md:overflow-hidden">
      {/* Toast Alert Banner */}
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center space-x-3 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold animate-in slide-in-from-top-5 duration-200 ${
            toast.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/95 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40"
              : toast.type === "error"
              ? "bg-rose-50 dark:bg-rose-950/95 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/40"
              : "bg-indigo-50 dark:bg-indigo-950/95 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40"
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800/40">
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              Dashboard
            </h1>
          </div>
          {stats && (
            <span className="text-[10px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium hidden md:inline-block">
              {stats.totalPages} monitored • {stats.completed} completed • {stats.failed} failed
            </span>
          )}
          {stats && stats.scanning > 0 && (
            <span className="flex items-center space-x-1.5 text-[10px] bg-cyan-50 dark:bg-cyan-950/80 border border-cyan-200 dark:border-cyan-500/30 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-full font-semibold animate-pulse shrink-0">
              <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-500 dark:text-cyan-400" />
              <span>Scanning {stats.scanning} {stats.scanning === 1 ? "page" : "pages"}...</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
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
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pagesLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Inline Dashboard Key Stats */}
      <StatsCards stats={stats} loading={statsLoading} />

      {/* Main Tracked Pages Table */}
      <PagesTable
        pages={pages}
        loading={pagesLoading}
        stats={stats}
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
        onWatchlistToggle={() => loadData(true)}
        onResetFilters={handleResetFilters}
      />

      {/* Track URL / Bulk File Import Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="bg-slate-950 border border-slate-800/80 p-5 sm:p-6 rounded-2xl max-w-2xl w-full shadow-2xl relative animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowAddModal(false);
                setAddModalTab("single");
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Switcher Tabs */}
            <div className="flex items-center space-x-2 mb-4 pb-2.5 border-b border-slate-800/80">
              <button
                type="button"
                onClick={() => setAddModalTab("single")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  addModalTab === "single"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Single URL / Domain</span>
              </button>

              <button
                type="button"
                onClick={() => setAddModalTab("bulk")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  addModalTab === "bulk"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Bulk File Import (CSV / XLSX)</span>
              </button>
            </div>

            {addModalTab === "single" ? (
              <AddUrlForm
                onSuccess={() => {
                  setShowAddModal(false);
                  loadData();
                }}
              />
            ) : (
              <div className="space-y-4">
                <ImportDropzone />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
