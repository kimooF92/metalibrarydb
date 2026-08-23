"use client";

import { useState, useEffect } from "react";
import {
  X,
  Star,
  Plus,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/components/toast-context";

interface CandidatePage {
  id: string;
  pageId: string;
  displayName: string | null;
  matchingAdCount: number;
  status: string;
  sampleCtas?: string[] | null;
  sampleUrls?: string[] | null;
  createdAt: string;
}

interface TrackedPageInfo {
  id: string;
  displayName: string | null;
  url: string;
  pageId: string | null;
  country?: string | null;
  searchType: string | null;
  discoveredPagesCount: number;
}

interface ResolveBrandModalProps {
  trackedPageId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ResolveBrandModal({
  trackedPageId,
  isOpen,
  onClose,
  onSuccess,
}: ResolveBrandModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [trackedPage, setTrackedPage] = useState<TrackedPageInfo | null>(null);
  const [candidates, setCandidates] = useState<CandidatePage[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !trackedPageId) return;

    let isMounted = true;
    setLoading(true);

    fetch(`/api/tracked-pages/candidates?trackedPageId=${trackedPageId}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.success) {
            setTrackedPage(data.trackedPage);
            setCandidates(data.candidates || []);
          } else {
            showToast({ type: "error", title: "Failed to load candidate pages" });
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Error loading candidate pages:", err);
          showToast({ type: "error", title: "Network error loading candidate pages" });
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, trackedPageId, showToast]);

  if (!isOpen || !trackedPageId) return null;

  // 1. Action: Set as Primary Official Brand Page
  const handleSetPrimary = async (candidate: CandidatePage) => {
    setProcessingId(candidate.id);
    try {
      const res = await fetch("/api/tracked-pages/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exactMatchTrackedPageId: trackedPageId,
          resolvedPageId: candidate.pageId,
          resolvedDisplayName: candidate.displayName || `Page ${candidate.pageId}`,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Brand Verified & Upgraded",
          message: `Successfully linked to official Page "${candidate.displayName || candidate.pageId}"!`,
        });
        onSuccess?.();
        onClose();
      } else {
        showToast({ type: "error", title: "Merge Failed", message: data.error || "Failed to set primary brand page" });
      }
    } catch (err) {
      showToast({ type: "error", title: "Network error during brand page merge" });
    } finally {
      setProcessingId(null);
    }
  };

  // 2. Action: Track as Separate Brand
  const handleTrackSeparate = async (candidate: CandidatePage) => {
    setProcessingId(candidate.id);
    try {
      const res = await fetch("/api/discovery/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discoveredPageIds: candidate.id.startsWith("cand_") ? [] : [candidate.id],
          pages: [
            {
              pageId: candidate.pageId,
              displayName: candidate.displayName || `Page ${candidate.pageId}`,
              country: trackedPage?.country || "TN",
              matchingAdCount: candidate.matchingAdCount,
            },
          ],
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Brand Added",
          message: `Added "${candidate.displayName || candidate.pageId}" as a new tracked brand!`,
        });
        // Update local candidate status
        setCandidates((prev) =>
          prev.map((c) => (c.id === candidate.id ? { ...c, status: "imported" } : c))
        );
        onSuccess?.();
      } else {
        showToast({ type: "error", title: "Import Failed", message: data.error || "Failed to track brand" });
      }
    } catch (err) {
      showToast({ type: "error", title: "Network error tracking brand" });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Resolve Multiple Facebook Pages
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Target: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{trackedPage?.displayName || "Exact Match Target"}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200/60 dark:border-indigo-800/40 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            Meta Ad Library detected <strong>{candidates.length} Facebook Pages</strong> running ads for this domain. Choose which page is the <strong>Primary Brand</strong>, or track multiple pages separately.
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
              <p className="text-xs text-slate-500">Loading candidate pages...</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
              No candidate pages found for this brand.
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map((cand, idx) => {
                const isProcessing = processingId === cand.id;
                const isAlreadyTracked = cand.status === "imported";

                return (
                  <div
                    key={cand.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {cand.displayName || `Page ${cand.pageId}`}
                        </span>
                        {idx === 0 && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Most Active
                          </span>
                        )}
                        {isAlreadyTracked && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Tracked
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">Page ID: {cand.pageId}</span>
                        <span>•</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {cand.matchingAdCount} ads found
                        </span>
                      </div>

                      {/* Meta Ad Library Link */}
                      <a
                        href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&view_all_page_id=${cand.pageId}&search_type=page`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline pt-0.5"
                      >
                        <span>View in Meta Ad Library</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleSetPrimary(cand)}
                        disabled={isProcessing}
                        title="Set this as the primary official page for this brand"
                        className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Star className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>Set Primary</span>
                      </button>

                      {!isAlreadyTracked && (
                        <button
                          onClick={() => handleTrackSeparate(cand)}
                          disabled={isProcessing}
                          title="Track this page as a separate independent brand"
                          className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Track Separate</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
