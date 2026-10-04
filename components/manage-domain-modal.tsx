"use client";

import { useState, useEffect } from "react";
import {
  X,
  Globe,
  Star,
  Plus,
  ExternalLink,
  RefreshCw,
  Trash2,
  Layers,
  ShoppingBag,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
} from "lucide-react";
import { useToast } from "@/components/toast-context";
import type { TrackedPage } from "@/types";

interface SisterPageInfo extends TrackedPage {
  pageRole?: "primary" | "satellite" | "backup" | null;
}

interface DomainPortfolioData {
  id: string;
  domain: string;
  displayName: string;
  category?: string | null;
  storePlatform?: string | null;
  notes?: string | null;
  isWatchlisted: boolean;
  totalCombinedAds: number;
  totalProducts: number;
  linkedPagesCount: number;
  primaryPageId?: string | null;
  primaryDisplayName?: string | null;
  sisterPages: SisterPageInfo[];
}

interface ManageDomainModalProps {
  domainOrId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ManageDomainModal({
  domainOrId,
  isOpen,
  onClose,
  onSuccess,
}: ManageDomainModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState<DomainPortfolioData | null>(null);
  const [newPageInput, setNewPageInput] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [processingPageId, setProcessingPageId] = useState<string | null>(null);

  const fetchPortfolio = async () => {
    if (!domainOrId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/domains/${encodeURIComponent(domainOrId)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setPortfolio(data.portfolio);
      } else {
        showToast({
          type: "error",
          title: "Portfolio Not Found",
          message: data.error || "Failed to load domain portfolio.",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Failed to fetch domain portfolio.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && domainOrId) {
      fetchPortfolio();
    } else {
      setPortfolio(null);
      setNewPageInput("");
    }
  }, [isOpen, domainOrId]);

  if (!isOpen || !domainOrId) return null;

  // 1. Switch Primary Page
  const handleSetPrimary = async (page: SisterPageInfo) => {
    if (!portfolio || page.pageRole === "primary") return;
    setProcessingPageId(page.id);

    try {
      const res = await fetch(`/api/domains/${portfolio.id}/set-primary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackedPageId: page.id }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Flagship Page Updated",
          message: `"${page.displayName || page.pageId}" is now the primary page for ${portfolio.domain}.`,
        });
        await fetchPortfolio();
        onSuccess?.();
      } else {
        showToast({
          type: "error",
          title: "Update Failed",
          message: data.error || "Could not switch primary page.",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Network Error", message: err.message });
    } finally {
      setProcessingPageId(null);
    }
  };

  // 2. Unlink Sister Page
  const handleUnlink = async (page: SisterPageInfo) => {
    if (!portfolio) return;
    const isConfirm = window.confirm(
      `Unlink "${page.displayName || page.pageId}" from "${portfolio.domain}"? Its historical ad data will be preserved.`
    );
    if (!isConfirm) return;

    setProcessingPageId(page.id);

    try {
      const res = await fetch(`/api/domains/${portfolio.id}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackedPageId: page.id }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Page Unlinked",
          message: `Successfully detached page from domain portfolio.`,
        });
        await fetchPortfolio();
        onSuccess?.();
      } else {
        showToast({
          type: "error",
          title: "Unlink Failed",
          message: data.error || "Could not unlink page.",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Network Error", message: err.message });
    } finally {
      setProcessingPageId(null);
    }
  };

  // 3. Link New Page by ID or URL
  const handleLinkNewPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portfolio || !newPageInput.trim()) return;

    setIsLinking(true);
    try {
      const res = await fetch(`/api/domains/${portfolio.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageIdOrUrl: newPageInput.trim(),
          role: "satellite",
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Page Linked",
          message: `Added sister page to ${portfolio.domain}.`,
        });
        setNewPageInput("");
        await fetchPortfolio();
        onSuccess?.();
      } else if (data.conflict) {
        const force = window.confirm(
          `${data.error}\n\nDo you want to reassign this page to "${portfolio.domain}"?`
        );
        if (force) {
          const forceRes = await fetch(`/api/domains/${portfolio.id}/link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageIdOrUrl: newPageInput.trim(),
              role: "satellite",
              forceReassign: true,
            }),
          });
          const forceData = await forceRes.json();
          if (forceRes.ok && forceData.success) {
            showToast({
              type: "success",
              title: "Page Reassigned",
              message: `Page reassigned to "${portfolio.domain}".`,
            });
            setNewPageInput("");
            await fetchPortfolio();
            onSuccess?.();
          } else {
            showToast({ type: "error", title: "Failed", message: forceData.error });
          }
        }
      } else {
        showToast({
          type: "error",
          title: "Link Failed",
          message: data.error || "Could not link page.",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Network Error", message: err.message });
    } finally {
      setIsLinking(false);
    }
  };

  // 4. Scan All Sister Pages Now
  const handleScanAll = async () => {
    if (!portfolio) return;
    setIsScanningAll(true);

    try {
      const res = await fetch(`/api/domains/${portfolio.id}/scan-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanType: "both" }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Bulk Scan Enqueued",
          message: data.message || `Enqueued scans for all sister pages.`,
        });
      } else {
        showToast({
          type: "error",
          title: "Scan Trigger Failed",
          message: data.error || "Could not enqueue scans.",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Network Error", message: err.message });
    } finally {
      setIsScanningAll(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {portfolio?.domain || "Domain Portfolio"}
                </h2>
                {portfolio?.storePlatform && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {portfolio.storePlatform}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Brand Portfolio: <span className="font-semibold text-slate-700 dark:text-slate-200">{portfolio?.displayName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {portfolio?.domain && (
              <a
                href={`https://${portfolio.domain}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title="Visit Store Domain"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
              <p className="text-xs">Loading domain portfolio...</p>
            </div>
          ) : !portfolio ? (
            <div className="py-12 text-center text-slate-500">
              Portfolio data could not be retrieved.
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span>Combined Active Ads</span>
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                    {portfolio.totalCombinedAds}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span>Catalog Products</span>
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                    {portfolio.totalProducts}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span>Sister Pages</span>
                    <Globe className="w-3.5 h-3.5 text-cyan-500" />
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                    {portfolio.linkedPagesCount}
                  </div>
                </div>
              </div>

              {/* Sister Pages Roster */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Linked Facebook Pages ({portfolio.sisterPages.length})
                  </h3>
                  <button
                    onClick={handleScanAll}
                    disabled={isScanningAll || portfolio.sisterPages.length === 0}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isScanningAll ? "animate-spin" : ""}`} />
                    <span>Scan All Pages</span>
                  </button>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
                  {portfolio.sisterPages.map((page) => {
                    const isPrimary = page.pageRole === "primary";
                    const isProcessing = processingPageId === page.id;

                    return (
                      <div
                        key={page.id}
                        className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                          isPrimary
                            ? "bg-amber-500/[0.04] dark:bg-amber-500/[0.07]"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={() => handleSetPrimary(page)}
                            disabled={isPrimary || isProcessing}
                            title={isPrimary ? "Current Flagship Page" : "Click to make Primary Flagship"}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              isPrimary
                                ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400"
                                : "border-slate-200 dark:border-slate-700 text-slate-300 hover:text-amber-500 hover:border-amber-400"
                            }`}
                          >
                            <Star className={`w-4 h-4 ${isPrimary ? "fill-amber-500" : ""}`} />
                          </button>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {page.displayName || `Page ${page.pageId}`}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  isPrimary
                                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300/60 dark:border-amber-700/60"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                {isPrimary ? "Flagship Primary" : "Satellite"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                              <span>#{page.pageId || "unassigned"}</span>
                              <span>•</span>
                              <span className="text-slate-600 dark:text-slate-300 font-semibold">
                                {page.currentResults ?? 0} active ads
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Page Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {page.pageId && (
                            <a
                              href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${page.pageId}&search_type=page&media_type=all`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                              title="Open in Meta Ad Library"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}

                          <button
                            onClick={() => handleUnlink(page)}
                            disabled={isProcessing}
                            title="Unlink from domain portfolio"
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Link New Page Form */}
              <form onSubmit={handleLinkNewPage} className="pt-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Link Another Facebook Page
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPageInput}
                    onChange={(e) => setNewPageInput(e.target.value)}
                    placeholder="Enter Meta Page ID (e.g. 418187088053866) or Ad Library URL"
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={isLinking || !newPageInput.trim()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    {isLinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>Link Page</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs">
          <div className="text-slate-500">
            Portfolios synchronize ads, products, and intelligence across sister pages.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
