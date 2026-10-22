import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredPages } from "@/db/schema";
import { inArray, eq, and, ne } from "drizzle-orm";

/**
 * POST /api/discovery/ignore
 *
 * Marks discovered pages as "ignored" (or restores them back to "discovered").
 * Ephemeral Guard: Immediately nulls all 5 preview staging columns on ignored pages.
 *
 * Supports:
 * - Specific page IDs: { discoveredPageIds: string[], restore?: boolean }
 * - Dismiss remaining for a run: { runId: string, dismissRemaining: true }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = body.discoveredPageIds || body.ids || [];
    const runId: string | undefined = body.runId;
    const dismissRemaining: boolean = !!body.dismissRemaining;
    const restore: boolean = !!body.restore;

    const targetStatus = restore ? "discovered" : "ignored";

    if (dismissRemaining && runId) {
      // Mark all unmerged/un-ignored pages in this run as ignored and immediately null ephemeral preview columns
      const updated = await db
        .update(discoveredPages)
        .set({
          status: "ignored",
          previewProductUrl: null,
          previewProductTitle: null,
          previewProductImage: null,
          previewProductPrice: null,
          previewProductCurrency: null,
          previewSource: "none",
          previewScrapeStatus: "ignored",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(discoveredPages.runId, runId),
            ne(discoveredPages.status, "imported"),
            ne(discoveredPages.status, "ignored")
          )
        )
        .returning({ id: discoveredPages.id });

      return NextResponse.json({
        success: true,
        ignoredCount: updated.length,
        message: `Dismissed ${updated.length} remaining pages in run`,
      });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No discovered page IDs or valid runId provided" },
        { status: 400 }
      );
    }

    // Update specific page IDs and null preview columns if ignored
    const updatePayload: Record<string, any> = {
      status: targetStatus,
      updatedAt: new Date(),
    };

    if (!restore) {
      updatePayload.previewProductUrl = null;
      updatePayload.previewProductTitle = null;
      updatePayload.previewProductImage = null;
      updatePayload.previewProductPrice = null;
      updatePayload.previewProductCurrency = null;
      updatePayload.previewSource = "none";
      updatePayload.previewScrapeStatus = "ignored";
    } else {
      updatePayload.previewScrapeStatus = "pending";
    }

    const updated = await db
      .update(discoveredPages)
      .set(updatePayload)
      .where(inArray(discoveredPages.id, ids))
      .returning({ id: discoveredPages.id });

    return NextResponse.json({
      success: true,
      updatedCount: updated.length,
      status: targetStatus,
      message: restore
        ? `Restored ${updated.length} page(s) to discovery feed`
        : `Marked ${updated.length} page(s) as ignored and cleaned staging data`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update page ignore status" },
      { status: 500 }
    );
  }
}
