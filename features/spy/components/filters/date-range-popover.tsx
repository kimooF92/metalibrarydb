"use client";

import { useEffect, useRef } from "react";
import { Calendar, X } from "lucide-react";

interface DateRangePopoverProps {
  isOpen: boolean;
  dateFrom?: string;
  dateTo?: string;
  onClose: () => void;
  onFilterChange: (dates: { dateFrom?: string; dateTo?: string; smartPreset?: undefined }) => void;
  onClear: () => void;
}

export function DateRangePopover({
  isOpen,
  dateFrom,
  dateTo,
  onClose,
  onFilterChange,
  onClear,
}: DateRangePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Self-contained click-outside handler tied directly to popover DOM node
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs sm:bg-transparent sm:backdrop-blur-none sm:p-0">
      <div
        ref={popoverRef}
        className="w-full max-w-sm sm:max-w-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-emerald-500">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Custom Date Range
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Filter by ad launch date
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 my-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              From Date:
            </label>
            <input
              type="date"
              value={dateFrom ? dateFrom.substring(0, 10) : ""}
              onChange={(e) =>
                onFilterChange({
                  dateFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  smartPreset: undefined,
                })
              }
              className="w-full bg-slate-50 dark:bg-slate-950 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              To Date:
            </label>
            <input
              type="date"
              value={dateTo ? dateTo.substring(0, 10) : ""}
              onChange={(e) =>
                onFilterChange({
                  dateTo: e.target.value
                    ? new Date(e.target.value + "T23:59:59").toISOString()
                    : undefined,
                  smartPreset: undefined,
                })
              }
              className="w-full bg-slate-50 dark:bg-slate-950 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          {dateFrom || dateTo ? (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              Clear Range
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer hover:opacity-90 transition shadow-sm"
          >
            Apply Range
          </button>
        </div>
      </div>
    </div>
  );
}

