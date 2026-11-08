/**
 * Backward-compatible barrel re-export bridge for Apify ingestion modules.
 * Decomposed into modular domain components in lib/apify/:
 * - apify-normalizer.ts: extractAdArchiveId, extractMedia, extractAdActiveStatus, parseAdStartDate, extractPageInfo (numeric page ID validation guard)
 * - apify-ingestion-service.ts: ingestApifyDatasetItems (Backblaze B2 storage URL preservation SQL, dataset error verification)
 */

export * from "./apify/apify-normalizer";
export * from "./apify/apify-ingestion-service";
