import { db } from "@/db";
import { trackedPages, queue, workerState, appSettings } from "@/db/schema";
import { eq, and, ne, asc, sql } from "drizzle-orm";
import { getCached } from "./cache-service";
import type { ScanScheduleStatus } from "./realtime-scan-types";

export type { ScanScheduleStatus };

/**
 * Computes the next scheduled daily cron window (06:00 UTC or 18:00 UTC).
 */
export function getNextCronWindowUtc(now = new Date()): Date {
  const currentUtcHour = now.getUTCHours();
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);

  if (currentUtcHour < 6) {
    next.setUTCHours(6);
  } else if (currentUtcHour < 18) {
    next.setUTCHours(18);
  } else {
    // Tomorrow at 06:00 UTC
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(6);
  }

  return next;
}

/**
 * Calculates predictive next scan timer and full engine status.
 * Evaluates pending queue, backoff limits, stale page thresholds, and daily crons.
 */
export async function getScanScheduleStatus(workspaceId?: string): Promise<ScanScheduleStatus> {
  const now = new Date();
  const nowMs = now.getTime();

  // 1. Fetch current Worker State (Single row #1)
  const [worker] = await db
    .select({
      isPaused: workerState.isPaused,
      circuitBreakerTripped: workerState.circuitBreakerTripped,
      circuitBreakerReason: workerState.circuitBreakerReason,
      circuitBreakerUntil: workerState.circuitBreakerUntil,
      backoffUntil: workerState.backoffUntil,
      scansThisHour: workerState.scansThisHour,
      scansToday: workerState.scansToday,
    })
    .from(workerState)
    .where(eq(workerState.id, 1));

  // 2. Fetch Queue status counts
  const queueStats = await db
    .select({
      status: queue.status,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(queue)
    .where(workspaceId ? eq(queue.workspaceId, workspaceId) : sql`1=1`)
    .groupBy(queue.status);

  const pendingJobsCount = queueStats.find((s) => s.status === "pending")?.count || 0;
  const runningJobsCount = queueStats.find((s) => s.status === "running")?.count || 0;
  const isQueueRunning = runningJobsCount > 0;

  // 3. App Settings for stale cooldown hours
  const [settings] = await db
    .select({
      staleHours: appSettings.staleHours,
    })
    .from(appSettings)
    .where(eq(appSettings.id, "default"))
    .limit(1);

  const staleHours = settings?.staleHours || 12;

  // 4. Find oldest checked active tracked page
  const [oldestPage] = await db
    .select({
      id: trackedPages.id,
      displayName: trackedPages.displayName,
      lastChecked: trackedPages.lastChecked,
    })
    .from(trackedPages)
    .where(
      and(
        workspaceId ? eq(trackedPages.workspaceId, workspaceId) : sql`1=1`,
        ne(trackedPages.status, "on_hold")
      )
    )
    .orderBy(asc(trackedPages.lastChecked))
    .limit(1);

  let oldestBrandName = oldestPage?.displayName || null;
  let oldestDueTimeMs: number | null = null;
  if (oldestPage?.lastChecked) {
    oldestDueTimeMs = new Date(oldestPage.lastChecked).getTime() + staleHours * 3600 * 1000;
  }

  // 5. Determine Next Scan Trigger
  const isPaused = worker?.isPaused ?? false;
  const circuitBreakerTripped = worker?.circuitBreakerTripped ?? false;
  const circuitBreakerUntilMs = worker?.circuitBreakerUntil ? new Date(worker.circuitBreakerUntil).getTime() : 0;
  const backoffUntilMs = worker?.backoffUntil ? new Date(worker.backoffUntil).getTime() : 0;

  let targetTimeMs: number;
  let reason: ScanScheduleStatus["nextScanReason"];

  if (isQueueRunning) {
    targetTimeMs = nowMs;
    reason = "running";
  } else if (pendingJobsCount > 0) {
    targetTimeMs = nowMs;
    reason = "queue_pending";
  } else if (circuitBreakerTripped && circuitBreakerUntilMs > nowMs) {
    targetTimeMs = circuitBreakerUntilMs;
    reason = "circuit_breaker";
  } else if (backoffUntilMs > nowMs) {
    targetTimeMs = backoffUntilMs;
    reason = "backoff";
  } else {
    const nextCronWindowMs = getNextCronWindowUtc(now).getTime();

    if (oldestDueTimeMs !== null && oldestDueTimeMs <= nowMs) {
      // Stale page is already eligible for refresh right now
      targetTimeMs = nowMs;
      reason = "stale_page_eligible";
    } else if (oldestDueTimeMs !== null && oldestDueTimeMs < nextCronWindowMs) {
      targetTimeMs = oldestDueTimeMs;
      reason = "stale_page_eligible";
    } else {
      targetTimeMs = nextCronWindowMs;
      reason = "cron_schedule";
    }
  }

  const secondsRemaining = Math.max(0, Math.round((targetTimeMs - nowMs) / 1000));

  return {
    nextScanAt: new Date(targetTimeMs).toISOString(),
    nextScanReason: reason,
    secondsRemaining,
    isQueueRunning,
    pendingJobsCount,
    runningJobsCount,
    oldestBrandName,
    workerState: {
      isPaused,
      circuitBreakerTripped,
      circuitBreakerReason: worker?.circuitBreakerReason || null,
      scansThisHour: worker?.scansThisHour || 0,
      scansToday: worker?.scansToday || 0,
      hourlyLimit: 100, // Standard hourly budget
    },
  };
}

