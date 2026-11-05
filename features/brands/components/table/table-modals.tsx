"use client";

import React from "react";
import { TrackedPage } from "@/types";
import { HistoryModal } from "@/components/history-modal";
import { DeleteConfirmModal } from "@/components/delete-confirm-modal";
import { ScanRunnerModal } from "@/components/scan-runner-modal";
import { ResolveBrandModal } from "@/components/resolve-brand-modal";
import { ManageDomainModal } from "@/components/manage-domain-modal";
import { MoveWorkspaceModal } from "@/components/move-workspace-modal";
import { Clock, Sparkles, CheckCircle2, AlertTriangle, X } from "lucide-react";

export interface TableModalsProps {
  history: {
    page: TrackedPage | null;
    isOpen: boolean;
    onClose: () => void;
  };
  deleteModal: {
    page: TrackedPage | null;
    loading: boolean;
    onClose: () => void;
    onConfirm: () => void;
  };
  scanRunner: {
    isOpen: boolean;
    pages: TrackedPage[];
    onClose: () => void;
    onConfirm: (runner: "local" | "apify") => Promise<void>;
    onAutoScanChanged?: (pageIds: string[], enabled: boolean) => void;
  };
  brandResolution: {
    pageId: string | null;
    onClose: () => void;
    onSuccess?: () => void;
  };
  manageDomain: {
    domainOrId: string | null;
    onClose: () => void;
    onSuccess?: () => void;
  };
  moveWorkspace: {
    isOpen: boolean;
    page: TrackedPage | null;
    pages: TrackedPage[] | null;
    pageIds: string[] | null;
    onClose: () => void;
    onSuccess?: () => void;
  };
  toast: {
    data: { type: string; title: string; message: string } | null;
    onDismiss: () => void;
  };
}

export function TableModals({
  history,
  deleteModal,
  scanRunner,
  brandResolution,
  manageDomain,
  moveWorkspace,
  toast,
}: TableModalsProps) {
  return (
    <>
      {/* Scan History Modal */}
      <HistoryModal
        page={history.page}
        isOpen={history.isOpen}
        onClose={history.onClose}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        page={deleteModal.page}
        isOpen={!!deleteModal.page}
        onClose={deleteModal.onClose}
        onConfirm={deleteModal.onConfirm}
        loading={deleteModal.loading}
      />

      {/* Animated Toast Notification Popup */}
      {toast.data && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 rounded-xl shadow-2xl border max-w-sm animate-in slide-in-from-bottom-5 duration-200 bg-slate-900 text-slate-100 border-slate-800">
          {toast.data.type === "warning" && <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
          {toast.data.type === "info" && <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />}
          {toast.data.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
          {toast.data.type === "error" && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold text-white">{toast.data.title}</span>
            <span className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{toast.data.message}</span>
          </div>

          <button onClick={toast.onDismiss} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Dismiss toast">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Scan Runner Engine Selection Modal */}
      <ScanRunnerModal
        isOpen={scanRunner.isOpen}
        onClose={scanRunner.onClose}
        trackedPages={scanRunner.pages}
        onConfirm={scanRunner.onConfirm}
        onAutoScanChanged={scanRunner.onAutoScanChanged}
      />

      {/* Multi-Page Brand Resolution Modal */}
      <ResolveBrandModal
        trackedPageId={brandResolution.pageId}
        isOpen={Boolean(brandResolution.pageId)}
        onClose={brandResolution.onClose}
        onSuccess={brandResolution.onSuccess}
      />

      {/* Multi-Page Brand Domain Portfolio Modal */}
      <ManageDomainModal
        domainOrId={manageDomain.domainOrId}
        isOpen={Boolean(manageDomain.domainOrId)}
        onClose={manageDomain.onClose}
        onSuccess={manageDomain.onSuccess}
      />

      {/* Move Page/Brand to Workspace Modal */}
      <MoveWorkspaceModal
        isOpen={moveWorkspace.isOpen}
        onClose={moveWorkspace.onClose}
        page={moveWorkspace.page}
        pages={moveWorkspace.pages || undefined}
        pageIds={moveWorkspace.pageIds || (moveWorkspace.page ? [moveWorkspace.page.id] : undefined)}
        onSuccess={moveWorkspace.onSuccess}
      />
    </>
  );
}
