import { db } from "@/db";
import { trackedPages, creativeScans, queue, discoveryRuns } from "@/db/schema";
import { eq, and, or, lt, isNull, isNotNull, inArray } from "drizzle-orm";
import { forceReleaseLock, deleteCached, deleteByPrefix } from "@/lib/cache-service";

/**
 * Cleans up orphaned or stuck scans across trackedPages, creativeScans, queue, and discoveryRuns tables.
 * @param timeoutMinutes Age threshold in minutes for considering a scan orphaned (default: 3 mins, 0 for immediate reset of all)
 */
export async function cleanOrphanedScans(timeoutMinutes: number = 3): Promise<{
  fixedPages: number;
  fixedScans: number;
  fixedQueue: number;
  fixedDiscoveryRuns: number;
}> {
  // Enforce consistent minimum 5-minute age floor across all cleanup branches
  const cutoff = timeoutMinutes === 0
    ? new Date(Date.now() - 5 * 60 * 1000)
    : new Date(Date.now() - timeoutMinutes * 60 * 1000);
  const now = new Date();

  let fixedPages = 0;
  let fixedScans = 0;
  let fixedQueue = 0;
  let fixedDiscoveryRuns = 0;

  // 1. Reset orphaned creative_scans (running, abandoned ingesting, or abandoned pending)
  const stuckScans = await db.query.creativeScans.findMany({
    where: and(
      inArray(creativeScans.status, ["running", "ingesting", "pending"]),
      or(
        and(isNotNull(creativeScans.startedAt), lt(creativeScans.startedAt, cutoff)),
        and(isNull(creativeScans.startedAt), lt(creativeScans.createdAt, cutoff))
      )
    ),
    columns: { id: true },
  });

  if (stuckScans.length > 0) {
    const scanIds = stuckScans.map((s) => s.id);
    await db
      .update(creativeScans)
      .set({
        status: "failed",
        failureReason: "timeout",
        outcomeDetails: `Scan automatically marked failed after ${timeoutMinutes > 0 ? `${timeoutMinutes}m` : "5m"} of inactivity`,
        finishedAt: now,
      })
      .where(
        and(
          inArray(creativeScans.id, scanIds),
          inArray(creativeScans.status, ["running", "ingesting", "pending"]),
          or(
            and(isNotNull(creativeScans.startedAt), lt(creativeScans.startedAt, cutoff)),
            and(isNull(creativeScans.startedAt), lt(creativeScans.createdAt, cutoff))
          )
        )
      );
    fixedScans = scanIds.length;
  }

  // 2. Reset orphaned queue jobs
  const stuckQueue = await db.query.queue.findMany({
    where: and(
      eq(queue.status, "running"),
      or(
        and(isNotNull(queue.startedAt), lt(queue.startedAt, cutoff)),
        and(isNull(queue.startedAt), lt(queue.createdAt, cutoff))
      )
    ),
    columns: { id: true },
  });

  if (stuckQueue.length > 0) {
    const queueIds = stuckQueue.map((q) => q.id);
    await db
      .update(queue)
      .set({
        status: "failed",
        failureReason: "timeout",
        finishedAt: now,
      })
      .where(
        and(
          inArray(queue.id, queueIds),
          eq(queue.status, "running"),
          or(
            and(isNotNull(queue.startedAt), lt(queue.startedAt, cutoff)),
            and(isNull(queue.startedAt), lt(queue.createdAt, cutoff))
          )
        )
      );
    fixedQueue = queueIds.length;
  }

  // 3. Reset orphaned discovery_runs in "running" status
  const stuckDiscoveryRuns = await db.query.discoveryRuns.findMany({
    where: and(
      eq(discoveryRuns.status, "running"),
      or(
        and(isNotNull(discoveryRuns.startedAt), lt(discoveryRuns.startedAt, cutoff)),
        and(isNull(discoveryRuns.startedAt), lt(discoveryRuns.createdAt, cutoff))
      )
    ),
    columns: { id: true },
  });

  if (stuckDiscoveryRuns.length > 0) {
    const runIds = stuckDiscoveryRuns.map((r) => r.id);
    await db
      .update(discoveryRuns)
      .set({
        status: "failed",
        failureReason: "timeout",
        outcomeDetails: `Discovery run automatically marked failed after ${timeoutMinutes > 0 ? `${timeoutMinutes}m` : "5m"} of inactivity`,
        finishedAt: now,
      })
      .where(
        and(
          inArray(discoveryRuns.id, runIds),
          eq(discoveryRuns.status, "running"),
          or(
            and(isNotNull(discoveryRuns.startedAt), lt(discoveryRuns.startedAt, cutoff)),
            and(isNull(discoveryRuns.startedAt), lt(discoveryRuns.createdAt, cutoff))
          )
        )
      );
    fixedDiscoveryRuns = runIds.length;
  }

  // 4. Reset orphaned tracked_pages in "scanning" status
  const pageCutoffMinutes = timeoutMinutes === 0 ? 5 : Math.max(timeoutMinutes, 3.5);
  const pageCutoff = new Date(Date.now() - pageCutoffMinutes * 60 * 1000);

  const scanningPages = await db.query.trackedPages.findMany({
    where: and(
      eq(trackedPages.status, "scanning"),
      or(
        isNull(trackedPages.updatedAt),
        lt(trackedPages.updatedAt, pageCutoff)
      )
    ),
    columns: { id: true, lastSuccessAt: true, currentResults: true },
  });

  for (const page of scanningPages) {
    // If page has verified past results or lastSuccessAt, restore to "success" instead of leaving broken
    const targetStatus = (page.lastSuccessAt !== null || page.currentResults !== null)
      ? "success"
      : "failed";

    await db
      .update(trackedPages)
      .set({
        status: targetStatus,
        updatedAt: now,
      })
      .where(and(eq(trackedPages.id, page.id), eq(trackedPages.status, "scanning")));

    // Cancel any stale queue entries for this page
    await db
      .update(queue)
      .set({
        status: "failed",
        failureReason: "orphaned_scan_timeout",
        finishedAt: now,
      })
      .where(and(eq(queue.trackedPageId, page.id), inArray(queue.status, ["pending", "running"])))
      .catch(() => {});

    // Free distributed lock and clear stale scan_step in Redis
    await forceReleaseLock(`lock:scrape:${page.id}`).catch(() => {});
    await deleteCached(`scan_step:${page.id}`).catch(() => {});

    fixedPages++;
  }

  // If any orphaned items were recovered, invalidate cached overview & stats to keep UI fresh
  if (fixedPages > 0 || fixedScans > 0 || fixedQueue > 0 || fixedDiscoveryRuns > 0) {
    Promise.allSettled([
      deleteByPrefix("cache:dashboard:overview:"),
      deleteByPrefix("cache:stats:"),
      deleteByPrefix("cache:pages:"),
    ]).catch(() => {});
  }

  return { fixedPages, fixedScans, fixedQueue, fixedDiscoveryRuns };
}
