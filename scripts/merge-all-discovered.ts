import { db } from "../db";
import { discoveredPages, trackedPages, queue } from "../db/schema";
import { eq, ne } from "drizzle-orm";

async function main() {
  const unimported = await db.query.discoveredPages.findMany({
    where: ne(discoveredPages.status, "imported"),
  });

  console.log(`Found ${unimported.length} un-imported discovered pages. Merging to main tracked pages...`);

  let count = 0;
  for (const dp of unimported) {
    const pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${
      dp.country || "TN"
    }&view_all_page_id=${dp.pageId}&search_type=page&media_type=all`;

    const [tp] = await db
      .insert(trackedPages)
      .values({
        url: pageUrl,
        displayName: dp.displayName || `Page ${dp.pageId}`,
        pageId: dp.pageId,
        searchType: "page",
        country: dp.country || "TN",
        adCount: dp.matchingAdCount,
        currentResults: dp.verifiedAdCount || dp.matchingAdCount,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: trackedPages.url,
        set: {
          displayName: dp.displayName || trackedPages.displayName,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Check if count job is queued
    const existingQueueJob = await db.query.queue.findFirst({
      where: (q, { and, eq, inArray }) =>
        and(
          eq(q.trackedPageId, tp.id),
          eq(q.jobType, "count"),
          inArray(q.status, ["pending", "running"])
        ),
    });

    if (!existingQueueJob) {
      await db.insert(queue).values({
        trackedPageId: tp.id,
        jobType: "count",
        status: "pending",
      });
    }

    await db
      .update(discoveredPages)
      .set({
        status: "imported",
        trackedPageId: tp.id,
        updatedAt: new Date(),
      })
      .where(eq(discoveredPages.id, dp.id));

    count++;
  }

  console.log(`Successfully merged ${count} discovered pages to main tracked pages!`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to merge pages:", err);
  process.exit(1);
});
