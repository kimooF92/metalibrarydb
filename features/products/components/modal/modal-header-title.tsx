"use client";

import { ScrapedProduct } from "@/types";
import {
  ShoppingBag,
  Edit3,
  Layers,
  Tag,
  Undo2,
  Save,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { getNicheDisplayLabel, getSubNicheDisplayLabel } from "@/lib/niches-taxonomy";

export interface ModalHeaderNavProps {
  currentIndex: number;
  totalCount: number;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
}

export interface ModalHeaderEditControls {
  isEditMode: boolean;
  isSavingEdit?: boolean;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
}

export interface ModalHeaderTitleProps {
  product: ScrapedProduct;
  hasCarouselAd: boolean;
  onClose: () => void;
  editControls: ModalHeaderEditControls;
  nav?: ModalHeaderNavProps;
}

export function ModalHeaderTitle({
  product,
  hasCarouselAd,
  onClose,
  editControls,
  nav,
}: ModalHeaderTitleProps) {
  const { isEditMode, isSavingEdit, onCancelEdit, onSaveEdit } = editControls;

  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
          <ShoppingBag className="w-4 h-4" />
        </div>

        {isEditMode ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
              <Edit3 className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>Editing Product Details</span>
            </span>
            <span className="text-xs text-slate-500 truncate">{product.title}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            <h2
              className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
              title={product.title || "Product Landing Page"}
            >
              {product.title || "Product Landing Page"}
            </h2>
          </div>
        )}
      </div>

      {/* Top Right: Modal Controls (Nav Pager & Close or Edit Save/Cancel) */}
      <div className="flex items-center gap-2 shrink-0">
        {isEditMode ? (
          <div className="flex items-center gap-2">
            <button
              key="modal-header-cancel-btn"
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCancelEdit?.();
              }}
              disabled={isSavingEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
            <button
              key="modal-header-save-btn"
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSaveEdit?.();
              }}
              disabled={isSavingEdit}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isSavingEdit ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSavingEdit ? "Saving..." : "Save Changes"}</span>
            </button>
          </div>
        ) : (
          nav &&
          nav.totalCount > 1 &&
          nav.currentIndex >= 0 && (
            <div
              key="modal-header-nav-group"
              className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/90 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700/80 shrink-0"
            >
              <button
                type="button"
                onClick={nav.onNavigatePrev}
                disabled={!nav.hasPrev}
                className="p-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                title="Previous Product (Arrow Left ←)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span
                className="text-[11px] font-bold text-slate-600 dark:text-slate-300 px-1.5 select-none whitespace-nowrap"
                title="Use ← and → arrow keys to browse products"
              >
                {nav.currentIndex + 1} / {nav.totalCount}
              </span>
              <button
                type="button"
                onClick={nav.onNavigateNext}
                disabled={!nav.hasNext}
                className="p-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                title="Next Product (Arrow Right →)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        )}

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Close modal (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

