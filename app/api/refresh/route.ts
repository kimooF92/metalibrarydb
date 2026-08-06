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

    // 2. Update status to 'pending' in tracked_pages
    await db
      .update(trackedPages)
      .set({ status: "pending", updatedAt: new Date() })
      .where(inArray(trackedPages.id, foundIds));

    // 3. Insert pending queue jobs
    await db.insert(queue).values(
      foundIds.map((id) => ({
        trackedPageId: id,
        status: "pending",
      }))
    );

    // Trigger GitHub Action worker workflow
    await triggerGitHubWorkflow("worker.yml").catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Enqueued ${foundIds.length} page(s) for refresh.`,
      enqueuedCount: foundIds.length,
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
