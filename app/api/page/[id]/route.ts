import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, ads, scrapedProducts } from "@/db/schema";
import { eq, or } from "drizzle-orm";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 });
    }

    // 1. Fetch tracked page first to get its pageId
    const targetPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, id),
    });

    if (!targetPage) {
      return NextResponse.json({ error: "Tracked page not found" }, { status: 404 });
    }

    const pageId = targetPage.pageId;

    // 2. Delete associated ads and scraped products for this brand
    if (pageId && pageId !== "0" && !pageId.startsWith("pending-")) {
      await Promise.allSettled([
        db.delete(ads).where(eq(ads.pageId, pageId)),
        db.delete(scrapedProducts).where(or(eq(scrapedProducts.pageId, pageId), eq(scrapedProducts.pageId, id))),
      ]);
    } else {
      await db.delete(scrapedProducts).where(eq(scrapedProducts.pageId, id));
    }

    // 3. Delete tracked page record (cascades to scan_history, creative_scans, ad_observations)
    const [deleted] = await db
      .delete(trackedPages)
      .where(eq(trackedPages.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      message: "Tracked page, ads, and product catalog deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("Error in DELETE /api/page/[id]:", error);
    return NextResponse.json(
      { error: "Failed to delete tracked page" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { displayName, notes, isWatchlisted } = body;

    if (!id) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };

    if (displayName !== undefined) {
      updatePayload.displayName = displayName?.trim() || null;
    }
    if (notes !== undefined) {
      updatePayload.notes = notes?.trim() || null;
    }
    if (isWatchlisted !== undefined) {
      updatePayload.isWatchlisted = Boolean(isWatchlisted);
    }

    const [updated] = await db
      .update(trackedPages)
      .set(updatePayload)
      .where(eq(trackedPages.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Tracked page not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Page updated successfully",
      page: updated,
    });
  } catch (error) {
    console.error("Error in PATCH /api/page/[id]:", error);
    return NextResponse.json(
      { error: "Failed to update page" },
      { status: 500 }
    );
  }
}
