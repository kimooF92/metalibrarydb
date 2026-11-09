"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export interface TableSkeletonRowsProps {
  count?: number;
}

export function TableSkeletonRows({ count = 8 }: TableSkeletonRowsProps) {
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <tr
          key={i}
          className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors animate-pulse"
        >
          {/* 1. Checkbox */}
          <td className="px-2 md:px-2.5 py-2.5 text-center w-10">
            <Skeleton className="w-4 h-4 rounded border border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-800 mx-auto" />
          </td>

          {/* 2. Star */}
          <td className="px-1 md:px-1.5 py-2.5 text-center w-8">
            <Skeleton className="w-3.5 h-3.5 rounded bg-slate-200/70 dark:bg-slate-800/70 mx-auto" />
          </td>

          {/* 3. Brand Name & Info */}
          <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <Skeleton className="w-7 h-7 rounded-lg shrink-0 bg-slate-200 dark:bg-slate-800" />
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <Skeleton
                  className="h-3.5 rounded bg-slate-200 dark:bg-slate-800"
                  style={{ width: `${55 + ((i * 17) % 35)}%`, maxWidth: "180px" }}
                />
                <Skeleton className="h-2.5 w-20 rounded bg-slate-200/60 dark:bg-slate-800/60" />
              </div>
            </div>
          </td>

          {/* 4. Active Ads, Delta & Sparkline */}
          <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-1.5 shrink-0 min-w-[60px]">
                <Skeleton className="h-4 w-9 rounded-md bg-slate-200 dark:bg-slate-800" />
                <Skeleton className="h-3 w-6 rounded bg-slate-200/60 dark:bg-slate-800/60" />
              </div>
              <Skeleton className="w-14 h-4 rounded bg-slate-200/60 dark:bg-slate-800/60 shrink-0" />
            </div>
          </td>

          {/* 5. Products */}
          <td className="px-2 md:px-2.5 xl:px-3 py-2.5 text-center">
            <Skeleton className="h-4 w-8 rounded bg-slate-200 dark:bg-slate-800 mx-auto" />
          </td>

          {/* 6. Pattern & Status (hidden on mobile) */}
          <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 hidden md:table-cell whitespace-nowrap">
            <div className="flex items-center gap-2 flex-nowrap">
              <Skeleton className="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-800 shrink-0" />
              <Skeleton className="h-4 w-20 rounded bg-slate-200/80 dark:bg-slate-800/80" />
            </div>
          </td>

          {/* 7. Last Checked */}
          <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 whitespace-nowrap">
            <Skeleton className="h-3.5 w-16 rounded bg-slate-200 dark:bg-slate-800" />
          </td>

          {/* 8. Actions */}
          <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 text-right whitespace-nowrap">
            <div className="flex items-center justify-end gap-1">
              <Skeleton className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-800" />
              <Skeleton className="w-5 h-5 rounded bg-slate-200/60 dark:bg-slate-800/60" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

