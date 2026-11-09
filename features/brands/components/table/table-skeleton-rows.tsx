"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export interface TableSkeletonRowsProps {
  count?: number;
}

export function TableSkeletonRows({ count = 8 }: TableSkeletonRowsProps) {
  return (
    <>
      {[...Array(count)].map((_, i) => {
        // Vertical opacity ramp so rows subtly dissolve into transparent toward table bottom
        const rowOpacity =
          count > 2 ? Math.max(0.18, 1 - (i / (count - 1)) * 0.8) : 1;

        return (
          <tr
            key={i}
            style={{ opacity: rowOpacity }}
            className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-opacity"
          >
            {/* 1. Checkbox */}
            <td className="px-2 md:px-2.5 py-2.5 text-center w-10">
              <Skeleton fade="none" className="w-4 h-4 rounded border border-slate-200/60 dark:border-slate-800/60 mx-auto" />
            </td>

            {/* 2. Star */}
            <td className="px-1 md:px-1.5 py-2.5 text-center w-8">
              <Skeleton fade="none" className="w-3.5 h-3.5 rounded mx-auto" />
            </td>

            {/* 3. Brand Name & Info */}
            <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Skeleton fade="none" className="w-7 h-7 rounded-lg shrink-0" />
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <Skeleton
                    className="h-3.5 rounded"
                    style={{ width: `${55 + ((i * 17) % 35)}%`, maxWidth: "180px" }}
                  />
                  <Skeleton className="h-2.5 w-20 rounded" />
                </div>
              </div>
            </td>

            {/* 4. Active Ads, Delta & Sparkline */}
            <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex items-baseline gap-1.5 shrink-0 min-w-[60px]">
                  <Skeleton className="h-4 w-9 rounded-md" />
                  <Skeleton className="h-3 w-6 rounded" />
                </div>
                <Skeleton className="w-14 h-4 rounded shrink-0" />
              </div>
            </td>

            {/* 5. Products */}
            <td className="px-2 md:px-2.5 xl:px-3 py-2.5 text-center">
              <Skeleton fade="none" className="h-4 w-8 rounded mx-auto" />
            </td>

            {/* 6. Pattern & Status (hidden on mobile) */}
            <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 hidden md:table-cell whitespace-nowrap">
              <div className="flex items-center gap-2 flex-nowrap">
                <Skeleton fade="none" className="w-5 h-5 rounded-md shrink-0" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            </td>

            {/* 7. Last Checked */}
            <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 whitespace-nowrap">
              <Skeleton className="h-3.5 w-16 rounded" />
            </td>

            {/* 8. Actions */}
            <td className="px-2.5 md:px-3.5 xl:px-4 py-2.5 text-right whitespace-nowrap">
              <div className="flex items-center justify-end gap-1">
                <Skeleton fade="none" className="w-5 h-5 rounded" />
                <Skeleton fade="none" className="w-5 h-5 rounded opacity-60" />
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
