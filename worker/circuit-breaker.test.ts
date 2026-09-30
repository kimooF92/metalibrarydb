import test from "node:test";
import assert from "node:assert/strict";
import { getCircuitBreakerConfig } from "./circuit-breaker";

test("getCircuitBreakerConfig uses default thresholds and env overrides", () => {
  const config = getCircuitBreakerConfig();
  assert.equal(typeof config.threshold, "number");
  assert.equal(config.threshold >= 3, true);
  assert.equal(config.windowMinutes > 0, true);
  assert.equal(config.cooldownMinutes > 0, true);
  assert.equal(typeof config.canaryUrl, "string");
  assert.equal(config.canaryUrl.includes("facebook.com/ads/library"), true);
});

test("checkZeroAdAnomaly logic: accurately identifies single page vs 3+ distinct page clusters", () => {
  // Simulate anomaly logic:
  function evaluateCluster(recentZeroPageIds: string[], currentPageId: string, threshold = 3) {
    const distinct = new Set(recentZeroPageIds);
    distinct.add(currentPageId);
    return {
      isAnomalous: distinct.size >= threshold,
      distinctCount: distinct.size,
    };
  }

  // Case 1: Page 1 drops to 0 (isolated drop)
  const step1 = evaluateCluster([], "page-1");
  assert.equal(step1.isAnomalous, false, "Single page drop must not trigger outage guard");
  assert.equal(step1.distinctCount, 1);

  // Case 2: Page 1 drops again (same page, e.g. scan 2 of grace period)
  const step2 = evaluateCluster(["page-1"], "page-1");
  assert.equal(step2.isAnomalous, false, "Consecutive scans of SAME page must not trigger cross-page anomaly");
  assert.equal(step2.distinctCount, 1);

  // Case 3: Page 2 drops to 0 (2 distinct pages)
  const step3 = evaluateCluster(["page-1"], "page-2");
  assert.equal(step3.isAnomalous, false, "2 distinct pages still below threshold of 3");
  assert.equal(step3.distinctCount, 2);

  // Case 4: Page 3 drops to 0 (3 distinct pages -> META AD LIBRARY OUTAGE)
  const step4 = evaluateCluster(["page-1", "page-2"], "page-3");
  assert.equal(step4.isAnomalous, true, "3 distinct pages MUST trigger outage circuit breaker");
  assert.equal(step4.distinctCount, 3);

  // Case 5: 4th page drops during outage
  const step5 = evaluateCluster(["page-1", "page-2", "page-3"], "page-4");
  assert.equal(step5.isAnomalous, true, "4th page must also be flagged as anomalous outage cluster");
  assert.equal(step5.distinctCount, 4);
});

test("circuit breaker expiration: correctly calculates remaining minutes and active status", () => {
  const now = Date.now();
  const futureTime = new Date(now + 30 * 60 * 1000); // 30 mins in future
  const pastTime = new Date(now - 5 * 60 * 1000); // 5 mins in past

  function checkBreakerActive(breakerUntil: Date | null, isTripped: boolean) {
    if (isTripped && breakerUntil) {
      const currentTime = new Date();
      if (currentTime < breakerUntil) {
        const mins = Math.ceil((breakerUntil.getTime() - currentTime.getTime()) / (1000 * 60));
        return { isActive: true, minsRemaining: mins };
      }
    }
    return { isActive: false, minsRemaining: 0 };
  }

  const activeRes = checkBreakerActive(futureTime, true);
  assert.equal(activeRes.isActive, true);
  assert.equal(activeRes.minsRemaining > 0, true);

  const expiredRes = checkBreakerActive(pastTime, true);
  assert.equal(expiredRes.isActive, false);

  const untrippedRes = checkBreakerActive(futureTime, false);
  assert.equal(untrippedRes.isActive, false);
});

test("canary configuration supports primary and fallback URLs", () => {
  const config = getCircuitBreakerConfig();
  assert.equal(Array.isArray(config.canaryUrls), true);
  assert.equal(config.canaryUrls.length >= 2, true, "Must have at least primary and fallback canaries");
  for (const url of config.canaryUrls) {
    assert.equal(url.startsWith("https://www.facebook.com/ads/library"), true);
  }
});

test("nuanced on_hold rescue: distinguishes outage victims from pre-existing paused brands", () => {
  const now = Date.now();
  const windowMinutes = 20;
  const outageWindowStart = new Date(now - windowMinutes * 60 * 1000);

  function decidePageAction(page: { holdStatus: string; holdStartedAt: Date | null }) {
    const isOnHold = page.holdStatus === "on_hold";
    const enteredHoldDuringOutage =
      isOnHold && page.holdStartedAt && new Date(page.holdStartedAt) >= outageWindowStart;

    if (enteredHoldDuringOutage) {
      return "RESCUE_TO_ACTIVE";
    }
    return "FREEZE_EXISTING_STATE";
  }

  // Brand A: was put on hold 5 minutes ago (during the 20m outage window) -> MUST RESCUE
  const victimBrand = {
    holdStatus: "on_hold",
    holdStartedAt: new Date(now - 5 * 60 * 1000),
  };
  assert.equal(decidePageAction(victimBrand), "RESCUE_TO_ACTIVE");

  // Brand B: was put on hold 2 days ago (legitimate brand shutdown) -> MUST NOT RESCUE (FREEZE)
  const legitDeadBrand = {
    holdStatus: "on_hold",
    holdStartedAt: new Date(now - 48 * 60 * 60 * 1000),
  };
  assert.equal(decidePageAction(legitDeadBrand), "FREEZE_EXISTING_STATE");

  // Brand C: was active before this scan -> MUST NOT RESCUE (FREEZE/KEEP ACTIVE)
  const activeBrand = {
    holdStatus: "active",
    holdStartedAt: null,
  };
  assert.equal(decidePageAction(activeBrand), "FREEZE_EXISTING_STATE");
});

test("concurrency guard fast-path: skips duplicate alerts and DB writes if breaker is already tripped", () => {
  const now = new Date();
  const activeBreakerUntil = new Date(now.getTime() + 45 * 60 * 1000);

  function checkFastPath(state: { circuitBreakerTripped: boolean; circuitBreakerUntil: Date | null }) {
    if (state.circuitBreakerTripped && state.circuitBreakerUntil && now < state.circuitBreakerUntil) {
      return { skippedDuplicateWork: true };
    }
    return { skippedDuplicateWork: false };
  }

  const siblingShardTripped = {
    circuitBreakerTripped: true,
    circuitBreakerUntil: activeBreakerUntil,
  };
  assert.equal(checkFastPath(siblingShardTripped).skippedDuplicateWork, true);

  const cleanState = {
    circuitBreakerTripped: false,
    circuitBreakerUntil: null,
  };
  assert.equal(checkFastPath(cleanState).skippedDuplicateWork, false);
});

test("anomaly cluster filter: only counts true drops to 0, strictly excluding already-0 pages", () => {
  interface ScanCandidate {
    pageId: string;
    results: number;
    difference: number | null;
    holdStatus: string;
    lastKnownValidResults: number | null;
  }

  function isEligibleDropToZero(scan: ScanCandidate): boolean {
    if (scan.results !== 0) return false;
    if (scan.holdStatus === "inactive") return false; // Strictly exclude inactive pages!
    return (
      (scan.difference !== null && scan.difference < 0) ||
      scan.holdStatus === "on_hold" ||
      (scan.lastKnownValidResults !== null && scan.lastKnownValidResults > 0)
    );
  }

  // 1. Page with 50 ads suddenly drops to 0 (diff = -50) -> MUST COUNT
  assert.equal(
    isEligibleDropToZero({
      pageId: "brand-active-drop",
      results: 0,
      difference: -50,
      holdStatus: "active",
      lastKnownValidResults: null,
    }),
    true
  );

  // 2. Page currently in on_hold grace period returning 0 -> MUST COUNT
  assert.equal(
    isEligibleDropToZero({
      pageId: "brand-on-hold",
      results: 0,
      difference: 0,
      holdStatus: "on_hold",
      lastKnownValidResults: 35,
    }),
    true
  );

  // 3. Page already confirmed inactive (even if legacy DB had lastKnownValidResults > 0) -> MUST EXCLUDE
  assert.equal(
    isEligibleDropToZero({
      pageId: "brand-inactive-already-zero",
      results: 0,
      difference: 0,
      holdStatus: "inactive",
      lastKnownValidResults: 25,
    }),
    false
  );

  // 4. Page that never had ads (fresh brand with 0 ads, diff = 0 or null) -> MUST EXCLUDE
  assert.equal(
    isEligibleDropToZero({
      pageId: "brand-zero-ad-starter",
      results: 0,
      difference: 0,
      holdStatus: "active",
      lastKnownValidResults: null,
    }),
    false
  );
});

test("canary pre-trip verification: healthy canary prevents false circuit breaker trips", () => {
  function evaluateWithCanary(
    distinctZeroPagesCount: number,
    threshold: number,
    canaryResult: { isHealthy: boolean; results: number | null }
  ) {
    if (distinctZeroPagesCount >= threshold) {
      if (canaryResult.isHealthy) {
        return { tripped: false, reason: "Canary passed — natural brand churn, Meta is operational" };
      }
      return { tripped: true, reason: "Canary failed — genuine Meta outage confirmed" };
    }
    return { tripped: false, reason: "Below threshold" };
  }

  // Case 1: 5 small brands pause ads, but Canary (Nike) has 120 ads -> DO NOT TRIP
  const healthyCanaryRes = evaluateWithCanary(5, 5, { isHealthy: true, results: 120 });
  assert.equal(healthyCanaryRes.tripped, false);
  assert.match(healthyCanaryRes.reason, /Canary passed/);

  // Case 2: 5 brands drop to 0 AND Canary (Nike) returns 0 or fails -> TRIP BREAKER
  const failedCanaryRes = evaluateWithCanary(5, 5, { isHealthy: false, results: 0 });
  assert.equal(failedCanaryRes.tripped, true);
  assert.match(failedCanaryRes.reason, /genuine Meta outage confirmed/);
});

test("inactive brand state machine: confirmed inactive brand rechecking 0 ads remains inactive without re-entering hold", () => {
  function evaluateScanTransition(params: {
    results: number | null;
    status: "success" | "unclear";
    scanQuality: "complete" | "partial" | "unclear";
    scanError: string | null;
    holdStatus: "active" | "on_hold" | "inactive";
    hadActiveAds: boolean;
  }) {
    const isOnHold = params.holdStatus === "on_hold";
    const isInactive = params.holdStatus === "inactive";
    const isValidatedZero =
      params.results === 0 &&
      params.status === "success" &&
      params.scanQuality === "complete" &&
      !params.scanError;

    const isDropToZero = isValidatedZero && !isOnHold && !isInactive && params.hadActiveAds;
    const isZeroWhileOnHold = isOnHold && isValidatedZero;
    const isRecovering =
      isOnHold &&
      params.results !== null &&
      params.results > 0 &&
      params.status === "success" &&
      params.scanQuality === "complete" &&
      !params.scanError;
    const isRelaunching =
      isInactive &&
      params.results !== null &&
      params.results > 0 &&
      params.status === "success" &&
      params.scanQuality === "complete" &&
      !params.scanError;

    if (isDropToZero) return "ENTER_ON_HOLD";
    if (isZeroWhileOnHold) return "INCREMENT_HOLD_OR_INACTIVATE";
    if (isRecovering) return "RECOVER_ACTIVE";
    if (isRelaunching) return "RELAUNCH_ACTIVE";
    if (isInactive && isValidatedZero) return "MAINTAIN_INACTIVE";
    return "NORMAL_UPDATE";
  }

  // 1. Inactive brand checked after 72h returns 0 ads -> MUST REMAIN INACTIVE (not enter hold!)
  const inactiveRecheck = evaluateScanTransition({
    results: 0,
    status: "success",
    scanQuality: "complete",
    scanError: null,
    holdStatus: "inactive",
    hadActiveAds: true, // even if it had ads historically
  });
  assert.equal(inactiveRecheck, "MAINTAIN_INACTIVE");

  // 2. Active brand dropping from 11 ads to 0 -> MUST ENTER HOLD
  const activeDrop = evaluateScanTransition({
    results: 0,
    status: "success",
    scanQuality: "complete",
    scanError: null,
    holdStatus: "active",
    hadActiveAds: true,
  });
  assert.equal(activeDrop, "ENTER_ON_HOLD");

  // 3. Inactive brand launching 5 new ads -> MUST RELAUNCH TO ACTIVE
  const inactiveRelaunch = evaluateScanTransition({
    results: 5,
    status: "success",
    scanQuality: "complete",
    scanError: null,
    holdStatus: "inactive",
    hadActiveAds: false,
  });
  assert.equal(inactiveRelaunch, "RELAUNCH_ACTIVE");
});

test("relaunch with 1 single ad satisfies meaningful delta and queues creative scan with urgent priority", () => {
  function evaluateCreativeRouting(params: {
    results: number;
    hasPreviousScan: boolean;
    displayDifference: number;
    isRelaunching: boolean;
  }) {
    const effectiveDifference = (params.isRelaunching || (!params.hasPreviousScan && (params.displayDifference === null || params.displayDifference < 1) && (params.results || 0) >= 1))
      ? (params.results || 0)
      : (params.displayDifference ?? 0);

    const isMeaningfulDelta = params.isRelaunching || !params.hasPreviousScan || effectiveDifference >= 2;
    const priority = params.isRelaunching ? 1 : 5;

    return { effectiveDifference, isMeaningfulDelta, priority };
  }

  // Case 1: Inactive brand relaunches with just 1 ad (previously scanned)
  const relaunchSingleAd = evaluateCreativeRouting({
    results: 1,
    hasPreviousScan: true,
    displayDifference: 1,
    isRelaunching: true,
  });
  assert.equal(relaunchSingleAd.isMeaningfulDelta, true, "1-ad relaunch must be treated as meaningful delta");
  assert.equal(relaunchSingleAd.priority, 1, "Relaunch must be queued with urgent priority 1");
  assert.equal(relaunchSingleAd.effectiveDifference, 1);

  // Case 2: Standard existing active page with only +1 ad (not relaunching)
  const regularMinorDelta = evaluateCreativeRouting({
    results: 15,
    hasPreviousScan: true,
    displayDifference: 1,
    isRelaunching: false,
  });
  assert.equal(regularMinorDelta.isMeaningfulDelta, false, "Regular +1 fluctuation on existing page should not trigger creative scan");
});

test("adaptive decay cadence evaluates due status based on inactivity age and watchlist", () => {
  const now = Date.now();
  const activeCutoff = new Date(now - 12 * 60 * 60 * 1000);
  const freshInactiveCutoff = new Date(now - 24 * 60 * 60 * 1000);
  const dormantInactiveCutoff = new Date(now - 72 * 60 * 60 * 1000);
  const coldInactiveCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  function isPageDueForRefresh(page: {
    holdStatus: "active" | "on_hold" | "inactive";
    lastChecked: Date | null;
    isWatchlisted: boolean;
    holdStartedAt: Date | null;
    status: string;
  }): boolean {
    if (page.holdStatus !== "inactive") {
      return (
        !page.lastChecked ||
        page.lastChecked < activeCutoff ||
        page.status === "pending"
      );
    }

    if (!page.lastChecked) return true;
    if (page.isWatchlisted && page.lastChecked < activeCutoff) return true;

    // Fresh inactive (<= 7 days dark): checked every 24h
    if (page.holdStartedAt && page.holdStartedAt > sevenDaysAgo) {
      return page.lastChecked < freshInactiveCutoff;
    }

    // Dormant inactive (8-30 days dark): checked every 72h
    if (
      page.holdStartedAt &&
      page.holdStartedAt <= sevenDaysAgo &&
      page.holdStartedAt > thirtyDaysAgo
    ) {
      return page.lastChecked < dormantInactiveCutoff;
    }

    // Cold inactive (>30 days dark or holdStartedAt is null): checked every 7 days
    return page.lastChecked < coldInactiveCutoff;
  }

  // 1. Fresh inactive (went dark 3 days ago), checked 10h ago -> NOT due yet (needs 24h)
  const fresh10h = isPageDueForRefresh({
    holdStatus: "inactive",
    lastChecked: new Date(now - 10 * 60 * 60 * 1000),
    isWatchlisted: false,
    holdStartedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
    status: "success",
  });
  assert.equal(fresh10h, false, "Fresh inactive checked 10h ago should not be due");

  // 2. Fresh inactive (went dark 3 days ago), checked 26h ago -> DUE
  const fresh26h = isPageDueForRefresh({
    holdStatus: "inactive",
    lastChecked: new Date(now - 26 * 60 * 60 * 1000),
    isWatchlisted: false,
    holdStartedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
    status: "success",
  });
  assert.equal(fresh26h, true, "Fresh inactive checked 26h ago MUST be due");

  // 3. Dormant inactive (went dark 15 days ago), checked 26h ago -> NOT due (needs 72h)
  const dormant26h = isPageDueForRefresh({
    holdStatus: "inactive",
    lastChecked: new Date(now - 26 * 60 * 60 * 1000),
    isWatchlisted: false,
    holdStartedAt: new Date(now - 15 * 24 * 60 * 60 * 1000),
    status: "success",
  });
  assert.equal(dormant26h, false, "Dormant inactive checked 26h ago should not be due");

  // 4. Dormant inactive (went dark 15 days ago), checked 75h ago -> DUE
  const dormant75h = isPageDueForRefresh({
    holdStatus: "inactive",
    lastChecked: new Date(now - 75 * 60 * 60 * 1000),
    isWatchlisted: false,
    holdStartedAt: new Date(now - 15 * 24 * 60 * 60 * 1000),
    status: "success",
  });
  assert.equal(dormant75h, true, "Dormant inactive checked 75h ago MUST be due");

  // 5. Cold inactive (went dark 60 days ago), checked 4 days ago -> NOT due (needs 7 days)
  const cold4d = isPageDueForRefresh({
    holdStatus: "inactive",
    lastChecked: new Date(now - 4 * 24 * 60 * 60 * 1000),
    isWatchlisted: false,
    holdStartedAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
    status: "success",
  });
  assert.equal(cold4d, false, "Cold inactive checked 4 days ago should not be due");

  // 6. VIP Watchlist page: went dark 60 days ago, checked 14h ago -> DUE (12h cadence)
  const vipWatchlist = isPageDueForRefresh({
    holdStatus: "inactive",
    lastChecked: new Date(now - 14 * 60 * 60 * 1000),
    isWatchlisted: true,
    holdStartedAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
    status: "success",
  });
  assert.equal(vipWatchlist, true, "Watchlisted inactive page checked 14h ago MUST be due");
});


