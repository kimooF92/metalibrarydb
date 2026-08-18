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
  EyeOff,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";

interface DiscoveryRun {
  id: string;
  country: string;
  searchUrl: string;
  query?: string;
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

const KEYWORD_GROUPS = [
  {
    groupName: "Popular",
    options: [
      { label: "Zero Width Joiner", value: "\u200D" },
      { label: '"توصيل"', value: "توصيل" },
      { label: '"عرض خاص"', value: "عرض خاص" },
      { label: '"تخفيض"', value: "تخفيض" },
      { label: '"الدفع عند الاستلام"', value: "الدفع عند الاستلام" },
    ],
  },
  {
    groupName: "Problem Solving",
    options: [
      { label: '"بدون تعب"', value: "بدون تعب" },
      { label: '"يحمي"', value: "يحمي" },
      { label: '"في دقائق"', value: "في دقائق" },
      { label: '"حل مشكلة"', value: "حل مشكلة" },
    ],
  },
  {
    groupName: "Transformation",
    options: [
      { label: '"شوف الفرق"', value: "شوف الفرق" },
      { label: '"النتيجة من أول استعمال"', value: "النتيجة من أول استعمال" },
      { label: '"النتيجة"', value: "النتيجة" },
    ],
  },
];

function getRunKeywordDisplay(run: DiscoveryRun): string {
  let q = run.query;
  if (!q || q.startsWith("http://") || q.startsWith("https://")) {
    const target = q || run.searchUrl || "";
    try {
      const urlObj = new URL(target);
      q = urlObj.searchParams.get("q") || "";
    } catch {
      const match = target.match(/[?&]q=([^&]+)/);
      q = match ? decodeURIComponent(match[1]) : "";
    }
  }
  if (!q || q === "\u200D" || q === "%E2%80%8D") {
    return "ZWJ (Broad Search)";
  }
  return q;
}

const VALID_DISCOVERY_STATUSES = ["all", "discovered", "verified", "verifying", "imported", "ignored"] as const;
const VALID_DISCOVERY_MEDIA = ["all", "video", "image"] as const;

function getInitialDiscoveryState() {
  const defaults = {
    selectedRunId: null as string | null,
    country: "TN",
    mediaType: "video" as (typeof VALID_DISCOVERY_MEDIA)[number],
    searchFilter: "",
    statusFilter: "all" as (typeof VALID_DISCOVERY_STATUSES)[number],
  };

  if (typeof window === "undefined") return defaults;

  try {
    // 1. Load saved state from localStorage or sessionStorage
    let saved: Partial<typeof defaults> = {};
    const rawSaved =
      localStorage.getItem("discovery_filters") ||
      sessionStorage.getItem("discovery_filters");

    if (rawSaved) {
      try {
        saved = JSON.parse(rawSaved);
      } catch {}
    }

    if (saved.statusFilter && !VALID_DISCOVERY_STATUSES.includes(saved.statusFilter as any)) {
      saved.statusFilter = "all";
    }
    if (saved.mediaType && !VALID_DISCOVERY_MEDIA.includes(saved.mediaType as any)) {
      saved.mediaType = "video";
    }

    const state = {
      ...defaults,
      ...saved,
    };

    // 2. Overlay individual URL query parameters if present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("runId")) state.selectedRunId = urlParams.get("runId") || null;
    if (urlParams.has("country")) state.country = urlParams.get("country") || "TN";
    if (urlParams.has("mediaType")) {
      const mt = urlParams.get("mediaType");
      state.mediaType = mt && VALID_DISCOVERY_MEDIA.includes(mt as any) ? (mt as any) : "video";
    }
    if (urlParams.has("search")) state.searchFilter = urlParams.get("search") || "";
    if (urlParams.has("status")) {
      const s = urlParams.get("status");
      state.statusFilter = s && VALID_DISCOVERY_STATUSES.includes(s as any) ? (s as any) : "all";
    }

    return state;
  } catch (e) {
    console.error("Error reading discovery params:", e);
  }

  return defaults;
}

function syncDiscoveryStateToUrl(state: {
  selectedRunId: string | null;
  country: string;
  mediaType: string;
  searchFilter: string;
  statusFilter: string;
}) {
  if (typeof window === "undefined") return;
  try {
    const query = new URLSearchParams();
    if (state.selectedRunId) query.set("runId", state.selectedRunId);
    if (state.country && state.country !== "TN") query.set("country", state.country);
    if (state.mediaType && state.mediaType !== "video") query.set("mediaType", state.mediaType);
    if (state.searchFilter) query.set("search", state.searchFilter);
    if (state.statusFilter && state.statusFilter !== "all") query.set("status", state.statusFilter);

    const queryString = query.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);

    const payload = JSON.stringify(state);
    sessionStorage.setItem("discovery_filters", payload);
    localStorage.setItem("discovery_filters", payload);
  } catch (e) {
    console.error("Error syncing discovery state:", e);
  }
}

export default function DiscoveryPage() {
  const [initialLoaded] = useState(() => getInitialDiscoveryState());

  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialLoaded.selectedRunId);
  const [pages, setPages] = useState<DiscoveredPage[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLaunchingScan, setIsLaunchingScan] = useState(false);

  // Filter Form State
  const [country, setCountry] = useState(initialLoaded.country);
  const [mediaType, setMediaType] = useState(initialLoaded.mediaType);
  const [selectedKeyword, setSelectedKeyword] = useState("\u200D");
  const [isCustomKeyword, setIsCustomKeyword] = useState(false);
  const [customKeywordText, setCustomKeywordText] = useState("");

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
  const [activeDatePreset, setActiveDatePreset] = useState<"last7" | "last30" | "today" | "custom">("last7");

  // Table Filter, Sorting & Selection State
  const [searchFilter, setSearchFilter] = useState(initialLoaded.searchFilter);
  const [statusFilter, setStatusFilter] = useState<"all" | "discovered" | "verified" | "verifying" | "imported" | "ignored">(initialLoaded.statusFilter);

  // Sync state to URL and session storage
  useEffect(() => {
    syncDiscoveryStateToUrl({
      selectedRunId,
      country,
      mediaType,
      searchFilter,
      statusFilter,
    });
  }, [selectedRunId, country, mediaType, searchFilter, statusFilter]);

  // Sync on browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const init = getInitialDiscoveryState();
      setSelectedRunId(init.selectedRunId);
      setCountry(init.country);
      setMediaType(init.mediaType);
      setSearchFilter(init.searchFilter);
      setStatusFilter(init.statusFilter);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const [sortBy, setSortBy] = useState<string>("matchingAdCount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isActionPending, startTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [mergeConfirmPending, setMergeConfirmPending] = useState(false);

  const applyDatePreset = (preset: "today" | "last7" | "last30" | "thisMonth") => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    setStartDateMax(todayStr);

    if (preset === "today") {
      setStartDateMin(todayStr);
      setActiveDatePreset("today");
    } else if (preset === "last7") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDateMin(d.toISOString().split("T")[0]);
      setActiveDatePreset("last7");
    } else if (preset === "last30") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDateMin(d.toISOString().split("T")[0]);
      setActiveDatePreset("last30");
    } else if (preset === "thisMonth") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDateMin(firstDay.toISOString().split("T")[0]);
      setActiveDatePreset("custom");
    }
  };

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
      const url = `/api/discovery/pages?runId=${runId}&sortBy=${sortBy}&sortOrder=${sortOrder}${searchFilter ? `&q=${encodeURIComponent(searchFilter)}` : ""
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

  // Helper to compute final formatted query for launch
  const computeFinalQuery = () => {
    if (isCustomKeyword) {
      const trimmed = customKeywordText.trim();
      if (!trimmed) return "\u200D";
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed;
      return `"${trimmed}"`;
    }
    if (selectedKeyword === "\u200D") return "\u200D";
    return `"${selectedKeyword}"`;
  };

  // Handle Launching New Country Discovery Scan
  const handleLaunchScan = async () => {
    try {
      setIsLaunchingScan(true);
      setActionMessage(null);
      const finalQuery = computeFinalQuery();
      const res = await fetch("/api/discovery/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country,
          mediaType,
          query: finalQuery,
          startDateMin,
          startDateMax,
        }),
      });
      const data = await res.json();
      if (data.success && data.runId) {
        setSelectedRunId(data.runId);
        setActionMessage(`Country discovery scan launched with keyword ${finalQuery === "\u200D" ? "ZWJ (Broad Search)" : finalQuery}! Worker is harvesting pages...`);
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

  // Selection toggle handlers (operates on currently visible filtered pages)
  const toggleSelectAll = () => {
    const selectableIds = filteredPages.map((p) => p.id);
    if (selectableIds.every((id) => selectedPageIds.has(id)) && selectableIds.length > 0) {
      const next = new Set(selectedPageIds);
      selectableIds.forEach((id) => next.delete(id));
      setSelectedPageIds(next);
    } else {
      const next = new Set(selectedPageIds);
      selectableIds.forEach((id) => next.add(id));
      setSelectedPageIds(next);
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

  // Batch Action 2: Merge Selected (non-tracked) Pages to Main Dashboard
  const handleMergeSelected = async (explicitIds?: string[]) => {
    const idsToMerge = explicitIds ?? Array.from(selectedPageIds).filter(
      (id) => !pages.find((p) => p.id === id)?.isTracked
    );
    if (idsToMerge.length === 0) return;
    setMergeConfirmPending(false);
    startTransition(async () => {
      try {
        setActionMessage(null);
        const res = await fetch("/api/discovery/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discoveredPageIds: idsToMerge }),
        });
        const data = await res.json();
        if (data.success) {
          setActionMessage(
            `✓ Successfully merged ${data.importedCount} page${data.importedCount !== 1 ? "s" : ""} into your tracking dashboard!`
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

  // Single-row Merge — takes pageId directly to avoid stale closure race
  const handleMergeSinglePage = async (pageId: string) => {
    await handleMergeSelected([pageId]);
  };

  // Action 3: Ignore or Restore Selected Pages
  const handleIgnoreSelected = async (explicitIds?: string[], restore: boolean = false) => {
    const idsToUpdate = explicitIds ?? Array.from(selectedPageIds);
    if (idsToUpdate.length === 0) return;
    startTransition(async () => {
      try {
        setActionMessage(null);
        const res = await fetch("/api/discovery/ignore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discoveredPageIds: idsToUpdate, restore }),
        });
        const data = await res.json();
        if (data.success) {
          setActionMessage(data.message || "Updated page ignore status");
          setSelectedPageIds(new Set());
          if (selectedRunId) fetchPages(selectedRunId);
        } else {
          setActionMessage(`Ignore action failed: ${data.error}`);
        }
      } catch (err: any) {
        setActionMessage(`Ignore action error: ${err.message}`);
      }
    });
  };

  // Action 4: Dismiss all remaining unmerged pages in current run
  const handleDismissRemainingRun = async () => {
    if (!selectedRunId) return;
    startTransition(async () => {
      try {
        setActionMessage(null);
        const res = await fetch("/api/discovery/ignore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: selectedRunId, dismissRemaining: true }),
        });
        const data = await res.json();
        if (data.success) {
          setActionMessage(`Dismissed ${data.ignoredCount} remaining pages in this run!`);
          setSelectedPageIds(new Set());
          if (selectedRunId) fetchPages(selectedRunId);
        } else {
          setActionMessage(`Dismiss remaining failed: ${data.error}`);
        }
      } catch (err: any) {
        setActionMessage(`Dismiss remaining error: ${err.message}`);
      }
    });
  };

  const activeRun = runs.find((r) => r.id === selectedRunId);
  const untrackedCount = pages.filter((p) => !p.isTracked && p.status !== "ignored").length;
  const newDiscoveredCount = pages.filter((p) => !p.isTracked && p.status === "discovered").length;
  const verifiedCount = pages.filter((p) => !p.isTracked && p.status !== "imported" && p.status !== "ignored" && p.verifiedAdCount !== null).length;
  const ignoredCount = pages.filter((p) => p.status === "ignored").length;
  const dismissableRemainingCount = pages.filter((p) => !p.isTracked && p.status !== "imported" && p.status !== "ignored").length;

  const SortHeader = ({ col, label, className = "" }: { col: string; label: string; className?: string }) => {
    const active = sortBy === col;
    return (
      <th className={`p-3 whitespace-nowrap ${className}`}>
        <button
          onClick={() => handleSortChange(col)}
          className={`flex items-center space-x-1.5 uppercase font-bold text-[10px] tracking-wider transition-colors cursor-pointer ${active ? "text-indigo-600 dark:text-indigo-400 font-extrabold" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
        >
          <span>{label}</span>
          <span className="shrink-0">
            {active ? (
              sortOrder === "asc" ? (
                <ChevronUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
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
    } else if (sortBy === "pageId") {
      valA = (a.pageId || "").toLowerCase();
      valB = (b.pageId || "").toLowerCase();
    } else if (sortBy === "status") {
      const statusOrder: Record<string, number> = {
        verifying: 1,
        discovered: 2,
        tracked: 3,
        imported: 4,
        ignored: 5,
      };
      const statusA = a.isTracked ? "tracked" : a.status;
      const statusB = b.isTracked ? "tracked" : b.status;
      valA = statusOrder[statusA] || 99;
      valB = statusOrder[statusB] || 99;
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Filtered view for the table (client-side status filter on top of server results)
  const filteredPages = sortedPages.filter((p) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "discovered") return !p.isTracked && p.status !== "imported" && p.status !== "ignored";
    if (statusFilter === "verified") return !p.isTracked && p.status !== "imported" && p.status !== "ignored" && p.verifiedAdCount !== null;
    if (statusFilter === "verifying") return p.status === "verifying";
    if (statusFilter === "imported") return (p.isTracked || p.status === "imported") && p.status !== "ignored";
    if (statusFilter === "ignored") return p.status === "ignored";
    return true;
  });

  return (
    <div className="space-y-4 pb-12 bg-background text-foreground">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800/40">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              Country Brand Discovery
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                Tunisia & Global
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Scan Meta Ad Library by country to uncover e-commerce brands matching "Shop Now" & "Order Now"
            </p>
          </div>
        </div>

        <button
          onClick={fetchRuns}
          title="Refresh Scans"
          className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRuns ? "animate-spin text-indigo-500" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-500/40 text-indigo-900 dark:text-indigo-200 text-xs font-medium flex items-center justify-between animate-in fade-in duration-150 shadow-sm">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>{actionMessage}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-xs font-bold cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Discovery Scanner Controls Panel */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-3.5 sm:p-4 space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-2.5">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            <Filter className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <span>Discovery Search Controls</span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-1">
            {/* Quick Date Presets */}
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mr-1">Presets:</span>
            <button
              type="button"
              onClick={() => applyDatePreset("today")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition cursor-pointer ${activeDatePreset === "today"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800"
                }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset("last7")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition cursor-pointer ${activeDatePreset === "last7"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800"
                }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset("last30")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition cursor-pointer ${activeDatePreset === "last30"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800"
                }`}
            >
              Last 30 Days
            </button>

            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1 ml-auto sm:ml-2">
              <ShieldCheck className="w-3 h-3" />
              CTA Active: "Shop Now" & "Order Now"
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 text-xs">
          {/* Country Selection */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              Target Country
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 transition cursor-pointer"
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

          {/* Keyword Selection */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              Target Keyword
            </label>
            {isCustomKeyword ? (
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  placeholder='e.g. "شحن مجاني"'
                  value={customKeywordText}
                  onChange={(e) => setCustomKeywordText(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomKeyword(false);
                    setSelectedKeyword("\u200D");
                  }}
                  title="Back to Presets"
                  className="px-2 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
                >
                  Presets
                </button>
              </div>
            ) : (
              <select
                value={selectedKeyword}
                onChange={(e) => {
                  if (e.target.value === "__CUSTOM__") {
                    setIsCustomKeyword(true);
                  } else {
                    setSelectedKeyword(e.target.value);
                  }
                }}
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 transition cursor-pointer text-xs"
              >
                {KEYWORD_GROUPS.map((group) => (
                  <optgroup key={group.groupName} label={`— ${group.groupName} —`}>
                    {group.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <optgroup label="— Custom —">
                  <option value="__CUSTOM__">✏️ Custom Keyword...</option>
                </optgroup>
              </select>
            )}
          </div>

          {/* Start Date Min */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              Start Date Min
            </label>
            <input
              type="date"
              value={startDateMin}
              onChange={(e) => {
                setStartDateMin(e.target.value);
                setActiveDatePreset("custom");
              }}
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 transition cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>

          {/* Start Date Max */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              Start Date Max
            </label>
            <input
              type="date"
              value={startDateMax}
              onChange={(e) => {
                setStartDateMax(e.target.value);
                setActiveDatePreset("custom");
              }}
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 transition cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>

          {/* Media Type */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              Media Format
            </label>
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as "all" | "video" | "image")}
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-indigo-500 transition cursor-pointer"
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
              className="w-full h-[36px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer"
            >
              {isLaunchingScan ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Launching...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch Discovery</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Discovery Runs Selector */}
      {runs.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-3 space-y-2.5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>Discovery Scan Runs ({runs.length})</span>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold shrink-0">Select Run:</label>
              <select
                value={selectedRunId || ""}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="w-full sm:w-auto bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold rounded-lg px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
              >
                {runs.map((r) => {
                  const kw = getRunKeywordDisplay(r);
                  const dateStr = new Date(r.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
                  const timeStr = new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  return (
                    <option key={r.id} value={r.id}>
                      {r.country} — Keyword: {kw} ({r.totalPagesDiscovered} pages, {r.totalAdsScanned} ads) — {dateStr} {timeStr}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {runs.slice(0, 4).map((run) => {
              const isSelected = run.id === selectedRunId;
              const isRunning = run.status === "running" || run.status === "pending";
              const kw = getRunKeywordDisplay(run);

              return (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition cursor-pointer ${isSelected
                      ? "bg-indigo-50/80 dark:bg-indigo-950/70 border-indigo-500 text-slate-900 dark:text-white shadow-sm ring-1 ring-indigo-500/30"
                      : "bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    {isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin shrink-0" />
                    ) : run.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span>Country: {run.country}</span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate" title={`Keyword: ${kw}`}>
                        KW: {kw} · {run.totalPagesDiscovered} p · {run.totalAdsScanned} ads
                      </div>
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-400 dark:text-slate-500 text-right shrink-0 pl-1.5">
                    <div>
                      {new Date(run.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div>
                      {new Date(run.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Run Stats & Batch Actions Bar */}
      <div className="space-y-3">
        {activeRun && (
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-sm">
            <div className="flex items-center space-x-4">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                <span className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  {activeRun.status === "running" && (
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                  )}
                  {activeRun.status}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">Ads Scanned</span>
                <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">
                  {activeRun.totalAdsScanned.toLocaleString()}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">Discovered Pages</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                  {activeRun.totalPagesDiscovered.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Batch Selection & Action Buttons */}
            <div className="flex items-center gap-2 animate-in fade-in duration-150 flex-wrap">
              {/* Step indicator */}
              <div className="hidden md:flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 mr-2 border-r border-slate-200 dark:border-slate-700 pr-3">
                <span className={`px-1.5 py-0.5 rounded ${selectedPageIds.size > 0 ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300" : "opacity-40"}`}>① Select</span>
                <span className="opacity-30">›</span>
                <span className={`px-1.5 py-0.5 rounded opacity-40`}>② Verify</span>
                <span className="opacity-30">›</span>
                <span className={`px-1.5 py-0.5 rounded opacity-40`}>③ Merge</span>
              </div>

              {selectedPageIds.size > 0 && (
                <>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {selectedPageIds.size} selected
                  </span>
                  <button
                    onClick={handleVerifySelected}
                    disabled={isActionPending}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Verify Ad Counts</span>
                  </button>

                  {/* Ignore Selected */}
                  <button
                    onClick={() => handleIgnoreSelected()}
                    disabled={isActionPending}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-800 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Ignore Selected ({selectedPageIds.size})</span>
                  </button>

                  {/* Merge Selected — with confirmation guard */}
                  {mergeConfirmPending ? (
                    <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-500/40 rounded-lg px-2.5 py-1">
                      <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">Merge {Array.from(selectedPageIds).filter(id => !pages.find(p => p.id === id)?.isTracked).length} new pages?</span>
                      <button
                        onClick={() => handleMergeSelected()}
                        disabled={isActionPending}
                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setMergeConfirmPending(false)}
                        className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setMergeConfirmPending(true)}
                      disabled={isActionPending || Array.from(selectedPageIds).every(id => pages.find(p => p.id === id)?.isTracked)}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Merge New Selected ({Array.from(selectedPageIds).filter(id => !pages.find(p => p.id === id)?.isTracked).length})</span>
                    </button>
                  )}
                </>
              )}

              {/* Dismiss Remaining button for active run */}
              {selectedRunId && dismissableRemainingCount > 0 && selectedPageIds.size === 0 && (
                <button
                  onClick={handleDismissRemainingRun}
                  disabled={isActionPending}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  title="Mark all remaining unselected pages in this run as ignored"
                >
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Dismiss Remaining ({dismissableRemainingCount})</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Discovered Pages Table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 flex flex-col shadow-sm">
          {/* Table Header Controls */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by page name..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              {/* Status filter tabs */}
              <div className="flex items-center gap-1 shrink-0 flex-wrap">
                {(["all", "discovered", "verified", "verifying", "imported", "ignored"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-2 py-1 rounded text-[10px] font-bold border transition cursor-pointer capitalize ${statusFilter === f
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                  >
                    {f === "all" ? `All (${pages.length})` :
                      f === "discovered" ? `New (${newDiscoveredCount})` :
                        f === "verified" ? `Verified (${verifiedCount})` :
                          f === "verifying" ? `Verifying` :
                            f === "imported" ? `Merged` :
                              `Ignored (${ignoredCount})`}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
              Showing <span className="font-bold text-slate-900 dark:text-white">{filteredPages.length}</span> of {pages.length}
            </div>
          </div>

          {/* Table Element - Fits laptop screens cleanly and scrolls with page */}
          <div className="overflow-x-auto relative">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px] tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={pages.length > 0 && selectedPageIds.size === pages.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <SortHeader col="displayName" label="Brand & Meta Link" />
                  <SortHeader col="matchingAdCount" label="Ads (Active / Verified)" />
                  <th className="p-3">Sample CTAs</th>
                  <SortHeader col="status" label="Status" />
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {isLoadingPages ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 dark:text-indigo-400" />
                      <div>Loading discovered pages...</div>
                    </td>
                  </tr>
                ) : filteredPages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 dark:text-slate-400">
                      {pages.length === 0
                        ? "No discovered pages found for this scan run yet. Launch a new country scan above!"
                        : `No pages match the "${statusFilter}" filter.`}
                    </td>
                  </tr>
                ) : (
                  filteredPages.map((page) => {
                    const isSelected = selectedPageIds.has(page.id);
                    const metaAdLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${page.country || "TN"}&view_all_page_id=${page.pageId}&search_type=page&media_type=all`;

                    return (
                      <tr
                        key={page.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 transition ${isSelected ? "bg-indigo-50/70 dark:bg-indigo-950/40" : ""
                          }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPage(page.id)}
                            className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5">
                            <div className="font-bold text-slate-900 dark:text-white text-xs flex items-center space-x-1.5 truncate max-w-[200px] sm:max-w-xs">
                              <span className="truncate">{page.displayName || `Page ${page.pageId}`}</span>
                              <a
                                href={metaAdLibraryUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 shrink-0"
                                title="Open in Meta Ad Library"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              ID: {page.pageId}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400 w-fit">
                              {page.matchingAdCount} active ads
                            </span>
                            {page.verifiedAdCount !== null ? (
                              page.verifiedAdCount >= 10 ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-600/40 w-fit">
                                  <Sparkles className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />
                                  <span>{page.verifiedAdCount} verified (High Signal)</span>
                                </span>
                              ) : page.verifiedAdCount > 0 ? (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  <span>{page.verifiedAdCount} verified</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                  <span>0 verified (No active ads)</span>
                                </span>
                              )
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Unverified</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {page.sampleCtas && page.sampleCtas.length > 0 ? (
                              page.sampleCtas.slice(0, 3).map((cta, idx) => (
                                <span
                                  key={idx}
                                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80"
                                >
                                  {cta}
                                </span>
                              ))
                            ) : (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Shop Now</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          {page.status === "ignored" ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400">
                              <EyeOff className="w-3 h-3" />
                              <span>Ignored</span>
                            </span>
                          ) : page.isTracked ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                              <Check className="w-3 h-3" />
                              <span>Already Tracked</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 uppercase">
                              {page.status}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => handleVerifyPage(page.id)}
                              disabled={isActionPending || page.status === "verifying"}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-300 border border-slate-200 dark:border-indigo-500/30 text-xs font-semibold transition inline-flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
                              title="Verify exact active ad count via worker"
                            >
                              <RefreshCw className={`w-3 h-3 ${page.status === "verifying" ? "animate-spin text-indigo-500" : ""}`} />
                              <span className="hidden sm:inline">{page.status === "verifying" ? "Verifying..." : "Verify"}</span>
                            </button>

                            {/* Ignore or Restore button */}
                            {page.status === "ignored" ? (
                              <button
                                onClick={() => handleIgnoreSelected([page.id], true)}
                                disabled={isActionPending}
                                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition inline-flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                                title="Restore to active discovery feed"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleIgnoreSelected([page.id], false)}
                                disabled={isActionPending}
                                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-800 text-xs font-medium transition inline-flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                                title="Ignore and hide from discovery feed (remembered on future scans)"
                              >
                                <EyeOff className="w-3 h-3" />
                                <span className="hidden sm:inline">Ignore</span>
                              </button>
                            )}

                            {!page.isTracked && page.status !== "ignored" && (
                              <button
                                onClick={() => handleMergeSinglePage(page.id)}
                                disabled={isActionPending}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition inline-flex items-center space-x-1 shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                <ArrowRight className="w-3 h-3" />
                                <span>Merge</span>
                              </button>
                            )}
                          </div>
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
