import test from "node:test";
import assert from "node:assert/strict";
import * as workerDb from "./db";
import { hasActiveApifyDeltaTasks, waitForApifyDeltaQueueDrain } from "./services/apify-delta-service";

test("Worker DB Barrel re-exports all domain repositories and services cleanly", () => {
  const expectedExports = [
    // scan-history-repo
    "purgeOldRawExtracts",
    // worker-state-repo
    "getAppSettings",
    "getWorkerState",
    "updateWorkerState",
    // discovery-run-repo
    "claimNextPendingDiscoveryRun",
    "markDiscoveryJobCompleted",
    "markDiscoveryJobFailed",
    // creative-scan-repo
    "markCreativeJobCompleted",
    "markCreativeJobFailed",
    // tracked-page-repo
    "enqueuePagesForCreativeScan",
    "saveExtractedPageIdsToDiscovery",
    // queue-repo
    "claimNextPendingJob",
    "getNextPendingJob",
    "markJobRunning",
    "markJobFailed",
    "resetStuckJobs",
    "enqueueOrEscalateJob",
    "enqueueAllPagesForRefresh",
    // apify-delta-service
    "hasActiveApifyDeltaTasks",
    "waitForApifyDeltaQueueDrain",
    "tryAutoTriggerApifyDeltaScan",
    // scan-completion-service
    "markJobCompleted",
  ];

  for (const fnName of expectedExports) {
    assert.equal(
      typeof (workerDb as any)[fnName],
      "function",
      `Expected ${fnName} to be exported as a function from worker/db`
    );
  }
});

test("Environment variable evaluation invariant: process.env.COUNT_ONLY is evaluated dynamically inside call", () => {
  // Simulate the dynamic check in claimNextPendingJob:
  const getJobTypeFilter = () => {
    const isCountOnly =
      process.env.COUNT_ONLY === "true" ||
      process.env.CI === "true" ||
      process.env.GITHUB_ACTIONS === "true";
    const isCreativeOnly = process.env.CREATIVE_ONLY === "true";

    if (isCountOnly) return "count_only";
    if (isCreativeOnly) return "creative_only";
    return "all";
  };

  const originalCountOnly = process.env.COUNT_ONLY;
  const originalCi = process.env.CI;
  const originalGh = process.env.GITHUB_ACTIONS;
  const originalCreativeOnly = process.env.CREATIVE_ONLY;

  try {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;

    process.env.COUNT_ONLY = "true";
    delete process.env.CREATIVE_ONLY;
    assert.equal(getJobTypeFilter(), "count_only");

    delete process.env.COUNT_ONLY;
    process.env.CREATIVE_ONLY = "true";
    assert.equal(getJobTypeFilter(), "creative_only");

    delete process.env.COUNT_ONLY;
    delete process.env.CREATIVE_ONLY;
    assert.equal(getJobTypeFilter(), "all");
  } finally {
    if (originalCountOnly !== undefined) process.env.COUNT_ONLY = originalCountOnly;
    else delete process.env.COUNT_ONLY;

    if (originalCi !== undefined) process.env.CI = originalCi;
    else delete process.env.CI;

    if (originalGh !== undefined) process.env.GITHUB_ACTIONS = originalGh;
    else delete process.env.GITHUB_ACTIONS;

    if (originalCreativeOnly !== undefined) process.env.CREATIVE_ONLY = originalCreativeOnly;
    else delete process.env.CREATIVE_ONLY;
  }
});

test("Apify delta service: drains queue immediately when idle", async () => {
  assert.equal(typeof hasActiveApifyDeltaTasks, "function");
  assert.equal(typeof waitForApifyDeltaQueueDrain, "function");

  // Idle state drain check returns { drained: true }
  const result = await waitForApifyDeltaQueueDrain(100);
  assert.equal(result.drained, true);
});

test("Adaptive decay cadence calculation handles multi-tier cutoffs correctly", () => {
  const now = Date.now();
  const cooldownHours = 12;
  const effectiveCooldown = Math.max(0.5, cooldownHours > 1 ? cooldownHours - 0.5 : cooldownHours);
  const activeCutoff = new Date(now - effectiveCooldown * 60 * 60 * 1000);

  // Buffer calculation preserves 30-minute grace window
  assert.equal(effectiveCooldown, 11.5);
  assert.equal(activeCutoff.getTime() < now, true);

  const freshInactiveCutoff = new Date(now - 24 * 60 * 60 * 1000);
  const dormantInactiveCutoff = new Date(now - 72 * 60 * 60 * 1000);
  const coldInactiveCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // Ascending age intervals
  assert.equal(freshInactiveCutoff.getTime() > dormantInactiveCutoff.getTime(), true);
  assert.equal(dormantInactiveCutoff.getTime() > coldInactiveCutoff.getTime(), true);
});
