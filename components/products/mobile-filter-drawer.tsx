"use client";

import React, { useEffect } from "react";
import { X, SlidersHorizontal, RotateCcw } from "lucide-react";
import { ProductsSidebarFilters, ProductsSidebarFiltersProps } from "./products-sidebar-filters";

export interface MobileFilterDrawerProps extends ProductsSidebarFiltersProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileFilterDrawer({
  isOpen,
  onClose,
  activeFilterCount,
  onResetFilters,
  ...sidebarProps
}: MobileFilterDrawerProps) {
  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative z-10 w-[85vw] max-w-sm h-full bg-card border-r border-border flex flex-col shadow-2xl animate-in slide-in-from-left duration-250">
        {/* Drawer Header */}
        <div className="p-3.5 border-b border-border flex items-center justify-between shrink-0 bg-card">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Filter Catalog
              </h2>
              <span className="text-[10px] text-muted-foreground">
                {activeFilterCount > 0 ? `${activeFilterCount} active filters` : "Refine products"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-md hover:bg-accent cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Close filters"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto">
          <ProductsSidebarFilters
            {...sidebarProps}
            activeFilterCount={activeFilterCount}
            onResetFilters={onResetFilters}
            className="w-full border-none rounded-none shadow-none max-h-none sticky-none top-0"
          />
        </div>

        {/* Drawer Footer CTA */}
        <div className="p-3 border-t border-border bg-card shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold text-center cursor-pointer shadow-xs transition-colors"
          >
            Show Results {activeFilterCount > 0 ? `(${activeFilterCount} Active)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
