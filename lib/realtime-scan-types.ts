/**
 * Client-Safe Scan Telemetry & Schedule Types and Constants.
 * 
 * This file contains strictly pure TypeScript types, interfaces, and string constants.
 * It has ZERO server-side imports (no crypto, no redis, no postgres/db, no dotenv),
 * making it 100% safe to import in client components ("use client") and SSR bundles alike.
 */

export const SCAN_TELEMETRY_CHANNEL = "scan-telemetry";
export const SCAN_STEP_EVENT = "scan:step";
export const SCAN_BATCH_EVENT = "scan:batch_summary";
export const SCAN_STATE_EVENT = "scan:state_change";

export interface ScanStepBroadcastPayload {
  jobId: string;
  pageId: string;
  displayName: string;
  country?: string;
  profilePicUrl?: string | null;
  jobType: "count" | "creative" | "discovery_count" | "discovery" | "product_scrape";
  step:
    | "locked"
    | "launching"
    | "navigating"
    | "settling"
    | "extracting"
    | "saving"
    | "completed"
    | "failed";
  label: string;
  percent: number;
  activeAds?: number | null;
  previousAds?: number | null;
  diff?: number | null;
  batchIndex?: number;
  batchTotal?: number;
  timestamp: number;
}

export interface ScanBatchSummaryPayload {
  finishedAt: number;
  totalScanned: number;
  newAdsCount: number;
  moversCount: number;
  durationSeconds: number;
  shardInfo?: string;
}

export interface EngineStatePayload {
  isPaused: boolean;
  circuitBreakerTripped: boolean;
  circuitBreakerReason?: string | null;
  timestamp: number;
}

export interface ScanProgressStep {
  pageId: string;
  displayName?: string | null;
  step: "locked" | "launching" | "navigating" | "settling" | "extracting" | "saving" | "completed" | "failed";
  label: string;
  percent: number;
  activeAds?: number | null;
  timestamp: number;
}

export interface ScanScheduleStatus {
  nextScanAt: string; // ISO string
  nextScanReason: "queue_pending" | "running" | "stale_page_eligible" | "cron_schedule" | "circuit_breaker" | "backoff";
  secondsRemaining: number;
  isQueueRunning: boolean;
  pendingJobsCount: number;
  runningJobsCount: number;
  oldestBrandName?: string | null;
  workerState: {
    isPaused: boolean;
    circuitBreakerTripped: boolean;
    circuitBreakerReason?: string | null;
    scansThisHour: number;
    scansToday: number;
    hourlyLimit: number;
  };
}

