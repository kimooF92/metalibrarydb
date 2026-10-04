import { NextResponse } from "next/server";
import { db } from "@/db";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { trackedPages, importJobs } from "@/db/schema";
import { sql, desc, eq } from "drizzle-orm";
import { cleanOrphanedScans } from "@/lib/clean-scans";
import { getActiveWorkspace } from "@/lib/workspace-server";

interface CachedDashboardStats {
  data: any;
  timestamp: number;
}

const statsCacheMap = new Map<string, CachedDashboardStats>();
const STATS_CACHE_TTL_MS = 30 * 1000; // 30 seconds

let lastCleanupTimestamp = 0;
const CLEANUP_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

export async function GET(request: Request) {
  try {
    const activeWorkspace = await getActiveWorkspace(request);
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // 0. Auto-heal orphaned scans asynchronously in the background (at most once every 15 minutes)
    // Never block the user-facing stats API response on database maintenance routines.
    const now = Date.now();
    if (now - lastCleanupTimestamp > CLEANUP_THROTTLE_MS) {
      lastCleanupTimestamp = now;
      cleanOrphanedScans(5).catch((err) => {
        console.warn("Background auto-clean orphaned scans warning:", err);
      });
    }

    // Check in-memory cache for active workspace
    const cached = statsCacheMap.get(activeWorkspace.id);
    if (!forceRefresh && cached && now - cached.timestamp < STATS_CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: {
          "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
          Vary: PRIVATE_AUTH_VARY,
        },
      });
    }

    // 1. Status counts scoped to active workspace
    const statusCounts = await db
      .select({
        status: trackedPages.status,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(trackedPages)
      .where(eq(trackedPages.workspaceId, activeWorkspace.id))
      .groupBy(trackedPages.status);

    const countsMap: Record<string, number> = {
      pending: 0,
      scanning: 0,
      success: 0,
      failed: 0,
      unclear: 0,
    };

    let totalPages = 0;
    for (const row of statusCounts) {
      const c = Number(row.count);
      totalPages += c;
      if (row.status && row.status in countsMap) {
        countsMap[row.status] = c;
      }
    }

    // 2. Aggregate stats (avg and max results) scoped to active workspace
    const [aggregates] = await db
      .select({
        avgResults: sql<number>`round(avg(${trackedPages.currentResults}))`.as("avg"),
        highestResults: sql<number>`max(${trackedPages.currentResults})`.as("max"),
      })
      .from(trackedPages)
      .where(eq(trackedPages.workspaceId, activeWorkspace.id));

    // 3. Last import job timestamp for active workspace
    const lastImport = await db.query.importJobs.findFirst({
      where: eq(importJobs.workspaceId, activeWorkspace.id),
      orderBy: [desc(importJobs.createdAt)],
    });

    const responseData = {
      totalPages,
      pending: countsMap.pending,
      scanning: countsMap.scanning,
      completed: countsMap.success,
      failed: countsMap.failed,
      unclear: countsMap.unclear,
      averageResults: aggregates?.avgResults !== null ? Number(aggregates.avgResults) : 0,
      highestResults: aggregates?.highestResults !== null ? Number(aggregates.highestResults) : 0,
      lastImport: lastImport
        ? {
            id: lastImport.id,
            filename: lastImport.filename,
            createdAt: lastImport.createdAt,
            totalRows: lastImport.totalRows,
          }
        : null,
    };

    // Store in in-memory cache
    statsCacheMap.set(activeWorkspace.id, {
      data: responseData,
      timestamp: Date.now(),
    });

    return NextResponse.json(responseData, {
      headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL, Vary: PRIVATE_AUTH_VARY },
    });
  } catch (error) {
    console.error("Error in GET /api/stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard statistics" },
      { status: 500 }
    );
  }
}
