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

export async function enqueueAllPagesForRefresh(cooldownHours: number = 6) {
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

  // Find pages that either have never been checked, or were last checked before the cutoff time
  const pagesToRefresh = cooldownHours > 0
    ? await db.query.trackedPages.findMany({
        where: (pages, { or, isNull, lt }) =>
          or(isNull(pages.lastChecked), lt(pages.lastChecked, cutoff)),
        columns: { id: true },
      })
    : await db.query.trackedPages.findMany({
        columns: { id: true },
      });

  if (pagesToRefresh.length === 0) {
    console.log(
      `[Enqueue Refresh] No tracked pages due for refresh (all scanned within last ${cooldownHours}h).`
    );
    return 0;
  }

  const pageIds = pagesToRefresh.map((p) => p.id);

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

  console.log(
    `[Enqueue Refresh] Enqueued ${newJobs.length} page(s) for refresh (cooldown: ${cooldownHours}h).`
  );
  return newJobs.length;
}

export async function enqueuePagesForCreativeScan(cooldownDays: number = 3) {
  const cutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);

  const allPages = await db.query.trackedPages.findMany({
    columns: { id: true, lastCreativeScan: true, currentResults: true },
  });

  const eligibleIds: string[] = [];

  for (const page of allPages) {
    // Respect cooldown window
    if (page.lastCreativeScan && page.lastCreativeScan > cutoff) {
      continue;
    }

    const isFirstTimeCreativeScan = !page.lastCreativeScan;

    if (isFirstTimeCreativeScan) {
      // First-time creative scan: requires currentResults >= 1
      if ((page.currentResults || 0) >= 1) {
        eligibleIds.push(page.id);
      }
    } else {
      // Subsequent scan: requires latest scanHistory difference >= 1 (new ads added)
      const latestHistory = await db.query.scanHistory.findFirst({
        where: eq(scanHistory.trackedPageId, page.id),
        orderBy: [sql`${scanHistory.checkedAt} desc`],
      });

      if (latestHistory && (latestHistory.difference || 0) >= 1) {
        eligibleIds.push(page.id);
      }
    }
  }

  if (eligibleIds.length === 0) {
    console.log(
      `[Enqueue Spy] No eligible pages found for Ad Spy creative scan (difference < +1 or cooldown active).`
    );
    return 0;
  }

  let enqueuedCount = 0;

  for (const pageId of eligibleIds) {
    const existingQueueJob = await db.query.queue.findFirst({
      where: (q, { eq, and, inArray }) =>
        and(
          eq(q.trackedPageId, pageId),
          eq(q.jobType, "creative"),
          inArray(q.status, ["pending", "running"])
        ),
    });

    if (existingQueueJob) continue;

    const [scanRecord] = await db
      .insert(creativeScans)
      .values({
        trackedPageId: pageId,
        status: "pending",
      })
      .returning();

    await db.insert(queue).values({
      trackedPageId: pageId,
      jobType: "creative",
      creativeScanId: scanRecord.id,
      status: "pending",
    });

    enqueuedCount++;
  }

  console.log(`[Enqueue Spy] Enqueued ${enqueuedCount} page(s) for Ad Spy creative scan.`);
  return enqueuedCount;
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

