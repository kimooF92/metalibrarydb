"use client";

import { ScrapedProduct } from "@/types";
import { useAuth } from "@/components/auth-context";
import { formatDiscoveryDate } from "@/lib/format-date";
import { Flame, Calendar, Clock } from "lucide-react";

export interface ProductCardFooterProps {
  product: ScrapedProduct;
  activeAdsCount?: number | null;
  activeLinkedAdsCount?: number | null;
  isInactive: boolean;
  isPageOnHold: boolean;
  onViewCreatives?: (product: ScrapedProduct) => void;
}

export function ProductCardFooter({
  product,
  activeAdsCount,
  activeLinkedAdsCount,
  isInactive,
  isPageOnHold,
  onViewCreatives,
}: ProductCardFooterProps) {
  const { isStaff } = useAuth();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return null;
    }
  };

  const activeCount = activeAdsCount || 0;
  const hasLinkedAds = (activeLinkedAdsCount || 0) > 0;
  const canViewAds = !isStaff && Boolean(onViewCreatives) && hasLinkedAds;

  const velocityContent =
    activeCount >= 5 ? (
      <span className="inline-flex items-center gap-1 font-bold text-amber-500 dark:text-amber-400 leading-none">
        <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 animate-pulse transition-transform duration-200 ease-out group-hover/vel:scale-125 group-hover/vel:-rotate-6" />
        <span className="group-hover/vel:underline">{activeCount} Active</span>
      </span>
    ) : activeCount >= 1 ? (
      <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 leading-none">
        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0 transition-transform duration-200 ease-out group-hover/vel:scale-125 group-hover/vel:ring-2 group-hover/vel:ring-emerald-500/30" />
        <span className="group-hover/vel:underline">{activeCount} Active</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 font-medium text-slate-400 dark:text-slate-500 leading-none">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block shrink-0" />
        <span>0 Active</span>
      </span>
    );

  return (
    <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 min-h-[26px]">
      {/* Velocity: Green Dot (1-4 ads) vs Pulsing Flame (5+ ads) */}
      <div className="flex items-center min-w-0 shrink-0">
        {canViewAds ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewCreatives?.(product);
            }}
            className="group/vel inline-flex items-center gap-1.5 py-1 px-1.5 -mx-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/60 transition-all duration-200 ease-out hover:scale-[1.03] active:scale-95 cursor-pointer leading-none"
            title={`${activeCount} active ads running — click to view creatives`}
          >
            {velocityContent}
          </button>
        ) : (
          velocityContent
        )}
      </div>

      {/* Longevity / Launch Timeline */}
      <div className="flex items-center justify-end truncate font-medium leading-none">
        {product.earliestAdDate ? (
          (() => {
            const isProductActive = (product.activeAdsCount || 0) > 0 && !isInactive && !isPageOnHold;
            const earliest = product.earliestAdDate;
            const shutDownDate = product.latestAdDate || product.lastScrapedAt || product.updatedAt;

            let days = product.daysRunning || 1;
            if (!isProductActive && shutDownDate) {
              const startMs = new Date(earliest).getTime();
              const endMs = new Date(shutDownDate).getTime();
              if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
                days = Math.max(1, Math.round((endMs - startMs) / 86400000));
              }
            }

            const timelineText = isProductActive
              ? days <= 1
                ? "Today (1d)"
                : `${formatDiscoveryDate(earliest)} → Today (${days}d)`
              : shutDownDate
              ? `${formatDiscoveryDate(earliest)} → ${formatDiscoveryDate(shutDownDate)} (${days}d)`
              : `${formatDiscoveryDate(earliest)} (${days}d)`;

            const tooltipText = isProductActive
              ? `Active since ${formatDate(earliest)} (${days}d running)`
              : `Ran from ${formatDate(earliest)} to ${formatDate(shutDownDate)} (${days}d)`;

            return (
              <span
                className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 truncate leading-none"
                title={tooltipText}
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-500/80 shrink-0" />
                <span className="truncate">{timelineText}</span>
              </span>
            );
          })()
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 truncate leading-none">
            <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span className="truncate">
              Scraped {formatDiscoveryDate(product.lastScrapedAt || product.createdAt)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

