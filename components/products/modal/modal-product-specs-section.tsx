"use client";

import { ScrapedProduct } from "@/types";
import { Layers, ExternalLink, Calendar, Clock, Tag, MessageSquare, Phone, Activity } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { formatPrice } from "@/lib/format-price";

interface ModalProductSpecsSectionProps {
  product: ScrapedProduct;
}

export function ModalProductSpecsSection({ product }: ModalProductSpecsSectionProps) {
  const { activeWorkspace } = useWorkspace();
  const sym = activeWorkspace?.currencySymbol || "DT";

  const isUuid = (s?: string | null) =>
    Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));

  const rawPageId =
    (product.pageId && !isUuid(product.pageId) ? product.pageId : null) ||
    (product.brandPageId && !isUuid(product.brandPageId) && product.brandPageId !== "0"
      ? product.brandPageId
      : null);

  const metaAdLibraryUrl = rawPageId
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(
      rawPageId
    )}`
    : product.brandName && !isUuid(product.brandName)
      ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&q=${encodeURIComponent(
        product.brandName
      )}`
      : null;

  return (
    <div className="space-y-5">
      {/* Multi-Tier Bundle Offers */}
      {product.allOffers && Array.isArray(product.allOffers) && product.allOffers.length > 0 && (
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
            <Layers className="w-4 h-4 text-indigo-500" />
            <span>Bundle & Quantity Offers ({product.allOffers.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {product.allOffers.map((tier, idx) => (
              <div
                key={idx}
                className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between"
              >
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {(tier as any).tier_name || (tier as any).tierName || `Tier #${idx + 1}`}
                </span>
                <div className="flex items-baseline justify-between mt-1.5">
                  <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                    {formatPrice(tier.price, sym)}
                  </span>
                  {tier.savings && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {tier.savings}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Specifications & Categorization */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
          Product Specifications & Metadata
        </span>

        <div className="space-y-2 text-xs">
          {product.category && (
            <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-slate-500">Category Taxonomy</span>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {product.category}
                </span>
                {product.subCategory && (
                  <span className="text-slate-400">
                    › {product.subCategory}
                  </span>
                )}
                {product.targetAudience && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                    {product.targetAudience}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
            <span className="text-slate-500">Store Destination URL</span>
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[280px] flex items-center gap-1"
            >
              <span>{product.url}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>

          {metaAdLibraryUrl && (
            <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-slate-500">Meta Ad Library</span>
              <a
                href={metaAdLibraryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>View Brand Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {product.earliestAdDate && (
            <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-slate-500">First Ad Running</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {new Date(product.earliestAdDate).toLocaleDateString()} {product.daysRunning ? `(${product.daysRunning}d running)` : ""}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
            <span className="text-slate-500">Discovered On</span>
            <span className="text-slate-700 dark:text-slate-300">
              {product.createdAt ? new Date(product.createdAt).toLocaleDateString() : "Unknown"}
            </span>
          </div>

          {product.lastScrapedAt && (
            <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-slate-500">Last Scraped & Verified</span>
              <span className="text-slate-700 dark:text-slate-300">
                {new Date(product.lastScrapedAt).toLocaleString()}
              </span>
            </div>
          )}

          {product.metaPixelIds && product.metaPixelIds.length > 0 && (
            <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-slate-500">Meta Pixel IDs</span>
              <div className="flex items-center gap-1 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                <Activity className="w-3 h-3 text-indigo-400" />
                <span>{product.metaPixelIds.join(", ")}</span>
              </div>
            </div>
          )}

          {((product.phoneNumbers && product.phoneNumbers.length > 0) || (product.whatsappNumbers && product.whatsappNumbers.length > 0)) && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-500">Store Contact Info</span>
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                {product.whatsappNumbers?.map((w, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <MessageSquare className="w-3 h-3" />
                    <span>{w}</span>
                  </span>
                ))}
                {product.phoneNumbers?.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <Phone className="w-3 h-3" />
                    <span>{p}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
