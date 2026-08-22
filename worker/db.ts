import { db } from "../db";
import { trackedPages, queue, scanHistory, workerState, creativeScans, discoveredPages, discoveryRuns } from "../db/schema";
import { eq, asc, desc, sql, inArray } from "drizzle-orm";

export async function resetStuckJobs() {
  await db
    .update(queue)
    .set({ status: "pending" })
    .where(eq(queue.status, "running"));

  await db
    .update(trackedPages)
    .set({ status: "failed" })
    .where(eq(trackedPages.status, "scanning"));

  await db
    .update(discoveredPages)
    .set({ status: "discovered" })
    .where(eq(discoveredPages.status, "verifying"));
}

export async function enqueueAllPagesForRefresh(cooldownHours: number = 12) {
  // Apply a 30-minute grace buffer so that 12-hour scheduled workflow runs (e.g. 8:00 & 20:00 UTC)
  // match pages scanned in the previous workflow window without failing strict boundary checks
  const effectiveCooldown = Math.max(0.5, cooldownHours > 1 ? cooldownHours - 0.5 : cooldownHours);
  const cutoff = new Date(Date.now() - effectiveCooldown * 60 * 60 * 1000);

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

export async function enqueuePagesForCreativeScan(
  cooldownDays: number = 3,
  maxPages: number = 25
) {
  const cutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);

  const allPages = await db.query.trackedPages.findMany({
    columns: {
      id: true,
      status: true,
      searchType: true,
      pageId: true,
      lastCreativeScan: true,
      currentResults: true,
    },
  });

  // --- Option A+B: Collect eligible pages with their ad count for priority sorting ---
  const eligiblePages: { id: string; currentResults: number }[] = [];

  for (const page of allPages) {
    // 1. MUST be a verified successful count scan (not 'pending', 'scanning', or 'failed')
    if (page.status !== "success") {
      continue;
    }

    // 2. MUST have a resolved Meta Page ID (not unverified domain/keyword search)
    if (!page.pageId || page.searchType === "keyword_exact_phrase") {
      continue;
    }

    // 3. Respect cooldown window
    if (page.lastCreativeScan && page.lastCreativeScan > cutoff) {
      continue;
    }

    const isFirstTimeCreativeScan = !page.lastCreativeScan;

    if (isFirstTimeCreativeScan) {
      // First-time creative scan: requires currentResults >= 1
      if ((page.currentResults || 0) >= 1) {
        eligiblePages.push({ id: page.id, currentResults: page.currentResults || 0 });
      }
    } else {
      // Subsequent scan: requires latest scanHistory difference >= 1 (new ads added)
      const latestHistory = await db.query.scanHistory.findFirst({
        where: eq(scanHistory.trackedPageId, page.id),
        orderBy: [sql`${scanHistory.checkedAt} desc`],
      });

      if (latestHistory && (latestHistory.difference || 0) >= 1) {
        eligiblePages.push({ id: page.id, currentResults: page.currentResults || 0 });
      }
    }
  }

  if (eligiblePages.length === 0) {
    console.log(
      `[Enqueue Spy] No eligible pages found for Ad Spy creative scan (difference < +1 or cooldown active).`
    );
    return 0;
  }

  // Option B: Sort by highest active ad count first (most active advertisers get priority)
  eligiblePages.sort((a, b) => b.currentResults - a.currentResults);

  // Option A: Cap at maxPages to stay within GitHub Actions 60-min timeout
  const batch = eligiblePages.slice(0, maxPages);
  const skipped = eligiblePages.length - batch.length;

  console.log(
    `[Enqueue Spy] ${eligiblePages.length} eligible page(s) found. Enqueuing top ${batch.length} by ad count (cap: ${maxPages}${skipped > 0 ? `, ${skipped} deferred to next round` : ""
    }).`
  );

  let enqueuedCount = 0;

  for (const { id: pageId } of batch) {
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
      priority: 1,
    });

    enqueuedCount++;
  }

  console.log(`[Enqueue Spy] Enqueued ${enqueuedCount} page(s) for Ad Spy creative scan.`);
  return enqueuedCount;
}

/**
 * Saves extracted Page IDs into discovery_runs and discovered_pages tables so they appear on Discovery UI
 */
export async function saveExtractedPageIdsToDiscovery(
  pageIds: string[],
  searchUrl: string,
  country: string = "TN",
  parentTrackedPageId?: string | null
) {
  if (!pageIds || pageIds.length === 0) return [];

  const now = new Date();

  // 1. Create a discovery run record for this inline extraction
  const [runRecord] = await db
    .insert(discoveryRuns)
    .values({
      country,
      searchUrl,
      query: searchUrl,
      status: "completed",
      totalAdsScanned: pageIds.length,
      totalPagesDiscovered: pageIds.length,
      outcomeDetails: `Inline page extraction from: ${searchUrl}`,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
    })
    .returning();

  const savedDiscovered: any[] = [];

  for (const pageId of pageIds) {
    const cleanId = pageId.trim();
    if (!cleanId || cleanId === "0") continue;

    // Check if page is already tracked
    const existingTracked = await db.query.trackedPages.findFirst({
      where: (tp, { or, eq }) =>
        or(
          eq(tp.pageId, cleanId),
          eq(
            tp.url,
            `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${cleanId}&search_type=page&media_type=all`
          )
        ),
    });

    const status = existingTracked ? "imported" : "discovered";
    const trackedPageId = existingTracked?.id || parentTrackedPageId || null;

    const [saved] = await db
      .insert(discoveredPages)
      .values({
        runId: runRecord.id,
        pageId: cleanId,
        displayName: existingTracked?.displayName || `Page ${cleanId}`,
        country,
        matchingAdCount: 1,
        status,
        trackedPageId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (saved) savedDiscovered.push(saved);
  }

  return savedDiscovered;
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

/**
 * Enqueue a job or escalate priority if already pending to prevent duplicate queue rows
 */
export async function enqueueOrEscalateJob(
  trackedPageId: string,
  jobType: "count" | "creative" = "count",
  priority: number = 1
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

  const [newJob] = await db
    .insert(queue)
    .values({
      trackedPageId,
      jobType,
      priority,
      status: "pending",
    })
    .returning();

  return { job: newJob, isNew: true };
}

/**
 * Atomically claim the next pending queue job using PostgreSQL FOR UPDATE SKIP LOCKED
 */
export async function claimNextPendingJob() {
  const result = await db.execute(sql`
    UPDATE queue
    SET 
      status = 'running',
      started_at = NOW(),
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM queue
      WHERE status = 'pending'
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

  if (!page && !discoveredPage) return null;

  let creativeScanRecord = null;
  if (job.jobType === "creative" && job.creativeScanId) {
    await db
      .update(creativeScans)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(creativeScans.id, job.creativeScanId));

    creativeScanRecord = await db.query.creativeScans.findFirst({
      where: eq(creativeScans.id, job.creativeScanId),
    });
  } else if (job.trackedPageId) {
    await db
      .update(trackedPages)
      .set({ status: "scanning", updatedAt: new Date() })
      .where(eq(trackedPages.id, job.trackedPageId));
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
  discoveredPageId?: string | null
) {
  // Retained for backward compatibility if called directly
  const now = new Date();
  await db
    .update(queue)
    .set({
      status: "running",
      startedAt: now,
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
  } else if (pageId) {
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

  // Update matching discovered_pages record with verified count & reset status from verifying to discovered
  await db
    .update(discoveredPages)
    .set({
      verifiedAdCount: results,
      status: "discovered",
      updatedAt: now,
    })
    .where(eq(discoveredPages.trackedPageId, pageId));

  // 4. Mark queue job completed
  await db
    .update(queue)
    .set({
      status: "completed",
      finishedAt: now,
    })
    .where(eq(queue.id, queueId));

  // 4b. Log in-app activity notification for count check
  try {
    const trackedPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, pageId),
      columns: { displayName: true, url: true },
    });
    const { logCountScanNotification } = await import("../lib/notifications");
    await logCountScanNotification({
      trackedPageId: pageId,
      brandName: trackedPage?.displayName || trackedPage?.url || "Tracked Brand",
      currentResults: results,
      difference,
      status,
    });
  } catch {}

  // 5. Automatic Apify Delta Trigger: If new ads detected (difference >= 1), launch Apify Cloud scan in background
  if (status === "success" && difference !== null && difference >= 1) {
    tryAutoTriggerApifyDeltaScan(pageId, difference).catch((err) => {
      console.error("[Apify Auto-Trigger] Error launching background delta scan:", err);
    });
  }
}

/**
 * Automatically triggers an Apify Delta Cloud scan when a positive ad count difference is detected.
 * Uses formula: Limit = Delta + max(3, ceil(Delta * 0.2)) and respects 24h cooldown per page.
 */
export async function tryAutoTriggerApifyDeltaScan(pageId: string, difference: number) {
  if (difference < 1) return;

  const page = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, pageId),
  });

  if (!page || !page.url) return;

  // Enforce 24-hour cooldown window to prevent redundant credit usage
  const cooldownCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (page.lastCreativeScan && page.lastCreativeScan > cooldownCutoff) {
    console.log(
      `[Apify Auto-Trigger] Skipping "${page.displayName || pageId}": creative scan performed within 24h cooldown.`
    );
    return;
  }

  // Check if a creative scan is already pending/running
  const existingJob = await db.query.creativeScans.findFirst({
    where: (cs, { and, eq, inArray }) =>
      and(
        eq(cs.trackedPageId, pageId),
        inArray(cs.status, ["pending", "running"])
      ),
  });

  if (existingJob) {
    console.log(
      `[Apify Auto-Trigger] Skipping "${page.displayName || pageId}": creative scan already in progress.`
    );
    return;
  }

  try {
    const { startApifyDeltaScan, calculateDeltaLimit } = await import("../lib/apify");
    const maxResults = calculateDeltaLimit(difference);

    const [newScan] = await db
      .insert(creativeScans)
      .values({
        trackedPageId: pageId,
        status: "running",
        startedAt: new Date(),
        configSnapshot: JSON.stringify({
          runner: "apify",
          autoTriggered: true,
          delta: difference,
          maxResults,
        }),
        outcomeDetails: `Auto-triggered Apify Delta Cloud run for +${difference} new ad(s) (Limit: ${maxResults})`,
      })
      .returning();

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const runRes = await startApifyDeltaScan({
      pageUrl: page.url,
      delta: difference,
      creativeScanId: newScan.id,
      webhookBaseUrl: baseUrl,
    });

    if (runRes?.id) {
      await db
        .update(creativeScans)
        .set({
          configSnapshot: JSON.stringify({
            runner: "apify",
            autoTriggered: true,
            delta: difference,
            maxResults,
            apifyRunId: runRes.id,
            defaultDatasetId: runRes.defaultDatasetId,
          }),
          outcomeDetails: `Auto-triggered Apify Delta Cloud run for +${difference} new ad(s) (Run ID: ${runRes.id})`,
        })
        .where(eq(creativeScans.id, newScan.id));

      const { pollApifyRunUntilDone } = await import("../lib/apify-sync");
      pollApifyRunUntilDone(newScan.id, runRes.id, runRes.defaultDatasetId);
    }

    console.log(
      `[Apify Auto-Trigger] ⚡ Launched Apify Delta Cloud scan for "${page.displayName || pageId}" (+${difference} new ads | limit ${maxResults} ads). Run ID: ${runRes?.id}`
    );
  } catch (err: any) {
    console.error(`[Apify Auto-Trigger] Failed to auto-launch Apify scan for "${page.displayName || pageId}":`, err);
  }
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

export async function markDiscoveryJobCompleted(
  queueId: string,
  discoveredPageId: string,
  results: number | null
) {
  const now = new Date();

  await db
    .update(discoveredPages)
    .set({
      verifiedAdCount: results,
      status: "discovered",
      updatedAt: now,
    })
    .where(eq(discoveredPages.id, discoveredPageId));

  await db
    .update(queue)
    .set({
      status: "completed",
      finishedAt: now,
    })
    .where(eq(queue.id, queueId));
}

export async function markDiscoveryJobFailed(
  queueId: string,
  discoveredPageId: string,
  reason: string
) {
  const now = new Date();

  await db
    .update(discoveredPages)
    .set({
      status: "discovered",
      updatedAt: now,
    })
    .where(eq(discoveredPages.id, discoveredPageId));

  await db
    .update(queue)
    .set({
      status: "failed",
      failureReason: reason,
      finishedAt: now,
    })
    .where(eq(queue.id, queueId));
}


