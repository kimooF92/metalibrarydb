import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, queue } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { triggerGitHubWorkflow } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id: brandDomainId } = await params;
    const body = await req.json().catch(() => ({}));
    const scanType = body.scanType || "both"; // "count" | "creative" | "both"

    const sisterPages = await db.query.trackedPages.findMany({
      where: eq(trackedPages.brandDomainId, brandDomainId),
    });

    if (sisterPages.length === 0) {
      return NextResponse.json(
        { success: false, error: "No sister pages found for this domain" },
        { status: 404 }
      );
    }

    const pageIds = sisterPages.map((p) => p.id);
    const now = new Date();

    // Check existing active queue jobs to avoid duplicate entries
    const activeJobs = await db.query.queue.findMany({
      where: and(
        inArray(queue.trackedPageId, pageIds),
        inArray(queue.status, ["pending", "running"])
      ),
    });

    const activeSet = new Set(activeJobs.map((j) => `${j.trackedPageId}_${j.jobType}`));

    const jobsToInsert: Array<{
      trackedPageId: string;
      jobType: "count" | "creative";
      status: "pending";
      priority: number;
    }> = [];

    for (const page of sisterPages) {
      if ((scanType === "count" || scanType === "both") && !activeSet.has(`${page.id}_count`)) {
        jobsToInsert.push({
          trackedPageId: page.id,
          jobType: "count",
          status: "pending",
          priority: 15,
        });
      }
      if ((scanType === "creative" || scanType === "both") && !activeSet.has(`${page.id}_creative`)) {
        jobsToInsert.push({
          trackedPageId: page.id,
          jobType: "creative",
          status: "pending",
          priority: 15,
        });
      }
    }

    if (jobsToInsert.length > 0) {
      await db
        .update(trackedPages)
        .set({ status: "pending", updatedAt: now })
        .where(inArray(trackedPages.id, pageIds));

      await db.insert(queue).values(jobsToInsert);
    }

    // Trigger GitHub Action worker workflow if available
    await triggerGitHubWorkflow("worker.yml").catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Enqueued ${jobsToInsert.length} scan jobs across ${sisterPages.length} sister pages.`,
      enqueuedCount: jobsToInsert.length,
      pagesCount: sisterPages.length,
    });
  } catch (err: any) {
    console.error("[POST /api/domains/[id]/scan-all] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to enqueue sister page scans" },
      { status: 500 }
    );
  }
}
