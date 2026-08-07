import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredPages } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";

/**
 * POST /api/discovery/verify
 *
 * Marks selected discovered pages as "verifying" so the background worker
 * can fetch real ad counts from Meta.
 *
 * IMPORTANT: This endpoint does NOT create trackedPages rows.
 * Creating a trackedPages row is the exclusive responsibility of /api/discovery/import
 * (the explicit user-initiated Merge action).
 *
 * Previously this route inserted into trackedPages which caused pages to appear
 * as "Already Tracked" before the user ever clicked Merge — that was a bug.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = body.discoveredPageIds || body.ids || [];

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No discovered page IDs provided" },
        { status: 400 }
      );
    }

    const pagesToVerify = await db.query.discoveredPages.findMany({
      where: inArray(discoveredPages.id, ids),
    });

    let enqueuedCount = 0;

    for (const discPage of pagesToVerify) {
      // Only mark as verifying — do NOT insert into trackedPages.
      // The worker will update verifiedAdCount directly on discoveredPages.
      await db
        .update(discoveredPages)
        .set({
          status: "verifying",
          updatedAt: new Date(),
        })
        .where(eq(discoveredPages.id, discPage.id));

      enqueuedCount++;
    }

    return NextResponse.json({
      success: true,
      verifiedCount: pagesToVerify.length,
      enqueuedQueueJobs: enqueuedCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to verify page ad counts" },
      { status: 500 }
    );
  }
}
