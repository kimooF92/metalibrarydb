import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredPages, trackedPages, queue } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = body.discoveredPageIds || body.ids || [];

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No discovered page IDs provided" },
        { status: 400 }
      );
    }

    const pagesToVerify = await db.query.discoveredPages.findMany({
      where: inArray(discoveredPages.id, ids),
    });

    let enqueuedCount = 0;

    for (const discPage of pagesToVerify) {
      const pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${discPage.country || "TN"}&view_all_page_id=${discPage.pageId}&search_type=page&media_type=all`;

      // Create or find tracked page record
      const [tp] = await db
        .insert(trackedPages)
        .values({
          url: pageUrl,
          displayName: discPage.displayName || `Page ${discPage.pageId}`,
          pageId: discPage.pageId,
          searchType: "page",
          country: discPage.country || "TN",
          status: "pending",
        })
        .onConflictDoUpdate({
          target: trackedPages.url,
          set: { updatedAt: new Date() },
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
        enqueuedCount++;
      }

      await db
        .update(discoveredPages)
        .set({
          status: "verifying",
          trackedPageId: tp.id,
          updatedAt: new Date(),
        })
        .where(eq(discoveredPages.id, discPage.id));
    }

    return NextResponse.json({
      success: true,
      verifiedCount: pagesToVerify.length,
      enqueuedQueueJobs: enqueuedCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to verify page ad counts" },
      { status: 500 }
    );
  }
}
