"use client";

import React, { RefObject } from "react";
import { createPortal } from "react-dom";
import { TrackedPage } from "@/types";
import { StickyNote, X, Trash2, Check, Loader2 } from "lucide-react";

export interface NotePopoverProps {
  mounted: boolean;
  isOpen: boolean;
  notePopoverPos: { top?: number; bottom?: number; left?: number; right?: number } | null;
  notePopoverPage: TrackedPage | null;
  notePopoverRef: RefObject<HTMLDivElement | null>;
  notePopoverValue: string;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSave: (pageId: string, customVal?: string) => void;
  savingNotes: boolean;
}

export function NotePopover({
  mounted,
  isOpen,
  notePopoverPos,
  notePopoverPage,
  notePopoverRef,
  notePopoverValue,
  onChangeValue,
  onClose,
  onSave,
  savingNotes,
}: NotePopoverProps) {
  if (!mounted || !isOpen || !notePopoverPos || !notePopoverPage) {
    return null;
  }

  return createPortal(
    <div
      ref={notePopoverRef}
      style={{
        position: "fixed",
        top: notePopoverPos.top !== undefined ? `${notePopoverPos.top}px` : undefined,
        bottom: notePopoverPos.bottom !== undefined ? `${notePopoverPos.bottom}px` : undefined,
        left: notePopoverPos.left !== undefined ? `${notePopoverPos.left}px` : undefined,
        right: notePopoverPos.right !== undefined ? `${notePopoverPos.right}px` : undefined,
      }}
      className="w-80 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl p-3 z-[110] animate-in fade-in zoom-in-95 text-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-1.5 min-w-0">
          <StickyNote className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            Notes
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-mono">
            • {notePopoverPage.displayName || notePopoverPage.pageId || "Brand"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close notes popover"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Textarea */}
      <textarea
        value={notePopoverValue}
        onChange={(e) => onChangeValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSave(notePopoverPage.id);
          }
        }}
        rows={3}
        placeholder="Write a note about this brand..."
        className="w-full bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700/80 focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none resize-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
        autoFocus
        disabled={savingNotes}
      />

      {/* Footer */}
      <div className="mt-2.5 flex items-center justify-between pt-1">
        <div>
          {Boolean((notePopoverPage as any).notes) && (
            <button
              type="button"
              onClick={() => onSave(notePopoverPage.id, "")}
              disabled={savingNotes}
              className="text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 font-medium hover:underline flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 hidden sm:inline mr-1">
            ⌘+Enter
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={savingNotes}
            className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(notePopoverPage.id)}
            disabled={savingNotes}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-semibold rounded-md shadow-xs shadow-amber-500/20 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
          >
            {savingNotes ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
