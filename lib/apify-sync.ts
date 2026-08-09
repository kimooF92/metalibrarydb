import { db } from "@/db";
import { creativeScans } from "@/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { getApifyTokens, fetchApifyDatasetItems } from "@/lib/apify";
import { ingestApifyDatasetItems } from "@/lib/apify-ingest";

const APIFY_BASE_URL = "https://api.apify.com/v2";

interface ApifyRunDetails {
  id: string;
  status: string; // SUCCEEDED | FAILED | ABORTED | TIMED-OUT | RUNNING | READY
  defaultDatasetId: string;
  finishedAt?: string;
  exitCode?: number;
}

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
  let syncedCount = 0;

  try {
    const runningScans = await db.query.creativeScans.findMany({
      where: eq(creativeScans.status, "running"),
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
      datasetId = runDetails?.defaultDatasetId || datasetId;

      if (status === "SUCCEEDED" && datasetId) {
        console.log(`[Apify Sync] Scan ${scan.id} finished on Apify! Fetching dataset ${datasetId}...`);
        const items = await fetchApifyDatasetItems(datasetId);
        await ingestApifyDatasetItems(scan.id, items);
        syncedCount++;
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
        syncedCount++;
      }
    }

    return { syncedCount, checkedCount: apifyScans.length };
  } catch (error) {
    console.error("[Apify Sync] Ingestion sync error:", error);
    return { syncedCount, checkedCount: 0 };
  }
}

/**
 * Polls an Apify run asynchronously in the background until it completes, then ingests dataset.
 * Designed for local development where public webhooks cannot reach localhost.
 */
export function pollApifyRunUntilDone(
  creativeScanId: string,
  runId: string,
  defaultDatasetId?: string,
  maxAttempts: number = 24, // 24 * 5s = 2 minutes max
  intervalMs: number = 5000
) {
  let attempts = 0;

  const timer = setInterval(async () => {
    attempts++;
    try {
      const details = await getApifyRunStatus(runId);
      const status = details?.status;
      const targetDatasetId = details?.defaultDatasetId || defaultDatasetId;

      if (status === "SUCCEEDED" && targetDatasetId) {
        clearInterval(timer);
        console.log(`[Apify Poller] ⚡ Run ${runId} SUCCEEDED on attempt #${attempts}! Ingesting dataset ${targetDatasetId}...`);
        const items = await fetchApifyDatasetItems(targetDatasetId);
        await ingestApifyDatasetItems(creativeScanId, items);
        return;
      }

      if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        clearInterval(timer);
        console.warn(`[Apify Poller] Run ${runId} ${status} on attempt #${attempts}.`);
        await db
          .update(creativeScans)
          .set({
            status: "failed",
            failureReason: `apify_${status.toLowerCase()}`,
            outcomeDetails: `Apify run status: ${status}`,
            finishedAt: new Date(),
          })
          .where(eq(creativeScans.id, creativeScanId));
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
        console.log(`[Apify Poller] Reached max polling attempts (${maxAttempts}) for run ${runId}. Sync will catch up on next feed refresh.`);
      }
    } catch (err) {
      console.error(`[Apify Poller] Error on attempt #${attempts}:`, err);
    }
  }, intervalMs);
}
