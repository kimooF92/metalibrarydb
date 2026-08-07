import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, queue, scanHistory } from "@/db/schema";
import { inArray, eq, and, sql } from "drizzle-orm";
import { retrySchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const validated = retrySchema.parse(body);

    let targetPageIds: string[] = [];

    if (validated.ids && validated.ids.length > 0) {
      targetPageIds = validated.ids;
    } else {
      // Find all pages currently marked as failed
      const failedPages = await db.query.trackedPages.findMany({
        where: eq(trackedPages.status, "failed"),
        columns: { id: true },
      });
      targetPageIds = failedPages.map((p) => p.id);
    }

    if (targetPageIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No failed pages found to retry.",
        retriedCount: 0,
      });
    }

    // Check failed attempts count for each target page
    const attemptCounts = await db
      .select({
        trackedPageId: scanHistory.trackedPageId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(scanHistory)
      .where(
        and(
          inArray(scanHistory.trackedPageId, targetPageIds),
          eq(scanHistory.status, "failed")
        )
      )
      .groupBy(scanHistory.trackedPageId);

    const attemptsMap = Object.fromEntries(
      attemptCounts.map((a) => [a.trackedPageId, Number(a.count)])
    );

    // Filter pages: flag those with >= 3 failed attempts as requiring manual review
    const eligibleForRetry: string[] = [];
    const flaggedForManualReview: string[] = [];

    for (const pageId of targetPageIds) {
      const attempts = attemptsMap[pageId] || 0;
      if (attempts >= 3) {
        flaggedForManualReview.push(pageId);
      } else {
        eligibleForRetry.push(pageId);
      }
    }

    if (eligibleForRetry.length > 0) {
      // Check existing pending/running queue jobs
      const existingQueueJobs = await db.query.queue.findMany({
        where: (q, { and, inArray }) =>
          and(
            inArray(q.trackedPageId, eligibleForRetry),
            inArray(q.status, ["pending", "running"])
          ),
        columns: { trackedPageId: true },
      });
      const existingSet = new Set(existingQueueJobs.map((q) => q.trackedPageId));

      const newRetryIds = eligibleForRetry.filter((id) => !existingSet.has(id));

      if (newRetryIds.length > 0) {
        // Update status to 'pending'
        await db
          .update(trackedPages)
          .set({ status: "pending", updatedAt: new Date() })
          .where(inArray(trackedPages.id, newRetryIds));

        // Insert new queue entries
        await db.insert(queue).values(
          newRetryIds.map((id) => ({
            trackedPageId: id,
            jobType: "count",
            priority: 10,
            status: "pending",
            attempts: (attemptsMap[id] || 0) + 1,
          }))
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Enqueued ${eligibleForRetry.length} page(s) for retry.${
        flaggedForManualReview.length > 0
          ? ` ${flaggedForManualReview.length} page(s) require manual review due to repeated failures (>= 3).`
          : ""
      }`,
      retriedCount: eligibleForRetry.length,
      flaggedCount: flaggedForManualReview.length,
      flaggedPageIds: flaggedForManualReview,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 });
    }
    console.error("Error in POST /api/retry:", error);
    return NextResponse.json(
      { error: "Failed to retry jobs" },
      { status: 500 }
    );
  }
}
