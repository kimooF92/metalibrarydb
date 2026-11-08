/**
 * Backward-compatible barrel re-export bridge for ad spy scanning.
 * Decomposed into modular domain components in worker/scanners/:
 * - media-pipeline.ts: processAdMedia (B2 and Supabase thumbnail & asset caching)
 * - ad-spy-crawler.ts: scanAdCreatives, parseAdGraphQLNode, ExtractedAdData, SpyScanOutcome
 */

export * from "./scanners/media-pipeline";
export * from "./scanners/ad-spy-crawler";
