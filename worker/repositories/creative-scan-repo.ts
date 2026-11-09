import { db } from "../../db";
import { creativeScans, queue, trackedPages, scanHistory } from "../../db/schema";
import { eq, desc } from "drizzle-orm";

function isUuid(id?: string | null): boolean {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function markCreativeJobCompleted(
  queueId: string,
  creativeScanId: string,
  extractedCount: number,
  status: "completed" | "partial"
) {
  const now = new Date();

  await db
    .update(creativeScans)
    .set({
      status,
      extractedCount,
      failureReason: null,
      outcomeDetails: null,
      finishedAt: now,
    })
    .where(eq(creativeScans.id, creativeScanId));

  if (isUuid(queueId)) {
    await db
      .update(queue)
      .set({
        status: "completed",
        failureReason: null,
        finishedAt: now,
      })
      .where(eq(queue.id, queueId));
  }

  const creativeScan = await db.query.creativeScans.findFirst({
    where: eq(creativeScans.id, creativeScanId),
    columns: { id: true, trackedPageId: true },
  });
  if (creativeScan?.trackedPageId) {
    await db
      .update(trackedPages)
      .set({
        status: "success",
        lastCreativeScan: now,
        lastSuccessAt: now,
        updatedAt: now,
      })
      .where(eq(trackedPages.id, creativeScan.trackedPageId));

    // Update the latest scan_history entry so the creative scan date is immediately paired with the count check
    const latestScan = await db.query.scanHistory.findFirst({
      where: eq(scanHistory.trackedPageId, creativeScan.trackedPageId),
      orderBy: [desc(scanHistory.checkedAt)],
      columns: { id: true },
    });
    if (latestScan) {
      await db
        .update(scanHistory)
        .set({ creativeScannedAt: now })
        .where(eq(scanHistory.id, latestScan.id));
    }

    // Invalidate dashboard overview and stats cache so UI clears active scanning indicator immediately
    const pageRecord = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, creativeScan.trackedPageId),
      columns: { workspaceId: true },
    });
    if (pageRecord?.workspaceId) {
      import("../../lib/cache-service")
        .then(({ deleteByPrefix, deleteCached }) => {
          Promise.allSettled([
            deleteByPrefix(`cache:dashboard:overview:${pageRecord.workspaceId}:`),
            deleteCached(`cache:stats:${pageRecord.workspaceId}`),
          ]).catch(() => {});
        })
        .catch(() => {});
    }
  }
}

export async function markCreativeJobFailed(
  queueId: string,
  creativeScanId: string,
  reason: string,
  details?: string
) {
  const now = new Date();

  await db
    .update(creativeScans)
    .set({
      status: "failed",
      failureReason: reason,
      outcomeDetails: details,
      finishedAt: now,
    })
    .where(eq(creativeScans.id, creativeScanId));

  const creativeScan = await db.query.creativeScans.findFirst({
    where: eq(creativeScans.id, creativeScanId),
  });
  if (creativeScan?.trackedPageId) {
    const page = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, creativeScan.trackedPageId),
    });
    if (page && page.status === "scanning") {
      await db
        .update(trackedPages)
        .set({
          status: page.lastSuccessAt || page.currentResults !== null ? "success" : "failed",
          updatedAt: now,
        })
        .where(eq(trackedPages.id, creativeScan.trackedPageId));
    }
  }

  await db
    .update(queue)
    .set({
      status: "failed",
      failureReason: reason,
      finishedAt: now,
    })
    .where(eq(queue.id, queueId));
}
