import { getSupabase } from "./supabase";
import { setCached, deleteCached } from "./cache-service";
import {
  SCAN_TELEMETRY_CHANNEL,
  SCAN_STEP_EVENT,
  SCAN_BATCH_EVENT,
  SCAN_STATE_EVENT,
  CATALOG_INFLOW_EVENT,
  type ScanStepBroadcastPayload,
  type ScanBatchSummaryPayload,
  type EngineStatePayload,
  type CatalogInflowBroadcastPayload,
} from "./realtime-scan-types";

export * from "./realtime-scan-types";

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

/**
 * Broadcasts a lightweight catalog inflow event when a new product is discovered or enriched.
 * Zero database load, zero WAL replication, sub-millisecond client telemetry.
 */
export async function broadcastCatalogInflow(payload: CatalogInflowBroadcastPayload): Promise<void> {
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.send({
        type: "broadcast",
        event: CATALOG_INFLOW_EVENT,
        payload,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[Realtime Telemetry] Failed to broadcast catalog inflow:", err);
  }
}


