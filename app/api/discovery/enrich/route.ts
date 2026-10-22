import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { enrichDiscoveredPagesForRun } from "@/worker/discovery-enricher";
import { db } from "@/db";
import { discoveryRuns, discoveredPages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const body = await req.json().catch(() => ({}));
    const runId = body.runId;

    if (!runId) {
      return NextResponse.json(
        { success: false, error: "Missing required runId parameter" },
        { status: 400 }
      );
    }

    // Verify run belongs to active workspace
    const run = await db.query.discoveryRuns.findFirst({
      where: and(
        eq(discoveryRuns.id, runId),
        eq(discoveryRuns.workspaceId, activeWorkspace.id)
      ),
      columns: { id: true },
    });

    if (!run) {
      return NextResponse.json(
        { success: false, error: "Discovery run not found" },
        { status: 404 }
      );
    }

    // If requested, reset failed, idle, or stale abandoned 'processing' candidate pages to 'pending'
    if (body.resetFailed) {
      await db
        .update(discoveredPages)
        .set({
          previewScrapeStatus: "pending",
          previewScrapeAttempts: 0,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(discoveredPages.runId, runId),
            sql`(${discoveredPages.previewScrapeStatus} IN ('failed', 'idle') OR (${discoveredPages.previewScrapeStatus} = 'processing' AND ${discoveredPages.updatedAt} < NOW() - INTERVAL '2 minutes'))`,
            sql`${discoveredPages.status} NOT IN ('imported', 'ignored')`
          )
        );
    }

    // Run decoupled enrichment
    const outcome = await enrichDiscoveredPagesForRun(runId);

    return NextResponse.json({
      success: true,
      outcome,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to enrich discovery pages" },
      { status: 500 }
    );
  }
}
