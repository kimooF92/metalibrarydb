import { db } from "../db";
import { scanHistory, trackedPages, queue } from "../db/schema";
import { sql, and, gte, eq, inArray } from "drizzle-orm";
import { updateWorkerState, getWorkerState } from "./db";
import { Page } from "playwright";
import { scanMetaAdPage } from "./scanner";

export interface ZeroAdAnomalyResult {
  isAnomalous: boolean;
  reason?: string;
  distinctPagesCount?: number;
}

// Configurable constants via environment variables
export function getCircuitBreakerConfig() {
  const threshold = parseInt(process.env.ZERO_AD_ANOMALY_THRESHOLD || "5", 10);
  const windowMinutes = parseInt(process.env.ZERO_AD_ANOMALY_WINDOW_MINUTES || "20", 10);
  const cooldownMinutes = parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MINUTES || "45", 10);
  const defaultCanaries = [
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=15087023444", // Nike Global
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=141873822521199", // Shopify Global
  ];
  const canaryUrl = process.env.CANARY_AD_LIBRARY_URL || defaultCanaries[0];
  const canaryUrls = process.env.CANARY_AD_LIBRARY_URL
    ? process.env.CANARY_AD_LIBRARY_URL.split(",").map((u) => u.trim()).filter(Boolean)
    : defaultCanaries;

  return {
    threshold,
    windowMinutes,
    cooldownMinutes,
    canaryUrl,
    canaryUrls,
  };
}

/**
 * Checks whether the current 0-result scan is part of a multi-page cluster anomaly.
 * When distinct pages report 0 ads within the rolling window, it verifies platform health via canary.
 * Only if the canary fails or is unavailable does it declare an incident and trip the circuit breaker.
 */
export async function checkZeroAdAnomaly(
  currentPageId: string,
  currentResults: number | null,
  browserPage?: Page | null
): Promise<ZeroAdAnomalyResult> {
  const config = getCircuitBreakerConfig();

  // 0. Inactive page filter: Never scrutinize or flag pages that are confirmed inactive or already zero
  const currentPage = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, currentPageId),
    columns: { id: true, holdStatus: true, currentResults: true, lastKnownValidResults: true },
  });

  const isCurrentPageInactive =
    currentPage?.holdStatus === "inactive" ||
    (currentPage?.holdStatus === "active" &&
      (currentPage?.currentResults ?? 0) === 0 &&
      !currentPage?.lastKnownValidResults);

  if (isCurrentPageInactive) {
    return { isAnomalous: false };
  }

  // Fast-path concurrency guard: if another shard already tripped the breaker, respect it without duplicate alerts or writes
  const currentState = await getWorkerState();
  if (
    currentState.circuitBreakerTripped &&
    currentState.circuitBreakerUntil &&
    new Date() < new Date(currentState.circuitBreakerUntil)
  ) {
    return {
      isAnomalous: true,
      reason: currentState.circuitBreakerReason || "Meta Ad Library Outage Guard active (tripped by sibling shard)",
      distinctPagesCount: currentState.consecutiveZeroPages || config.threshold,
    };
  }

  // If the result is a real positive count, the scraper is clearly functional for this page.
  if (currentResults !== null && currentResults > 0) {
    const state = await getWorkerState();
    if ((state.consecutiveZeroPages || 0) > 0) {
      await updateWorkerState({ consecutiveZeroPages: 0 });
    }
    return { isAnomalous: false };
  }

  // Only scrutinize when results === 0
  if (currentResults !== 0) {
    return { isAnomalous: false };
  }

  const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000);

  // Find distinct pages that DROPPED to 0 ads in the rolling window (excluding already quarantined scans, already-0 pages, and inactive pages)
  const recentZeroScans = await db
    .select({
      trackedPageId: scanHistory.trackedPageId,
    })
    .from(scanHistory)
    .innerJoin(trackedPages, eq(scanHistory.trackedPageId, trackedPages.id))
    .where(
      and(
        gte(scanHistory.checkedAt, windowStart),
        eq(scanHistory.results, 0),
        sql`(${scanHistory.failureReason} IS NULL OR ${scanHistory.failureReason} != 'circuit_breaker_meta_outage')`,
        // Crucial Guard: Exclude inactive pages strictly!
        sql`${trackedPages.holdStatus} != 'inactive'`,
        // Only count genuine drops to 0 (had active ads before) or pages currently in on_hold grace period.
        // Never count brands that were already confirmed 0 (inactive or zero-ad pages).
        sql`(${scanHistory.difference} < 0 OR ${trackedPages.holdStatus} = 'on_hold' OR (${trackedPages.lastKnownValidResults} IS NOT NULL AND ${trackedPages.lastKnownValidResults} > 0))`
      )
    );

  const distinctZeroPageIds = new Set<string>();
  for (const s of recentZeroScans) {
    if (s.trackedPageId) {
      distinctZeroPageIds.add(s.trackedPageId);
    }
  }
  distinctZeroPageIds.add(currentPageId);

  const count = distinctZeroPageIds.size;

  if (count >= config.threshold) {
    // Before declaring an Ad Library outage, run a sanity check on a mega-advertiser (e.g. Nike Global)
    // If the canary returns active ads, Meta Ad Library is operational — these 0-counts are natural brand pauses/churn!
    if (browserPage) {
      console.log(
        `[Circuit Breaker] 🔍 Cluster threshold reached (${count} pages with 0 ads). Verifying platform health via canary check before tripping...`
      );
      try {
        const canary = await runCanarySanityCheck(browserPage);
        if (canary.isHealthy) {
          console.log(
            `[Circuit Breaker] 🟢 Canary check passed (${canary.results} active ads found). Meta Ad Library is operational! ${count} 0-ad results are natural brand pauses, not an outage.`
          );
          await updateWorkerState({ consecutiveZeroPages: 0 });
          return {
            isAnomalous: false,
            distinctPagesCount: count,
          };
        } else {
          console.warn(
            `[Circuit Breaker] ⚠️ Canary check confirmed outage (${canary.reason}). Proceeding to trip circuit breaker.`
          );
        }
      } catch (canaryErr: any) {
        console.warn(
          `[Circuit Breaker] Canary verification failed with error: ${canaryErr?.message}. Proceeding with outage trip.`
        );
      }
    }

    const cooldownUntil = new Date(Date.now() + config.cooldownMinutes * 60 * 1000);
    const reason = `Meta Ad Library Outage Guard: ${count} distinct brands returned 0 ads within ${config.windowMinutes}m (Threshold: >= ${config.threshold}).`;

    console.error(`\n🚨 [CIRCUIT BREAKER TRIPPED] ${reason}`);
    console.error(`   Affected Pages: ${Array.from(distinctZeroPageIds).join(", ")}`);
    console.error(`   Worker paused across all shards until ${cooldownUntil.toISOString()}\n`);

    // 1. Trip circuit breaker state in database (pauses all worker shards)
    await updateWorkerState({
      circuitBreakerTripped: true,
      circuitBreakerReason: reason,
      circuitBreakerUntil: cooldownUntil,
      consecutiveZeroPages: count,
      backoffUntil: cooldownUntil,
    });

    // 2. Rescue and quarantine the other victim pages affected during this outage window
    const otherPageIds = Array.from(distinctZeroPageIds).filter((id) => id !== currentPageId);
    if (otherPageIds.length > 0) {
      for (const victimId of otherPageIds) {
        try {
          const victim = await db.query.trackedPages.findFirst({
            where: eq(trackedPages.id, victimId),
          });

          if (victim && victim.holdStatus === "on_hold") {
            const enteredDuringOutage = victim.holdStartedAt
              ? new Date(victim.holdStartedAt) >= windowStart
              : true;

            if (enteredDuringOutage) {
              console.log(
                `[Circuit Breaker] 🛡️ Rescuing victim page "${victim.displayName || victimId}" — reverting false on_hold status to active.`
              );
              await db
                .update(trackedPages)
                .set({
                  holdStatus: "active",
                  currentResults: victim.lastKnownValidResults ?? victim.currentResults,
                  consecutiveZeroScans: 0,
                  lastKnownValidResults: null,
                  holdStartedAt: null,
                  status: "pending",
                  updatedAt: new Date(),
                })
                .where(eq(trackedPages.id, victimId));
            } else {
              console.log(
                `[Circuit Breaker] ❄️ Freezing victim page "${victim.displayName || victimId}" — keeping pre-existing hold state (entered before outage window).`
              );
            }
          }
        } catch (rescueErr) {
          console.error(`[Circuit Breaker] Failed to rescue victim page ${victimId}:`, rescueErr);
        }
      }

      // Neutralize their recent zero scans so they do not poison sparklines or scaling classifiers
      try {
        await db
          .update(scanHistory)
          .set({
            results: null,
            difference: null,
            status: "unclear",
            failureReason: "circuit_breaker_meta_outage",
          })
          .where(
            and(
              inArray(scanHistory.trackedPageId, otherPageIds),
              gte(scanHistory.checkedAt, windowStart),
              eq(scanHistory.results, 0)
            )
          );
      } catch (histErr) {
        console.error("[Circuit Breaker] Failed to sanitize historical zero rows:", histErr);
      }

      // De-escalate priority on any rechecks enqueued for victim pages back to standard priority 1
      try {
        await db
          .update(queue)
          .set({ priority: 1 })
          .where(
            and(
              inArray(queue.trackedPageId, otherPageIds),
              eq(queue.status, "pending"),
              sql`${queue.priority} > 1`
            )
          );
      } catch (queueErr) {
        console.error("[Circuit Breaker] Failed to de-escalate victim priority jobs:", queueErr);
      }
    }

    // 3. Emit high-severity notification to operator
    try {
      const { createNotification } = await import("../lib/notifications");
      await createNotification({
        type: "system_alert",
        title: "🛑 Meta Ad Library Outage Guard Triggered",
        message: `${count} distinct brands reported 0 ads within ${config.windowMinutes}m. System declared a Meta Ad Library incident. Worker paused for ${config.cooldownMinutes}m and zero-counts quarantined to prevent false ad archiving.`,
        severity: "error",
        actionUrl: "/?holdStatus=on_hold",
      });
    } catch (notifErr) {
      console.error("[Circuit Breaker] Failed to send alert notification:", notifErr);
    }

    return {
      isAnomalous: true,
      reason,
      distinctPagesCount: count,
    };
  }

  // Not yet at threshold, but track count
  await updateWorkerState({ consecutiveZeroPages: count });
  return { isAnomalous: false, distinctPagesCount: count };
}

/**
 * Checks if the circuit breaker is currently active.
 */
export async function isCircuitBreakerActive(): Promise<{
  isActive: boolean;
  reason?: string;
  minutesRemaining?: number;
}> {
  const state = await getWorkerState();
  if (state.circuitBreakerTripped && state.circuitBreakerUntil) {
    const now = new Date();
    const breakerTime = new Date(state.circuitBreakerUntil);
    if (now < breakerTime) {
      const minutesRemaining = Math.ceil((breakerTime.getTime() - now.getTime()) / (1000 * 60));
      return {
        isActive: true,
        reason: state.circuitBreakerReason || "Meta Ad Library Outage Guard active",
        minutesRemaining,
      };
    } else {
      // Cooldown expired — auto-clear breaker flag
      await updateWorkerState({
        circuitBreakerTripped: false,
        circuitBreakerReason: null,
        circuitBreakerUntil: null,
        consecutiveZeroPages: 0,
      });
    }
  }
  return { isActive: false };
}

/**
 * Runs a health check against a known mega-advertiser (e.g. Nike Global) with hundreds of active ads.
 * Used to verify whether Meta Ad Library is truly operational before resuming scans.
 */
export async function runCanarySanityCheck(page: Page): Promise<{
  isHealthy: boolean;
  results: number | null;
  reason?: string;
}> {
  const config = getCircuitBreakerConfig();
  const candidateUrls = config.canaryUrls.length > 0 ? config.canaryUrls : [config.canaryUrl];
  let lastFailureMsg = "Unknown failure";

  for (let i = 0; i < candidateUrls.length; i++) {
    const url = candidateUrls[i];
    const isFallback = i > 0;
    console.log(
      `[Canary Health Check] 🐤 Testing Meta Ad Library health using ${isFallback ? "Fallback" : "Primary"} Canary URL (${i + 1}/${candidateUrls.length}): ${url}...`
    );

    try {
      const outcome = await scanMetaAdPage(page, url);

      if (outcome.status === "success" && outcome.results !== null && outcome.results >= 10) {
        console.log(
          `[Canary Health Check] 🟢 PASSED! Canary brand returned ${outcome.results} active ads. Meta Ad Library is operational.`
        );
        // Reset breaker
        await updateWorkerState({
          circuitBreakerTripped: false,
          circuitBreakerReason: null,
          circuitBreakerUntil: null,
          consecutiveZeroPages: 0,
          backoffUntil: null,
        });
        return { isHealthy: true, results: outcome.results };
      }

      lastFailureMsg = `Canary [${i + 1}] returned status "${outcome.status}" with ${outcome.results ?? 0} ads. Failure reason: ${outcome.failureReason || "insufficient ads"}.`;
      console.warn(`[Canary Health Check] ⚠️ ${isFallback ? "Fallback" : "Primary"} Canary did not pass: ${lastFailureMsg}`);
    } catch (err: any) {
      lastFailureMsg = `Canary [${i + 1}] error: ${err?.message}`;
      console.warn(`[Canary Health Check] ⚠️ Error during canary scan [${i + 1}]:`, err?.message);
    }
  }

  console.error(`[Canary Health Check] 🔴 ALL CANARIES FAILED: ${lastFailureMsg}`);
  return {
    isHealthy: false,
    results: null,
    reason: lastFailureMsg,
  };
}
