import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, queue } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { refreshSchema } from "@/lib/validators";
import { triggerGitHubWorkflow } from "@/lib/github";
import { validateAdminRole } from "@/lib/api-guard";
import { tasks } from "@trigger.dev/sdk";

export async function POST(request: Request) {
  const authError = await validateAdminRole(request);
  if (authError) return authError;

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
      columns: { id: true, trackedPageId: true, status: true, startedAt: true },
    });
    const existingSet = new Set(existingQueueJobs.map((q) => q.trackedPageId));

    // Reset stuck running jobs (> 3 mins) or boost pending jobs
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    const stuckJobIds: string[] = [];
    const pendingJobIds: string[] = [];

    for (const job of existingQueueJobs) {
      if (job.status === "running" && job.startedAt && new Date(job.startedAt) < threeMinutesAgo) {
        stuckJobIds.push(job.id);
      } else if (job.status === "pending") {
        pendingJobIds.push(job.id);
      }
    }

    if (stuckJobIds.length > 0) {
      await db
        .update(queue)
        .set({ status: "pending", startedAt: null, priority: 10 })
        .where(inArray(queue.id, stuckJobIds));
    }

    if (pendingJobIds.length > 0) {
      await db
        .update(queue)
        .set({ priority: 10 })
        .where(inArray(queue.id, pendingJobIds));
    }

    const idsToEnqueue = foundIds.filter((id) => !existingSet.has(id));

    if (idsToEnqueue.length > 0) {
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

    // Always update status to 'pending' in tracked_pages for all requested IDs
    await db
      .update(trackedPages)
      .set({ status: "pending", updatedAt: new Date() })
      .where(inArray(trackedPages.id, foundIds));

    const isSinglePage = foundIds.length === 1;

    // 1. Single Page Ad Count: Dispatch to Trigger.dev immediately
    if (isSinglePage) {
      let triggerDevDispatched = false;
      if (process.env.TRIGGER_SECRET_KEY) {
        try {
          await tasks.trigger("scan-page-count", { pageId: foundIds[0] });
          triggerDevDispatched = true;
        } catch (triggerErr: any) {
          console.warn("[Trigger.dev Single Dispatch Warning]:", triggerErr?.message || triggerErr);
        }
      }

      // If Trigger.dev wasn't dispatched (or errored), fallback to GitHub Action worker
      if (!triggerDevDispatched) {
        await triggerGitHubWorkflow("worker.yml").catch(() => {});
      }

      return NextResponse.json({
        success: true,
        message: `Dispatched single-page ad count scan${triggerDevDispatched ? " via Trigger.dev" : " to worker queue"}.`,
        enqueuedCount: 1,
        mode: triggerDevDispatched ? "trigger.dev" : "worker_fallback",
      });
    }

    // 2. Multi Page Ad Count (foundIds.length > 1):
    // Preserves Trigger.dev free-tier limits by NOT invoking Trigger.dev.
    // Preserves GitHub Actions runners by keeping status as 'pending' in the DB queue
    // until the user starts the GitHub worker or local worker.
    return NextResponse.json({
      success: true,
      message: `Enqueued ${foundIds.length} page(s) as pending. Waiting for GitHub worker or local worker to start.`,
      enqueuedCount: foundIds.length,
      newlyCreatedCount: idsToEnqueue.length,
      requeuedCount: existingSet.size,
      mode: "pending_worker_queue",
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
