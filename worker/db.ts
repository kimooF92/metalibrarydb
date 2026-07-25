import { db } from "../db";
import { trackedPages, queue, scanHistory, workerState } from "../db/schema";
import { eq, asc, sql } from "drizzle-orm";

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
    with: {
      // Find associated tracked page
    },
  });

  if (!job) return null;

  const page = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, job.trackedPageId),
  });

  if (!page) return null;

  return {
    queueJob: job,
    trackedPage: page,
  };
}

export async function markJobRunning(queueId: string, pageId: string) {
  await db
    .update(queue)
    .set({
      status: "running",
      startedAt: new Date(),
      attempts: sql`${queue.attempts} + 1`,
    })
    .where(eq(queue.id, queueId));

  await db
    .update(trackedPages)
    .set({ status: "scanning", updatedAt: new Date() })
    .where(eq(trackedPages.id, pageId));
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
