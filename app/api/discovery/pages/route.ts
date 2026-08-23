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

    // Fetch active queue jobs (pending/running count or discovery_count jobs) to check real-time verification state
    const activeJobs = await db.query.queue.findMany({
      where: (q, { and, eq, inArray }) =>
        and(eq(q.jobType, "count"), inArray(q.status, ["pending", "running"])),
      columns: { trackedPageId: true },
    });
    const activeJobSet = new Set(activeJobs.map((j) => j.trackedPageId));

    const activeDiscoveryJobs = await db.query.queue.findMany({
      where: (q, { and, eq, inArray }) =>
        and(eq(q.jobType, "discovery_count"), inArray(q.status, ["pending", "running"])),
      columns: { discoveredPageId: true },
    });
    const activeDiscoverySet = new Set(
      activeDiscoveryJobs.map((j) => j.discoveredPageId).filter(Boolean)
    );

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
      const isActivelyVerifying = tId ? activeJobSet.has(tId) : activeDiscoverySet.has(page.id);

      return {
        ...page,
        status: page.status === "verifying" && !isActivelyVerifying ? "discovered" : page.status,
        verifiedAdCount,
        isTracked: Boolean(trackedInfo || page.trackedPageId),
        trackedPageId: tId,
        trackedCurrentResults: trackedInfo?.currentResults ?? null,
      };
    });

    const sortBy = searchParams.get("sortBy") || "matchingAdCount";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    enrichedPages.sort((a, b) => {
      let valA: any = a[sortBy as keyof typeof a];
      let valB: any = b[sortBy as keyof typeof b];

      if (sortBy === "verifiedAdCount") {
        valA = a.verifiedAdCount ?? -1;
        valB = b.verifiedAdCount ?? -1;
      } else if (sortBy === "displayName") {
        valA = (a.displayName || "").toLowerCase();
        valB = (b.displayName || "").toLowerCase();
      } else if (sortBy === "pageId") {
        valA = (a.pageId || "").toLowerCase();
        valB = (b.pageId || "").toLowerCase();
      } else if (sortBy === "status") {
        const statusOrder: Record<string, number> = {
          verifying: 1,
          discovered: 2,
          tracked: 3,
          imported: 4,
          ignored: 5,
        };
        const statusA = a.isTracked ? "tracked" : a.status;
        const statusB = b.isTracked ? "tracked" : b.status;
        valA = statusOrder[statusA] || 99;
        valB = statusOrder[statusB] || 99;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return (a.id || "").localeCompare(b.id || "");
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
