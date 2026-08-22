import { db } from "@/db";
import { trackedPages, creativeScans, queue } from "@/db/schema";
import { eq, and, or, lt, isNull, inArray } from "drizzle-orm";

/**
 * Cleans up orphaned or stuck scans across trackedPages, creativeScans, and queue tables.
 * @param timeoutMinutes Age threshold in minutes for considering a scan orphaned (default: 5 mins, 0 for immediate reset of all)
 */
export async function cleanOrphanedScans(timeoutMinutes: number = 5): Promise<{
  fixedPages: number;
  fixedScans: number;
  fixedQueue: number;
}> {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  const now = new Date();

  let fixedPages = 0;
  let fixedScans = 0;
  let fixedQueue = 0;

  // 1. Reset orphaned creative_scans
  const stuckScans = timeoutMinutes === 0
    ? await db.query.creativeScans.findMany({
        where: eq(creativeScans.status, "running"),
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

  // 3. Reset orphaned tracked_pages in "scanning" status
  const scanningPages = timeoutMinutes === 0
    ? await db.query.trackedPages.findMany({
        where: eq(trackedPages.status, "scanning"),
      })
    : await db.query.trackedPages.findMany({
        where: and(
          eq(trackedPages.status, "scanning"),
          or(
            isNull(trackedPages.updatedAt),
            lt(trackedPages.updatedAt, cutoff)
          )
        ),
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
    fixedPages++;
  }

  return { fixedPages, fixedScans, fixedQueue };
}
