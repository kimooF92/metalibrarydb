"use client";

import React, { RefObject } from "react";
import { TrackedPage } from "@/types";
import {
  Pencil,
  History,
  StickyNote,
  RotateCcw,
  FolderInput,
  Trash2,
} from "lucide-react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export interface RowActionMenuProps {
  page?: TrackedPage | null;
  isRetrying?: boolean;
  onRename: (page: TrackedPage) => void;
  onHistory: (page: TrackedPage) => void;
  onNote: (page: TrackedPage) => void;
  onRetry: (pageId: string) => void;
  onMove: (page: TrackedPage) => void;
  onDelete: (page: TrackedPage) => void;
  // Optional backward compatibility props
  mounted?: boolean;
  isOpen?: boolean;
  menuPos?: { top?: number; bottom?: number; right: number } | null;
  activeMenuPage?: TrackedPage | null;
  rowMenuRef?: RefObject<HTMLDivElement | null>;
  retryingPageIds?: Set<string>;
  onClose?: () => void;
}

export function RowActionMenu({
  page,
  isRetrying,
  onRename,
  onHistory,
  onNote,
  onRetry,
  onMove,
  onDelete,
  activeMenuPage,
  retryingPageIds,
  onClose,
}: RowActionMenuProps) {
  const targetPage = page || activeMenuPage;
  if (!targetPage) return null;

  const retrying = isRetrying ?? (retryingPageIds?.has(targetPage.id) ?? false);

  return (
    <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-36 text-left">
      <div className="py-0.5">
        {/* Rename Brand */}
        <DropdownMenuItem
          onClick={() => {
            onClose?.();
            onRename(targetPage);
          }}
        >
          <Pencil className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
          <span>Rename</span>
        </DropdownMenuItem>

        {/* View History */}
        <DropdownMenuItem
          onClick={() => {
            onClose?.();
            onHistory(targetPage);
          }}
        >
          <History className="w-3.5 h-3.5 shrink-0 text-blue-500" />
          <span>History</span>
        </DropdownMenuItem>

        {/* Notes */}
        <DropdownMenuItem
          onClick={() => {
            onClose?.();
            onNote(targetPage);
          }}
        >
          <StickyNote className={`w-3.5 h-3.5 shrink-0 ${(targetPage as any).notes ? "text-amber-500" : "text-slate-400"}`} />
          <span>{(targetPage as any).notes ? "Edit Note" : "Add Note"}</span>
        </DropdownMenuItem>

        {/* Retry if failed */}
        {targetPage.status === "failed" && (
          <DropdownMenuItem
            onClick={() => {
              onClose?.();
              onRetry(targetPage.id);
            }}
            disabled={retrying}
            className="text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 data-highlighted:bg-amber-500/10 data-highlighted:text-amber-600 dark:data-highlighted:text-amber-400"
          >
            <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${retrying ? "animate-spin" : ""}`} />
            <span>Retry Scan</span>
          </DropdownMenuItem>
        )}

        {/* Move to Workspace */}
        <DropdownMenuItem
          onClick={() => {
            onClose?.();
            onMove(targetPage);
          }}
        >
          <FolderInput className="w-3.5 h-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
          <span>Move to</span>
        </DropdownMenuItem>
      </div>

      <div className="py-0.5">
        {/* Delete */}
        <DropdownMenuItem
          onClick={() => {
            onClose?.();
            onDelete(targetPage);
          }}
          className="text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 data-highlighted:bg-rose-500/10 data-highlighted:text-rose-600 dark:data-highlighted:text-rose-400"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>Delete</span>
        </DropdownMenuItem>
      </div>
    </DropdownMenuContent>
  );
}
