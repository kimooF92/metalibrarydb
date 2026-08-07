import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, queue } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { refreshSchema } from "@/lib/validators";
import { triggerGitHubWorkflow } from "@/lib/github";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = refreshSchema.parse(body);

    const targetIds = validated.ids;

    // 1. Verify target pages exist
    const pages = await db.query.trackedPages.findMany({
      where: inArray(trackedPages.id, targetIds),
      columns: { id: true },
    });

    if (pages.length === 0) {
      return NextResponse.json(
        { error: "No valid tracked pages found for provided IDs" },
        { status: 404 }
      );
    }

    const foundIds = pages.map((p) => p.id);

    // 2. Fetch existing pending/running queue jobs for these page IDs
    const existingQueueJobs = await db.query.queue.findMany({
      where: (q, { and, inArray }) =>
        and(
          inArray(q.trackedPageId, foundIds),
          inArray(q.status, ["pending", "running"])
        ),
      columns: { trackedPageId: true },
    });
    const existingSet = new Set(existingQueueJobs.map((q) => q.trackedPageId));

    const idsToEnqueue = foundIds.filter((id) => !existingSet.has(id));

    if (idsToEnqueue.length > 0) {
      // Update status to 'pending' in tracked_pages
      await db
        .update(trackedPages)
        .set({ status: "pending", updatedAt: new Date() })
        .where(inArray(trackedPages.id, idsToEnqueue));

      // Insert pending queue jobs
      await db.insert(queue).values(
        idsToEnqueue.map((id) => ({
          trackedPageId: id,
          jobType: "count",
          status: "pending",
          priority: 10,
        }))
      );
    }

    // Trigger GitHub Action worker workflow
    await triggerGitHubWorkflow("worker.yml").catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Enqueued ${idsToEnqueue.length} page(s) for refresh (${foundIds.length - idsToEnqueue.length} already in progress).`,
      enqueuedCount: idsToEnqueue.length,
      skippedCount: foundIds.length - idsToEnqueue.length,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 });
    }
    console.error("Error in POST /api/refresh:", error);
    return NextResponse.json(
      { error: "Failed to enqueue pages for refresh" },
      { status: 500 }
    );
  }
}
