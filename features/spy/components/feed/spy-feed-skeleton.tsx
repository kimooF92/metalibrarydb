"use client";

import { Skeleton } from "@/components/ui/skeleton";

export interface SpyFeedSkeletonProps {
  viewMode: "grid" | "list";
  count?: number;
  className?: string;
}

export function SpyFeedSkeleton({
  viewMode,
  count,
  className = "",
}: SpyFeedSkeletonProps) {
  const defaultCount = viewMode === "grid" ? (count ?? 8) : (count ?? 6);

  if (viewMode === "grid") {
    return (
      <div
        className={`grid grid-cols-[repeat(auto-fill,minmax(min(100%,290px),1fr))] gap-3.5 ${className}`}
      >
        {[...Array(defaultCount)].map((_, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-xl border border-border bg-card/60 p-3.5 shadow-2xs select-none"
          >
            {/* Header: Brand Avatar & Actions */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                  <Skeleton className="h-3.5 w-24 rounded-md" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                  <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                </div>
              </div>

              {/* Media Square Canvas */}
              <Skeleton className="w-full aspect-square rounded-xl mb-2.5" />

              {/* Destination Domain / Store */}
              <Skeleton className="h-3 w-28 rounded-md mb-2" />

              {/* Ad Copy Lines */}
              <div className="space-y-1 mb-3">
                <Skeleton className="h-2.5 w-full rounded" />
                <Skeleton className="h-2.5 w-4/5 rounded" />
              </div>
            </div>

            {/* Footer Velocity & Longevity */}
            <div className="pt-2.5 border-t border-border/60 flex items-center justify-between">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {[...Array(defaultCount)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3.5 p-3 rounded-xl border border-border bg-card/60 select-none"
        >
          {/* Media Thumbnail */}
          <Skeleton className="w-16 h-16 rounded-lg shrink-0" />

          {/* Body Content */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-28 rounded" />
              <Skeleton className="h-3 w-12 rounded-full" />
            </div>
            <Skeleton className="h-2.5 w-3/4 rounded" />
            <Skeleton className="h-2.5 w-1/2 rounded" />
          </div>

          {/* Right Action / Velocity */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="w-7 h-7 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
