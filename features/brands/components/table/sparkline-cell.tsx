"use client";

import { calculateSparklineGeometry, getSparklineTrend } from "@/lib/sparkline-utils";

interface SparklineCellProps {
  points?: number[] | null;
  difference?: number | null;
}

export function SparklineCell({
  points,
  difference,
}: SparklineCellProps) {
  const geo = calculateSparklineGeometry(points);
  if (!geo) {
    return (
      <div className="w-12 h-3.5 flex items-center justify-center opacity-25">
        <div className="w-5 h-[1px] bg-slate-400 dark:bg-slate-600 rounded-full" />
      </div>
    );
  }

  const { strokeColor } = getSparklineTrend(difference);

  return (
    <div
      className="flex items-center shrink-0"
      title={`Trend (last ${points?.length ?? 0} scans): ${(points ?? []).join(" → ")} ads`}
    >
      <svg
        viewBox={`0 0 ${geo.width} ${geo.height}`}
        className="w-13 h-4.5 overflow-visible select-none shrink-0"
      >
        <polyline
          points={geo.polylineStr}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={geo.lastPoint.x} cy={geo.lastPoint.y} r="2" fill={strokeColor} />
      </svg>
    </div>
  );
}

// Backward-compatible alias for existing consumers
export const InlineSparkline = SparklineCell;

