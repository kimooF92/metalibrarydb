"use client";

import type React from "react";
import type { ScrapedProduct } from "@/types";
import { AdCardPricing, type AdCardPricingProps } from "./ad-card-pricing";
import { formatPrice } from "@/lib/format-price";
import { useWorkspace } from "@/components/workspace-context";

export interface AdCardProductProps {
  product?: ScrapedProduct | null;
  adArchiveId?: string;
  destinationUrl?: string | null;
  targetDomain?: string | null;
  isExtractingProduct?: boolean;
  onFetchProduct?: (e: React.MouseEvent) => void;
}

export function AdCardProduct({
  product,
  adArchiveId = "",
  destinationUrl,
  targetDomain,
  isExtractingProduct,
  onFetchProduct,
}: AdCardProductProps) {
  const { activeWorkspace } = useWorkspace();
  const sym = activeWorkspace?.currencySymbol || "DT";

  const cleanPrice = product?.currentPrice
    ? formatPrice(product.currentPrice, sym)
    : undefined;

  return (
    <AdCardPricing
      cleanPrice={cleanPrice}
      discountOrOffer={product?.discountOrOffer}
      destinationUrl={destinationUrl || product?.url}
      targetDomain={targetDomain || product?.domain}
      adArchiveId={adArchiveId}
      isExtractingProduct={isExtractingProduct}
      onFetchProduct={onFetchProduct}
    />
  );
}

export { AdCardPricing };
export type { AdCardPricingProps };
