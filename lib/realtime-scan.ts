import { getSupabase } from "./supabase";
import { setCached, deleteCached } from "./cache-service";

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

export const SCAN_TELEMETRY_CHANNEL = "scan-telemetry";
export const SCAN_STEP_EVENT = "scan:step";
export const SCAN_BATCH_EVENT = "scan:batch_summary";
export const SCAN_STATE_EVENT = "scan:state_change";

let broadcastChannelInstance: any = null;

/**
 * Returns or initializes the dedicated Supabase Realtime Broadcast channel.
 * Uses ack: false for sub-millisecond, zero-allocation messaging.
 */
function getBroadcastChannel() {
  if (broadcastChannelInstance) {
    return broadcastChannelInstance;
  }

  try {
    const supabase = getSupabase();
    broadcastChannelInstance = supabase.channel(SCAN_TELEMETRY_CHANNEL, {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    broadcastChannelInstance.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        // Channel ready for sending broadcasts
      }
    });

    return broadcastChannelInstance;
  } catch (err) {
    console.warn("[Realtime Telemetry] Failed to initialize Supabase broadcast channel:", err);
    return null;
  }
}

/**
 * Broadcasts a live micro-step progress event over Supabase Realtime.
 * Also persists to Upstash Redis for instant cold-load hydration (zero DB WAL overhead).
 */
export async function broadcastScanStep(payload: ScanStepBroadcastPayload): Promise<void> {
  // 1. Dual-write to Redis cache for instant hydration on page reloads (TTL: 120s)
  try {
    if (payload.pageId) {
      if (payload.step === "completed" || payload.step === "failed") {
        // Keep completed/failed status briefly so UI can show success state, then expire
        await setCached(`scan_step:${payload.pageId}`, payload, 30);
      } else {
        await setCached(`scan_step:${payload.pageId}`, payload, 120);
        // Also track the active scan pointer
        await setCached(`active_scan_job`, payload, 120);
      }
    }
  } catch (cacheErr) {
    // Non-blocking cache warning
  }

  // 2. Broadcast over Supabase Realtime channel
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.send({
        type: "broadcast",
        event: SCAN_STEP_EVENT,
        payload,
      }).catch((sendErr: any) => {
        // Channel send might fail if disconnected; silent catch
      });
    }
  } catch (broadcastErr) {
    // Non-blocking Realtime warning
  }
}

/**
 * Broadcasts a batch summary event when a scanning session or queue drains.
 */
export async function broadcastBatchSummary(payload: ScanBatchSummaryPayload): Promise<void> {
  try {
    // Cache the last batch summary in Redis for up to 48 hours
    await setCached("last_batch_summary", payload, 48 * 3600);
    // Remove active scan job pointer
    await deleteCached("active_scan_job").catch(() => {});

    const channel = getBroadcastChannel();
    if (channel) {
      channel.send({
        type: "broadcast",
        event: SCAN_BATCH_EVENT,
        payload,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[Realtime Telemetry] Failed to broadcast batch summary:", err);
  }
}

/**
 * Broadcasts an engine state change (paused, backoff, circuit breaker).
 */
export async function broadcastEngineState(payload: EngineStatePayload): Promise<void> {
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.send({
        type: "broadcast",
        event: SCAN_STATE_EVENT,
        payload,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[Realtime Telemetry] Failed to broadcast engine state:", err);
  }
}

