"use client";

import { Loader2, CheckCircle2 } from "lucide-react";

export interface ProductsLoadMoreProps {
  productsCount: number;
  totalCount: number;
  hasMore: boolean;
  isFetchingMore: boolean;
  onManualLoadMore: () => void;
}

export function ProductsLoadMore({
  productsCount,
  totalCount,
  hasMore,
  isFetchingMore,
  onManualLoadMore,
}: ProductsLoadMoreProps) {
  const progressPercent =
    totalCount > 0 ? Math.min(100, Math.round((productsCount / totalCount) * 100)) : 0;
  const remainingCount = Math.max(0, totalCount - productsCount);

  return (
    <div className="flex flex-col items-center justify-center pt-8 pb-8 space-y-3">
      {/* Visual Progress Bar */}
      <div className="w-full max-w-xs flex flex-col items-center space-y-1.5">
        <div className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>
            Showing{" "}
            <strong className="text-slate-900 dark:text-white font-bold">{productsCount}</strong> of{" "}
            <strong className="text-slate-900 dark:text-white font-bold">{totalCount}</strong> products
          </span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{progressPercent}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Action Button or Completion Indicator */}
      {hasMore ? (
        <button
          onClick={onManualLoadMore}
          disabled={isFetchingMore}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 font-bold text-xs shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
        >
          {isFetchingMore ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              <span>Loading next products...</span>
            </>
          ) : (
            <>
              <span>Load More Products ({Math.min(24, remainingCount)} more)</span>
              <span className="text-[10px] text-slate-400 font-normal">
                ({remainingCount} remaining)
              </span>
            </>
          )}
        </button>
      ) : productsCount > 0 ? (
        <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>You&apos;ve viewed all {totalCount} products</span>
        </div>
      ) : null}
    </div>
  );
}

