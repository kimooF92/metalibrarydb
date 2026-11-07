"use client";

import React from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { TrackedPage } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface DeleteConfirmModalProps {
  page: TrackedPage | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void> | void;
  loading?: boolean;
}

export function DeleteConfirmModal({
  page,
  isOpen,
  onClose,
  onConfirm,
  loading = false,
}: DeleteConfirmModalProps) {
  if (!page) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) {
          onClose();
        }
      }}
    >
      <DialogContent showClose={!loading} className="max-w-md p-6">
        {/* Modal Icon & Header */}
        <div className="flex items-start space-x-4">
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="flex-1">
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Delete Brand
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Are you sure you want to delete{" "}
              <strong className="text-slate-800 dark:text-slate-200">
                {page.displayName || page.url}
              </strong>
              ? This will remove the brand and its saved ad history from your workspace.
            </DialogDescription>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => onConfirm(page.id)}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold text-xs shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            <span>Delete Brand</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
