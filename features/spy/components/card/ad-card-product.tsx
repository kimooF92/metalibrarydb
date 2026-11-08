"use client";

import Link from "next/link";
import type { ScrapedProduct } from "@/types";
import { useWorkspace } from "@/components/workspace-context";
import { formatPrice } from "@/lib/format-price";
import { ShoppingBag, ExternalLink } from "lucide-react";

export interface AdCardProductProps {
  product: ScrapedProduct | null;
}

export function AdCardProduct({ product }: AdCardProductProps) {
  const { activeWorkspace } = useWorkspace();
  const sym = activeWorkspace?.currencySymbol || "DT";

  if (!product) return null;

  return (
    <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-1.5 truncate">
        <ShoppingBag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="font-bold text-indigo-700 dark:text-indigo-300 truncate">
          {product.currentPrice ? formatPrice(product.currentPrice, sym) : "Product Scraped"}
        </span>
        {product.discountOrOffer && (
          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded truncate">
            {product.discountOrOffer}
          </span>
        )}
      </div>
      <Link
        href="/products"
        onClick={(e) => e.stopPropagation()}
        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 flex items-center gap-0.5"
      >
        <span>View Hub</span>
        <ExternalLink className="w-2.5 h-2.5" />
      </Link>
    </div>
  );
}

