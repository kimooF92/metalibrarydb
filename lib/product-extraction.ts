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
  const brandName = compactNotificationText(input.domain || (input.url ? input.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : "Product"), 40);
  const label = compactNotificationText(input.title || input.domain || input.url, 80);
  const actionUrl = input.productId ? `/products?id=${input.productId}` : "/products";

  if (input.success) {
    const wasExisting = Boolean(input.wasExistingProduct);
    return {
      type: "system_alert" as const,
      title: `${brandName}: ${wasExisting ? "Product Updated" : "Product Added"}`,
      message: `"${label}" was ${wasExisting ? "updated with newest images and pricing" : "added to catalog"}.`,
      severity: "success" as const,
      actionUrl,
      metadata: {
        category: "product",
        brandName,
        event: wasExisting ? "product_re_extracted" : "product_added",
        productId: input.productId || null,
        url: input.url,
        productTitle: input.title || label,
      },
    };
  }

  return {
    type: "system_alert" as const,
    title: `${brandName}: Extraction Failed`,
    message: `Could not extract product details from ${brandName}. ${compactNotificationText(input.error || "Both page extractors failed.", 160)}`,
    severity: "error" as const,
    actionUrl,
    metadata: {
      category: "error",
      brandName,
      event: "product_extraction_failed",
      productId: input.productId || null,
      url: input.url,
      error: compactNotificationText(input.error, 180) || null,
    },
  };
}
