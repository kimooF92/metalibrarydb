import { db } from "../../db";
import {
  trackedPages,
  queue,
  scanHistory,
  discoveredPages,
  creativeScans,
} from "../../db/schema";
import { eq, sql, inArray } from "drizzle-orm";

function isUuid(id?: string | null): boolean {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function resetStuckJobs() {
  const { cleanOrphanedScans } = await import("../../lib/clean-scans");
  await cleanOrphanedScans(0);

  await db
    .update(discoveredPages)
    .set({ status: "discovered" })
    .where(eq(discoveredPages.status, "verifying"));
}

export async function enqueueAllPagesForRefresh(cooldownHours: number = 12) {
  // Apply a 30-minute grace buffer so that 12-hour scheduled workflow runs (e.g. 8:00 & 20:00 UTC)
  // match pages scanned in the previous workflow window without failing strict boundary checks
  const effectiveCooldown = Math.max(0.5, cooldownHours > 1 ? cooldownHours - 0.5 : cooldownHours);
  const now = Date.now();
  const activeCutoff = new Date(now - effectiveCooldown * 60 * 60 * 1000);

  // Adaptive Decay Cadence for Inactive Pages to detect ad relaunches:
  // 1. VIP Watchlist inactive: checked at active cutoff rate (12h-24h)
  // 2. Fresh inactive (went dark <= 7 days ago): checked every 24h (highest probability of temporary hold/relaunch)
  // 3. Dormant inactive (went dark 8-30 days ago): checked every 72h (3 days)
  // 4. Cold inactive (>30 days dark or holdStartedAt missing): checked every 7 days (weekly to preserve proxy quota)
  const freshInactiveCutoff = new Date(now - 24 * 60 * 60 * 1000);
  const dormantInactiveCutoff = new Date(now - 72 * 60 * 60 * 1000);
  const coldInactiveCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // Find pages that either have never been checked, or were last checked before their respective cutoff
  const pagesToRefresh = cooldownHours > 0
    ? await db.query.trackedPages.findMany({
      where: (pages, { or, and, isNull, lt, gt, lte, ne, eq }) =>
        or(
          // Active or on_hold pages: standard cooldown (default 12h) or explicitly pending
          and(
            or(isNull(pages.holdStatus), ne(pages.holdStatus, "inactive")),
            or(
              isNull(pages.lastChecked),
              lt(pages.lastChecked, activeCutoff),
              eq(pages.status, "pending")
            )
          ),
          // Inactive pages: adaptive recheck cadence based on how recently they went dark
          and(
            eq(pages.holdStatus, "inactive"),
            or(
              isNull(pages.lastChecked),
              // VIP Watchlist: always checked with active cutoff (12h)
              and(eq(pages.isWatchlisted, true), lt(pages.lastChecked, activeCutoff)),
              // Fresh inactive (went dark <= 7 days ago): checked every 24h
              and(
                gt(pages.holdStartedAt, sevenDaysAgo),
                lt(pages.lastChecked, freshInactiveCutoff)
              ),
              // Dormant inactive (went dark 8-30 days ago): checked every 72h
              and(
                lte(pages.holdStartedAt, sevenDaysAgo),
                gt(pages.holdStartedAt, thirtyDaysAgo),
                lt(pages.lastChecked, dormantInactiveCutoff)
              ),
              // Cold inactive (>30 days dark or holdStartedAt missing): checked every 7 days
              and(
                or(isNull(pages.holdStartedAt), lte(pages.holdStartedAt, thirtyDaysAgo)),
                lt(pages.lastChecked, coldInactiveCutoff)
              )
            )
          )
        ),
      columns: { id: true, holdStatus: true },
    })
    : await db.query.trackedPages.findMany({
      columns: { id: true, holdStatus: true },
    });

  if (pagesToRefresh.length === 0) {
    console.log(
      `[Enqueue Refresh] No tracked pages due for refresh (active < ${cooldownHours}h, inactive < 72h).`
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
      priority: 1,
    }));

  if (newJobs.length > 0) {
    await db.insert(queue).values(newJobs);
  }

  console.log(
    `[Enqueue Refresh] Enqueued ${newJobs.length} page(s) for refresh (cooldown: ${cooldownHours}h).`
  );
  return newJobs.length;
}

/**
 * Enqueue a job or escalate priority if already pending to prevent duplicate queue rows
 */
export async function enqueueOrEscalateJob(
  trackedPageId: string,
  jobType: "count" | "creative" = "count",
  priority: number = 1,
  creativeScanId?: string | null
) {
  const existingJob = await db.query.queue.findFirst({
    where: (q, { and, eq, inArray }) =>
      and(
        eq(q.trackedPageId, trackedPageId),
        eq(q.jobType, jobType),
        inArray(q.status, ["pending", "running"])
      ),
  });

  if (existingJob) {
    if (existingJob.status === "pending" && existingJob.priority < priority) {
      await db
        .update(queue)
        .set({ priority })
        .where(eq(queue.id, existingJob.id));
    }
    return { job: existingJob, isNew: false };
  }

  let effectiveScanId = creativeScanId || null;
  if (jobType === "creative" && !effectiveScanId) {
    const [newScan] = await db
      .insert(creativeScans)
      .values({
        trackedPageId,
        status: "pending",
        configSnapshot: JSON.stringify({
          runner: "local",
          maxScrolls: 15,
          timeoutMs: 25000,
        }),
      })
      .returning();
    effectiveScanId = newScan.id;
  }

  const [newJob] = await db
    .insert(queue)
    .values({
      trackedPageId,
      jobType,
      priority,
      status: "pending",
      creativeScanId: effectiveScanId,
    })
    .returning();

  return { job: newJob, isNew: true };
}

/**
 * Atomically claim the next pending queue job using PostgreSQL FOR UPDATE SKIP LOCKED
 */
export async function claimNextPendingJob() {
  const isCountOnly =
    process.env.COUNT_ONLY === "true" ||
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true";
  const isCreativeOnly = process.env.CREATIVE_ONLY === "true";

  const jobTypeFilter = isCountOnly
    ? sql`AND job_type IN ('count', 'discovery_count')`
    : isCreativeOnly
    ? sql`AND job_type = 'creative'`
    : sql``;

  const result = await db.execute(sql`
    UPDATE queue
    SET 
      status = 'running',
      started_at = NOW(),
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM queue
      WHERE status = 'pending'
      ${jobTypeFilter}
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *;
  `);

  const claimedRows = (Array.isArray(result) ? result : (result as any)?.rows || []) as any[];
  if (!claimedRows || claimedRows.length === 0) return null;
  const jobRow = claimedRows[0];

  const job = {
    id: String(jobRow.id),
    trackedPageId: jobRow.tracked_page_id ? String(jobRow.tracked_page_id) : null,
    discoveredPageId: jobRow.discovered_page_id ? String(jobRow.discovered_page_id) : null,
    jobType: String(jobRow.job_type || "count"),
    priority: Number(jobRow.priority || 1),
    creativeScanId: jobRow.creative_scan_id ? String(jobRow.creative_scan_id) : null,
    status: String(jobRow.status),
    attempts: Number(jobRow.attempts || 1),
    failureReason: jobRow.failure_reason ? String(jobRow.failure_reason) : null,
    workspaceId: jobRow.workspace_id ? String(jobRow.workspace_id) : null,
    createdAt: jobRow.created_at ? new Date(jobRow.created_at) : null,
    startedAt: jobRow.started_at ? new Date(jobRow.started_at) : null,
    finishedAt: jobRow.finished_at ? new Date(jobRow.finished_at) : null,
  };

  let page = null;
  if (job.trackedPageId) {
    page = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, job.trackedPageId),
    });
  }

  let discoveredPage = null;
  if (job.discoveredPageId) {
    discoveredPage = await db.query.discoveredPages.findFirst({
      where: eq(discoveredPages.id, job.discoveredPageId),
    });
  }

  if (job.jobType !== "product_scrape" && !page && !discoveredPage) return null;

  let creativeScanRecord = null;
  if (job.jobType === "creative") {
    let scanId = job.creativeScanId;
    if (!scanId && job.trackedPageId) {
      const [newScan] = await db
        .insert(creativeScans)
        .values({
          trackedPageId: job.trackedPageId,
          status: "running",
          startedAt: new Date(),
          configSnapshot: JSON.stringify({
            runner: "local",
            maxScrolls: 15,
            timeoutMs: 25000,
          }),
        })
        .returning();
      scanId = newScan.id;
      await db.update(queue).set({ creativeScanId: scanId }).where(eq(queue.id, job.id));
      creativeScanRecord = newScan;
    } else if (scanId) {
      await db
        .update(creativeScans)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(creativeScans.id, scanId));

      creativeScanRecord = await db.query.creativeScans.findFirst({
        where: eq(creativeScans.id, scanId),
      });
    }

    if (job.trackedPageId) {
      await db
        .update(trackedPages)
        .set({ status: "scanning", updatedAt: new Date() })
        .where(eq(trackedPages.id, job.trackedPageId));
    }
  } else if (job.jobType === "count" && job.trackedPageId) {
    await db
      .update(trackedPages)
      .set({ status: "scanning", updatedAt: new Date() })
      .where(eq(trackedPages.id, job.trackedPageId));
  } else if (job.jobType === "product_scrape") {
    // Product landing page extraction should NEVER mark the brand page as "scanning"
  } else if (job.discoveredPageId) {
    await db
      .update(discoveredPages)
      .set({ status: "verifying", updatedAt: new Date() })
      .where(eq(discoveredPages.id, job.discoveredPageId));
  }

  return {
    queueJob: job,
    trackedPage: page,
    discoveredPage,
    creativeScan: creativeScanRecord,
  };
}

export async function getNextPendingJob() {
  return claimNextPendingJob();
}

export async function markJobRunning(
  queueId: string,
  pageId?: string | null,
  creativeScanId?: string | null,
  discoveredPageId?: string | null,
  jobType?: string | null
) {
  const now = new Date();
  if (isUuid(queueId)) {
    await db
      .update(queue)
      .set({
        status: "running",
        startedAt: now,
      })
      .where(eq(queue.id, queueId));
  }

  if (creativeScanId) {
    await db
      .update(creativeScans)
      .set({
        status: "running",
        startedAt: now,
      })
      .where(eq(creativeScans.id, creativeScanId));
  } else if (pageId && jobType !== "product_scrape") {
    await db
      .update(trackedPages)
      .set({ status: "scanning", updatedAt: now })
      .where(eq(trackedPages.id, pageId));
  } else if (discoveredPageId) {
    await db
      .update(discoveredPages)
      .set({ status: "verifying", updatedAt: now })
      .where(eq(discoveredPages.id, discoveredPageId));
  }
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
    creativeScannedAt: null,
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

  // 3. Reset matching discovered_pages status from verifying back to discovered
  await db
    .update(discoveredPages)
    .set({
      status: "discovered",
      updatedAt: now,
    })
    .where(eq(discoveredPages.trackedPageId, pageId));

  // 4. Mark queue job failed
  await db
    .update(queue)
    .set({
      status: "failed",
      failureReason: reason,
      finishedAt: now,
    })
    .where(eq(queue.id, queueId));
}
