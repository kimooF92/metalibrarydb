"use client";

import { useState, useEffect } from "react";
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
  Key,
  Layers,
  Clock,
  HardDrive,
  Check,
} from "lucide-react";
import { useToast } from "@/components/toast-context";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"general" | "spy" | "discovery" | "maintenance">("general");
  const [loading, setLoading] = useState(false);
  const [pruneEligible, setPruneEligible] = useState<number | null>(null);
  const [pruning, setPruning] = useState(false);
  const [savedSettings, setSavedSettings] = useState({
    defaultCountry: "TN",
    autoMerge: true,
    staleHours: 12,
    autoSpyThreshold: 1,
    discoveryWindowDays: 7,
    autoB2Backup: true,
  });

  const { showToast } = useToast();

  useEffect(() => {
    // Load local storage preferences if any
    try {
      const saved = localStorage.getItem("app_user_settings");
      if (saved) {
        setSavedSettings((prev) => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch {}

    // Fetch queue maintenance status
    fetch("/api/queue/prune")
      .then((r) => r.json())
      .then((d) => setPruneEligible(d.eligible ?? 0))
      .catch(() => {});
  }, []);

  const handleSavePreferences = () => {
    try {
      localStorage.setItem("app_user_settings", JSON.stringify(savedSettings));
      showToast({ type: "success", title: "Settings saved successfully" });
    } catch {
      showToast({ type: "error", title: "Failed to save settings" });
    }
  };

  const handlePruneQueue = async () => {
    setPruning(true);
    try {
      const res = await fetch("/api/queue/prune", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPruneEligible(0);
        showToast({
          type: "success",
          title: "Queue Pruned",
          message: data.message || "Completed jobs older than 30 days removed.",
        });
      }
    } catch {
      showToast({ type: "error", title: "Failed to prune queue" });
    } finally {
      setPruning(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      showToast({ type: "info", title: "Preparing CSV export..." });
      const res = await fetch("/api/pages?limit=1000");
      if (res.ok) {
        const data = await res.json();
        const pages = data.pages || [];

        const headers = ["Brand Name", "Search Type", "Page ID", "Active Ads", "Difference", "Country", "Last Checked", "URL"];
        const rows = pages.map((p: any) => [
          `"${(p.displayName || "").replace(/"/g, '""')}"`,
          p.searchType || "",
          p.pageId || "",
          p.currentResults ?? "",
          p.difference ?? "",
          p.country || "TN",
          p.lastChecked ? new Date(p.lastChecked).toISOString() : "",
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
        showToast({ type: "success", title: "Export downloaded successfully" });
      }
    } catch {
      showToast({ type: "error", title: "Failed to export data" });
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800/60">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Settings & Automation
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage scraper frequency, cloud tokens, discovery rules, and data maintenance.
            </p>
          </div>
        </div>

        <button
          onClick={handleSavePreferences}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          <span>Save Changes</span>
        </button>
      </div>

      {/* Settings Tab Navigation */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-2">
        {[
          { id: "general", label: "General & Scraping", icon: Cpu },
          { id: "spy", label: "Ad Spy & Cloud", icon: Sparkles },
          { id: "discovery", label: "Discovery Engine", icon: Globe },
          { id: "maintenance", label: "Database & Queue", icon: Database },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
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
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Auto-Merge Domain Matches</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Automatically convert single-brand exact phrase domain searches to canonical Facebook Page IDs during local & cloud scans.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={savedSettings.autoMerge}
                  onChange={(e) => setSavedSettings({ ...savedSettings, autoMerge: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-1"
                />
              </div>
              <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-800/30 text-[11px] text-indigo-700 dark:text-indigo-300">
                ✓ Enabled: Verified numeric Page IDs (e.g. <code>920201531178963</code>) automatically become primary tracked targets.
              </div>
            </div>

            {/* Default Target Country */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Default Target Country</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Default 2-letter country code applied when adding URLs or running discovery.
              </p>
              <select
                value={savedSettings.defaultCountry}
                onChange={(e) => setSavedSettings({ ...savedSettings, defaultCountry: e.target.value })}
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
                GitHub Worker cron (every 2h) will auto-enqueue any page not scanned within this window.
              </p>
              <div className="flex items-center space-x-3">
                {[6, 12, 24].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setSavedSettings({ ...savedSettings, staleHours: hours })}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      savedSettings.staleHours === hours
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    Every {hours} Hours
                  </button>
                ))}
              </div>
            </div>

            {/* Scan Engine Rate Mode */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Queue Throttle Cap</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Currently running in <strong>Unlimited Capacity</strong> mode with safe 2–5s randomized browser jitter.
              </p>
              <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Unlimited (Continuous Queue Draining)</span>
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
                    onClick={() => setSavedSettings({ ...savedSettings, autoSpyThreshold: delta })}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      savedSettings.autoSpyThreshold === delta
                        ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    +{delta} New Ads
                  </button>
                ))}
              </div>
            </div>

            {/* Backblaze B2 Media Backup */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Backblaze B2 Media Cloud Storage</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Automatically persist and mirror ad images & videos to your S3-compatible bucket so creatives never expire.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={savedSettings.autoB2Backup}
                  onChange={(e) => setSavedSettings({ ...savedSettings, autoB2Backup: e.target.checked })}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer mt-1"
                />
              </div>
              <div className="inline-flex items-center space-x-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Bucket: meta-ad-media-feed (Active)</span>
              </div>
            </div>

            {/* Apify Multi-Token Cloud Manager */}
            <div className="md:col-span-2 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Key className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Apify Cloud Actor & Tokens</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                  2 Tokens Configured
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The scraper rotates across comma-separated tokens in <code>APIFY_API_TOKENS</code> to maximize concurrency and free monthly limits.
              </p>
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                curious_coder/facebook-ads-library-scraper
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
                    onClick={() => setSavedSettings({ ...savedSettings, discoveryWindowDays: days })}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      savedSettings.discoveryWindowDays === days
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    Last {days} Days
                  </button>
                ))}
              </div>
            </div>

            {/* E-Commerce CTAs */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Buying Intent CTAs Included</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Discovery engine filters strictly for purchase actions:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["SHOP_NOW", "ORDER_NOW", "BUY_NOW", "GET_OFFER", "PURCHASE"].map((cta) => (
                  <span
                    key={cta}
                    className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Purge finished queue entries older than 30 days to keep your database index small and ultra-fast.
              </p>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  {pruneEligible !== null ? `${pruneEligible} jobs eligible` : "Checking..."}
                </span>
                <button
                  onClick={handlePruneQueue}
                  disabled={pruning || pruneEligible === 0}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{pruning ? "Pruning..." : "Prune Old Jobs"}</span>
                </button>
              </div>
            </div>

            {/* Export CSV */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Export Tracked Competitors</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Download a clean spreadsheet backup of all monitored brands, Page IDs, and latest ad counts.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleExportCsv}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
