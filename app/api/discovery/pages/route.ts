import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredPages, trackedPages } from "@/db/schema";
import { eq, desc, and, ilike, sql } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("runId");
    const query = searchParams.get("q") || "";
    const status = searchParams.get("status") || "all";

    if (!runId) {
      // Default to latest discovery run if no runId specified
      const latestRun = await db.query.discoveryRuns.findFirst({
        orderBy: [desc(discoveredPages.createdAt)],
      });
      if (!latestRun) {
        return NextResponse.json({ success: true, pages: [], total: 0 });
      }
    }

    // Fetch active queue jobs (pending/running count jobs) to check real-time verification state
    const activeJobs = await db.query.queue.findMany({
      where: (q, { and, eq, inArray }) =>
        and(eq(q.jobType, "count"), inArray(q.status, ["pending", "running"])),
      columns: { trackedPageId: true },
    });
    const activeJobSet = new Set(activeJobs.map((j) => j.trackedPageId));

    // Auto-clean any discovered pages stuck in "verifying" status if no queue job is running
    const verifyingPages = await db.query.discoveredPages.findMany({
      where: eq(discoveredPages.status, "verifying"),
    });
    for (const vp of verifyingPages) {
      const tId = vp.trackedPageId;
      if (!tId || !activeJobSet.has(tId)) {
        const tp = tId
          ? await db.query.trackedPages.findFirst({
              where: eq(trackedPages.id, tId),
            })
          : null;
        await db
          .update(discoveredPages)
          .set({
            status: "discovered",
            verifiedAdCount: tp?.currentResults ?? vp.verifiedAdCount ?? null,
            updatedAt: new Date(),
          })
          .where(eq(discoveredPages.id, vp.id));
      }
    }

    const whereConditions = [];

    if (runId) {
      whereConditions.push(eq(discoveredPages.runId, runId));
    }

    if (query.trim()) {
      whereConditions.push(
        ilike(discoveredPages.displayName, `%${query.trim()}%`)
      );
    }

    if (status !== "all") {
      whereConditions.push(eq(discoveredPages.status, status));
    }

    const pages = await db.query.discoveredPages.findMany({
      where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
      orderBy: [desc(discoveredPages.matchingAdCount)],
    });

    // Check all currently tracked pages to set isTracked flag
    const allTracked = await db.query.trackedPages.findMany({
      columns: { id: true, pageId: true, url: true, currentResults: true, displayName: true },
    });

    const trackedMap = new Map<string, { id: string; currentResults: number | null }>();
    for (const tp of allTracked) {
      if (tp.pageId) {
        trackedMap.set(tp.pageId, { id: tp.id, currentResults: tp.currentResults });
      }
      if (tp.url) {
        const match = tp.url.match(/view_all_page_id=(\d+)/);
        if (match) {
          trackedMap.set(match[1], { id: tp.id, currentResults: tp.currentResults });
        }
      }
    }

    const enrichedPages = pages.map((page) => {
      const trackedInfo = trackedMap.get(page.pageId);
      const verifiedAdCount = page.verifiedAdCount ?? trackedInfo?.currentResults ?? null;
      const tId = trackedInfo?.id || page.trackedPageId || null;
      const isActivelyVerifying = tId ? activeJobSet.has(tId) : false;

      return {
        ...page,
        status: page.status === "verifying" && !isActivelyVerifying ? "discovered" : page.status,
        verifiedAdCount,
        isTracked: Boolean(trackedInfo || page.trackedPageId),
        trackedPageId: tId,
        trackedCurrentResults: trackedInfo?.currentResults ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      pages: enrichedPages,
      total: enrichedPages.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch discovered pages" },
      { status: 500 }
    );
  }
}
