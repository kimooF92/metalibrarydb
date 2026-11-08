import { db } from "../../db";
import { trackedPages, creativeScans } from "../../db/schema";
import { eq } from "drizzle-orm";
import { enqueueOrEscalateJob } from "../repositories/queue-repo";

// In-memory sequential queue for Apify delta triggers to prevent slot starvation / 429 errors
interface ApifyDeltaTask {
  pageId: string;
  difference: number;
}

const apifyDeltaQueue: ApifyDeltaTask[] = [];
let isProcessingApifyQueue = false;
const deltaDrainListeners: Array<() => void> = [];

function checkDeltaDrainNotification() {
  if (!isProcessingApifyQueue && apifyDeltaQueue.length === 0) {
    while (deltaDrainListeners.length > 0) {
      const listener = deltaDrainListeners.shift();
      listener?.();
    }
  }
}

export function hasActiveApifyDeltaTasks(): boolean {
  return isProcessingApifyQueue || apifyDeltaQueue.length > 0;
}

/**
 * Awaits until all queued background Apify delta scans complete or until timeout expires.
 */
export async function waitForApifyDeltaQueueDrain(timeoutMs: number = 60000): Promise<{ drained: boolean }> {
  if (!hasActiveApifyDeltaTasks()) {
    return { drained: true };
  }

  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ drained: false });
      }
    }, timeoutMs);

    deltaDrainListeners.push(() => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ drained: true });
      }
    });
  });
}

async function processNextApifyDelta() {
  if (isProcessingApifyQueue || apifyDeltaQueue.length === 0) {
    checkDeltaDrainNotification();
    return;
  }
  isProcessingApifyQueue = true;

  const nextTask = apifyDeltaQueue.shift();
  if (nextTask) {
    try {
      await executeApifyDeltaScan(nextTask.pageId, nextTask.difference);
    } catch (err) {
      console.error("[Apify Auto-Trigger Queue] Task error:", err);
    } finally {
      isProcessingApifyQueue = false;
      checkDeltaDrainNotification();
      // 2-second cooldown between consecutive Apify actor runs
      setTimeout(() => {
        processNextApifyDelta();
      }, 2000);
    }
  } else {
    isProcessingApifyQueue = false;
    checkDeltaDrainNotification();
  }
}

/**
 * Executes a single Apify Delta Cloud scan with fail-fast database updates and synchronous completion wait.
 */
async function executeApifyDeltaScan(pageId: string, difference: number) {
  const page = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, pageId),
  });

  if (!page || !page.url) return;

  // Strict guard: Skip if user paused automatic creative scans
  if (page.autoCreativeScan === false) {
    console.log(
      `[Apify Auto-Trigger] ⏸️ Skipping "${page.displayName || pageId}": auto creative scan is paused.`
    );
    return;
  }

  // Strict guard: Apify must NEVER scan micro-pages (< 20 ads)
  if ((page.currentResults || 0) < 20) {
    console.log(
      `[Apify Auto-Trigger] 🛑 Skipping "${page.displayName || pageId}": micro-page (${page.currentResults ?? 0} ads < 20). Micro-pages are scanned locally.`
    );
    return;
  }

  // Enforce 24-hour cooldown window to prevent redundant credit usage
  const cooldownCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (page.lastCreativeScan && page.lastCreativeScan > cooldownCutoff) {
    if (page.isWatchlisted && difference >= 5) {
      console.log(
        `[Apify Cooldown Override] High-priority watchlisted brand "${page.displayName || pageId}" has +${difference} ad spike. Enqueuing local Playwright fallback...`
      );
      await enqueueOrEscalateJob(pageId, "creative", 6);
    } else {
      console.log(
        `[Apify Cooldown] Skipping "${page.displayName || pageId}": creative scan performed within 24h cooldown.`
      );
    }
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

  let newScanId: string | null = null;

  try {
    const { startApifyDeltaScan, calculateDeltaLimit } = await import("../../lib/apify");
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

    newScanId = newScan.id;

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

      console.log(
        `[Apify Auto-Trigger] ⚡ Launched Apify Delta Cloud scan for "${page.displayName || pageId}" (+${difference} new ads | limit ${maxResults} ads). Run ID: ${runRes?.id}`
      );

      const { pollApifyRunUntilDone } = await import("../../lib/apify-sync");
      await pollApifyRunUntilDone(newScan.id, runRes.id, runRes.defaultDatasetId);
    } else {
      throw new Error("No Apify Run ID returned from startApifyDeltaScan");
    }
  } catch (err: any) {
    console.error(`[Apify Auto-Trigger] Failed to auto-launch Apify scan for "${page.displayName || pageId}". Enqueuing local Playwright fallback:`, err?.message || err);

    if (newScanId) {
      const isRateLimited = err?.message?.toLowerCase().includes("rate") || err?.message?.toLowerCase().includes("limit") || err?.message?.toLowerCase().includes("429");
      await db
        .update(creativeScans)
        .set({
          status: "failed",
          failureReason: isRateLimited ? "rate_limited" : "apify_launch_failed",
          outcomeDetails: `Auto-trigger start failed: ${err?.message || "Unknown error"}`,
          finishedAt: new Date(),
        })
        .where(eq(creativeScans.id, newScanId));
    }

    const isWatchlisted = Boolean(page.isWatchlisted);
    const isRelaunching = page.status === "inactive" && (page.currentResults || 0) > 0;
    const shouldLocalFallback = isWatchlisted || isRelaunching || difference >= 3;
    if (shouldLocalFallback) {
      console.log(`[Apify Failover] Enqueuing local Playwright fallback for "${page.displayName || pageId}" (priority: ${isWatchlisted ? 7 : 4})...`);
      await enqueueOrEscalateJob(pageId, "creative", isWatchlisted ? 7 : 4);
    } else {
      console.log(`[Apify Failover] Cloud launch failed for "${page.displayName || pageId}", non-critical page skipped local fallback to protect worker queue.`);
    }
  }
}

/**
 * Enqueues an Apify Delta Cloud scan when a positive ad count difference is detected.
 * Uses formula: Limit = Delta + max(3, ceil(Delta * 0.2)) and respects 24h cooldown per page.
 */
export async function tryAutoTriggerApifyDeltaScan(pageId: string, difference: number) {
  if (difference < 1) return;

  // Deduplicate in-queue tasks for the same page
  if (apifyDeltaQueue.some((t) => t.pageId === pageId)) {
    return;
  }

  apifyDeltaQueue.push({ pageId, difference });
  processNextApifyDelta();
}
