"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Settings,
  Cpu,
  Sparkles,
  Globe,
  Database,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Download,
  Shield,
  ShieldCheck,
  Key,
  HardDrive,
  Check,
  Lock,
  LogOut,
  AlertTriangle,
  RotateCcw,
  X,
  ExternalLink,
  Bot,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/toast-context";
import { Switch } from "@/components/ui/switch";
import { useLogout } from "@/hooks/use-logout";

type SettingsTab = "general" | "spy" | "discovery" | "maintenance" | "security";

interface AppSettingsData {
  defaultCountry: string;
  autoMerge: boolean;
  autoDomainLink: boolean;
  staleHours: number;
  autoSpyThreshold: number;
  discoveryWindowDays: number;
  autoB2Backup: boolean;
}

interface SystemTelemetry {
  apifyTokensConfigured: number;
  b2Configured: boolean;
  b2Bucket: string;
  isProduction: boolean;
  hasSavedReports: boolean;
}

const DEFAULT_SETTINGS: AppSettingsData = {
  defaultCountry: "TN",
  autoMerge: true,
  autoDomainLink: true,
  staleHours: 12,
  autoSpyThreshold: 1,
  discoveryWindowDays: 7,
  autoB2Backup: true,
};

const DEFAULT_TELEMETRY: SystemTelemetry = {
  apifyTokensConfigured: 0,
  b2Configured: false,
  b2Bucket: "meta-ad-media-feed",
  isProduction: false,
  hasSavedReports: false,
};

function SettingsSkeleton() {
  return (
    <div className="h-full flex flex-col space-y-6 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto animate-pulse">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800/60">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="space-y-2">
            <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-72 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
        <div className="h-9 w-28 rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>

      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-28 rounded-xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 h-44 space-y-3">
            <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-10 w-full rounded-xl bg-slate-200 dark:bg-slate-800 mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { logout, isLoggingOut } = useLogout();

  // Tab navigation via URL search parameter
  const rawTab = searchParams.get("tab") as SettingsTab | null;
  const activeTab: SettingsTab = useMemo(() => {
    const validTabs: SettingsTab[] = ["general", "spy", "discovery", "maintenance", "security"];
    return rawTab && validTabs.includes(rawTab) ? rawTab : "general";
  }, [rawTab]);

  const setActiveTab = useCallback(
    (tab: SettingsTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`/settings?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // States
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [persistedSettings, setPersistedSettings] = useState<AppSettingsData>(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<AppSettingsData>(DEFAULT_SETTINGS);
  const [telemetry, setTelemetry] = useState<SystemTelemetry>(DEFAULT_TELEMETRY);

  // Queue pruning state
  const [pruneEligible, setPruneEligible] = useState<number | "error" | null>(null);
  const [pruning, setPruning] = useState(false);
  const [isPruneModalOpen, setIsPruneModalOpen] = useState(false);

  // AI cache state
  const [clearingCache, setClearingCache] = useState(false);

  // Compute dirty state
  const isDirty = useMemo(() => {
    return JSON.stringify(persistedSettings) !== JSON.stringify(draftSettings);
  }, [persistedSettings, draftSettings]);

  // Load settings & telemetry
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.settings) {
        const loaded: AppSettingsData = {
          defaultCountry: data.settings.defaultCountry ?? "TN",
          autoMerge: data.settings.autoMerge ?? true,
          autoDomainLink: data.settings.autoDomainLink ?? true,
          staleHours: data.settings.staleHours ?? 12,
          autoSpyThreshold: data.settings.autoSpyThreshold ?? 1,
          discoveryWindowDays: data.settings.discoveryWindowDays ?? 7,
          autoB2Backup: data.settings.autoB2Backup ?? true,
        };
        setPersistedSettings(loaded);
        setDraftSettings(loaded);

        if (data.telemetry) {
          setTelemetry({
            apifyTokensConfigured: data.telemetry.apifyTokensConfigured ?? 0,
            b2Configured: Boolean(data.telemetry.b2Configured),
            b2Bucket: data.telemetry.b2Bucket ?? "meta-ad-media-feed",
            isProduction: Boolean(data.telemetry.isProduction),
            hasSavedReports: Boolean(data.telemetry.hasSavedReports),
          });
        }
      }
    } catch {
      try {
        const saved = localStorage.getItem("app_user_settings");
        if (saved) {
          const parsed = JSON.parse(saved);
          setPersistedSettings((prev) => ({ ...prev, ...parsed }));
          setDraftSettings((prev) => ({ ...prev, ...parsed }));
        }
      } catch {}
    } finally {
      setInitialLoading(false);
    }
  }, []);

  // Fetch queue maintenance status
  const fetchQueueStatus = useCallback(async () => {
    setPruneEligible(null);
    try {
      const res = await fetch("/api/queue/prune");
      if (!res.ok) throw new Error("HTTP error");
      const data = await res.json();
      setPruneEligible(typeof data.eligible === "number" ? data.eligible : 0);
    } catch {
      setPruneEligible("error");
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchQueueStatus();
  }, [fetchSettings, fetchQueueStatus]);

  // Save draft preferences to DB
  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftSettings),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPersistedSettings(draftSettings);
        try {
          localStorage.setItem("app_user_settings", JSON.stringify(draftSettings));
        } catch {}
        showToast({ type: "success", title: "Settings Saved", message: "Configuration persisted to database." });
      } else {
        throw new Error(data.error || "Failed to save settings");
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Failed to save settings", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Discard draft changes
  const handleDiscardChanges = () => {
    setDraftSettings(persistedSettings);
    showToast({ type: "info", title: "Changes Discarded", message: "Restored last saved database settings." });
  };

  // Prune completed jobs
  const handlePruneQueue = async () => {
    setPruning(true);
    try {
      const res = await fetch("/api/queue/prune", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setPruneEligible(0);
        setIsPruneModalOpen(false);
        showToast({
          type: "success",
          title: "Queue Pruned",
          message: data.message || "Completed jobs older than 30 days removed.",
        });
      } else {
        throw new Error(data.error || "Failed to prune queue");
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Prune Failed", message: err.message });
    } finally {
      setPruning(false);
    }
  };

  // Clear AI cached forecasts
  const handleClearAiCache = async () => {
    setClearingCache(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAiCache: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTelemetry((prev) => ({ ...prev, hasSavedReports: false }));
        showToast({ type: "success", title: "AI Cache Cleared", message: "Opportunity & forecast reports invalidated." });
      } else {
        throw new Error(data.error || "Failed to clear cache");
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Cache Clear Failed", message: err.message });
    } finally {
      setClearingCache(false);
    }
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      showToast({ type: "info", title: "Preparing CSV export...", message: "Fetching competitor records..." });
      const res = await fetch("/api/pages?limit=5000&tab=all");
      if (!res.ok) throw new Error("Failed to fetch pages data");

      const data = await res.json();
      const pages = data.data || data.pages || [];

      if (!pages.length) {
        showToast({ type: "info", title: "No Data Found", message: "There are no tracked pages to export." });
        return;
      }

      const headers = [
        "Brand Name",
        "Search Type",
        "Page ID",
        "Active Ads",
        "Difference",
        "Country",
        "Status",
        "Last Checked",
        "Watchlisted",
        "URL",
      ];

      const rows = pages.map((p: any) => [
        `"${(p.displayName || "").replace(/"/g, '""')}"`,
        p.searchType || "page",
        p.pageId || "",
        p.currentResults ?? 0,
        p.difference ?? 0,
        p.country || draftSettings.defaultCountry || "TN",
        p.status || "pending",
        p.lastChecked ? new Date(p.lastChecked).toISOString() : "",
        p.isWatchlisted ? "Yes" : "No",
        `"${(p.url || "").replace(/"/g, '""')}"`,
      ]);

      const csvContent = [headers.join(","), ...rows.map((r: any[]) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meta-ad-tracker-export-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      showToast({
        type: "success",
        title: "Export Completed",
        message: `Exported ${pages.length} competitor record(s) to CSV.`,
      });
    } catch (err: any) {
      showToast({ type: "error", title: "Export Failed", message: err.message || "Failed to download CSV." });
    }
  };

  if (initialLoading) {
    return <SettingsSkeleton />;
  }

  // Which tabs have saveable preferences
  const isConfigurationTab = ["general", "spy", "discovery"].includes(activeTab);

  return (
    <div className="h-full flex flex-col space-y-6 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto pb-24">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800/60">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Settings & Automation
              </h1>
              {isDirty && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Unsaved Edits
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage scraper frequency, cloud tokens, discovery rules, and data maintenance.
            </p>
          </div>
        </div>

        {/* Header Save CTA — contextual to configurable tabs */}
        {isConfigurationTab && (
          <div className="flex items-center space-x-2">
            {isDirty && (
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={saving}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>
            )}

            <button
              onClick={handleSavePreferences}
              disabled={saving || !isDirty}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isDirty ? "Save Changes" : "Saved"}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Settings Tab Navigation with URL deep-linking */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-2">
        {[
          { id: "general", label: "General & Scraping", icon: Cpu },
          { id: "spy", label: "Ad Spy & Cloud", icon: Sparkles },
          { id: "discovery", label: "Discovery Engine", icon: Globe },
          { id: "maintenance", label: "Database & Queue", icon: Database },
          { id: "security", label: "Security & Access", icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                active
                  ? "bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/40 border border-transparent"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: General & Scraping */}
      {activeTab === "general" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Auto-Merge Setting */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Auto-Merge Domain Matches</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Automatically convert single-brand exact phrase domain searches to canonical Facebook Page IDs during local & cloud scans.
                  </p>
                </div>
                <Switch
                  id="auto-merge-switch"
                  ariaLabel="Toggle auto-merge domain matches"
                  checked={draftSettings.autoMerge}
                  onCheckedChange={(val) => setDraftSettings({ ...draftSettings, autoMerge: val })}
                  colorScheme="indigo"
                />
              </div>
              <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-800/30 text-[11px] text-indigo-700 dark:text-indigo-300">
                {draftSettings.autoMerge ? (
                  <span>✓ <strong>Enabled:</strong> Verified numeric Page IDs (e.g. <code>920201531178963</code>) automatically become primary tracked targets.</span>
                ) : (
                  <span>✕ <strong>Disabled:</strong> Domain search terms remain tracked strictly as keywords.</span>
                )}
              </div>
            </div>

            {/* Auto-Link Domain Portfolios */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Auto-Link Sister Pages (Domain Portfolios)</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Automatically group multiple Facebook Pages sharing the same checkout/store domain into unified brand domain portfolios.
                  </p>
                </div>
                <Switch
                  id="auto-domain-link-switch"
                  ariaLabel="Toggle auto-link sister pages"
                  checked={draftSettings.autoDomainLink}
                  onCheckedChange={(val) => setDraftSettings({ ...draftSettings, autoDomainLink: val })}
                  colorScheme="indigo"
                />
              </div>
              <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 text-[11px] text-emerald-700 dark:text-emerald-300">
                {draftSettings.autoDomainLink ? (
                  <span>✓ <strong>Enabled:</strong> Pages driving traffic to the same destination store (e.g. flagship + promo pages) are linked with combined ad intelligence.</span>
                ) : (
                  <span>✕ <strong>Disabled:</strong> Sister pages are treated as completely independent competitor entities.</span>
                )}
              </div>
            </div>

            {/* Default Target Country */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Default Target Country</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Default 2-letter country code applied when adding URLs or running discovery.
              </p>
              <select
                value={draftSettings.defaultCountry}
                onChange={(e) => setDraftSettings({ ...draftSettings, defaultCountry: e.target.value })}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="TN">Tunisia (TN)</option>
                <option value="FR">France (FR)</option>
                <option value="SA">Saudi Arabia (SA)</option>
                <option value="AE">United Arab Emirates (AE)</option>
                <option value="US">United States (US)</option>
                <option value="ALL">All Countries (ALL)</option>
              </select>
            </div>

            {/* Stale Cooldown Threshold */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Auto-Refresh Stale Cooldown</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                GitHub Worker cron will automatically re-enqueue any tracked page not scanned within this window.
              </p>
              <div className="flex items-center space-x-3">
                {[6, 12, 24].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setDraftSettings({ ...draftSettings, staleHours: hours })}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      draftSettings.staleHours === hours
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400"
                    }`}
                  >
                    Every {hours} Hours
                  </button>
                ))}
              </div>
            </div>

            {/* Scan Engine Rate Mode (Worker Runtime Telemetry) */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Worker Engine Telemetry & Mode</h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Background scrapers continuously drain queue jobs with randomized 2–5s browser jitter to prevent rate limits.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold border border-emerald-500/20 shrink-0">
                  Continuous Queue Draining
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                <span>Concurrency Profile: <strong>1 active worker loop + headless Chromium stealth</strong></span>
                <span className="text-[10px] text-slate-500 font-mono">jitter: 2000-5000ms</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Ad Spy & Cloud */}
      {activeTab === "spy" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Auto-Spy Trigger Delta */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Auto-Spy Trigger Threshold</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatically queue deep creative extraction when a tracked brand gains active ads.
              </p>
              <div className="flex items-center space-x-3">
                {[1, 3, 5].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => setDraftSettings({ ...draftSettings, autoSpyThreshold: delta })}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      draftSettings.autoSpyThreshold === delta
                        ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-purple-400"
                    }`}
                  >
                    +{delta} New Ads
                  </button>
                ))}
              </div>
            </div>

            {/* Backblaze B2 Media Backup */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Backblaze B2 Media Cloud Storage</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Automatically persist and mirror ad images & videos to your S3-compatible bucket so creatives never expire.
                  </p>
                </div>
                <Switch
                  id="auto-b2-backup-switch"
                  ariaLabel="Toggle Backblaze B2 media cloud backup"
                  checked={draftSettings.autoB2Backup}
                  onCheckedChange={(val) => setDraftSettings({ ...draftSettings, autoB2Backup: val })}
                  colorScheme="purple"
                />
              </div>

              {/* Dynamic B2 Status from Telemetry */}
              <div className="flex items-center space-x-2 text-[11px] font-bold">
                <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                {draftSettings.autoB2Backup ? (
                  telemetry.b2Configured ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Bucket: {telemetry.b2Bucket} (Active & Connected)
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      Bucket: {telemetry.b2Bucket} (Enabled, but B2 credentials missing in env)
                    </span>
                  )
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">
                    B2 Media Mirroring Disabled
                  </span>
                )}
              </div>
            </div>

            {/* Apify Multi-Token Cloud Manager */}
            <div className="md:col-span-2 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Key className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Apify Cloud Actor & Tokens</h3>
                </div>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                    telemetry.apifyTokensConfigured > 0
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  }`}
                >
                  {telemetry.apifyTokensConfigured > 0
                    ? `${telemetry.apifyTokensConfigured} Token${telemetry.apifyTokensConfigured > 1 ? "s" : ""} Configured`
                    : "No Tokens Configured (Worker Fallback)"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                The scraper rotates across comma-separated tokens in <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">APIFY_API_TOKENS</code> to maximize concurrency and free monthly limits.
              </p>
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                <span>curious_coder/facebook-ads-library-scraper</span>
                <span className="text-[10px] text-slate-500 font-sans">Active Actor Slug</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Discovery Engine */}
      {activeTab === "discovery" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Default Date Range */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Default Discovery Date Range</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Default time window for finding recently launched e-commerce stores in your target country.
              </p>
              <div className="flex items-center space-x-3">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setDraftSettings({ ...draftSettings, discoveryWindowDays: days })}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      draftSettings.discoveryWindowDays === days
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400"
                    }`}
                  >
                    Last {days} Days
                  </button>
                ))}
              </div>
            </div>

            {/* E-Commerce CTAs (Clarified as Built-in Engine Defaults) */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Buying Intent Signals</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Built-in Engine Defaults
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                The discovery engine strictly matches ads with these high-converting transactional call-to-actions:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["SHOP_NOW", "ORDER_NOW", "BUY_NOW", "GET_OFFER", "PURCHASE"].map((cta) => (
                  <span
                    key={cta}
                    className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  >
                    ✓ {cta}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Database & Queue Maintenance */}
      {activeTab === "maintenance" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Prune Queue */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Queue Database Cleanup</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Purge finished queue entries older than 30 days to keep your database index small and ultra-fast.
              </p>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  {pruneEligible === null && "Checking eligible jobs..."}
                  {typeof pruneEligible === "number" && `${pruneEligible} completed job(s) eligible`}
                  {pruneEligible === "error" && (
                    <span className="text-rose-500 flex items-center space-x-1">
                      <span>Unable to count</span>
                      <button
                        type="button"
                        onClick={fetchQueueStatus}
                        className="underline text-indigo-500 hover:text-indigo-400 cursor-pointer ml-1"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setIsPruneModalOpen(true)}
                  disabled={pruning || pruneEligible === 0 || pruneEligible === null || pruneEligible === "error"}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Prune Old Jobs</span>
                </button>
              </div>
            </div>

            {/* Export CSV */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Export Tracked Competitors</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Download a clean spreadsheet backup of monitored brands, active ad counts, difference trends, and target URLs.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleExportCsv}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Competitors CSV</span>
                </button>
              </div>
            </div>

            {/* AI Report Cache Invalidation */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Bot className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Intelligence Cache Management</h3>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                    telemetry.hasSavedReports
                      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {telemetry.hasSavedReports ? "Cached Forecasts Present" : "No Reports Cached"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Cached AI opportunity summaries and market forecasts are saved in your database to accelerate page loads. Clear this cache if you want to trigger fresh AI market intelligence runs.
              </p>
              <div className="pt-1">
                <button
                  onClick={handleClearAiCache}
                  disabled={clearingCache || !telemetry.hasSavedReports}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${clearingCache ? "animate-spin" : ""}`} />
                  <span>{clearingCache ? "Clearing Cache..." : "Clear AI Report Cache"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Security & Access Gate */}
      {activeTab === "security" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gate Status */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Master Password Gate</h3>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Active & Edge Protected</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                All pages, competitor databases, and API routes are guarded by cryptographic HMAC-SHA256 session signatures.
              </p>
              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Session Length:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">30 Days (Rolling)</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Cookie Security:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">HttpOnly + SameSite</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Brute-Force Guard:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">5 Attempts / Lockout</span>
                </div>
              </div>
            </div>

            {/* Session Management */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Session Controls</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Manage your active authentication session</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {telemetry.isProduction ? (
                  <span>
                    Lock your session immediately on this device, or update your password in your <strong>hosting provider&apos;s Environment Variables</strong> (e.g. Vercel Dashboard → Settings → Environment Variables).
                  </span>
                ) : (
                  <span>
                    Lock your session immediately on this device, or update your password in <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">.env.local</code>.
                  </span>
                )}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={logout}
                  disabled={isLoggingOut}
                  className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  <LogOut className={`w-3.5 h-3.5 ${isLoggingOut ? "animate-spin" : ""}`} />
                  <span>{isLoggingOut ? "Locking Session..." : "Lock Session / Sign Out"}</span>
                </button>
              </div>
            </div>

            {/* Background Workers & API Key Access */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3 md:col-span-2">
              <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400">
                <Key className="w-4 h-4" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Automated Workers & API Access</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Background scraping cron jobs and external automation scripts can authenticate by supplying the <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">x-api-secret</code> header or a Bearer token matching <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">API_SECRET</code> or <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">APP_PASSWORD</code>.
              </p>
              <div className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto">
                <code>curl -H &quot;x-api-secret: YOUR_PASSWORD&quot; https://your-domain.com/api/spy/scans/sync</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Unsaved Changes Bottom Banner */}
      {isDirty && (
        <div className="fixed bottom-6 inset-x-0 max-w-xl mx-auto z-40 px-4 animate-in slide-in-from-bottom-5 duration-200">
          <div className="p-3.5 sm:px-5 rounded-2xl bg-slate-900/95 dark:bg-slate-950/95 text-white shadow-2xl border border-slate-700/80 backdrop-blur-md flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 truncate">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="text-xs font-semibold truncate">You have unsaved changes</span>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={saving}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSavePreferences}
                disabled={saving}
                className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-md shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prune Confirmation Modal */}
      {isPruneModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-slate-950/70 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pruning) setIsPruneModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prune-modal-title"
            className="relative w-full max-w-md glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 animate-in zoom-in-95 duration-150"
          >
            <button
              onClick={() => !pruning && setIsPruneModalOpen(false)}
              disabled={pruning}
              aria-label="Close modal"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start space-x-4">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div className="flex-1">
                <h3 id="prune-modal-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Prune Completed Queue Jobs
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Are you sure you want to permanently delete{" "}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {typeof pruneEligible === "number" ? `${pruneEligible} completed job(s)` : "eligible jobs"}
                  </strong>{" "}
                  older than 30 days? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsPruneModalOpen(false)}
                disabled={pruning}
                className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handlePruneQueue}
                disabled={pruning}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {pruning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Pruning...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Prune Database</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}
