import { db } from "../../db";
import {
  trackedPages,
  scanHistory,
  queue,
  creativeScans,
  discoveryRuns,
  discoveredPages,
} from "../../db/schema";
import { and, inArray, desc, sql } from "drizzle-orm";

export async function enqueuePagesForCreativeScan(
  cooldownDays: number = 3,
  maxPages: number = 25,
  minDifferenceThreshold: number = 1
) {
  const cutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);

  const allPages = await db.query.trackedPages.findMany({
    columns: {
      id: true,
      status: true,
      holdStatus: true,
      searchType: true,
      pageId: true,
      lastCreativeScan: true,
      currentResults: true,
      autoCreativeScan: true,
      workspaceId: true,
    },
  });

  // --- Collect eligible pages with their ad count and workspace for fair multi-workspace scheduling ---
  const eligiblePages: { id: string; currentResults: number; workspaceId: string | null }[] = [];

  // Batch-fetch latest scanHistory differences to eliminate N+1 loop queries
  const pagesNeedingHistory = allPages.filter((p) => {
    if (p.status !== "success" || p.autoCreativeScan === false) return false;
    if (p.holdStatus === "on_hold" || p.holdStatus === "inactive") return false;
    if (!p.pageId || p.searchType === "keyword_exact_phrase") return false;
    if (p.lastCreativeScan && p.lastCreativeScan > cutoff) return false;
    return !!p.lastCreativeScan; // Only pages requiring subsequent history check
  });

  const latestDifferenceMap = new Map<string, number>();
  if (pagesNeedingHistory.length > 0) {
    const pageIds = pagesNeedingHistory.map((p) => p.id);
    const rows = await db
      .selectDistinctOn([scanHistory.trackedPageId], {
        tracked_page_id: scanHistory.trackedPageId,
        difference: scanHistory.difference,
      })
      .from(scanHistory)
      .where(
        and(
          inArray(scanHistory.trackedPageId, pageIds),
          sql`${scanHistory.checkedAt} >= NOW() - INTERVAL '30 days'`
        )
      )
      .orderBy(scanHistory.trackedPageId, desc(scanHistory.checkedAt));

    for (const r of rows) {
      latestDifferenceMap.set(String(r.tracked_page_id), Number(r.difference || 0));
    }
  }

  for (const page of allPages) {
    // 1. MUST be a verified successful count scan (not 'pending', 'scanning', or 'failed')
    if (page.status !== "success") {
      continue;
    }

    // 1b. Skip pages where user explicitly paused automatic creative scanning
    if (page.autoCreativeScan === false) {
      continue;
    }

    // 1c. Skip pages that are currently on hold or inactive (paused)
    if (page.holdStatus === "on_hold" || page.holdStatus === "inactive") {
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
        eligiblePages.push({ id: page.id, currentResults: page.currentResults || 0, workspaceId: page.workspaceId });
      }
    } else {
      // Subsequent scan: strictly requires latest scanHistory difference >= minDifferenceThreshold (new ads added)
      const threshold = Math.max(1, minDifferenceThreshold);
      const diff = latestDifferenceMap.get(page.id) ?? 0;

      if (diff >= threshold) {
        eligiblePages.push({ id: page.id, currentResults: page.currentResults || 0, workspaceId: page.workspaceId });
      }
    }
  }

  if (eligiblePages.length === 0) {
    console.log(
      `[Enqueue Spy] No eligible pages found for Ad Spy creative scan (difference < +${minDifferenceThreshold} or cooldown active).`
    );
    return 0;
  }

  // --- Fair Multi-Workspace Scheduling (Round-Robin Partitioning) ---
  // Guarantees all active workspaces (e.g. Morocco alongside Tunisia) get fair allocation
  const wsPartitions = new Map<string, typeof eligiblePages>();
  for (const p of eligiblePages) {
    const key = p.workspaceId || "unassigned";
    if (!wsPartitions.has(key)) wsPartitions.set(key, []);
    wsPartitions.get(key)!.push(p);
  }

  for (const [_, list] of wsPartitions) {
    // Prioritize small pages (< 20 ads) because cloud Apify only scans >= 20 ads;
    // small pages rely exclusively on the local Playwright worker!
    list.sort((a, b) => {
      const aIsSmall = (a.currentResults || 0) < 20;
      const bIsSmall = (b.currentResults || 0) < 20;
      if (aIsSmall && !bIsSmall) return -1;
      if (!aIsSmall && bIsSmall) return 1;
      return b.currentResults - a.currentResults;
    });
  }

  const batch: typeof eligiblePages = [];
  const wsQueues = Array.from(wsPartitions.values());
  let addedAny = true;
  while (batch.length < maxPages && addedAny) {
    addedAny = false;
    for (const q of wsQueues) {
      if (q.length > 0 && batch.length < maxPages) {
        batch.push(q.shift()!);
        addedAny = true;
      }
    }
  }

  const skipped = eligiblePages.length - batch.length;

  console.log(
    `[Enqueue Spy] ${eligiblePages.length} eligible page(s) across ${wsPartitions.size} workspace(s). Enqueuing top ${batch.length} (cap: ${maxPages}${skipped > 0 ? `, ${skipped} deferred to next round` : ""}).`
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
  country: string = "ALL",
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
            `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${cleanId}&search_type=page&media_type=all`
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
