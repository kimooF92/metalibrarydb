"use client";

import React, { useEffect } from "react";
import { X, SlidersHorizontal, RotateCcw } from "lucide-react";
import { SpySidebarFilters, SpySidebarFiltersProps } from "./spy-sidebar-filters";

export interface MobileSpyFilterDrawerProps extends SpySidebarFiltersProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileSpyFilterDrawer({
  isOpen,
  onClose,
  activeFilterCount,
  onReset,
  ...sidebarProps
}: MobileSpyFilterDrawerProps) {
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
                Filter Ad Feed
              </h2>
              <span className="text-[10px] text-muted-foreground">
                {activeFilterCount > 0 ? `${activeFilterCount} active filters` : "Refine creatives"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 px-2 py-1 rounded hover:bg-rose-500/10 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition cursor-pointer"
              title="Close Filter Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Body (SpySidebarFilters content full width) */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <SpySidebarFilters
            {...sidebarProps}
            activeFilterCount={activeFilterCount}
            onReset={onReset}
            isCollapsed={false}
            className="w-full border-r-0"
          />
        </div>

        {/* Apply Button Footer */}
        <div className="p-3 border-t border-border bg-card shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition cursor-pointer"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

