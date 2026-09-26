import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { trackedPages, queue, creativeScans, ads } from "../db/schema";
import { eq, sql, inArray } from "drizzle-orm";

async function main() {
  console.log("==========================================");
  console.log(" 🔄 Resetting Small Pages Scanned by CI    ");
  console.log("==========================================");

  // 1. Identify all small pages intercepted by GitHub Actions Playwright runs since Sept 25
  const affectedPagesResult: any = await db.execute(sql`
    SELECT DISTINCT tp.id, tp.display_name, tp.page_id, tp.current_results
    FROM creative_scans cs
    JOIN tracked_pages tp ON tp.id = cs.tracked_page_id
    WHERE cs.config_snapshot::text LIKE '%playwright%'
      AND cs.created_at >= '2026-09-25 00:00:00+00'
      AND (tp.current_results > 0 AND tp.current_results < 50)
      AND (tp.hold_status IS NULL OR (tp.hold_status != 'on_hold' AND tp.hold_status != 'inactive'))
      AND (tp.search_type IS NULL OR tp.search_type != 'keyword_exact_phrase')
    ORDER BY tp.current_results DESC;
  `);

  const pages = (Array.isArray(affectedPagesResult) ? affectedPagesResult : affectedPagesResult?.rows || []) as any[];

  console.log(`Found ${pages.length} small page(s) affected by GitHub Actions Playwright runs.`);
  if (pages.length === 0) {
    console.log("No affected pages found. Exiting.");
    process.exit(0);
  }

  const pageIds = pages.map((p) => p.id);

  // 2. Remove any old completed/failed queue entries for these pages to keep queue clean
  await db.execute(sql`
    DELETE FROM queue 
    WHERE tracked_page_id IN (${sql.join(pageIds.map((id) => sql`${id}`), sql`, `)})
      AND status IN ('completed', 'failed');
  `);

  // 3. Un-archive ads that were incorrectly marked archived during these scroll-less scans
  const unarchiveResult = await db.execute(sql`
    UPDATE ads
    SET is_archived = false, archived_at = NULL
    WHERE page_id IN (
      SELECT page_id FROM tracked_pages 
      WHERE id IN (${sql.join(pageIds.map((id) => sql`${id}`), sql`, `)})
        AND page_id IS NOT NULL
    )
    AND is_archived = true
    AND updated_at >= '2026-09-25 00:00:00+00';
  `);

  console.log(`Restored falsely-archived ads for affected pages.`);

  // 4. Enqueue fresh pending creative scans for local worker
  let enqueuedCount = 0;
  for (const page of pages) {
    // Check if already has pending or running queue job
    const existing = await db.query.queue.findFirst({
      where: (q, { and, eq: eqCol, inArray: inArrayCol }) =>
        and(
          eqCol(q.trackedPageId, page.id),
          eqCol(q.jobType, "creative"),
          inArrayCol(q.status, ["pending", "running"])
        ),
    });

    if (!existing) {
      const [scanRecord] = await db
        .insert(creativeScans)
        .values({
          trackedPageId: page.id,
          status: "pending",
          configSnapshot: JSON.stringify({
            runner: "playwright",
            resetFromCi: true,
            totalResults: page.current_results,
          }),
          outcomeDetails: `Queued for local residential Playwright scan (restored from CI interception, ${page.current_results} ads)`,
        })
        .returning();

      await db.insert(queue).values({
        trackedPageId: page.id,
        jobType: "creative",
        creativeScanId: scanRecord.id,
        status: "pending",
        priority: 5,
      });

      enqueuedCount++;
    }

    // Set page status to pending and reset last_creative_scan so UI shows clean state
    await db
      .update(trackedPages)
      .set({
        status: "pending",
        lastCreativeScan: null,
        updatedAt: new Date(),
      })
      .where(eq(trackedPages.id, page.id));
  }

  console.log(`✅ Successfully reset and queued ${enqueuedCount} page(s) for local Playwright creative scan!`);
  console.log(`They will now appear in your Small Pages Scan banner and TopBar badge.`);
  console.log("==========================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error resetting small pages:", err);
  process.exit(1);
});
