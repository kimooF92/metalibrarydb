import { db } from "@/db";
import { creativeScans, queue, trackedPages, scanHistory } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getApifyTokens } from "@/lib/apify";

export type CreativeRunnerType = "local" | "apify";

export interface DispatchCreativeScanOptions {
  trackedPageId: string;
  runner?: CreativeRunnerType;
  priority?: number;
  webhookBaseUrl?: string;
}

export interface DispatchCreativeScanResult {
  success: boolean;
  status: "apify_launched" | "enqueued" | "already_queued" | "failed";
  message: string;
  runner: CreativeRunnerType;
  creativeScanId?: string;
  runId?: string;
  isScannedToday?: boolean;
  lastCreativeScan?: Date | null;
  displayName?: string;
}

/**
 * Dispatches a creative scan for a tracked page via either Local Playwright worker
 * or Apify Cloud actor run.
 */
export async function dispatchCreativeScanForBrand(
  options: DispatchCreativeScanOptions
): Promise<DispatchCreativeScanResult> {
  const { trackedPageId, priority = 10, webhookBaseUrl } = options;
  let runner: CreativeRunnerType = options.runner || "local";

  // If apify requested, check if any tokens configured. If not, fallback to local.
  if (runner === "apify") {
    const tokens = getApifyTokens();
    if (tokens.length === 0) {
      console.warn("[CreativeScan] Apify requested but no tokens found in env. Falling back to local worker.");
      runner = "local";
    }
  }

  // 1. Fetch tracked page
  const page = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, trackedPageId),
  });

  if (!page || !page.url) {
    return {
      success: false,
      status: "failed",
      message: "Tracked page not found or missing search URL.",
      runner,
    };
  }

  const brandDisplayName = page.displayName || page.pageId || page.id;
  const lastScanDate = page.lastCreativeScan ? new Date(page.lastCreativeScan) : null;
  const isScannedToday = Boolean(
    lastScanDate && lastScanDate.toDateString() === new Date().toDateString()
  );

  // 2. Check if page already has a pending or running creative job in queue
  const existingJob = await db.query.queue.findFirst({
    where: and(
      eq(queue.trackedPageId, page.id),
      eq(queue.jobType, "creative"),
      inArray(queue.status, ["pending", "running"])
    ),
  });

  if (existingJob) {
    if (existingJob.status === "pending" && existingJob.priority < priority) {
      await db
        .update(queue)
        .set({ priority })
        .where(eq(queue.id, existingJob.id));
    }

    return {
      success: true,
      status: "already_queued",
      message: `Creative scan for "${brandDisplayName}" is already queued in progress.`,
      runner,
      displayName: brandDisplayName,
      isScannedToday,
      lastCreativeScan: page.lastCreativeScan,
    };
  }

  const isPageTarget = Boolean(
    page.searchType === "page" ||
    (page.pageId && page.pageId !== "0" && !page.pageId.includes(" "))
  );
  const isFullScan = isPageTarget;

  // 3. Apify Cloud Runner
  if (runner === "apify") {
    const latestHistory = await db.query.scanHistory.findFirst({
      where: eq(scanHistory.trackedPageId, page.id),
      orderBy: [sql`${scanHistory.checkedAt} desc`],
    });

    const delta = isPageTarget
      ? Math.max(15, Math.min(300, page.currentResults || 30))
      : Math.max(1, latestHistory?.difference || page.currentResults || 15);

    const configObj = {
      runner: "apify",
      delta,
      isFullScan,
    };

    const [newScan] = await db
      .insert(creativeScans)
      .values({
        trackedPageId: page.id,
        status: "running",
        startedAt: new Date(),
        configSnapshot: JSON.stringify(configObj),
        outcomeDetails: `Apify ${isFullScan ? "Full" : "Delta"} Cloud run launched for ${delta} ad(s) limit`,
      })
      .returning();

    await db
      .update(trackedPages)
      .set({ status: "scanning", updatedAt: new Date() })
      .where(eq(trackedPages.id, page.id));

    try {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        type: "ad_spy",
        title: "⚡ Apify Scan Started",
        message: `Started creative extraction for "${brandDisplayName}" (+${delta} ads)...`,
        severity: "info",
        trackedPageId: page.id,
        actionUrl: `/spy?trackedPageId=${page.id}`,
      }).catch(() => {});

      const { startApifyDeltaScan } = await import("@/lib/apify");
      const { pollApifyRunUntilDone } = await import("@/lib/apify-sync");

      const runRes = await startApifyDeltaScan({
        pageUrl: page.url,
        delta,
        creativeScanId: newScan.id,
        webhookBaseUrl,
        isFullScan,
      });

      if (runRes?.id) {
        await db
          .update(creativeScans)
          .set({
            configSnapshot: JSON.stringify({
              ...configObj,
              apifyRunId: runRes.id,
              defaultDatasetId: runRes.defaultDatasetId,
            }),
            outcomeDetails: `Apify Cloud run launched (Run ID: ${runRes.id}, Dataset ID: ${runRes.defaultDatasetId})`,
          })
          .where(eq(creativeScans.id, newScan.id));

        pollApifyRunUntilDone(newScan.id, runRes.id, runRes.defaultDatasetId);
      }

      return {
        success: true,
        status: "apify_launched",
        message: `Launched ⚡ Apify Cloud creative scan for "${brandDisplayName}".`,
        creativeScanId: newScan.id,
        runId: runRes?.id,
        runner: "apify",
        displayName: brandDisplayName,
        isScannedToday,
        lastCreativeScan: page.lastCreativeScan,
      };
    } catch (apifyErr: any) {
      console.error("[CreativeScan] Apify launch failed:", apifyErr);
      await db
        .update(creativeScans)
        .set({
          status: "failed",
          failureReason: "apify_launch_failed",
          outcomeDetails: apifyErr?.message || "Apify launch failed",
          finishedAt: new Date(),
        })
        .where(eq(creativeScans.id, newScan.id));

      await db
        .update(trackedPages)
        .set({
          status: page.lastSuccessAt || page.currentResults !== null ? "success" : "failed",
          updatedAt: new Date(),
        })
        .where(eq(trackedPages.id, page.id));

      try {
        const { createNotification } = await import("@/lib/notifications");
        await createNotification({
          type: "system_alert",
          title: "⚠️ Apify Launch Failed",
          message: `Failed to launch Apify scan for "${brandDisplayName}": ${apifyErr?.message}`,
          severity: "error",
          trackedPageId: page.id,
        }).catch(() => {});
      } catch {}

      return {
        success: false,
        status: "failed",
        message: `Failed to launch Apify scan: ${apifyErr?.message}`,
        creativeScanId: newScan.id,
        runner: "apify",
        displayName: brandDisplayName,
        isScannedToday,
        lastCreativeScan: page.lastCreativeScan,
      };
    }
  }

  // 4. Local Playwright Runner
  const [newScan] = await db
    .insert(creativeScans)
    .values({
      trackedPageId: page.id,
      status: "pending",
      configSnapshot: JSON.stringify({
        runner: "local",
        maxScrolls: 15,
        timeoutMs: 25000,
        isFullScan,
      }),
    })
    .returning();

  await db.insert(queue).values({
    trackedPageId: page.id,
    jobType: "creative",
    creativeScanId: newScan.id,
    priority,
    status: "pending",
  });

  await db
    .update(trackedPages)
    .set({ status: "pending", updatedAt: new Date() })
    .where(eq(trackedPages.id, page.id));

  return {
    success: true,
    status: "enqueued",
    message: `Enqueued Local Playwright creative scan (Priority: ${priority}) for "${brandDisplayName}".`,
    creativeScanId: newScan.id,
    runner: "local",
    displayName: brandDisplayName,
    isScannedToday,
    lastCreativeScan: page.lastCreativeScan,
  };
}
