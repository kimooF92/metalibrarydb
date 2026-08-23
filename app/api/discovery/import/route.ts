import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredPages, trackedPages, queue } from "@/db/schema";
import { inArray, eq, and, isNull, ne } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = body.discoveredPageIds || body.ids || [];
    const runId: string | undefined = body.runId;
    const importAll: boolean = !!body.importAll;

    let pagesToImport: (typeof discoveredPages.$inferSelect)[] = [];

    if (ids.length > 0) {
      pagesToImport = await db.query.discoveredPages.findMany({
        where: inArray(discoveredPages.id, ids),
      });
    } else if (runId) {
      pagesToImport = await db.query.discoveredPages.findMany({
        where: and(
          eq(discoveredPages.runId, runId),
          ne(discoveredPages.status, "imported")
        ),
      });
    } else if (importAll) {
      pagesToImport = await db.query.discoveredPages.findMany({
        where: ne(discoveredPages.status, "imported"),
      });
    } else {
      return NextResponse.json(
        { success: false, error: "No discovered page IDs, runId, or importAll flag provided" },
        { status: 400 }
      );
    }

    if (pagesToImport.length === 0) {
      return NextResponse.json({
        success: true,
        importedCount: 0,
        enqueuedQueueJobs: 0,
        message: "No un-imported pages found to merge",
      });
    }

    let importedCount = 0;
    let newJobsCount = 0;

    for (const discPage of pagesToImport) {
      const pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${discPage.country || "TN"}&view_all_page_id=${discPage.pageId}&search_type=page&media_type=all`;

      let seedLandingPage: string | undefined = undefined;
      if (discPage.trackedPageId) {
        const parentTrackedPage = await db.query.trackedPages.findFirst({
          where: eq(trackedPages.id, discPage.trackedPageId),
        });
        if (parentTrackedPage) {
          seedLandingPage = parentTrackedPage.landingPage || parentTrackedPage.displayName || parentTrackedPage.url;
        }
      }

      const [tp] = await db
        .insert(trackedPages)
        .values({
          url: pageUrl,
          displayName: discPage.displayName || `Page ${discPage.pageId}`,
          landingPage: seedLandingPage,
          pageId: discPage.pageId,
          searchType: "page",
          country: discPage.country || "TN",
          adCount: discPage.matchingAdCount,
          currentResults: discPage.verifiedAdCount || discPage.matchingAdCount,
          status: "pending",
        })
        .onConflictDoUpdate({
          target: trackedPages.url,
          set: {
            displayName: discPage.displayName || trackedPages.displayName,
            landingPage: seedLandingPage || trackedPages.landingPage,
            pageId: discPage.pageId,
            searchType: "page",
            updatedAt: new Date(),
          },
        })
        .returning();

      // Check if job already pending in queue
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
        newJobsCount++;
      }

      await db
        .update(discoveredPages)
        .set({
          status: "imported",
          trackedPageId: tp.id,
          updatedAt: new Date(),
        })
        .where(eq(discoveredPages.id, discPage.id));

      importedCount++;
    }

    return NextResponse.json({
      success: true,
      importedCount,
      enqueuedQueueJobs: newJobsCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to merge pages into main dashboard" },
      { status: 500 }
    );
  }
}

