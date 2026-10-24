"use client";

import { useState, useEffect } from "react";
import {
  ArrowRightLeft,
  ArrowRight,
  Globe,
  Layers,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FolderSync,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { useToast } from "@/components/toast-context";
import type { TrackedPage } from "@/types";

export interface MoveWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  // Either a single page, multiple pages/IDs, or a brand domain:
  page?: TrackedPage | null;
  pages?: TrackedPage[];
  pageIds?: string[];
  brandDomainId?: string | null;
  brandDomainName?: string | null;
}

export function MoveWorkspaceModal({
  isOpen,
  onClose,
  onSuccess,
  page,
  pages,
  pageIds,
  brandDomainId,
  brandDomainName,
}: MoveWorkspaceModalProps) {
  const { workspaces, activeWorkspace, refreshWorkspaces } = useWorkspace();
  const { showToast } = useToast();

  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string>("");
  const [moveEntireBrand, setMoveEntireBrand] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Determine effective mode and IDs
  const isBrandMode = Boolean(brandDomainId);
  const effectivePageIds =
    pageIds && pageIds.length > 0
      ? pageIds
      : Array.isArray(pages) && pages.length > 0
      ? pages.map((p) => p.id)
      : page
      ? [page.id]
      : [];

  const isBulkMode = !isBrandMode && effectivePageIds.length > 1;
  const singlePage = !isBrandMode && effectivePageIds.length === 1
    ? page || (pages && pages[0]) || null
    : null;

  // Detect whether any target item has a brand portfolio relation
  const hasLinkedBrand =
    isBrandMode ||
    Boolean(singlePage?.brandDomainId || singlePage?.canonicalDomain) ||
    (isBulkMode && (pages?.some((p) => Boolean(p.brandDomainId || p.canonicalDomain)) ?? true));

  // Initialize moveEntireBrand safely (Finding [P1] Fix: Bulk moves default to page-only)
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      if (isBrandMode) {
        setMoveEntireBrand(true);
      } else if (isBulkMode) {
        setMoveEntireBrand(false);
      } else {
        setMoveEntireBrand(true);
      }
    }
  }, [isOpen, isBrandMode, isBulkMode]);

  // Source workspace resolution
  const currentWorkspaceId =
    singlePage?.workspaceId ||
    (pages && pages[0]?.workspaceId) ||
    activeWorkspace?.id ||
    null;

  const sourceWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || activeWorkspace;

  // Filter candidate target workspaces (must not be the source workspace)
  const candidateWorkspaces = workspaces.filter(
    (w) => w.id !== currentWorkspaceId && w.id !== sourceWorkspace?.id
  );

  // Pre-select first eligible target workspace
  useEffect(() => {
    if (isOpen) {
      if (candidateWorkspaces.length > 0) {
        setTargetWorkspaceId(candidateWorkspaces[0].id);
      } else {
        setTargetWorkspaceId("");
      }
    }
  }, [isOpen, currentWorkspaceId, workspaces]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const targetWorkspace = workspaces.find((w) => w.id === targetWorkspaceId);

  const displayBrandLabel =
    brandDomainName ||
    singlePage?.canonicalDomain ||
    singlePage?.displayName ||
    "Brand Portfolio";

  const handleConfirmMove = async () => {
    if (!targetWorkspaceId) {
      setErrorMsg("Please select a target workspace.");
      return;
    }

    if (!isBrandMode && effectivePageIds.length === 0) {
      setErrorMsg("No page IDs selected to move.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload: Record<string, any> = {
        targetWorkspaceId,
        moveEntireBrand: isBrandMode ? true : moveEntireBrand,
      };

      if (isBrandMode) {
        payload.brandDomainId = brandDomainId;
      } else {
        payload.pageIds = effectivePageIds;
      }

      const res = await fetch("/api/workspaces/move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.details || "Failed to move resources.");
      }

      showToast({
        type: "success",
        title: "Moved Successfully",
        message: data.message || `Resource moved to ${targetWorkspace?.name || "new workspace"}.`,
      });

      await refreshWorkspaces().catch(() => {});
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("[MoveWorkspaceModal] Error moving resource:", err);
      setErrorMsg(err.message || "An unexpected error occurred while moving.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-workspace-title"
        className="relative w-full max-w-lg glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 animate-in zoom-in-95 duration-150"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close modal"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start space-x-3.5 mb-5">
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h3
              id="move-workspace-title"
              className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              Move to Workspace
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Reassign brand pages, ad observations, and catalog products to another country market.
            </p>
          </div>
        </div>

        {/* Target Entity Summary Card */}
        <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800/80 mb-5 text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-medium">
            <span>Entity to Move</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {isBrandMode
                ? "Brand Portfolio"
                : isBulkMode
                ? `${effectivePageIds.length} Pages (Bulk)`
                : "Single Page"}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-bold text-sm">
            {isBrandMode ? (
              <Globe className="w-4 h-4 text-indigo-500 shrink-0" />
            ) : (
              <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
            )}
            <span className="truncate">
              {isBrandMode
                ? displayBrandLabel
                : isBulkMode
                ? `${effectivePageIds.length} selected pages across tables`
                : singlePage?.displayName || singlePage?.pageId || "Tracked Page"}
            </span>
          </div>

          {/* Transfer Visual Direction */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
              <span className="text-base">{sourceWorkspace?.flag || "🌐"}</span>
              <span>{sourceWorkspace?.name || "Current Workspace"}</span>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mx-2" />

            <div className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400">
              <span className="text-base">{targetWorkspace?.flag || "🌐"}</span>
              <span>{targetWorkspace?.name || "Select Destination"}</span>
            </div>
          </div>
        </div>

        {/* Destination Selector */}
        <div className="space-y-2 mb-5">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Select Destination Market Workspace
          </label>

          {candidateWorkspaces.length === 0 ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                No other workspaces available. Create an additional workspace in the workspace manager first.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {candidateWorkspaces.map((ws) => {
                const isSelected = ws.id === targetWorkspaceId;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => setTargetWorkspaceId(ws.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 text-slate-900 dark:text-white shadow-sm ring-1 ring-indigo-500"
                        : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className="text-2xl">{ws.flag || "🌐"}</span>
                      <div>
                        <div className="font-semibold text-xs text-slate-900 dark:text-white">
                          {ws.name}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {ws.countryCode} · {ws.currency} ({ws.currencySymbol})
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Brand Portfolio Inclusion Option */}
        {isBrandMode ? (
          <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 mb-5 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2.5">
            <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Full Brand Portfolio Move</span>
              <span className="text-[11px] text-indigo-700 dark:text-indigo-300 block mt-0.5">
                Moving this brand portfolio will relocate the domain, all its linked sister pages, and all associated products together.
              </span>
            </div>
          </div>
        ) : hasLinkedBrand && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 mb-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={moveEntireBrand}
                onChange={(e) => setMoveEntireBrand(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <div className="text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                  {isBulkMode
                    ? "Also include all sister pages and brand portfolios"
                    : "Move entire brand portfolio & catalog (Recommended)"}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  {isBulkMode
                    ? "If checked, any sister pages belonging to the selected brands will also be moved. If unchecked, only the selected pages will move and will be detached from their brand portfolios."
                    : "Includes domain portfolio, all linked sister pages, and associated catalog products to maintain synchronized brand intelligence."}
                </span>
              </div>
            </label>
          </div>
        )}

        {/* Error Feedback */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 mb-5 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmMove}
            disabled={
              isSubmitting ||
              !targetWorkspaceId ||
              candidateWorkspaces.length === 0 ||
              (!isBrandMode && effectivePageIds.length === 0)
            }
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Moving to {targetWorkspace?.name || "Workspace"}...</span>
              </>
            ) : (
              <>
                <FolderSync className="w-4 h-4" />
                <span>Move to {targetWorkspace?.name || "Target Workspace"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
