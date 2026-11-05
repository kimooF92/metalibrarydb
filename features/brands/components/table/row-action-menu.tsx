"use client";

import React, { RefObject } from "react";
import { createPortal } from "react-dom";
import { TrackedPage } from "@/types";
import {
  Pencil,
  History,
  StickyNote,
  RotateCcw,
  FolderInput,
  Trash2,
} from "lucide-react";

export interface RowActionMenuProps {
  mounted: boolean;
  isOpen: boolean;
  menuPos: { top?: number; bottom?: number; right: number } | null;
  activeMenuPage: TrackedPage | null;
  rowMenuRef: RefObject<HTMLDivElement | null>;
  retryingPageIds: Set<string>;
  onClose: () => void;
  onRename: (page: TrackedPage) => void;
  onHistory: (page: TrackedPage) => void;
  onNote: (page: TrackedPage) => void;
  onRetry: (pageId: string) => void;
  onMove: (page: TrackedPage) => void;
  onDelete: (page: TrackedPage) => void;
}

export function RowActionMenu({
  mounted,
  isOpen,
  menuPos,
  activeMenuPage,
  rowMenuRef,
  retryingPageIds,
  onClose,
  onRename,
  onHistory,
  onNote,
  onRetry,
  onMove,
  onDelete,
}: RowActionMenuProps) {
  if (!mounted || !isOpen || !menuPos || !activeMenuPage) {
    return null;
  }

  return createPortal(
    <div
      ref={rowMenuRef}
      style={{
        position: "fixed",
        top: menuPos.top !== undefined ? `${menuPos.top}px` : undefined,
        bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined,
        right: `${menuPos.right}px`,
      }}
      className="w-36 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-1 z-[100] animate-in fade-in zoom-in-95 text-left divide-y divide-slate-100 dark:divide-slate-800"
    >
      <div className="py-0.5">
        {/* Rename Brand */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onRename(activeMenuPage);
          }}
          className="w-full px-2.5 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <Pencil className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
          <span>Rename</span>
        </button>

        {/* View History */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onHistory(activeMenuPage);
          }}
          className="w-full px-2.5 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <History className="w-3.5 h-3.5 shrink-0 text-blue-500" />
          <span>History</span>
        </button>

        {/* Notes */}
        <button
          type="button"
          data-note-trigger={activeMenuPage.id}
          onClick={(e) => {
            e.stopPropagation();
            onNote(activeMenuPage);
          }}
          className="w-full px-2.5 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <StickyNote className={`w-3.5 h-3.5 shrink-0 ${(activeMenuPage as any).notes ? "text-amber-500" : "text-slate-400"}`} />
          <span>{(activeMenuPage as any).notes ? "Edit Note" : "Add Note"}</span>
        </button>

        {/* Retry if failed */}
        {activeMenuPage.status === "failed" && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onRetry(activeMenuPage.id);
            }}
            disabled={retryingPageIds.has(activeMenuPage.id)}
            className="w-full px-2.5 py-1.5 text-left text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${retryingPageIds.has(activeMenuPage.id) ? "animate-spin" : ""}`} />
            <span>Retry Scan</span>
          </button>
        )}

        {/* Move to Workspace */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onMove(activeMenuPage);
          }}
          className="w-full px-2.5 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <FolderInput className="w-3.5 h-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
          <span>Move to</span>
        </button>
      </div>

      <div className="py-0.5">
        {/* Delete */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onDelete(activeMenuPage);
          }}
          className="w-full px-2.5 py-1.5 text-left text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>Delete</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
