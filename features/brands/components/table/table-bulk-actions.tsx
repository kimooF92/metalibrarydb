"use client";

import { RefreshCw, Sparkles, FolderSync, Trash2 } from "lucide-react";

interface TableBulkActionsProps {
  selectedCount: number;
  isBulkRefreshing: boolean;
  onBulkRefresh: () => void;
  onExtractAdSpy: () => void;
  onMoveToWorkspace: () => void;
  onBulkDelete?: () => void;
  onClearSelection: () => void;
}

export function TableBulkActions({
  selectedCount,
  isBulkRefreshing,
  onBulkRefresh,
  onExtractAdSpy,
  onMoveToWorkspace,
  onBulkDelete,
  onClearSelection,
}: TableBulkActionsProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/90 border border-indigo-200 dark:border-indigo-500/40 px-4 py-2.5 rounded-xl text-xs text-indigo-800 dark:text-indigo-200 mb-4 animate-in fade-in duration-150">
      <div className="flex items-center space-x-2 font-medium">
        <span className="font-bold text-indigo-700 dark:text-white px-2 py-0.5 rounded bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30">
          {selectedCount}
        </span>
        <span>
          {selectedCount === 1 ? "page selected" : "pages selected"}
        </span>
      </div>

      <div className="flex items-center space-x-3">
        <button
          onClick={onBulkRefresh}
          disabled={isBulkRefreshing}
          className="group flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-75 text-white font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 transition-transform duration-300 ${
              isBulkRefreshing ? "animate-spin" : "group-hover:rotate-90"
            }`}
          />
          <span>{isBulkRefreshing ? "Refreshing..." : `Refresh (${selectedCount})`}</span>
        </button>

        <button
          onClick={onExtractAdSpy}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-md shadow-purple-600/30 transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Extract Ad Spy ({selectedCount})</span>
        </button>

        <button
          onClick={onMoveToWorkspace}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <FolderSync className="w-3.5 h-3.5" />
          <span>Move to Workspace ({selectedCount})</span>
        </button>

        {onBulkDelete && (
          <button
            onClick={onBulkDelete}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-md shadow-rose-600/30 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete ({selectedCount})</span>
          </button>
        )}

        <button
          onClick={onClearSelection}
          className="px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
