"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Globe,
  Search,
  Sparkles,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Download,
  Filter,
  Calendar,
  Layers,
  ArrowRight,
  Loader2,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";

interface DiscoveryRun {
  id: string;
  country: string;
  searchUrl: string;
  status: "pending" | "running" | "completed" | "partial" | "failed";
  totalAdsScanned: number;
  totalPagesDiscovered: number;
  failureReason?: string;
  outcomeDetails?: string;
  createdAt: string;
  finishedAt?: string;
}

interface DiscoveredPage {
  id: string;
  runId: string;
  pageId: string;
  displayName: string | null;
  country: string;
  matchingAdCount: number;
  verifiedAdCount: number | null;
  sampleAdArchiveIds: string[] | null;
  sampleCtas: string[] | null;
  sampleUrls: string[] | null;
  status: "discovered" | "verifying" | "imported" | "ignored";
  isTracked: boolean;
  trackedPageId: string | null;
  trackedCurrentResults: number | null;
  createdAt: string;
}

export default function DiscoveryPage() {
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pages, setPages] = useState<DiscoveredPage[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLaunchingScan, setIsLaunchingScan] = useState(false);

  // Filter Form State (Defaulting to Tunisia TN & Last 7 Days)
  const [country, setCountry] = useState("TN");
  const [mediaType, setMediaType] = useState("video");
  const [queryText, setQueryText] = useState("");

  const getSevenDaysAgoStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  };

  const getTodayStr = () => {
    return new Date().toISOString().split("T")[0];
  };

  const [startDateMin, setStartDateMin] = useState(getSevenDaysAgoStr());
  const [startDateMax, setStartDateMax] = useState(getTodayStr());

  // Table Filter, Sorting & Selection State
  const [searchFilter, setSearchFilter] = useState("");
  const [sortBy, setSortBy] = useState<string>("matchingAdCount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isActionPending, startTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleSortChange = (col: string) => {
    if (col === sortBy) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
  };

  // 1. Fetch Discovery Runs
  const fetchRuns = async () => {
    try {
      setIsLoadingRuns(true);
      const res = await fetch("/api/discovery/runs");
      const data = await res.json();
      if (data.success && Array.isArray(data.runs)) {
        setRuns(data.runs);
        if (data.runs.length > 0 && !selectedRunId) {
          setSelectedRunId(data.runs[0].id);
        }
      }
    } catch {
      // Fetch error silently
    } finally {
      setIsLoadingRuns(false);
    }
  };

  // 2. Fetch Discovered Pages for active run
  const fetchPages = async (runId: string) => {
    try {
      setIsLoadingPages(true);
      const url = `/api/discovery/pages?runId=${runId}&sortBy=${sortBy}&sortOrder=${sortOrder}${
        searchFilter ? `&q=${encodeURIComponent(searchFilter)}` : ""
      }`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.pages)) {
        setPages(data.pages);
      }
    } catch {
      // Fetch error silently
    } finally {
      setIsLoadingPages(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      fetchPages(selectedRunId);
    }
  }, [selectedRunId, searchFilter, sortBy, sortOrder]);

  // Handle Launching New Country Discovery Scan
  const handleLaunchScan = async () => {
    try {
      setIsLaunchingScan(true);
      setActionMessage(null);
      const res = await fetch("/api/discovery/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country,
          mediaType,
          query: queryText || "\u200D",
          startDateMin,
          startDateMax,
        }),
      });
      const data = await res.json();
      if (data.success && data.runId) {
        setSelectedRunId(data.runId);
        setActionMessage("Country discovery scan launched! Worker is harvesting pages...");
        await fetchRuns();
      } else {
        setActionMessage(`Error launching scan: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setActionMessage(`Failed to launch scan: ${err.message}`);
    } finally {
      setIsLaunchingScan(false);
    }
  };

  // Selection toggle handlers
  const toggleSelectAll = () => {
    if (selectedPageIds.size === pages.length) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(pages.map((p) => p.id)));
    }
  };

  const toggleSelectPage = (id: string) => {
    const next = new Set(selectedPageIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedPageIds(next);
  };

  // Batch Action 1: Verify Ad Counts
  const handleVerifySelected = async () => {
    if (selectedPageIds.size === 0) return;
    startTransition(async () => {
      try {
        setActionMessage(null);
        const res = await fetch("/api/discovery/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discoveredPageIds: Array.from(selectedPageIds) }),
        });
        const data = await res.json();
        if (data.success) {
          setActionMessage(
            `Enqueued ad count verification for ${data.verifiedCount} pages! Worker is checking Meta...`
          );
          if (selectedRunId) fetchPages(selectedRunId);
        } else {
          setActionMessage(`Verification failed: ${data.error}`);
        }
      } catch (err: any) {
        setActionMessage(`Verification error: ${err.message}`);
      }
    });
  };

  // Single Action: Verify Ad Count for a single page
  const handleVerifyPage = async (pageId: string) => {
    startTransition(async () => {
      try {
        setActionMessage(null);
        const res = await fetch("/api/discovery/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discoveredPageIds: [pageId] }),
        });
        const data = await res.json();
        if (data.success) {
          setActionMessage(
            `Enqueued ad count verification! Worker is checking Meta...`
          );
          if (selectedRunId) fetchPages(selectedRunId);
        } else {
          setActionMessage(`Verification failed: ${data.error}`);
        }
      } catch (err: any) {
        setActionMessage(`Verification error: ${err.message}`);
      }
    });
  };

  // Batch Action 2: Merge Selected Pages to Main Dashboard
  const handleMergeSelected = async () => {
    if (selectedPageIds.size === 0) return;
    startTransition(async () => {
      try {
        setActionMessage(null);
        const res = await fetch("/api/discovery/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discoveredPageIds: Array.from(selectedPageIds) }),
        });
        const data = await res.json();
        if (data.success) {
          setActionMessage(
            `Successfully merged ${data.importedCount} pages into main tracking dashboard!`
          );
          setSelectedPageIds(new Set());
          if (selectedRunId) fetchPages(selectedRunId);
        } else {
          setActionMessage(`Merge failed: ${data.error}`);
        }
      } catch (err: any) {
        setActionMessage(`Merge error: ${err.message}`);
      }
    });
  };

  // Batch Action 3: Merge ALL Discovered Pages for active run into Main Dashboard
  const handleMergeAllRunPages = async () => {
    if (!selectedRunId) return;
    startTransition(async () => {
      try {
        setActionMessage(null);
        const res = await fetch("/api/discovery/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: selectedRunId }),
        });
        const data = await res.json();
        if (data.success) {
          setActionMessage(
            `Successfully merged ${data.importedCount} pages into main tracking dashboard! Enqueued ${data.enqueuedQueueJobs} count jobs.`
          );
          setSelectedPageIds(new Set());
          if (selectedRunId) fetchPages(selectedRunId);
        } else {
          setActionMessage(`Merge failed: ${data.error}`);
        }
      } catch (err: any) {
        setActionMessage(`Merge error: ${err.message}`);
      }
    });
  };

  const activeRun = runs.find((r) => r.id === selectedRunId);
  const untrackedCount = pages.filter((p) => !p.isTracked).length;

  const SortHeader = ({ col, label }: { col: string; label: string }) => {
    const active = sortBy === col;
    return (
      <th className="p-4 whitespace-nowrap">
        <button
          onClick={() => handleSortChange(col)}
          className={`flex items-center space-x-1.5 uppercase font-bold text-[10px] tracking-wider transition-colors cursor-pointer ${
            active ? "text-indigo-400 font-extrabold" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>{label}</span>
          <span className="shrink-0">
            {active ? (
              sortOrder === "asc" ? (
                <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />
              )
            ) : (
              <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
            )}
          </span>
        </button>
      </th>
    );
  };

  const sortedPages = [...pages].sort((a, b) => {
    let valA: any = a[sortBy as keyof DiscoveredPage];
    let valB: any = b[sortBy as keyof DiscoveredPage];

    if (sortBy === "verifiedAdCount") {
      valA = a.verifiedAdCount ?? -1;
      valB = b.verifiedAdCount ?? -1;
    } else if (sortBy === "displayName") {
      valA = (a.displayName || "").toLowerCase();
      valB = (b.displayName || "").toLowerCase();
    } else if (sortBy === "status") {
      const statusOrder: Record<string, number> = {
        verifying: 1,
        imported: 2,
        discovered: 3,
        ignored: 4,
      };
      valA = statusOrder[a.status] || 99;
      valB = statusOrder[b.status] || 99;
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 space-y-8">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                Country Brand Discovery
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  Tunisia & Global
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Scan full Meta Ad Library by country to uncover active e-commerce brands matching "Shop Now" & "Order Now"
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchRuns}
          title="Refresh Scans"
          className="inline-flex items-center space-x-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRuns ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="p-4 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-200 text-xs font-medium flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>{actionMessage}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Discovery Scanner Controls Panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-white uppercase tracking-wider">
            <Filter className="w-4 h-4 text-indigo-400" />
            <span>Discovery Search Controls</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              CTA Filter Active: "Shop Now" & "Order Now"
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          {/* Country Selection */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Target Country
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="TN">TN — Tunisia 🇹🇳</option>
              <option value="FR">FR — France 🇫🇷</option>
              <option value="US">US — United States 🇺🇸</option>
              <option value="AE">AE — UAE 🇦🇪</option>
              <option value="SA">SA — Saudi Arabia 🇸🇦</option>
              <option value="MA">MA — Morocco 🇲🇦</option>
              <option value="DZ">DZ — Algeria 🇩🇿</option>
              <option value="EG">EG — Egypt 🇪🇬</option>
            </select>
          </div>

          {/* Start Date Min (Default Last 7 Days) */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Start Date Min
            </label>
            <input
              type="date"
              value={startDateMin}
              onChange={(e) => setStartDateMin(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Start Date Max (Default Today) */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Start Date Max
            </label>
            <input
              type="date"
              value={startDateMax}
              onChange={(e) => setStartDateMax(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Media Type */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Media Format
            </label>
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="video">Video Ads Only</option>
              <option value="image">Image Ads Only</option>
              <option value="all">All Formats</option>
            </select>
          </div>

          {/* Launch Scan Button */}
          <div className="flex items-end">
            <button
              onClick={handleLaunchScan}
              disabled={isLaunchingScan}
              className="w-full h-[38px] bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold rounded-lg shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              {isLaunchingScan ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Launching...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Discovery</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Discovery Runs Timeline Bar */}
      {runs.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            Recent Discovery Scan Runs
          </div>
          <div className="flex items-center space-x-3 overflow-x-auto pb-2 scrollbar-none">
            {runs.map((run) => {
              const isSelected = run.id === selectedRunId;
              const isRunning = run.status === "running" || run.status === "pending";

              return (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl border text-left shrink-0 transition ${
                    isSelected
                      ? "bg-indigo-950/60 border-indigo-500 text-white shadow-md shadow-indigo-500/10"
                      : "bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {isRunning ? (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    ) : run.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                    )}
                    <div>
                      <div className="font-bold text-xs text-white">
                        Country: {run.country}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {run.totalPagesDiscovered} pages | {run.totalAdsScanned} ads
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 pl-2 border-l border-slate-800">
                    {new Date(run.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Run Stats & Batch Actions Bar */}
      <div className="space-y-4">
        {activeRun && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
            <div className="flex items-center space-x-4">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                <span className="font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
                  {activeRun.status === "running" && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  )}
                  {activeRun.status}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-slate-800" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Ads Analyzed</span>
                <span className="font-extrabold text-indigo-400 text-sm">
                  {activeRun.totalAdsScanned.toLocaleString()}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-slate-800" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Unique Pages Found</span>
                <span className="font-extrabold text-emerald-400 text-sm">
                  {activeRun.totalPagesDiscovered.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Batch Selection & Action Buttons */}
            <div className="flex items-center space-x-2 animate-in fade-in duration-150 flex-wrap gap-2">
              {selectedPageIds.size > 0 && (
                <>
                  <span className="text-xs font-semibold text-slate-300 mr-1">
                    {selectedPageIds.size} selected
                  </span>
                  <button
                    onClick={handleVerifySelected}
                    disabled={isActionPending}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Verify Ad Counts</span>
                  </button>
                  <button
                    onClick={handleMergeSelected}
                    disabled={isActionPending}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Merge Selected ({selectedPageIds.size})</span>
                  </button>
                </>
              )}

              <button
                onClick={handleMergeAllRunPages}
                disabled={isActionPending || untrackedCount === 0}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-extrabold shadow-lg shadow-emerald-600/20 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Merge all discovered pages in this run directly to main tracked pages"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {untrackedCount > 0
                    ? `Merge ALL Discovered Pages (${untrackedCount})`
                    : "All Pages Already Merged ✓"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Discovered Pages Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl overflow-hidden">
          {/* Table Header Controls */}
          <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter discovered pages by name..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="text-xs text-slate-400">
              Showing <span className="font-bold text-white">{pages.length}</span> discovered pages
            </div>
          </div>

          {/* Table Element */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-4 w-10">
                    <input
                      type="checkbox"
                      checked={pages.length > 0 && selectedPageIds.size === pages.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0"
                    />
                  </th>
                  <SortHeader col="displayName" label="Page Name & Meta Link" />
                  <SortHeader col="pageId" label="Page ID" />
                  <SortHeader col="matchingAdCount" label="Active Ads (Discovery)" />
                  <SortHeader col="verifiedAdCount" label="Verified Count" />
                  <th className="p-4">Sample CTAs</th>
                  <SortHeader col="status" label="Status" />
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoadingPages ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500 space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
                      <div>Loading discovered pages...</div>
                    </td>
                  </tr>
                ) : sortedPages.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500">
                      No discovered pages found for this scan run yet. Launch a new country scan above!
                    </td>
                  </tr>
                ) : (
                  sortedPages.map((page) => {
                    const isSelected = selectedPageIds.has(page.id);
                    const metaAdLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${page.country || "TN"}&view_all_page_id=${page.pageId}&search_type=page&media_type=all`;

                    return (
                      <tr
                        key={page.id}
                        className={`hover:bg-slate-800/40 transition ${
                          isSelected ? "bg-indigo-950/20" : ""
                        }`}
                      >
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPage(page.id)}
                            className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0"
                          />
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-white text-sm flex items-center space-x-2">
                            <span>{page.displayName || `Page ${page.pageId}`}</span>
                            <a
                              href={metaAdLibraryUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:text-indigo-300"
                              title="Open in Meta Ad Library"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-slate-400">{page.pageId}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                            {page.matchingAdCount} active ads
                          </span>
                        </td>
                        <td className="p-4">
                          {page.verifiedAdCount !== null ? (
                            <span className="font-bold text-emerald-400">
                              {page.verifiedAdCount} verified
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Unverified</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {page.sampleCtas && page.sampleCtas.length > 0 ? (
                              page.sampleCtas.map((cta, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                                >
                                  {cta}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-500">Shop Now</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          {page.isTracked ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              <Check className="w-3 h-3" />
                              <span>Already Tracked</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                              {page.status}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => handleVerifyPage(page.id)}
                            disabled={isActionPending || page.status === "verifying"}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition inline-flex items-center space-x-1 disabled:opacity-50"
                            title="Verify exact active ad count via worker"
                          >
                            <RefreshCw className={`w-3 h-3 ${page.status === "verifying" ? "animate-spin text-indigo-400" : ""}`} />
                            <span>{page.status === "verifying" ? "Verifying..." : "Verify"}</span>
                          </button>

                          {!page.isTracked && (
                            <button
                              onClick={() => {
                                setSelectedPageIds(new Set([page.id]));
                                handleMergeSelected();
                              }}
                              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition inline-flex items-center space-x-1"
                            >
                              <ArrowRight className="w-3 h-3" />
                              <span>Merge</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
