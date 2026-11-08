/**
 * JSON-LD schema and HTML meta-tag extraction utilities.
 * Handles nested @graph schemas from Shopify, WooCommerce, and modern storefronts (BUG-10 mitigation).
 */

/**
 * Helper to check if a schema.org @type matches Product
 */
export function isProductSchemaType(type: any): boolean {
  if (typeof type === "string") {
    return (
      type === "Product" ||
      type === "http://schema.org/Product" ||
      type === "https://schema.org/Product" ||
      type === "IndividualProduct"
    );
  }
  if (Array.isArray(type)) {
    return type.some((t) => isProductSchemaType(t));
  }
  return false;
}

/**
 * Extracts JSON-LD schema objects from HTML content.
 * Recursively parses ld+json script tags and handles HTML comments.
 */
export function extractJsonLd(html: string): any[] {
  const results: any[] = [];
  const regex = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      let raw = match[1].trim();
      if (raw.startsWith("<!--")) {
        raw = raw.replace(/^<!--\s*/, "").replace(/\s*-->$/, "");
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else if (parsed && typeof parsed === "object") {
        results.push(parsed);
      }
    } catch {
      // Ignore invalid JSON in ld+json scripts
    }
  }

  return results;
}

/**
 * Finds the Product schema object within an array of JSON-LD items,
 * deep traversing `@graph` arrays if present (BUG-10).
 */
export function findProductSchemaInJsonLd(jsonLdList: any[]): any | null {
  for (const item of jsonLdList) {
    if (!item || typeof item !== "object") continue;
    if (isProductSchemaType(item["@type"])) {
      return item;
    }
    if (Array.isArray(item["@graph"])) {
      const graphProd = item["@graph"].find(
        (g: any) => g && isProductSchemaType(g["@type"])
      );
      if (graphProd) {
        return graphProd;
      }
    }
  }
  return null;
}

/**
 * Decodes HTML numeric and named entities in attribute and text values.
 */
export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

/**
 * Extracts meta tag content by property or name attribute.
 */
export function extractMeta(html: string, nameOrProp: string): string | null {
  const escaped = nameOrProp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\s+[^>]*property=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*property=["']${escaped}["']`, "i"),
    new RegExp(`<meta\\s+[^>]*name=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*name=["']${escaped}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match && match[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

