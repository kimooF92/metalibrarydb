import { NextResponse } from "next/server";
import { db } from "@/db";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { trackedPages, importJobs } from "@/db/schema";
import { sql, desc, eq } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { validateAdminRole } from "@/lib/api-guard";

import { getCached, setCached } from "@/lib/cache-service";

const STATS_CACHE_TTL_SECONDS = 60; // 60 seconds global cache

export async function GET(request: Request) {
  const authError = await validateAdminRole(request);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(request);
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true" || searchParams.has("_t");

    // Check Hybrid L1 (Memory) / L2 (Upstash Redis) cache for active workspace
    const cacheKey = `cache:stats:${activeWorkspace.id}`;
    if (!forceRefresh) {
      const cached = await getCached<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
            Vary: PRIVATE_AUTH_VARY,
          },
        });
      }
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

    // Auto-rescue any stuck scanning pages older than 60 seconds so client doesn't poll stats indefinitely
    if (countsMap.scanning > 0) {
      try {
        const rescued = await db.execute(sql`
          UPDATE tracked_pages
          SET status = CASE WHEN last_success_at IS NOT NULL OR current_results IS NOT NULL THEN 'success' ELSE 'failed' END,
              updated_at = NOW()
          WHERE status = 'scanning'
            AND workspace_id = ${activeWorkspace.id}
            AND updated_at < NOW() - INTERVAL '60 seconds'
          RETURNING id;
        `);
        const rescuedCount = (rescued as any)?.length || (rescued as any)?.rowCount || 0;
        if (rescuedCount > 0) {
          countsMap.scanning = Math.max(0, countsMap.scanning - rescuedCount);
          countsMap.success += rescuedCount;
        }
      } catch {}
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

    // Store in Hybrid L1 (Memory) and L2 (Upstash Redis) cache
    await setCached(cacheKey, responseData, STATS_CACHE_TTL_SECONDS);

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
