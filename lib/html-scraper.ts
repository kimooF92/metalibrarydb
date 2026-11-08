/**
 * Backward-compatible barrel re-export bridge for html-scraper modules.
 * Decomposed into modular domain components in lib/scraper/:
 * - ssrf-validator.ts: isSafePublicUrl (SSRF mitigation)
 * - price-parser.ts: isPriceString, isUrgencyOrPromoBanner, normalizeTndMillimes (currency heuristics)
 * - jsonld-extractor.ts: extractJsonLd (deep graph schema traversal), decodeHtmlEntities, extractMeta
 * - content-extractor.ts: parseProductHtmlContent, isTrackingBeacon, extractImageUrl, extractStoreLogoFromHtml, extractStoreLogoFromUrl (HTML content parsing)
 * - html-fetcher.ts: scrapeProductDirectHtml (safe HTTP streaming & redirects)
 */

export * from "./scraper/ssrf-validator";
export * from "./scraper/price-parser";
export * from "./scraper/jsonld-extractor";
export * from "./scraper/content-extractor";
export * from "./scraper/html-fetcher";
