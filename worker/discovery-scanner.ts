/**
 * Backward-compatible barrel re-export bridge for discovery scanner.
 * Decomposed into modular domain component in worker/scanners/:
 * - discovery-crawler.ts: runDiscoveryScan, DiscoveredPageData, DiscoveryScanOutcome
 */

export * from "./scanners/discovery-crawler";
