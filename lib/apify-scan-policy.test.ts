import test from "node:test";
import assert from "node:assert/strict";
import { resolveTier, evaluateScanRules } from "./apify-scan-policy";

test("resolveTier categorizes workload tiers correctly", () => {
  assert.equal(resolveTier(0), "tier1_gh");
  assert.equal(resolveTier(5), "tier1_gh");
  assert.equal(resolveTier(8), "tier1_gh");
  assert.equal(resolveTier(9), "tier2_local");
  assert.equal(resolveTier(20), "tier2_local");
  assert.equal(resolveTier(30), "tier2_local");
  assert.equal(resolveTier(31), "tier3_apify");
  assert.equal(resolveTier(85), "tier3_apify");
});

test("Pattern 1: Single-ad (+1) fluctuation is suppressed by noise gate", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-16T12:00:00Z"); // 48h ago

  // History: [30, 30, 30, 30, 30] and today count = 31 (+1 test ad above 30)
  const decision = evaluateScanRules({
    pageId: "test-page-noise-gate",
    url: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=123",
    currentResults: 31,
    lastCreativeScan: lastScan,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 31 },
    ],
    now,
  });

  assert.equal(decision.action, "SKIP");
  assert.equal(decision.isFullScan, false);
  assert.match(decision.reason, /noise gate/);
  assert.equal(decision.historicalPeak, 30);
});

test("Pattern 1: Genuine New Product Launch (>= +2 ads above Peak_3d) triggers DELTA_SCAN only", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-16T12:00:00Z"); // 48h ago

  // History: [30, 30, 30, 30, 30] and today count = 33 (+3 ads above 30)
  const decision = evaluateScanRules({
    pageId: "test-page-1",
    url: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=123",
    currentResults: 33,
    lastCreativeScan: lastScan,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 33 },
    ],
    now,
  });

  assert.equal(decision.action, "DELTA_SCAN");
  assert.equal(decision.isFullScan, false);
  assert.equal(decision.tier, "tier3_apify");
  assert.equal(decision.limit, 10); // max(10, 3 + 5)
  assert.equal(decision.netDelta, 3);
  assert.equal(decision.historicalPeak, 30);
});

test("Pattern 2: Confirmed Descaling triggers FULL_RECONCILE when 7-day cooldown expired", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-16T12:00:00Z");
  const lastReconcile = new Date("2026-11-10T12:00:00Z"); // 8 days ago (expired)

  // History: [35, 35, 35, 35, 20, 20] (scans after Nov 10, dropped from 35 to 20 and sustained)
  const decision = evaluateScanRules({
    pageId: "test-page-2",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=456",
    currentResults: 20,
    lastCreativeScan: lastScan,
    lastReconcileFinishedAt: lastReconcile,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 35, checkedAt: new Date("2026-11-16T00:00:00Z") },
      { results: 35, checkedAt: new Date("2026-11-16T12:00:00Z") },
      { results: 35, checkedAt: new Date("2026-11-17T00:00:00Z") },
      { results: 35, checkedAt: new Date("2026-11-17T12:00:00Z") },
      { results: 20, checkedAt: new Date("2026-11-18T00:00:00Z") },
      { results: 20, checkedAt: new Date("2026-11-18T12:00:00Z") },
    ],
    now,
  });

  assert.equal(decision.action, "FULL_RECONCILE");
  assert.equal(decision.isFullScan, true);
  assert.equal(decision.limit, 25); // 20 + 5
  assert.equal(decision.historicalPeak, 35);
});

test("Pattern 2: Confirmed Descaling SKIPS when 7-day cooldown is active", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-16T12:00:00Z");
  const lastReconcile = new Date("2026-11-15T12:00:00Z"); // 3 days ago (active cooldown!)

  const decision = evaluateScanRules({
    pageId: "test-page-reconcile-cooldown",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=456",
    currentResults: 20,
    lastCreativeScan: lastScan,
    lastReconcileFinishedAt: lastReconcile,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 35, checkedAt: new Date("2026-11-16T00:00:00Z") },
      { results: 35, checkedAt: new Date("2026-11-16T12:00:00Z") },
      { results: 35, checkedAt: new Date("2026-11-17T00:00:00Z") },
      { results: 35, checkedAt: new Date("2026-11-17T12:00:00Z") },
      { results: 20, checkedAt: new Date("2026-11-18T00:00:00Z") },
      { results: 20, checkedAt: new Date("2026-11-18T12:00:00Z") },
    ],
    now,
  });

  assert.equal(decision.action, "SKIP");
  assert.equal(decision.isFullScan, false);
  assert.match(decision.reason, /7-day descaling reconciliation cooldown active/);
});

test("Pattern 2: Jitter tolerance |s0 - s1| <= 2 still confirms descaling", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-16T12:00:00Z");

  // History: [40, 40, 40, 40, 21, 20] (|20 - 21| = 1 <= 2)
  const decision = evaluateScanRules({
    pageId: "test-page-jitter",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=456",
    currentResults: 20,
    lastCreativeScan: lastScan,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 40 },
      { results: 40 },
      { results: 40 },
      { results: 40 },
      { results: 21 },
      { results: 20 },
    ],
    now,
  });

  assert.equal(decision.action, "FULL_RECONCILE");
  assert.equal(decision.isFullScan, true);
  assert.equal(decision.limit, 25);
});

test("Pattern 3: Bounce-Back Jitter (s0 > s1 but <= Peak_3d) is suppressed ($0 spend)", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-16T12:00:00Z");

  // History: [50, 50, 48, 48, 49, 50] (dropped to 48 then bounced back to 50, peak is 50)
  const decision = evaluateScanRules({
    pageId: "test-page-3",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=789",
    currentResults: 50,
    lastCreativeScan: lastScan,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 50 },
      { results: 50 },
      { results: 48 },
      { results: 48 },
      { results: 49 },
      { results: 50 },
    ],
    now,
  });

  assert.equal(decision.action, "SKIP");
  assert.match(decision.reason, /Bounce-back jitter/);
  assert.equal(decision.limit, 0);
});

test("Pattern 4: Staleness Heartbeat runs maintenance full scan after >= 6 days flat", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-11T12:00:00Z"); // 7 days ago

  // History: [35, 35, 35, 35, 35, 35] completely flat
  const decision = evaluateScanRules({
    pageId: "test-page-4",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=999",
    currentResults: 35,
    lastCreativeScan: lastScan,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 35 },
      { results: 35 },
      { results: 35 },
      { results: 35 },
      { results: 35 },
      { results: 35 },
    ],
    now,
  });

  assert.equal(decision.action, "MAINTENANCE_FULL");
  assert.equal(decision.isFullScan, true);
  assert.equal(decision.limit, 40); // 35 + 5
});

test("Safety Lock 1: Strict 24h Cooldown skips scan even on increase", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-18T04:00:00Z"); // Scanned 8 hours ago

  const decision = evaluateScanRules({
    pageId: "test-cooldown",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=111",
    currentResults: 40,
    lastCreativeScan: lastScan,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 40 },
    ],
    now,
  });

  assert.equal(decision.action, "SKIP");
  assert.match(decision.reason, /24h cooldown/);
});

test("Safety Lock 2: 12h Failure Circuit Breaker skips retries", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const failedAt = new Date("2026-11-18T09:00:00Z"); // Failed 3 hours ago

  const decision = evaluateScanRules({
    pageId: "test-failure",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=222",
    currentResults: 40,
    lastCreativeScan: new Date("2026-11-10T00:00:00Z"),
    latestFailedScanFinishedAt: failedAt,
    latestFailedScanReason: "apify_timeout",
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 40 },
    ],
    now,
  });

  assert.equal(decision.action, "SKIP");
  assert.match(decision.reason, /12h failure cooldown/);
});

test("Descaling Recovery Anchor: Resets peak after reconciliation so new launches aren't masked", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const reconcileTime = new Date("2026-11-17T12:00:00Z"); // Reconciled yesterday at 20 ads

  // Trajectory: 3 days ago was 35. Dropped to 20 yesterday (reconciled). Today climbs to 23 (+3 test ad).
  const decision = evaluateScanRules({
    pageId: "test-recovery",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=333",
    currentResults: 23,
    lastCreativeScan: new Date("2026-11-15T00:00:00Z"),
    lastReconcileFinishedAt: reconcileTime,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 35, checkedAt: new Date("2026-11-16T00:00:00Z") }, // Before reconcile
      { results: 35, checkedAt: new Date("2026-11-16T12:00:00Z") }, // Before reconcile
      { results: 20, checkedAt: new Date("2026-11-17T00:00:00Z") }, // Before reconcile
      { results: 20, checkedAt: new Date("2026-11-17T13:00:00Z") }, // AFTER reconcile
      { results: 20, checkedAt: new Date("2026-11-18T00:00:00Z") }, // AFTER reconcile
      { results: 23, checkedAt: new Date("2026-11-18T12:00:00Z") }, // TODAY
    ],
    now,
  });

  // Because the 35 peak was before reconciliation, peak is bounded to 20!
  // Therefore 23 > 20 triggers a genuine new launch!
  assert.equal(decision.action, "DELTA_SCAN");
  assert.equal(decision.historicalPeak, 20);
  assert.equal(decision.netDelta, 3);
  assert.equal(decision.limit, 10);
});

test("Brand New Page Bootstrap: First time scan gets BOOTSTRAP_FULL", () => {
  const now = new Date("2026-11-18T12:00:00Z");

  const decision = evaluateScanRules({
    pageId: "test-new-page",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=555",
    currentResults: 45,
    lastCreativeScan: null, // Never scanned before
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [{ results: 45 }],
    now,
  });

  assert.equal(decision.action, "BOOTSTRAP_FULL");
  assert.equal(decision.isFullScan, true);
  assert.equal(decision.limit, 55); // 45 + 10
  assert.equal(decision.tier, "tier3_apify");
});

test("Scanner Anomaly Filter: Single-batch jump >= 50 ads is suppressed with SKIP", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-16T12:00:00Z");

  // Historical peak 30, today count suddenly jumps to 85 (+55 ad spike)
  const decision = evaluateScanRules({
    pageId: "test-anomaly-page",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=777",
    currentResults: 85,
    lastCreativeScan: lastScan,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 85 },
    ],
    now,
  });

  assert.equal(decision.action, "SKIP");
  assert.match(decision.reason, /Scanner anomaly: count jump/);
  assert.match(decision.reason, /\+55 ads >= 50/);
});

test("Scanner Boundary Check: Legitimate scaling jump of +49 ads still triggers DELTA_SCAN", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const lastScan = new Date("2026-11-16T12:00:00Z");

  // Historical peak 30, today count jumps to 79 (+49 ad spike, right below 50 limit)
  const decision = evaluateScanRules({
    pageId: "test-boundary-page",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=888",
    currentResults: 79,
    lastCreativeScan: lastScan,
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 30 },
      { results: 79 },
    ],
    now,
  });

  assert.equal(decision.action, "DELTA_SCAN");
  assert.equal(decision.netDelta, 49);
});

test("Bootstrap Invariant: Brand-new page onboarding with 60 ads still triggers BOOTSTRAP_FULL", () => {
  const now = new Date("2026-11-18T12:00:00Z");

  const decision = evaluateScanRules({
    pageId: "test-new-high-ad-page",
    url: "https://www.facebook.com/ads/library/?view_all_page_id=999",
    currentResults: 60,
    lastCreativeScan: null, // First time onboarding
    autoCreativeScan: true,
    holdStatus: "active",
    historyChronological: [{ results: 60 }],
    now,
  });

  assert.equal(decision.action, "BOOTSTRAP_FULL");
  assert.equal(decision.isFullScan, true);
  assert.equal(decision.limit, 70); // 60 + 10
});
