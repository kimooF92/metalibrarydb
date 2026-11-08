"use client";

import Link from "next/link";
import type { Ad } from "@/types";
import { BrandLogo } from "@/components/brand-logo";
import { CheckCircle2, XCircle, HelpCircle, Archive, Ban } from "lucide-react";

export interface AdCardHeaderProps {
  ad: Pick<Ad, "pageId" | "pageName" | "linkUrl" | "adArchiveId" | "brandProductCount" | "productSharePercent" | "isActive">;
  isArchived: boolean;
  onExcludeBrand?: (pageId: string) => void;
}

export function AdCardHeader({ ad, isArchived, onExcludeBrand }: AdCardHeaderProps) {
  const brandIdentifier =
    ad.pageId && ad.pageId !== "0" && !ad.pageId.includes("-")
      ? ad.pageId
      : ad.pageName || "";

  return (
    <div className="flex items-start justify-between gap-2 mb-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href={`/spy/brand/${encodeURIComponent(brandIdentifier)}`}
          className="shrink-0"
          tabIndex={-1}
        >
          <BrandLogo
            name={ad.pageName}
            domain={ad.linkUrl || (ad.pageName?.includes(".") ? ad.pageName : null)}
            pageId={ad.pageId}
            size="xs"
          />
        </Link>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link
              href={`/spy/brand/${encodeURIComponent(brandIdentifier)}`}
              className="text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors truncate"
              title={`Open ${ad.pageName || ad.pageId} Analytics & Ad Library`}
            >
              {ad.pageName || `Page ${ad.pageId}`}
            </Link>
            {ad.brandProductCount && ad.brandProductCount > 1 && (
              <span
                title={`Brand tested ${ad.brandProductCount} distinct products (${ad.productSharePercent || 100}% creatives dedicated to this product)`}
                className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium shrink-0"
              >
                {ad.brandProductCount} Products
              </span>
            )}
            {onExcludeBrand && (
              <button
                type="button"
                onClick={() => onExcludeBrand(ad.pageId)}
                title={`Hide "${ad.pageName || ad.pageId}" from feed`}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded shrink-0 cursor-pointer"
              >
                <Ban className="w-3 h-3" />
              </button>
            )}
          </div>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
            ID: {ad.adArchiveId}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isArchived ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
            <Archive className="w-3 h-3" /> Archived
          </span>
        ) : ad.isActive === true ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Active
          </span>
        ) : ad.isActive === false ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3 text-slate-600 dark:text-slate-400" /> Inactive
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 px-2 py-0.5 rounded-full">
            <HelpCircle className="w-3 h-3" /> Unknown
          </span>
        )}
      </div>
    </div>
  );
}

