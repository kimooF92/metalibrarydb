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
    let tpId: string | undefined = undefined;

    if (dp.trackedPageId) {
      const parentTrackedPage = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.id, dp.trackedPageId),
      });

      if (parentTrackedPage && parentTrackedPage.searchType !== "page") {
        const { mergeExactMatchWithPageId } = await import("../actions/merge-pages");
        const mergeResult = await mergeExactMatchWithPageId(
          dp.trackedPageId,
          dp.pageId,
          dp.displayName
        );
        if (mergeResult.success && mergeResult.mergedPageId) {
          tpId = mergeResult.mergedPageId;
        }
      }
    }

    if (!tpId) {
      const pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${
        dp.country || "TN"
      }&view_all_page_id=${dp.pageId}&search_type=page&media_type=all`;

      const existingByPageId = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.pageId, dp.pageId),
      });

      if (existingByPageId) {
        tpId = existingByPageId.id;
        await db
          .update(trackedPages)
          .set({
            url: pageUrl,
            displayName: dp.displayName || existingByPageId.displayName,
            searchType: "page",
            updatedAt: new Date(),
          })
          .where(eq(trackedPages.id, existingByPageId.id));
      } else {
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
              pageId: dp.pageId,
              searchType: "page",
              updatedAt: new Date(),
            },
          })
          .returning();
        tpId = tp.id;
      }
    }

    // Check if count job is queued
    const existingQueueJob = await db.query.queue.findFirst({
      where: (q, { and, eq, inArray }) =>
        and(
          eq(q.trackedPageId, tpId!),
          eq(q.jobType, "count"),
          inArray(q.status, ["pending", "running"])
        ),
    });

    if (!existingQueueJob) {
      await db.insert(queue).values({
        trackedPageId: tpId!,
        jobType: "count",
        status: "pending",
      });
    }

    await db
      .update(discoveredPages)
      .set({
        status: "imported",
        trackedPageId: tpId!,
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
