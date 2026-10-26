import { db } from "@/db";
import { creativeScans, trackedPages } from "@/db/schema";
import { eq, inArray, desc, and, or, lt, isNull } from "drizzle-orm";
import { getApifyTokens, fetchApifyDatasetItems } from "@/lib/apify";
import { ingestApifyDatasetItems } from "@/lib/apify-ingest";

async function resetTrackedPageFromScan(creativeScanId: string) {
  try {
    const scan = await db.query.creativeScans.findFirst({
      where: eq(creativeScans.id, creativeScanId),
    });
    if (scan?.trackedPageId) {
      const page = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.id, scan.trackedPageId),
      });
      if (page && (page.status === "scanning" || page.status === "pending")) {
        await db
          .update(trackedPages)
          .set({
            status: "success",
            lastSuccessAt: page.lastSuccessAt || new Date(),
            updatedAt: new Date(),
          })
          .where(eq(trackedPages.id, scan.trackedPageId));
      }
    }
  } catch (err) {
    console.error("[Apify Sync] Error resetting tracked page status:", err);
  }
}

const APIFY_BASE_URL = "https://api.apify.com/v2";

interface ApifyRunDetails {
  id: string;
  status: string; // SUCCEEDED | FAILED | ABORTED | TIMED-OUT | RUNNING | READY
  defaultDatasetId: string;
  finishedAt?: string;
  exitCode?: number;
}

let isSyncing = false;

/**
 * Queries Apify REST API for current status of a run ID using configured tokens.
 */
export async function getApifyRunStatus(runId: string): Promise<ApifyRunDetails | null> {
  const tokens = getApifyTokens();
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    try {
      const res = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}?token=${token}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.data;
        return {
          id: data.id,
          status: data.status,
          defaultDatasetId: data.defaultDatasetId,
          finishedAt: data.finishedAt,
          exitCode: data.exitCode,
        };
      }
    } catch (error) {
      console.error(`[Apify Sync] Error checking run status for ${runId}:`, error);
    }
  }

  return null;
}

/**
 * Checks all creative_scans records currently marked as "running" that were launched with Apify.
 * If Apify actor run has completed, ingests dataset items into ads and ad_observations tables.
 */
export async function syncApifyRuns(): Promise<{ syncedCount: number; checkedCount: number }> {
  if (isSyncing) {
    return { syncedCount: 0, checkedCount: 0 };
  }

  isSyncing = true;
  let syncedCount = 0;

  try {
    const runningScans = await db.query.creativeScans.findMany({
      where: inArray(creativeScans.status, ["running", "ingesting"]),
      orderBy: [desc(creativeScans.createdAt)],
      limit: 50,
    });

    const apifyScans = runningScans.filter((scan) => {
      if (!scan.configSnapshot) return false;
      try {
        const config = JSON.parse(scan.configSnapshot);
        return config.runner === "apify" || Boolean(config.apifyRunId);
      } catch {
        return false;
      }
    });

    if (apifyScans.length === 0) {
      return { syncedCount: 0, checkedCount: 0 };
    }

    console.log(`[Apify Sync] Checking status of ${apifyScans.length} active Apify cloud scan(s)...`);

    for (const scan of apifyScans) {
      let config: any = {};
      try {
        config = JSON.parse(scan.configSnapshot || "{}");
      } catch {}

      const runId = config.apifyRunId;
      let datasetId = config.defaultDatasetId;

      if (!runId && !datasetId) continue;

      let runDetails: ApifyRunDetails | null = null;
      if (runId) {
        runDetails = await getApifyRunStatus(runId);
      }

      const status = runDetails?.status || "RUNNING";
      if (status === "SUCCEEDED" && datasetId) {
        // Atomic claim: only proceed if scan is still 'running' or stalled 'ingesting' (> 2m ago)
        const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
        const [claimed] = await db
          .update(creativeScans)
          .set({ status: "ingesting", outcomeDetails: "Ingesting Apify dataset items...", startedAt: new Date() })
          .where(
            and(
              eq(creativeScans.id, scan.id),
              or(
                eq(creativeScans.status, "running"),
                and(
                  eq(creativeScans.status, "ingesting"),
                  or(
                    isNull(creativeScans.startedAt),
                    lt(creativeScans.startedAt, twoMinsAgo)
                  )
                )
              )
            )
          )
          .returning();

        if (!claimed) {
          console.log(`[Apify Sync] Scan ${scan.id} is already being processed by another worker. Skipping.`);
          continue;
        }

        try {
          console.log(`[Apify Sync] Scan ${scan.id} finished on Apify! Fetching dataset ${datasetId}...`);
          const items = await fetchApifyDatasetItems(datasetId);
          await ingestApifyDatasetItems(scan.id, items);
          syncedCount++;
        } catch (ingestErr: any) {
          console.error(`[Apify Sync] Ingest error for scan ${scan.id}:`, ingestErr);
          await db
            .update(creativeScans)
            .set({
              status: "failed",
              failureReason: "ingest_error",
              outcomeDetails: `Failed during dataset ingestion: ${ingestErr?.message || ingestErr}`,
              finishedAt: new Date(),
            })
            .where(eq(creativeScans.id, scan.id));
          await resetTrackedPageFromScan(scan.id);
        }
      } else if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        console.warn(`[Apify Sync] Scan ${scan.id} failed on Apify with status ${status}.`);
        await db
          .update(creativeScans)
          .set({
            status: "failed",
            failureReason: `apify_${status.toLowerCase()}`,
            outcomeDetails: `Apify run status: ${status}`,
            finishedAt: new Date(),
          })
          .where(eq(creativeScans.id, scan.id));
        await resetTrackedPageFromScan(scan.id);

        const { createNotification } = await import("@/lib/notifications");
        await createNotification({
          type: "system_alert",
          title: "Ad Fetch Incomplete",
          message: "Could not download newest ads. Will retry automatically.",
          severity: "error",
          trackedPageId: scan.trackedPageId,
        });

        syncedCount++;
      }
    }

    return { syncedCount, checkedCount: apifyScans.length };
  } catch (error) {
    console.error("[Apify Sync] Ingestion sync error:", error);
    return { syncedCount, checkedCount: 0 };
  } finally {
    isSyncing = false;
  }
}

/**
 * Polls an Apify run asynchronously in the background until it completes, then ingests dataset.
 * Designed for local development where public webhooks cannot reach localhost.
 * Returns a Promise that resolves to true if succeeded, false if failed/timed-out.
 */
export function pollApifyRunUntilDone(
  creativeScanId: string,
  runId: string,
  defaultDatasetId?: string,
  maxAttempts: number = 60, // 60 * 5s = 5 minutes max
  intervalMs: number = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;

    const timer = setInterval(async () => {
      attempts++;
      try {
        const details = await getApifyRunStatus(runId);
        const status = details?.status;
        const targetDatasetId = details?.defaultDatasetId || defaultDatasetId;

        if (status === "SUCCEEDED" && targetDatasetId) {
          clearInterval(timer);

          // Atomic claim: only proceed if scan is still in status 'running'
          const [claimed] = await db
            .update(creativeScans)
            .set({ status: "ingesting", outcomeDetails: "Ingesting Apify dataset items..." })
            .where(and(eq(creativeScans.id, creativeScanId), eq(creativeScans.status, "running")))
            .returning();

          if (!claimed) {
            console.log(`[Apify Poller] Scan ${creativeScanId} is already being ingested by sync worker. Skipping.`);
            resolve(true);
            return;
          }

          console.log(`[Apify Poller] ⚡ Run ${runId} SUCCEEDED on attempt #${attempts}! Ingesting dataset ${targetDatasetId}...`);
          try {
            const items = await fetchApifyDatasetItems(targetDatasetId);
            await ingestApifyDatasetItems(creativeScanId, items);
            resolve(true);
          } catch (ingestErr: any) {
            console.error(`[Apify Poller] Ingest error for run ${runId}:`, ingestErr);
            await db
              .update(creativeScans)
              .set({
                status: "failed",
                failureReason: "ingest_error",
                outcomeDetails: `Failed during dataset ingestion: ${ingestErr?.message || ingestErr}`,
                finishedAt: new Date(),
              })
              .where(eq(creativeScans.id, creativeScanId));
            await resetTrackedPageFromScan(creativeScanId);
            resolve(false);
          }
          return;
        }

        if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
          clearInterval(timer);
          console.warn(`[Apify Poller] Run ${runId} ${status} on attempt #${attempts}.`);
          const scan = await db.query.creativeScans.findFirst({
            where: eq(creativeScans.id, creativeScanId),
          });
          const actualTrackedPageId = scan?.trackedPageId || null;

          await db
            .update(creativeScans)
            .set({
              status: "failed",
              failureReason: `apify_${status.toLowerCase()}`,
              outcomeDetails: `Apify run status: ${status}`,
              finishedAt: new Date(),
            })
            .where(eq(creativeScans.id, creativeScanId));
          await resetTrackedPageFromScan(creativeScanId);

          const { createNotification } = await import("@/lib/notifications");
          await createNotification({
            type: "system_alert",
            title: "Ad Fetch Incomplete",
            message: "Could not download newest ads. Will retry automatically.",
            severity: "error",
            trackedPageId: actualTrackedPageId,
            actionUrl: actualTrackedPageId ? `/spy?trackedPageId=${actualTrackedPageId}` : "/spy",
          });
          resolve(false);
          return;
        }

        if (attempts >= maxAttempts) {
          clearInterval(timer);
          console.log(`[Apify Poller] Reached max polling attempts (${maxAttempts}) for run ${runId}.`);
          const scan = await db.query.creativeScans.findFirst({
            where: eq(creativeScans.id, creativeScanId),
          });
          const actualTrackedPageId = scan?.trackedPageId || null;

          await db
            .update(creativeScans)
            .set({
              status: "failed",
              failureReason: "poll_timeout",
              outcomeDetails: `Polling exceeded ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s)`,
              finishedAt: new Date(),
            })
            .where(eq(creativeScans.id, creativeScanId));
          await resetTrackedPageFromScan(creativeScanId);

          const { createNotification } = await import("@/lib/notifications");
          await createNotification({
            type: "system_alert",
            title: "Ad Fetch Taking Longer",
            message: "Ad download is still processing and will finalize shortly.",
            severity: "warning",
            trackedPageId: actualTrackedPageId,
            actionUrl: actualTrackedPageId ? `/spy?trackedPageId=${actualTrackedPageId}` : "/spy",
          });
          resolve(false);
        }
      } catch (err) {
        console.error(`[Apify Poller] Error on attempt #${attempts}:`, err);
      }
    }, intervalMs);
  });
}
