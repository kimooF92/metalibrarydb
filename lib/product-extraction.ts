import type { ScrapedProduct } from "../types";

export function resolveProductForRefresh(
  productId: string,
  products: ScrapedProduct[],
  fallback?: ScrapedProduct | null
): ScrapedProduct | null {
  const listedProduct = products.find((product) => product.id === productId);
  if (listedProduct?.url) return listedProduct;
  if (fallback?.id === productId && fallback.url) return fallback;
  return listedProduct || (fallback?.id === productId ? fallback : null);
}

function compactNotificationText(value: string | null | undefined, maxLength: number) {
  const compact = (value || "").replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

export function buildProductExtractionNotification(input: {
  success: boolean;
  productId?: string | null;
  title?: string | null;
  url: string;
  domain?: string | null;
  error?: string | null;
  wasExistingProduct?: boolean;
}) {
  const label = compactNotificationText(input.title || input.domain || input.url, 80);
  const source = compactNotificationText(input.domain || input.url, 120);
  const eventSource = compactNotificationText(input.url.replace(/^https?:\/\//, ""), 48);
  const actionUrl = input.productId ? `/products?id=${input.productId}` : "/products";

  if (input.success) {
    const wasExisting = Boolean(input.wasExistingProduct);
    return {
      type: "system_alert" as const,
      title: `${wasExisting ? "Product Re-extracted" : "Product Added"}: ${label} (${eventSource})`,
      message: `${label} was ${wasExisting ? "updated from its landing page" : "added from its landing page"}.`,
      severity: "success" as const,
      actionUrl,
      metadata: {
        event: wasExisting ? "product_re_extracted" : "product_added",
        productId: input.productId || null,
        url: input.url,
      },
    };
  }

  return {
    type: "system_alert" as const,
    title: `Product Extraction Failed: ${source}`,
    message: `Could not extract product content from ${source}. ${compactNotificationText(input.error || "Both page extractors failed.", 180)}`,
    severity: "error" as const,
    actionUrl,
    metadata: {
      event: "product_extraction_failed",
      productId: input.productId || null,
      url: input.url,
      error: compactNotificationText(input.error, 180) || null,
    },
  };
}
