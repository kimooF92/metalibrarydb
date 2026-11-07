"use client";

import { ArrowUpRight, ExternalLink } from "lucide-react";
import { MetaIcon } from "@/components/icons/custom-icons";

export interface ProductCardPricingProps {
  cleanPrice: string;
  isPendingScrape: boolean;
  isPageOnHold: boolean;
  isInactive: boolean;
  metaAdLibraryUrl: string | null;
  activeUrl: string | null;
}

export function ProductCardPricing({
  cleanPrice,
  isPendingScrape,
  isPageOnHold,
  isInactive,
  metaAdLibraryUrl,
  activeUrl,
}: ProductCardPricingProps) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      {/* Bold Clean Price */}
      <div className="flex items-baseline">
        {cleanPrice ? (
          <span
            className={`text-base sm:text-lg font-black tracking-tight ${
              isPageOnHold || isInactive
                ? "text-slate-600 dark:text-slate-400"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {cleanPrice}
          </span>
        ) : isPendingScrape ? (
          <span className="text-xs text-amber-500 font-medium">Checking price...</span>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400 italic">Price not listed</span>
        )}
      </div>

      {/* External Action Buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Meta Ad Library Quick Jump Button */}
        {metaAdLibraryUrl && (
          <a
            href={metaAdLibraryUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group/meta h-8 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 active:bg-blue-500/30 border border-blue-500/25 hover:border-blue-500/50 text-[#0081FB] dark:text-blue-400 shadow-xs hover:shadow-md hover:shadow-blue-500/15 transition-all duration-200 ease-out hover:scale-105 active:scale-95 cursor-pointer"
            title="View brand in Meta Ad Library"
          >
            <MetaIcon className="w-5 h-5 shrink-0 transition-transform duration-200 ease-out group-hover/meta:scale-110 drop-shadow-xs" />
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 transition-transform duration-200 ease-out group-hover/meta:translate-x-0.5 group-hover/meta:-translate-y-0.5" />
          </a>
        )}

        {/* Direct Store Landing Page Link */}
        {activeUrl && (
          <a
            href={activeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group/store w-8 h-8 inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 shadow-xs hover:shadow-sm rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-90 cursor-pointer"
            title="Open live store landing page"
          >
            <ExternalLink className="w-4 h-4 transition-transform duration-200 ease-out group-hover/store:scale-110 group-hover/store:translate-x-0.5 group-hover/store:-translate-y-0.5" />
          </a>
        )}
      </div>
    </div>
  );
}

