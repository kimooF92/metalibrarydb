"use client";

import type React from "react";
import { ArrowUpRight, ExternalLink, ShoppingBag, RotateCw } from "lucide-react";
import { MetaIcon } from "@/components/icons/custom-icons";

export interface AdCardPricingProps {
  cleanPrice?: string;
  discountOrOffer?: string | null;
  destinationUrl?: string | null;
  targetDomain?: string | null;
  adArchiveId: string;
  isExtractingProduct?: boolean;
  onFetchProduct?: (e: React.MouseEvent) => void;
}

export function AdCardPricing({
  cleanPrice,
  discountOrOffer,
  destinationUrl,
  targetDomain,
  adArchiveId,
  isExtractingProduct = false,
  onFetchProduct,
}: AdCardPricingProps) {
  const metaAdLibraryUrl = adArchiveId
    ? `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adArchiveId)}`
    : null;

  return (
    <div className="flex items-center justify-between gap-2 mb-2 min-h-[32px]">
      {/* Left: Clean Price & Discount Pill OR Save Product CTA */}
      <div className="flex items-center gap-1.5 min-w-0">
        {cleanPrice ? (
          <div className="flex items-baseline gap-1.5 truncate">
            <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">
              {cleanPrice}
            </span>
            {discountOrOffer && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-full truncate">
                {discountOrOffer}
              </span>
            )}
          </div>
        ) : destinationUrl && onFetchProduct ? (
          <button
            type="button"
            onClick={onFetchProduct}
            disabled={isExtractingProduct}
            className="group/fetch h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200/80 dark:border-indigo-800/80 text-xs font-semibold text-indigo-600 dark:text-indigo-400 transition-all duration-200 ease-out hover:scale-102 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
            title="Scan landing page to save product details & price"
          >
            {isExtractingProduct ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
            ) : (
              <ShoppingBag className="w-3.5 h-3.5 text-indigo-500 transition-transform duration-200 group-hover/fetch:scale-110" />
            )}
            <span className="text-[11px]">
              {isExtractingProduct ? "Saving..." : "Save Product"}
            </span>
          </button>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500 italic font-medium">
            Price not listed
          </span>
        )}
      </div>

      {/* Right: External Action Buttons (Meta Ad Library + Live Store Link) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Meta Ad Library Quick Jump */}
        {metaAdLibraryUrl && (
          <a
            href={metaAdLibraryUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group/meta h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 active:bg-blue-500/30 border border-blue-500/25 hover:border-blue-500/50 text-[#0081FB] dark:text-blue-400 shadow-xs hover:shadow-md hover:shadow-blue-500/15 transition-all duration-200 ease-out hover:scale-105 active:scale-95 cursor-pointer"
            title="View ad in Meta Ad Library"
          >
            <MetaIcon className="w-5 h-5 shrink-0 transition-transform duration-200 ease-out group-hover/meta:scale-110 drop-shadow-xs" />
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 transition-transform duration-200 ease-out group-hover/meta:translate-x-0.5 group-hover/meta:-translate-y-0.5" />
          </a>
        )}

        {/* Direct Store Landing Page Link */}
        {destinationUrl && (
          <a
            href={destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group/store w-8 h-8 inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 shadow-xs hover:shadow-sm rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-90 cursor-pointer"
            title={`Visit store landing page (${targetDomain || destinationUrl})`}
          >
            <ExternalLink className="w-4 h-4 transition-transform duration-200 ease-out group-hover/store:scale-110 group-hover/store:translate-x-0.5 group-hover/store:-translate-y-0.5" />
          </a>
        )}
      </div>
    </div>
  );
}

