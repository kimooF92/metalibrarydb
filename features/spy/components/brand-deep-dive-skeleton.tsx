"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export interface BrandDeepDiveSkeletonProps {
  isModal?: boolean;
  className?: string;
}

export function BrandDeepDiveSkeleton({
  isModal = false,
  className = "",
}: BrandDeepDiveSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading Brand Intelligence & Analytics"
      className={`space-y-5 pb-16 animate-in fade-in duration-200 ${className}`}
    >
      {/* 1. Header Banner Skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-950/50 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          {/* Back button placeholder (if not modal) */}
          {!isModal && (
            <Skeleton fade="none" className="w-8 h-8 rounded-xl shrink-0 mt-0.5" />
          )}

          {/* Brand Logo Avatar */}
          <Skeleton fade="none" className="w-12 h-12 rounded-xl shrink-0 mt-0.5" />

          {/* Brand Titles & Badges */}
          <div className="min-w-0 space-y-2 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Skeleton className="h-7 w-44 sm:w-56 rounded-lg" />
              <Skeleton className="h-5 w-24 rounded-md" />
            </div>

            {/* Sub-meta details row */}
            <div className="flex items-center gap-2 flex-wrap">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="h-4 w-20 rounded-md" />
            </div>
          </div>
        </div>

        {/* Action Buttons Toolbar Skeleton */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Skeleton fade="none" className="h-9 w-28 rounded-xl" />
          <Skeleton fade="none" className="h-9 w-24 rounded-xl" />
          <Skeleton fade="none" className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* 2. Navigation Tabs Bar Skeleton */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 gap-1">
          <Skeleton fade="none" className="h-8 w-24 sm:w-28 rounded-lg" />
          <Skeleton fade="none" className="h-8 w-24 sm:w-28 rounded-lg opacity-60" />
          <Skeleton fade="none" className="h-8 w-24 sm:w-28 rounded-lg opacity-60" />
          <Skeleton fade="none" className="h-8 w-24 sm:w-28 rounded-lg opacity-60" />
        </div>
      </div>

      {/* 3. Executive Metrics Grid (4 KPI Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-3.5 shadow-sm space-y-2"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton fade="none" className="w-4 h-4 rounded-full" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        ))}
      </div>

      {/* 4. Intelligence Teaser Card Skeleton */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Skeleton fade="none" className="w-4 h-4 rounded-full" />
            <Skeleton className="h-4 w-48 rounded" />
          </div>
          <Skeleton className="h-4 w-20 rounded" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-6 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* 5. Analytics Charts Grid Skeleton (2 Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-4 w-36 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
              <Skeleton fade="none" className="h-6 w-16 rounded-md" />
            </div>
            {/* Chart mock bars with vertical fade to transparent */}
            <div className="h-44 rounded-lg bg-slate-50/50 dark:bg-slate-900/30 p-4 flex items-end justify-between gap-3">
              {[40, 75, 30, 90, 60, 45, 80].map((heightPercent, idx) => (
                <Skeleton
                  key={idx}
                  fade="bottom"
                  className="w-full rounded-t"
                  style={{ height: `${heightPercent}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
