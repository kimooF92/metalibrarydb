import { db } from "../db";
import { trackedPages, queue, scanHistory, workerState, creativeScans } from "../db/schema";
import { eq, asc, sql, inArray } from "drizzle-orm";

export async function resetStuckJobs() {
  await db
    .update(queue)
    .set({ status: "pending" })
    .where(eq(queue.status, "running"));

  await db
    .update(trackedPages)
    .set({ status: "pending" })
    .where(eq(trackedPages.status, "scanning"));
}

export async function enqueueAllPagesForRefresh() {
  const allPages = await db.query.trackedPages.findMany({
    columns: { id: true },
  });

  if (allPages.length === 0) {
    console.log("[Enqueue Refresh] No tracked pages found.");
    return 0;
  }

  const pageIds = allPages.map((p) => p.id);

  await db
    .update(trackedPages)
    .set({ status: "pending", updatedAt: new Date() })
    .where(inArray(trackedPages.id, pageIds));

  const existingPending = await db.query.queue.findMany({
    where: eq(queue.status, "pending"),
    columns: { trackedPageId: true },
  });
  const pendingSet = new Set(existingPending.map((q) => q.trackedPageId));

  const newJobs = pageIds
    .filter((id) => !pendingSet.has(id))
    .map((id) => ({
      trackedPageId: id,
      status: "pending",
      jobType: "count",
    }));

  if (newJobs.length > 0) {
    await db.insert(queue).values(newJobs);
  }

  console.log(`[Enqueue Refresh] Enqueued ${newJobs.length} page(s) for refresh.`);
  return newJobs.length;
}

export async function getWorkerState() {
  let state = await db.query.workerState.findFirst({
    where: eq(workerState.id, 1),
  });

  if (!state) {
    const [inserted] = await db
      .insert(workerState)
      .values({ id: 1, isPaused: false })
      .returning();
    state = inserted;
  }

  return state;
}

export async function updateWorkerState(
  updates: Partial<typeof workerState.$inferInsert>
) {
  const [updated] = await db
    .update(workerState)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(workerState.id, 1))
    .returning();

  return updated;
}

export async function getNextPendingJob() {
  const job = await db.query.queue.findFirst({
    where: eq(queue.status, "pending"),
    orderBy: [asc(queue.createdAt)],
  });

  if (!job) return null;

  const page = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, job.trackedPageId),
  });

  if (!page) return null;

  let creativeScanRecord = null;
  if (job.jobType === "creative" && job.creativeScanId) {
    creativeScanRecord = await db.query.creativeScans.findFirst({
      where: eq(creativeScans.id, job.creativeScanId),
    });
  }

  return {
    queueJob: job,
    trackedPage: page,
    creativeScan: creativeScanRecord,
  };
}

export async function markJobRunning(queueId: string, pageId: string, creativeScanId?: string | null) {
  const now = new Date();

  await db
    .update(queue)
    .set({
      status: "running",
      startedAt: now,
      attempts: sql`${queue.attempts} + 1`,
    })
    .where(eq(queue.id, queueId));

  if (creativeScanId) {
    await db
      .update(creativeScans)
      .set({
        status: "running",
        startedAt: now,
      })
      .where(eq(creativeScans.id, creativeScanId));
  } else {
    await db
      .update(trackedPages)
      .set({ status: "scanning", updatedAt: now })
      .where(eq(trackedPages.id, pageId));
  }
}

export async function markJobCompleted(
  queueId: string,
  pageId: string,
  results: number | null,
  status: "success" | "unclear"
) {
  const now = new Date();

  // 1. Fetch previous scan result for difference calculation
  const lastScan = await db.query.scanHistory.findFirst({
    where: eq(scanHistory.trackedPageId, pageId),
    orderBy: [sql`${scanHistory.checkedAt} desc`],
  });

  let difference: number | null = null;
  if (results !== null && lastScan?.results !== null && lastScan?.results !== undefined) {
    difference = results - lastScan.results;
  }

  // 2. Insert scan_history record
  await db.insert(scanHistory).values({
    trackedPageId: pageId,
    results,
    difference,
    checkedAt: now,
    status,
  });

  // 3. Update tracked_pages
  await db
    .update(trackedPages)
    .set({
      currentResults: results,
      lastChecked: now,
      lastSuccessAt: status === "success" ? now : undefined,
      status,
      updatedAt: now,
    })
    .where(eq(trackedPages.id, pageId));

  // 4. Mark queue job completed
  await db
    .update(queue)
    .set({
      status: "completed",
      finishedAt: now,
    })
    .where(eq(queue.id, queueId));
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
      finishedAt: now,
    })
    .where(eq(creativeScans.id, creativeScanId));

  await db
    .update(queue)
    .set({
      status: "completed",
      finishedAt: now,
    })
    .where(eq(queue.id, queueId));
}

export async function markJobFailed(
  queueId: string,
  pageId: string,
  reason: string
) {
  const now = new Date();

  // 1. Insert scan_history failure record
  await db.insert(scanHistory).values({
    trackedPageId: pageId,
    results: null,
    difference: null,
    checkedAt: now,
    status: "failed",
    failureReason: reason,
  });

  // 2. Update tracked_pages
  await db
    .update(trackedPages)
    .set({
      status: "failed",
      lastChecked: now,
      updatedAt: now,
    })
    .where(eq(trackedPages.id, pageId));

  // 3. Mark queue job failed
  await db
    .update(queue)
    .set({
      status: "failed",
      failureReason: reason,
      finishedAt: now,
    })
    .where(eq(queue.id, queueId));
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

  await db
    .update(queue)
    .set({
      status: "failed",
      failureReason: reason,
      finishedAt: now,
    })
    .where(eq(queue.id, queueId));
}

