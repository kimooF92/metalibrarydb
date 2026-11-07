"use client";

import React, { useId } from "react";
import { calculateSparklineGeometry, getSparklineTrend } from "@/lib/sparkline-utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface SparklineCellProps {
  points?: number[] | null;
  difference?: number | null;
}

export function SparklineCell({
  points,
  difference,
}: SparklineCellProps) {
  const rawId = useId();
  const gradientId = `spk-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const geo = calculateSparklineGeometry(points);

  if (!geo) {
    return (
      <div className="w-13 h-4.5 flex items-center justify-center opacity-20">
        <div className="w-6 h-[1.5px] bg-slate-400 dark:bg-slate-600 rounded-full" />
      </div>
    );
  }

  const { strokeColor, isUp, isDown } = getSparklineTrend(difference);
  const areaPolygon = `${geo.coords[0].x.toFixed(1)},${geo.height} ${geo.polylineStr} ${geo.lastPoint.x.toFixed(1)},${geo.height}`;

  const historyDisplay = (points ?? []).slice(-6).join(" → ");
  const deltaText =
    difference !== null && difference !== undefined && difference !== 0
      ? `${difference > 0 ? "+" : ""}${difference} ads`
      : "No change";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="flex items-center shrink-0 cursor-pointer group/sparkline"
            aria-label={`Trend: ${historyDisplay} (${deltaText})`}
          />
        }
      >
        <svg
          viewBox={`0 0 ${geo.width} ${geo.height}`}
          className="w-13 h-4.5 overflow-visible select-none shrink-0"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.30" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <polygon points={areaPolygon} fill={`url(#${gradientId})`} />
          <polyline
            points={geo.polylineStr}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={geo.lastPoint.x}
            cy={geo.lastPoint.y}
            r="2"
            fill={strokeColor}
            className="transition-transform group-hover/sparkline:scale-125"
          />
        </svg>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="text-center">
        <div className="text-[10px] text-slate-400 font-medium">Recent Trend ({points?.length ?? 0} scans)</div>
        <div className="text-xs font-bold text-white font-mono mt-0.5">{historyDisplay} ads</div>
        <div
          className={`text-[10px] font-semibold mt-0.5 ${
            isUp ? "text-emerald-400" : isDown ? "text-rose-400" : "text-slate-400"
          }`}
        >
          {deltaText}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Backward-compatible alias for existing consumers
export const InlineSparkline = SparklineCell;
