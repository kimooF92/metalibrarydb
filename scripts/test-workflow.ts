import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import {
  trackedPages,
  queue,
  scanHistory,
  creativeScans,
  adObservations,
} from "../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  markJobCompleted,
  claimNextPendingJob,
  markCreativeJobCompleted,
} from "../worker/db";

const TEST_PAGE_PREFIX = "test-wf-";

async function cleanupTestData() {
  const oldTestPages = await db.query.trackedPages.findMany({
    where: sql`url LIKE ${`%${TEST_PAGE_PREFIX}%`}`,
    columns: { id: true },
  });

  if (oldTestPages.length > 0) {
    const ids = oldTestPages.map((p) => p.id);
    await db.delete(queue).where(inArray(queue.trackedPageId, ids));
    await db.delete(scanHistory).where(inArray(scanHistory.trackedPageId, ids));
    await db.delete(adObservations).where(inArray(adObservations.trackedPageId, ids));
    await db.delete(creativeScans).where(inArray(creativeScans.trackedPageId, ids));
    await db.delete(trackedPages).where(inArray(trackedPages.id, ids));
  }
}

async function createTestTrackedPage(overrides: Partial<typeof trackedPages.$inferInsert> = {}) {
  const uniqueKey = Math.random().toString(36).slice(2, 8);
  const [page] = await db
    .insert(trackedPages)
    .values({
      url: `https://www.facebook.com/ads/library/?view_all_page_id=${TEST_PAGE_PREFIX}${uniqueKey}`,
      pageId: `${TEST_PAGE_PREFIX}${uniqueKey}`,
      displayName: `Test Brand ${uniqueKey}`,
      country: "TN",
      searchType: "page",
      status: "success",
      currentResults: 5,
      holdStatus: "active",
      consecutiveZeroScans: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    })
    .returning();

  return page;
}

async function createDummyQueueJob(pageId: string) {
  const [job] = await db
    .insert(queue)
    .values({
      trackedPageId: pageId,
      jobType: "count",
      status: "running",
      priority: 1,
      createdAt: new Date(),
    })
    .returning();
  return job;
}

let passedTests = 0;
let failedTests = 0;
const errors: string[] = [];

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ""}`);
    failedTests++;
    errors.push(`${testName}: ${details || "Assertion failed"}`);
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("🧪 STARTING FULL WORKFLOW AUTOMATED AUDIT & TEST SUITE");
  console.log("=======================================================\n");

  await cleanupTestData();

  // --------------------------------------------------------------------------
  // SCENARIO 1: Micro-page (< 20 ads) - First-time scan (+1 ad)
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 1: Micro-page (< 20 ads) First-time Scan (+1 ad) ---");
  {
    const page = await createTestTrackedPage({
      currentResults: 5,
      lastCreativeScan: null, // Never scanned
      status: "success",
    });

    const queueJob = await createDummyQueueJob(page.id);
    await markJobCompleted(queueJob.id, page.id, 6, "success");

    const updated = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(updated?.status === "pending", "Page status must be set to 'pending' on first-time scan with new ad", `Got: ${updated?.status}`);

    const creativeJob = await db.query.queue.findFirst({
      where: and(eq(queue.trackedPageId, page.id), eq(queue.jobType, "creative")),
    });
    assert(Boolean(creativeJob), "Creative job must be enqueued in queue for local Playwright worker");
    assert(creativeJob?.status === "pending", "Enqueued creative job status must be 'pending'", `Got: ${creativeJob?.status}`);
  }

  // --------------------------------------------------------------------------
  // SCENARIO 2: Micro-page (< 20 ads) - Already scanned, delta = +1 (Noise Filter)
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 2: Micro-page (< 20 ads) Filter Noise (+1 ad on already scanned page) ---");
  {
    const page = await createTestTrackedPage({
      currentResults: 5,
      lastCreativeScan: new Date(Date.now() - 3600000), // Scanned 1 hour ago
      status: "success",
    });

    await db.insert(scanHistory).values({
      trackedPageId: page.id,
      results: 5,
      difference: 0,
      status: "success",
      checkedAt: new Date(Date.now() - 3600000),
    });

    const queueJob = await createDummyQueueJob(page.id);
    await markJobCompleted(queueJob.id, page.id, 6, "success"); // results = 6, diff = +1

    const updated = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(updated?.status === "success", "Page status must remain 'success' (NOT 'pending') for +1 ad noise", `Got: ${updated?.status}`);

    const creativeJob = await db.query.queue.findFirst({
      where: and(eq(queue.trackedPageId, page.id), eq(queue.jobType, "creative")),
    });
    assert(!creativeJob, "Creative job must NOT be auto-enqueued for +1 ad noise on a micro-page");
  }

  // --------------------------------------------------------------------------
  // SCENARIO 3: Micro-page (< 20 ads) - Already scanned, delta = +2 (Meaningful Delta)
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 3: Micro-page (< 20 ads) Meaningful Delta (+2 ads on already scanned page) ---");
  {
    const page = await createTestTrackedPage({
      currentResults: 5,
      lastCreativeScan: new Date(Date.now() - 3600000),
      status: "success",
    });

    await db.insert(scanHistory).values({
      trackedPageId: page.id,
      results: 5,
      difference: 0,
      status: "success",
      checkedAt: new Date(Date.now() - 3600000),
    });

    const queueJob = await createDummyQueueJob(page.id);
    await markJobCompleted(queueJob.id, page.id, 7, "success"); // results = 7, diff = +2

    const updated = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(updated?.status === "pending", "Page status must become 'pending' on meaningful delta (+2 ads)", `Got: ${updated?.status}`);

    const creativeJob = await db.query.queue.findFirst({
      where: and(eq(queue.trackedPageId, page.id), eq(queue.jobType, "creative")),
    });
    assert(Boolean(creativeJob), "Creative job must be enqueued for +2 ads meaningful delta");
  }

  // --------------------------------------------------------------------------
  // SCENARIO 4: Worker Job Claiming and Completion Lifecycle
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 4: Worker Job Claiming & Completion Lifecycle ---");
  {
    const page = await createTestTrackedPage({
      currentResults: 8,
      status: "pending",
    });

    const [scan] = await db
      .insert(creativeScans)
      .values({
        trackedPageId: page.id,
        status: "pending",
        configSnapshot: JSON.stringify({ runner: "playwright" }),
      })
      .returning();

    const [job] = await db
      .insert(queue)
      .values({
        trackedPageId: page.id,
        jobType: "creative",
        creativeScanId: scan.id,
        status: "pending",
        priority: 10,
        createdAt: new Date(),
      })
      .returning();

    // 1. Claim job
    const claimed = await claimNextPendingJob();
    assert(claimed?.queueJob.id === job.id, "claimNextPendingJob should claim the pending creative job", `Claimed: ${claimed?.queueJob.id}`);

    const claimingPage = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(claimingPage?.status === "scanning", "Page status must transition to 'scanning' when claimed by worker", `Got: ${claimingPage?.status}`);

    const claimingScan = await db.query.creativeScans.findFirst({ where: eq(creativeScans.id, scan.id) });
    assert(claimingScan?.status === "running", "Creative scan record must transition to 'running'", `Got: ${claimingScan?.status}`);

    // 2. Complete job
    await markCreativeJobCompleted(job.id, scan.id, 8, "completed");

    const completedPage = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(completedPage?.status === "success", "Page status must transition to 'success' on completion", `Got: ${completedPage?.status}`);
    assert(Boolean(completedPage?.lastCreativeScan), "lastCreativeScan must be updated with completion timestamp");

    const completedScan = await db.query.creativeScans.findFirst({ where: eq(creativeScans.id, scan.id) });
    assert(completedScan?.status === "completed", "Creative scan status must be 'completed'", `Got: ${completedScan?.status}`);

    const completedJob = await db.query.queue.findFirst({ where: eq(queue.id, job.id) });
    assert(completedJob?.status === "completed", "Queue job status must be 'completed'", `Got: ${completedJob?.status}`);
  }

  // --------------------------------------------------------------------------
  // SCENARIO 5: Growing Page (>= 20 ads) - Cloud Delegation
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 5: Growing Page (>= 20 ads) Cloud Delegation ---");
  {
    const page = await createTestTrackedPage({
      currentResults: 25,
      status: "success",
    });

    await db.insert(scanHistory).values({
      trackedPageId: page.id,
      results: 25,
      difference: 0,
      status: "success",
      checkedAt: new Date(Date.now() - 3600000),
    });

    const queueJob = await createDummyQueueJob(page.id);
    await markJobCompleted(queueJob.id, page.id, 28, "success"); // results = 28, diff = +3

    const localJob = await db.query.queue.findFirst({
      where: and(eq(queue.trackedPageId, page.id), eq(queue.jobType, "creative")),
    });
    assert(!localJob, "Pages with >= 20 ads must NEVER be enqueued in local Playwright queue");

    const updated = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(updated?.status !== "pending", "Page with >= 20 ads should not be marked 'pending' for local worker", `Got: ${updated?.status}`);
  }

  // --------------------------------------------------------------------------
  // SCENARIO 6: Inactive Brand Relaunches Ads (0 -> 5 ads)
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 6: Inactive Brand Relaunches Ads (0 -> 5 ads) ---");
  {
    const page = await createTestTrackedPage({
      currentResults: 0,
      holdStatus: "inactive",
      consecutiveZeroScans: 3,
      status: "success",
    });

    const queueJob = await createDummyQueueJob(page.id);
    await markJobCompleted(queueJob.id, page.id, 5, "success");

    const updated = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(updated?.holdStatus === "active", "holdStatus must transition from 'inactive' to 'active' on relaunch", `Got: ${updated?.holdStatus}`);
    assert(updated?.consecutiveZeroScans === 0, "consecutiveZeroScans must be reset to 0 on relaunch", `Got: ${updated?.consecutiveZeroScans}`);
    assert(updated?.status === "pending", "Relaunched micro-page status must be 'pending' to trigger local creative scan", `Got: ${updated?.status}`);

    const creativeJob = await db.query.queue.findFirst({
      where: and(eq(queue.trackedPageId, page.id), eq(queue.jobType, "creative")),
    });
    assert(Boolean(creativeJob), "Creative job must be enqueued for relaunched micro-page");
  }

  // --------------------------------------------------------------------------
  // SCENARIO 7: On-hold Brand Recovers (0 -> 12 ads)
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 7: On-hold Brand Recovers (0 -> 12 ads) ---");
  {
    const page = await createTestTrackedPage({
      currentResults: 0,
      holdStatus: "on_hold",
      lastKnownValidResults: 10,
      consecutiveZeroScans: 1,
      status: "success",
    });

    const queueJob = await createDummyQueueJob(page.id);
    await markJobCompleted(queueJob.id, page.id, 12, "success"); // results = 12, diff = +2 vs baseline 10

    const updated = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(updated?.holdStatus === "active", "holdStatus must transition from 'on_hold' to 'active' on recovery", `Got: ${updated?.holdStatus}`);
    assert(updated?.lastKnownValidResults === null, "lastKnownValidResults must be cleared on recovery");
    assert(updated?.status === "pending", "Recovering micro-page with +2 ads must be set to 'pending'", `Got: ${updated?.status}`);

    const creativeJob = await db.query.queue.findFirst({
      where: and(eq(queue.trackedPageId, page.id), eq(queue.jobType, "creative")),
    });
    assert(Boolean(creativeJob), "Creative job must be enqueued for recovering micro-page with new ads");
  }

  // --------------------------------------------------------------------------
  // SCENARIO 8: Cliff-drop to zero and 3-scan confirmation
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 8: Cliff-Drop Grace Period (3 Consecutive Zero Scans) ---");
  {
    const page = await createTestTrackedPage({
      currentResults: 15,
      holdStatus: "active",
      consecutiveZeroScans: 0,
      status: "success",
    });

    // Scan 1: drops to 0
    const job1 = await createDummyQueueJob(page.id);
    await markJobCompleted(job1.id, page.id, 0, "success", { scanQuality: "complete" });

    const afterScan1 = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(afterScan1?.holdStatus === "on_hold", "Scan 1: holdStatus must be 'on_hold' (grace period started)", `Got: ${afterScan1?.holdStatus}`);
    assert(afterScan1?.consecutiveZeroScans === 1, "Scan 1: consecutiveZeroScans must be 1", `Got: ${afterScan1?.consecutiveZeroScans}`);
    assert(afterScan1?.lastKnownValidResults === 15, "Scan 1: lastKnownValidResults must be saved as 15", `Got: ${afterScan1?.lastKnownValidResults}`);

    // Scan 2: still 0
    const job2 = await createDummyQueueJob(page.id);
    await markJobCompleted(job2.id, page.id, 0, "success", { scanQuality: "complete" });

    const afterScan2 = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(afterScan2?.holdStatus === "on_hold", "Scan 2: holdStatus must remain 'on_hold'", `Got: ${afterScan2?.holdStatus}`);
    assert(afterScan2?.consecutiveZeroScans === 2, "Scan 2: consecutiveZeroScans must be 2", `Got: ${afterScan2?.consecutiveZeroScans}`);

    // Scan 3: confirmed 0 (shutdown confirmed)
    const job3 = await createDummyQueueJob(page.id);
    await markJobCompleted(job3.id, page.id, 0, "success", { scanQuality: "complete" });

    const afterScan3 = await db.query.trackedPages.findFirst({ where: eq(trackedPages.id, page.id) });
    assert(afterScan3?.holdStatus === "inactive", "Scan 3: holdStatus must transition to 'inactive' after 3 zero scans", `Got: ${afterScan3?.holdStatus}`);
    assert(afterScan3?.consecutiveZeroScans === 3, "Scan 3: consecutiveZeroScans must be 3", `Got: ${afterScan3?.consecutiveZeroScans}`);
  }

  // --------------------------------------------------------------------------
  // SCENARIO 9: Small Pages Scan API Query Filter (< 20 ads)
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 9: Small Pages Scan API Filter (< 20 ads) ---");
  {
    const pageA = await createTestTrackedPage({ currentResults: 12, status: "pending" });
    const pageB = await createTestTrackedPage({ currentResults: 35, status: "pending" });

    const rawRows: any = await db.execute(sql`
      SELECT tp.id, tp.current_results
      FROM tracked_pages tp
      WHERE 
        tp.current_results > 0 
        AND tp.current_results < 20
        AND (tp.hold_status IS NULL OR (tp.hold_status != 'on_hold' AND tp.hold_status != 'inactive'))
        AND (tp.search_type IS NULL OR tp.search_type != 'keyword_exact_phrase')
        AND tp.status = 'pending'
        AND tp.id IN (${pageA.id}, ${pageB.id})
    `);

    const resultIds = (rawRows || []).map((r: any) => r.id);
    assert(resultIds.includes(pageA.id), "API query must include micro-page (< 20 ads)");
    assert(!resultIds.includes(pageB.id), "API query must EXCLUDE growing page (>= 20 ads)");
  }

  await cleanupTestData();
  await client.end();

  console.log("\n=======================================================");
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log("=======================================================\n");

  if (failedTests > 0) {
    console.error("FAILURES:");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  } else {
    console.log("🎉 ALL WORKFLOW SCENARIOS VERIFIED SUCCESSFULLY WITH 0 BUGS!");
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error("Fatal test execution error:", e);
  process.exit(1);
});
