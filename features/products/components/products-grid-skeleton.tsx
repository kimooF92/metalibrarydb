"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export interface ProductsGridSkeletonProps {
  viewMode: "grid" | "list";
  count?: number;
  className?: string;
}

export function ProductsGridSkeleton({
  viewMode,
  count,
  className = "",
}: ProductsGridSkeletonProps) {
  const defaultCount = viewMode === "grid" ? (count ?? 8) : (count ?? 6);

  if (viewMode === "grid") {
    return (
      <div className={`products-cards-grid ${className}`}>
        {[...Array(defaultCount)].map((_, i) => {
          let itemOpacity = 1;
          if (i >= 4) {
            const remaining = Math.max(1, defaultCount - 4);
            const progress = remaining > 1 ? (i - 4) / (remaining - 1) : 1;
            itemOpacity = Math.max(0.04, 0.75 - progress * 0.70);
          }

          return (
            <div
              key={i}
              style={{ opacity: itemOpacity }}
              className="aspect-[3/4] bg-card rounded-xl border border-border p-4 flex flex-col justify-between transition-opacity"
            >
              <Skeleton fade="bottom" className="aspect-square rounded-lg w-full" />
              <div className="space-y-2 mt-4">
                <Skeleton className="h-4 rounded w-3/4" />
                <Skeleton className="h-3 rounded w-1/2" />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {[...Array(defaultCount)].map((_, i) => {
        let itemOpacity = 1;
        if (i >= 3) {
          const remaining = Math.max(1, defaultCount - 3);
          const progress = remaining > 1 ? (i - 3) / (remaining - 1) : 1;
          itemOpacity = Math.max(0.04, 0.75 - progress * 0.70);
        }

        return (
          <div
            key={i}
            style={{ opacity: itemOpacity }}
            className="flex items-center gap-4 p-3.5 bg-card rounded-xl border border-border transition-opacity"
          >
            <Skeleton fade="none" className="w-16 h-16 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <Skeleton className="h-4 rounded w-2/3" />
              <Skeleton className="h-3 rounded w-1/3" />
            </div>
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton fade="none" className="h-8 w-24 rounded-lg" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
