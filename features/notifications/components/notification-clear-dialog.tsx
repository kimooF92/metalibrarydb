"use client";

import { Trash2 } from "lucide-react";

interface NotificationClearDialogProps {
  confirmClearAll: boolean;
  onConfirmClick: () => void;
  onClearConfirm: () => void;
  onClearCancel: () => void;
}

export function NotificationClearDialog({
  confirmClearAll,
  onConfirmClick,
  onClearConfirm,
  onClearCancel,
}: NotificationClearDialogProps) {
  if (confirmClearAll) {
    return (
      <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-lg border border-rose-200 dark:border-rose-800 animate-in fade-in">
        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Clear all?</span>
        <button
          onClick={onClearConfirm}
          className="px-1.5 py-0.5 text-[10px] font-black bg-rose-600 text-white rounded hover:bg-rose-700 transition-colors cursor-pointer"
        >
          Yes
        </button>
        <button
          onClick={onClearCancel}
          className="px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onConfirmClick}
      title="Clear all notifications"
      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

