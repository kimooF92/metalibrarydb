"use client";

import type React from "react";
import type { AdActionsConfig } from "../../types";
import { formatDiscoveryDate } from "@/lib/format-date";
import { Flame, Calendar, Clock } from "lucide-react";

export interface AdCardFooterProps {
  config?: Partial<AdActionsConfig>;
  startedRunningOn?: string | null;
  firstSeenAt?: string | null;
  duplicationCount?: number;
  isActive?: boolean | null;
  isArchived?: boolean;
  onFetchProduct?: (e: React.MouseEvent) => void;
  onRefreshMedia?: (e?: React.MouseEvent) => void;
  onToggleArchive?: () => void;
}

export function AdCardFooter({
  config,
  startedRunningOn: propStartedRunningOn,
  firstSeenAt: propFirstSeenAt,
  duplicationCount: propDuplicationCount,
  isActive: propIsActive,
  isArchived: propIsArchived,
}: AdCardFooterProps) {
  const startedRunningOn = propStartedRunningOn ?? config?.startedRunningOn;
  const firstSeenAt = propFirstSeenAt ?? config?.firstSeenAt;
  const duplicationCount = propDuplicationCount ?? (config as any)?.duplicationCount ?? 1;
  const isArchived = propIsArchived ?? config?.isArchived ?? false;
  const isActive = propIsActive ?? (config as any)?.isActive ?? !isArchived;

  const effectiveStart = startedRunningOn || firstSeenAt;
  const isScaled = duplicationCount >= 5;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime())
        ? null
        : d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
    } catch {
      return null;
    }
  };

  const getTimelineDetails = () => {
    if (!effectiveStart) {
      return {
        label: "Unknown date",
        tooltip: "Launch date not recorded by Meta",
      };
    }

    const startMs = new Date(effectiveStart).getTime();
    if (isNaN(startMs)) {
      return {
        label: "Unknown date",
        tooltip: "Launch date not recorded",
      };
    }

    const days = Math.max(0, Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24)));
    const formattedShort = formatDiscoveryDate(effectiveStart);
    const fullDate = formatDate(effectiveStart) || formattedShort;

    if (!isActive || isArchived) {
      return {
        label: days <= 1 ? "Ran 1d" : `Ran ${days}d`,
        tooltip: `Active from ${fullDate} (${days}d lifespan)`,
      };
    }

    if (days <= 0) {
      return {
        label: "Launched today",
        tooltip: `Launched today (${fullDate})`,
      };
    }

    if (days === 1) {
      return {
        label: "Launched yesterday",
        tooltip: `Launched yesterday (${fullDate})`,
      };
    }

    return {
      label: `Running ${days}d • since ${formattedShort}`,
      tooltip: `Running since ${fullDate} (${days} days active)`,
    };
  };

  const timeline = getTimelineDetails();

  const velocityContent =
    !isActive || isArchived ? (
      <span className="inline-flex items-center gap-1.5 font-medium text-slate-400 dark:text-slate-500 leading-none">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block shrink-0" />
        <span>Ended</span>
      </span>
    ) : isScaled ? (
      <span
        className="inline-flex items-center gap-1 font-bold text-amber-500 dark:text-amber-400 leading-none"
        title={`${duplicationCount} ad copies running simultaneously`}
      >
        <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 animate-pulse" />
        <span>{duplicationCount}x Copies</span>
      </span>
    ) : duplicationCount >= 2 ? (
      <span
        className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 leading-none"
        title={`${duplicationCount} active ad copies running`}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" />
        <span>{duplicationCount}x Copies</span>
      </span>
    ) : (
      <span
        className="inline-flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-400 leading-none"
        title="1 active ad running"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 inline-block shrink-0" />
        <span>1x Copy</span>
      </span>
    );

  return (
    <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 min-h-[26px]">
      {/* Velocity / Scale Indicator (Matches ProductCardFooter) */}
      <div className="flex items-center min-w-0 shrink-0">{velocityContent}</div>

      {/* Longevity / Launch Timeline (Single Non-Redundant Date) */}
      <div className="flex items-center justify-end truncate font-medium leading-none">
        <span
          className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 truncate leading-none"
          title={timeline.tooltip}
        >
          {effectiveStart ? (
            <Calendar className="w-3.5 h-3.5 text-indigo-500/80 shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span className="truncate">{timeline.label}</span>
        </span>
      </div>
    </div>
  );
}
