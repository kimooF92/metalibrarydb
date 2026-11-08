import { db } from "../../db";
import { discoveryRuns, discoveredPages, queue } from "../../db/schema";
import { eq, sql } from "drizzle-orm";

function isUuid(id?: string | null): boolean {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
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

  if (isUuid(queueId)) {
    await db
      .update(queue)
      .set({
        status: "completed",
        finishedAt: now,
      })
      .where(eq(queue.id, queueId));
  }
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

/**
 * Atomically claims the next pending country discovery run using PostgreSQL FOR UPDATE SKIP LOCKED
 */
export async function claimNextPendingDiscoveryRun() {
  const result = await db.execute(sql`
    UPDATE discovery_runs
    SET status = 'running', started_at = NOW()
    WHERE id = (
      SELECT id FROM discovery_runs
      WHERE status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM discovery_runs
          WHERE status = 'running'
            AND (started_at IS NULL OR started_at >= NOW() - INTERVAL '45 minutes')
        )
      ORDER BY created_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *;
  `);

  const claimedRows = (Array.isArray(result) ? result : (result as any)?.rows || []) as any[];
  if (!claimedRows || claimedRows.length === 0) return null;
  const row = claimedRows[0];

  return {
    id: String(row.id),
    country: String(row.country || "TN"),
    searchUrl: String(row.search_url || row.searchUrl || ""),
    query: row.query ? String(row.query) : null,
    startDateMin: row.start_date_min ? new Date(row.start_date_min) : null,
    startDateMax: row.start_date_max ? new Date(row.start_date_max) : null,
    targetMaxAds: row.target_max_ads ? Number(row.target_max_ads) : null,
    maxScrolls: row.max_scrolls ? Number(row.max_scrolls) : null,
    status: String(row.status || "running"),
    outcomeDetails: row.outcome_details ? String(row.outcome_details) : null,
  };
}
