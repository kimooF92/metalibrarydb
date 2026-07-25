import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, importJobs } from "@/db/schema";
import { sql, desc } from "drizzle-orm";

export async function GET() {
  try {
    // 1. Status counts
    const statusCounts = await db
      .select({
        status: trackedPages.status,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(trackedPages)
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

    // 2. Aggregate stats (avg and max results)
    const [aggregates] = await db
      .select({
        avgResults: sql<number>`round(avg(${trackedPages.currentResults}))`.as("avg"),
        highestResults: sql<number>`max(${trackedPages.currentResults})`.as("max"),
      })
      .from(trackedPages);

    // 3. Last import job timestamp
    const lastImport = await db.query.importJobs.findFirst({
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
    });
  } catch (error) {
    console.error("Error in GET /api/stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard statistics" },
      { status: 500 }
    );
  }
}
