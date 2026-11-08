import { db } from "../../db";
import {
  trackedPages,
  queue,
  scanHistory,
  creativeScans,
  discoveredPages,
  brandDomains,
} from "../../db/schema";
import { eq, sql, and, or, isNull, inArray } from "drizzle-orm";
import { shouldArchiveZeroCount } from "../../lib/ad-reconciliation";
import { enqueueOrEscalateJob } from "../repositories/queue-repo";
import { tryAutoTriggerApifyDeltaScan } from "./apify-delta-service";

function isUuid(id?: string | null): boolean {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function markJobCompleted(
  queueId: string,
  pageId: string,
  results: number | null,
  status: "success" | "unclear",
  options?: {
    failureReason?: string | null;
    scanQuality?: "complete" | "partial" | "unclear";
    page?: any;
    profilePicUrl?: string | null;
  }
) {
  const now = new Date();

  // 1. Fetch previous scan result and tracked page early
  const lastScan = await db.query.scanHistory.findFirst({
    where: eq(scanHistory.trackedPageId, pageId),
    orderBy: [sql`${scanHistory.checkedAt} desc`],
  });

  const trackedPage = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, pageId),
  });

  // If a Meta profile picture was extracted and page doesn't have an authentic store logo, save it as fallback (skips if already identical)
  if (
    options?.profilePicUrl &&
    options.profilePicUrl !== trackedPage?.profilePicUrl &&
    (!trackedPage?.profilePicUrl || trackedPage.profilePicUrl.includes("fbcdn.net"))
  ) {
    try {
      await db
        .update(trackedPages)
        .set({ profilePicUrl: options.profilePicUrl, updatedAt: now })
        .where(eq(trackedPages.id, pageId));

      if (trackedPage?.brandDomainId) {
        await db
          .update(brandDomains)
          .set({ profilePicUrl: options.profilePicUrl, updatedAt: now })
          .where(
            and(
              eq(brandDomains.id, trackedPage.brandDomainId),
              or(
                isNull(brandDomains.profilePicUrl),
                eq(brandDomains.profilePicUrl, ""),
                sql`${brandDomains.profilePicUrl} LIKE '%fbcdn.net%'`
              )
            )
          );
      }
    } catch (picErr) {
      console.warn("[Count Scan] Non-fatal error updating profilePicUrl:", picErr);
    }
  }

  let mostRecentSuccessfulPositiveScan = null;
  if (!trackedPage?.lastKnownValidResults && trackedPage?.holdStatus !== "inactive") {
    mostRecentSuccessfulPositiveScan = await db.query.scanHistory.findFirst({
      where: and(
        eq(scanHistory.trackedPageId, pageId),
        eq(scanHistory.status, "success"),
        sql`${scanHistory.results} > 0`
      ),
      orderBy: [sql`${scanHistory.checkedAt} desc`],
    });
  }

  let difference: number | null = null;
  if (results !== null && lastScan?.results !== null && lastScan?.results !== undefined) {
    difference = results - lastScan.results;
  } else if (results !== null && trackedPage?.currentResults !== null && trackedPage?.currentResults !== undefined) {
    difference = results - trackedPage.currentResults;
  } else if (results !== null) {
    difference = results;
  }

  const scanError = options?.failureReason || null;
  const scanQuality = options?.scanQuality || (status === "success" && !scanError ? "complete" : "unclear");

  // 2. Cliff-Drop Detection & Grace Period State Machine Preparation
  const CONFIRM_SCANS = 3; // consecutive zero scans before archiving

  const prevCount = trackedPage?.lastKnownValidResults
    ?? mostRecentSuccessfulPositiveScan?.results
    ?? (lastScan?.status === "success" && (lastScan.results ?? 0) > 0 ? lastScan.results : null)
    ?? (trackedPage?.currentResults && trackedPage.currentResults > 0 ? trackedPage.currentResults : 0);
  const hadActiveAds = prevCount > 0;
  let isOnHold = trackedPage?.holdStatus === "on_hold";
  const isInactive = trackedPage?.holdStatus === "inactive";
  const brandName = trackedPage?.displayName || trackedPage?.url || "Tracked Brand";

  // 2a. Global Circuit Breaker Check (Zero-Ad Anomaly Outage Guard)
  // When distinct pages return 0 ads within the rolling window, it indicates a possible Ad Library outage/block.
  // We strictly exclude already-inactive pages, and verify platform health via canary before pausing the worker.
  const isAlreadyConfirmedInactive =
    trackedPage?.holdStatus === "inactive" ||
    (trackedPage?.holdStatus === "active" &&
      (trackedPage?.currentResults ?? 0) === 0 &&
      !trackedPage?.lastKnownValidResults);

  if (results === 0 && !isAlreadyConfirmedInactive && (hadActiveAds || isOnHold)) {
    const { checkZeroAdAnomaly } = await import("../circuit-breaker");
    const anomaly = await checkZeroAdAnomaly(pageId, results, options?.page);

    if (anomaly.isAnomalous) {
      console.warn(
        `[Count Scan] 🛑 0-ad result for page "${brandName}" (${pageId}) REJECTED by Circuit Breaker: ${anomaly.reason}`
      );

      // Record truthful incident record in scan_history with status "unclear" and null results to avoid polluting sparklines
      await db.insert(scanHistory).values({
        trackedPageId: pageId,
        results: null,
        difference: null,
        checkedAt: now,
        creativeScannedAt: null,
        status: "unclear",
        failureReason: "circuit_breaker_meta_outage",
      });

      // Nuanced Outage Rescue: If the trigger page entered on_hold during this outage window, rescue it back to active.
      // If it entered on_hold before the outage, freeze it cleanly without resetting or incrementing its count.
      const { getCircuitBreakerConfig } = await import("../circuit-breaker");
      const cbConfig = getCircuitBreakerConfig();
      const outageWindowStart = new Date(now.getTime() - cbConfig.windowMinutes * 60 * 1000);
      const enteredHoldDuringOutage =
        isOnHold && trackedPage?.holdStartedAt && new Date(trackedPage.holdStartedAt) >= outageWindowStart;

      if (enteredHoldDuringOutage) {
        console.log(
          `[Count Scan] 🛡️ Rescuing trigger page "${brandName}" — reverting false on_hold status to active.`
        );
        await db
          .update(trackedPages)
          .set({
            holdStatus: "active",
            currentResults: trackedPage?.lastKnownValidResults ?? trackedPage?.currentResults ?? prevCount,
            consecutiveZeroScans: 0,
            lastKnownValidResults: null,
            holdStartedAt: null,
            status: "pending",
            updatedAt: now,
          })
          .where(eq(trackedPages.id, pageId));
      } else {
        // Keep page in its prior state, set status to 'pending' so it can be cleanly retried after cooldown
        await db
          .update(trackedPages)
          .set({
            status: "pending",
            updatedAt: now,
          })
          .where(eq(trackedPages.id, pageId));
      }

      // Reset the current queue job to pending with priority 1 so it retries automatically once cooldown expires
      if (isUuid(queueId)) {
        await db
          .update(queue)
          .set({
            status: "pending",
            priority: 1,
            startedAt: null,
            finishedAt: null,
          })
          .where(eq(queue.id, queueId));
      }

      return {
        brandName,
        results: prevCount,
        difference: 0,
        circuitBreakerTripped: true,
      };
    }
  }

  // 2b. Insert scan_history record (truthful audit log for verified scans)
  await db.insert(scanHistory).values({
    trackedPageId: pageId,
    results,
    difference,
    checkedAt: now,
    creativeScannedAt: null,
    status,
    failureReason: scanError,
  });

  const isValidatedZero = results === 0
    && status === "success"
    && scanQuality === "complete"
    && !scanError;

  const isDropToZero = isValidatedZero && !isOnHold && !isInactive && hadActiveAds;
  const isZeroWhileOnHold = isOnHold && isValidatedZero;
  const isAmbiguousZero = results === 0 && !isValidatedZero;
  const isRecovering = isOnHold
    && results !== null
    && results > 0
    && status === "success"
    && scanQuality === "complete"
    && !scanError;
  const isRelaunching = isInactive
    && results !== null
    && results > 0
    && status === "success"
    && scanQuality === "complete"
    && !scanError;

  let displayDifference = difference;

  if (isDropToZero) {
    // First drop to 0: enter grace period, NEVER shut down ads directly
    await db.update(trackedPages).set({
      holdStatus: "on_hold",
      lastKnownValidResults: prevCount,
      holdStartedAt: now,
      consecutiveZeroScans: 1,
      currentResults: results,
      lastChecked: now,
      lastSuccessAt: now,
      status: "success",
      updatedAt: now,
    }).where(eq(trackedPages.id, pageId));

    // Recheck with priority 1 (keep in normal queue order so other pages are not starved)
    try {
      await enqueueOrEscalateJob(pageId, "count", 1);
    } catch (e) {
      console.error(`[Count Scan] Failed to enqueue recheck for ${pageId}:`, e);
    }

    // Fire amber hold notification instead of "Brand Went Dark"
    try {
      const { logHoldDetectedNotification } = await import("../../lib/notifications");
      await logHoldDetectedNotification({
        trackedPageId: pageId,
        brandName,
        prevResults: prevCount,
        pageId: trackedPage?.pageId,
      });
    } catch (e) {
      console.error("[Count Scan] Failed to log hold detected notification:", e);
    }
  } else if (isZeroWhileOnHold) {
    const nextZeroCount = (trackedPage?.consecutiveZeroScans ?? 0) + 1;
    const isConfirmedShutdown = nextZeroCount >= CONFIRM_SCANS;

    if (isConfirmedShutdown) {
      // 3 consecutive zero scans confirmed — transition to inactive & allow archival
      await db.update(trackedPages).set({
        holdStatus: "inactive",
        consecutiveZeroScans: nextZeroCount,
        currentResults: results,
        lastKnownValidResults: null,
        lastChecked: now,
        lastSuccessAt: now,
        status: "success",
        updatedAt: now,
      }).where(eq(trackedPages.id, pageId));

      // Archive ads now that shutdown is confirmed
      try {
        const { reconcileZeroResultCount } = await import("../../lib/ad-reconciliation");
        const archivedCount = await reconcileZeroResultCount(
          pageId,
          status,
          results,
          now,
          undefined,
          "inactive",
          nextZeroCount
        );
        if (archivedCount > 0) {
          console.log(
            `[Count Scan] Archived ${archivedCount} linked ad(s) after confirmed 3x zero-result scans for ${pageId}.`
          );
        }
      } catch (archiveErr) {
        console.error(
          `[Count Scan] Failed to archive linked ads after confirmed zero shutdown for ${pageId}:`,
          archiveErr
        );
      }
    } else {
      // Still in grace period (e.g. scan 2 of 3) — increment counter, NO archival
      await db.update(trackedPages).set({
        consecutiveZeroScans: nextZeroCount,
        currentResults: results,
        lastChecked: now,
        lastSuccessAt: now,
        status: "success",
        updatedAt: now,
      }).where(eq(trackedPages.id, pageId));

      try {
        await enqueueOrEscalateJob(pageId, "count", 2);
      } catch {}
    }
  } else if (isRecovering || isRelaunching) {
    // Account hold lifted OR inactive brand relaunched ads — compute display difference vs baseline BEFORE clearing
    const baseline = isRecovering ? (trackedPage?.lastKnownValidResults ?? results) : 0;
    displayDifference = results - baseline;

    const isSmallPage = (results || 0) < 20;
    const hasPreviousScan = Boolean(trackedPage?.lastCreativeScan);
    // For relaunches, any positive ad count (even 1 test ad) is meaningful!
    const isMeaningfulDelta = (isRelaunching || !hasPreviousScan)
      ? ((displayDifference !== null && displayDifference >= 1) || (results !== null && results >= 1))
      : (displayDifference !== null && displayDifference >= 2);
    const finalStatus = (status === "success" && isMeaningfulDelta && isSmallPage) ? "pending" : "success";

    await db.update(trackedPages).set({
      holdStatus: "active",
      lastKnownValidResults: null,
      holdStartedAt: null,
      consecutiveZeroScans: 0,
      currentResults: results,
      lastChecked: now,
      lastSuccessAt: now,
      status: finalStatus,
      updatedAt: now,
    }).where(eq(trackedPages.id, pageId));

    // Reset stale hold flag so the creative routing block below can fire for these pages.
    if (isRecovering) isOnHold = false;

    if (isRelaunching) {
      console.log(
        `[Count Scan] 🚀 Inactive brand "${brandName}" (${pageId}) relaunched ads! Detected ${results} active ad(s). Transitioned to active status.`
      );
      try {
        const { logHoldLiftedNotification } = await import("../../lib/notifications");
        await logHoldLiftedNotification({
          trackedPageId: pageId,
          brandName,
          recoveredResults: results,
          pageId: trackedPage?.pageId,
          isRelaunch: true,
        });
      } catch (notifErr) {
        console.error("[Count Scan] Failed to log relaunch notification:", notifErr);
      }
    } else {
      console.log(
        `[Count Scan] 🟢 Page ${pageId} recovered from hold: ${results} ads (baseline was ${baseline}, displayDiff: ${displayDifference}).`
      );
    }
  } else if (isInactive && isValidatedZero) {
    // Inactive brand routine check: verified still 0 ads (dark).
    // Remain inactive, preserve consecutiveZeroScans at 3 (or current count), and update timestamps.
    await db.update(trackedPages).set({
      currentResults: 0,
      lastChecked: now,
      lastSuccessAt: now,
      status: "success",
      updatedAt: now,
    }).where(eq(trackedPages.id, pageId));
  } else if (results === 0 || status !== "success" || scanQuality !== "complete" || scanError) {
    // Ambiguous/failed scan: preserve previous state and never archive.
    await db.update(trackedPages).set({
      currentResults: trackedPage?.currentResults ?? mostRecentSuccessfulPositiveScan?.results ?? null,
      consecutiveZeroScans: trackedPage?.consecutiveZeroScans ?? 0,
      lastChecked: now,
      status,
      updatedAt: now,
    }).where(eq(trackedPages.id, pageId));
  } else {
    // Normal (non-hold) update
    // If ad count changed on a micro-page (< 20 ads), set page to 'pending' if it's a meaningful delta (first-time >= 1, or delta >= 2)
    const isSmallPage = (results || 0) < 20;
    const hasPreviousScan = Boolean(trackedPage?.lastCreativeScan);
    const isMeaningfulDelta = !hasPreviousScan
      ? ((displayDifference !== null && displayDifference >= 1) || (results !== null && results >= 1))
      : (displayDifference !== null && displayDifference >= 2);

    const isAdCountIncrease = status === "success" && isMeaningfulDelta;
    const finalPageStatus = (isAdCountIncrease && isSmallPage) ? "pending" : status;

    await db.update(trackedPages).set({
      currentResults: results,
      lastChecked: now,
      lastSuccessAt: status === "success" ? now : undefined,
      status: finalPageStatus,
      updatedAt: now,
    }).where(eq(trackedPages.id, pageId));

    // Structural guard: NEVER archive a page that had active ads via this path.
    if (!hadActiveAds && shouldArchiveZeroCount(status, results, trackedPage?.holdStatus, trackedPage?.consecutiveZeroScans)) {
      try {
        const { reconcileZeroResultCount } = await import("../../lib/ad-reconciliation");
        await reconcileZeroResultCount(pageId, status, results, now);
      } catch (archiveErr) {
        console.error(`[Count Scan] Error in zero result reconciliation:`, archiveErr);
      }
    }
  }

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
  if (isUuid(queueId)) {
    await db
      .update(queue)
      .set({
        status: "completed",
        finishedAt: now,
      })
      .where(eq(queue.id, queueId));
  } else if (pageId) {
    await db
      .update(queue)
      .set({
        status: "completed",
        finishedAt: now,
      })
      .where(and(eq(queue.trackedPageId, pageId), inArray(queue.status, ["pending", "running"])));
  }

  // 4b. Log in-app activity notification
  if (!isDropToZero && !isAmbiguousZero && !(isInactive && isValidatedZero) && !(isZeroWhileOnHold && ((trackedPage?.consecutiveZeroScans ?? 0) + 1) < CONFIRM_SCANS)) {
    try {
      const { logCountScanNotification } = await import("../../lib/notifications");
      await logCountScanNotification({
        trackedPageId: pageId,
        brandName,
        currentResults: results,
        difference: displayDifference,
        status,
        pageId: trackedPage?.pageId || null,
        isOnHold: isDropToZero || isZeroWhileOnHold,
        isAmbiguousZero,
      });
    } catch {}
  }

  // 4c. Update & Persist Archetype Sweet-Spot Tag (Stable, Burst, Scaling, Breakout, etc.)
  try {
    const { updateAndPersistPageTag } = await import("../../lib/page-tagger");
    updateAndPersistPageTag(pageId).catch((err) =>
      console.warn(`[Page Tagger] Non-blocking tag error for ${pageId}:`, err?.message || err)
    );
  } catch {}

  // 5. Intelligent Creative Routing
  const hasPreviousScan = Boolean(trackedPage?.lastCreativeScan);
  // For a brand-new page with no previous creative scan OR a brand relaunching from inactive, all positive results count as new ads to extract
  const effectiveDifference = (isRelaunching || (!hasPreviousScan && (displayDifference === null || displayDifference < 1) && (results || 0) >= 1))
    ? (results || 0)
    : (displayDifference ?? 0);

  // Guard with effectiveDifference and ensure holdStatus !== "on_hold"
  if (status === "success" && !isOnHold && !isDropToZero && effectiveDifference >= 1) {
    try {
      if (trackedPage?.autoCreativeScan === false) {
        console.log(
          `[Creative Routing] ⏸️ Skipping auto creative scan for "${brandName}": auto-scan paused by user.`
        );
        return { difference: displayDifference, results, brandName };
      }

      const isCloudEligible = (results || 0) >= 20;

      if (!isCloudEligible) {
        const isWatchlisted = Boolean(trackedPage?.isWatchlisted);
        // MICRO-PAGE (< 20 active ads): Always enqueue for local free Playwright worker.
        // Require meaningful delta: first-time scan (>= 1), relaunch (>= 1), watchlisted (>= 1), or subsequent jump (>= 2)
        const isMeaningfulDelta =
          isRelaunching ||
          !hasPreviousScan ||
          isWatchlisted ||
          effectiveDifference >= 2;

        if (isMeaningfulDelta) {
          const existingJob = await db.query.queue.findFirst({
            where: (q, { and, eq, inArray }) =>
              and(
                eq(q.trackedPageId, pageId),
                eq(q.jobType, "creative"),
                inArray(q.status, ["pending", "running"])
              ),
          });

          if (!existingJob) {
            const [scanRecord] = await db
              .insert(creativeScans)
              .values({
                trackedPageId: pageId,
                status: "pending",
                configSnapshot: JSON.stringify({
                  runner: "playwright",
                  autoTriggered: true,
                  delta: displayDifference,
                  totalResults: results,
                  isRelaunch: isRelaunching,
                }),
                outcomeDetails: isRelaunching
                  ? `🚀 Queued urgent Playwright creative scan for relaunched brand (${results} active ad(s))`
                  : `Queued for local Playwright creative scan (+${displayDifference} new ads, total ${results} < 20)`,
              })
              .returning();

            await db.insert(queue).values({
              trackedPageId: pageId,
              jobType: "creative",
              creativeScanId: scanRecord.id,
              status: "pending",
              priority: isRelaunching ? 1 : 5, // Priority 1 (urgent) for relaunches
            });

            await db
              .update(trackedPages)
              .set({ status: "pending", updatedAt: now })
              .where(eq(trackedPages.id, pageId));

            console.log(
              `[Local Creative Queue] 🟢 Enqueued "${brandName}" for ${isRelaunching ? "URGENT relaunch" : "free local Playwright"} scan (+${displayDifference} ads, total: ${results} < 20).`
            );
          }
        } else {
          console.log(
            `[Local Creative Queue] ℹ️ Skipping auto-queue for "${brandName}": delta (+${displayDifference} < 2 on a ${results}-ad page) is below threshold.`
          );
        }
      } else {
        // GROWING & MEGA-BRAND (>= 20 ads): Trigger Apify Cloud runner for cloud-eligible catalogs
        console.log(
          `[Apify Auto-Trigger] 🚀 Cloud-eligible catalog (${results} active ads >= 20) detected for "${brandName}". Triggering Apify Cloud scan...`
        );
        tryAutoTriggerApifyDeltaScan(pageId, effectiveDifference).catch((err) => {
          console.error("[Apify Auto-Trigger] Error launching background delta scan:", err);
        });
      }
    } catch (routeErr) {
      console.error("[Creative Routing] Error routing new ads:", routeErr);
    }
  }

  if (trackedPage?.workspaceId) {
    import("../../lib/cache-service")
      .then(({ deleteByPrefix, deleteCached }) => {
        Promise.allSettled([
          deleteByPrefix(`cache:dashboard:overview:${trackedPage.workspaceId}:`),
          deleteCached(`cache:stats:${trackedPage.workspaceId}`),
        ]).catch(() => {});
      })
      .catch(() => {});
  }

  return { difference: displayDifference, results, brandName };
}
