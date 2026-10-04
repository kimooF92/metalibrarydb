import { NextResponse } from "next/server";
import { db } from "@/db";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { trackedPages, importJobs } from "@/db/schema";
import { sql, desc, eq } from "drizzle-orm";
import { cleanOrphanedScans } from "@/lib/clean-scans";
import { getActiveWorkspace } from "@/lib/workspace-server";

export async function GET(request: Request) {
  try {
    const activeWorkspace = await getActiveWorkspace(request);

    // 0. Auto-heal any orphaned scans stuck longer than 5 minutes
    await cleanOrphanedScans(5).catch((err) => {
      console.warn("Failed to auto-clean orphaned scans in /api/stats:", err);
    });

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

    return NextResponse.json({
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
    }, { headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL, Vary: PRIVATE_AUTH_VARY } });
  } catch (error) {
    console.error("Error in GET /api/stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard statistics" },
      { status: 500 }
    );
  }
}
