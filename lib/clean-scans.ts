import { db } from "@/db";
import { trackedPages, creativeScans, queue, discoveryRuns } from "@/db/schema";
import { eq, and, or, lt, isNull, inArray } from "drizzle-orm";
import { releaseLock, deleteCached } from "@/lib/cache-service";

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
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  const now = new Date();

  let fixedPages = 0;
  let fixedScans = 0;
  let fixedQueue = 0;
  let fixedDiscoveryRuns = 0;

  // 1. Reset orphaned creative_scans
  const stuckScans = timeoutMinutes === 0
    ? await db.query.creativeScans.findMany({
        where: eq(creativeScans.status, "running"),
        columns: { id: true },
      })
    : await db.query.creativeScans.findMany({
        where: and(
          eq(creativeScans.status, "running"),
          or(
            isNull(creativeScans.startedAt),
            lt(creativeScans.startedAt, cutoff),
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
        outcomeDetails: `Scan automatically marked failed after ${timeoutMinutes > 0 ? `${timeoutMinutes}m of inactivity` : "orphaned job cleanup"}`,
        finishedAt: now,
      })
      .where(inArray(creativeScans.id, scanIds));
    fixedScans = scanIds.length;
  }

  // 2. Reset orphaned queue jobs
  const stuckQueue = timeoutMinutes === 0
    ? await db.query.queue.findMany({
        where: eq(queue.status, "running"),
        columns: { id: true },
      })
    : await db.query.queue.findMany({
        where: and(
          eq(queue.status, "running"),
          or(
            isNull(queue.startedAt),
            lt(queue.startedAt, cutoff),
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
      .where(inArray(queue.id, queueIds));
    fixedQueue = queueIds.length;
  }

  // 3. Reset orphaned discovery_runs in "running" status
  const stuckDiscoveryRuns = timeoutMinutes === 0
    ? await db.query.discoveryRuns.findMany({
        where: eq(discoveryRuns.status, "running"),
        columns: { id: true },
      })
    : await db.query.discoveryRuns.findMany({
        where: and(
          eq(discoveryRuns.status, "running"),
          or(
            isNull(discoveryRuns.startedAt),
            lt(discoveryRuns.startedAt, cutoff),
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
        outcomeDetails: `Discovery run automatically marked failed after ${timeoutMinutes > 0 ? `${timeoutMinutes}m of inactivity` : "orphaned job cleanup"}`,
        finishedAt: now,
      })
      .where(inArray(discoveryRuns.id, runIds));
    fixedDiscoveryRuns = runIds.length;
  }

  // 4. Reset orphaned tracked_pages in "scanning" status (tight 90s cutoff for count scans)
  const pageCutoff = timeoutMinutes === 0
    ? cutoff
    : new Date(Date.now() - Math.min(timeoutMinutes, 1.5) * 60 * 1000);

  const scanningPages = timeoutMinutes === 0
    ? await db.query.trackedPages.findMany({
        where: eq(trackedPages.status, "scanning"),
        columns: { id: true, lastSuccessAt: true, currentResults: true },
      })
    : await db.query.trackedPages.findMany({
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
      .where(eq(trackedPages.id, page.id));

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
    await releaseLock(`lock:scrape:${page.id}`).catch(() => {});
    await deleteCached(`scan_step:${page.id}`).catch(() => {});

    fixedPages++;
  }

  return { fixedPages, fixedScans, fixedQueue, fixedDiscoveryRuns };
}
