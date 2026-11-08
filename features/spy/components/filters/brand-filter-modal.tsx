"use client";

import { useState, useEffect, useRef } from "react";
import type { BrandOption } from "@/types";
import { Ban, X, Search, Check } from "lucide-react";

interface BrandFilterModalProps {
  isOpen: boolean;
  brands: BrandOption[];
  excludedIds: string[];
  onToggleExclude: (pageId: string) => void;
  onClearAllExcluded: () => void;
  onClose: () => void;
}

export function BrandFilterModal({
  isOpen,
  brands,
  excludedIds,
  onToggleExclude,
  onClearAllExcluded,
  onClose,
}: BrandFilterModalProps) {
  const [brandSearch, setBrandSearch] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredBrands = brands.filter(
    (b) =>
      b.displayName.toLowerCase().includes(brandSearch.toLowerCase()) ||
      b.pageId.toLowerCase().includes(brandSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div
        ref={modalRef}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-500">
              <Ban className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Exclude Specific Brands
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Hide creatives from specific competitor pages
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

        {/* Search input in modal */}
        <div className="relative my-3">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search brands to exclude..."
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 text-xs rounded-xl pl-9 pr-8 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-rose-500 text-slate-900 dark:text-slate-100 font-medium"
          />
          {brandSearch && (
            <button
              type="button"
              onClick={() => setBrandSearch("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable brand list */}
        <div className="max-h-64 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
          {filteredBrands.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No matching brands found
            </div>
          ) : (
            filteredBrands.map((brand) => {
              const isExcluded = excludedIds.includes(brand.pageId);
              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => onToggleExclude(brand.pageId)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                    isExcluded
                      ? "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate pr-2">
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border ${
                        isExcluded
                          ? "bg-rose-600 border-rose-600 text-white"
                          : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      }`}
                    >
                      {isExcluded && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="truncate">{brand.displayName}</span>
                  </div>
                  {brand.adCount !== undefined && (
                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                      {brand.adCount} ads
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          {excludedIds.length > 0 ? (
            <button
              type="button"
              onClick={onClearAllExcluded}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              Clear All ({excludedIds.length})
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer hover:opacity-90 transition shadow-sm"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

