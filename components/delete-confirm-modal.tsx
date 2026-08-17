"use client";

import { useEffect } from "react";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";
import { TrackedPage } from "@/types";

interface DeleteConfirmModalProps {
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !page) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-slate-950/70 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        className="relative w-full max-w-md glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 animate-in zoom-in-95 duration-150"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          aria-label="Close modal"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-805 transition-all cursor-pointer disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Icon & Header */}
        <div className="flex items-start space-x-4">
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="flex-1">
            <h3 id="delete-modal-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Delete Tracked Page
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Are you sure you want to delete{" "}
              <strong className="text-slate-800 dark:text-slate-200">{page.displayName || page.url}</strong>?
              This action cannot be undone and will permanently remove all scan history.
            </p>
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
            <span>Delete Page</span>
          </button>
        </div>
      </div>
    </div>
  );
}
