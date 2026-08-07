import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredPages, queue } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { triggerGitHubWorkflow } from "@/lib/github";

/**
 * POST /api/discovery/verify
 *
 * Marks selected discovered pages as "verifying" and enqueues high-priority (priority: 10)
 * background jobs so the worker can fetch real ad counts directly into discoveredPages.
 *
 * IMPORTANT: This endpoint does NOT create trackedPages rows.
 * Creating a trackedPages row is the exclusive responsibility of /api/discovery/import
 * (the explicit user-initiated Merge action).
 */
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
      // 1. Mark status as verifying on discoveredPages
      await db
        .update(discoveredPages)
        .set({
          status: "verifying",
          updatedAt: new Date(),
        })
        .where(eq(discoveredPages.id, discPage.id));

      // 2. Check if a high-priority verification job is already pending/running
      const existingJob = await db.query.queue.findFirst({
        where: (q, { and, eq, inArray }) =>
          and(
            eq(q.discoveredPageId, discPage.id),
            eq(q.jobType, "discovery_count"),
            inArray(q.status, ["pending", "running"])
          ),
      });

      // 3. Enqueue high priority (priority 10) verification job
      if (!existingJob) {
        await db.insert(queue).values({
          discoveredPageId: discPage.id,
          jobType: "discovery_count",
          priority: 10,
          status: "pending",
        });
        enqueuedCount++;
      }
    }

    // 4. Trigger GitHub Actions worker workflow to process queue immediately
    await triggerGitHubWorkflow("worker.yml").catch(() => {});

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

