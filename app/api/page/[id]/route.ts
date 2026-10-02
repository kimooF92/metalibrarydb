import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, ads, scrapedProducts } from "@/db/schema";
import { eq, or, and, ne, desc } from "drizzle-orm";

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
    const brandDomainId = targetPage.brandDomainId;
    const wasPrimary = targetPage.pageRole === "primary";

    // 2. Check sister pages if linked to a domain
    let remainingSisterPages: any[] = [];
    if (brandDomainId) {
      remainingSisterPages = await db.query.trackedPages.findMany({
        where: and(
          eq(trackedPages.brandDomainId, brandDomainId),
          ne(trackedPages.id, id)
        ),
        orderBy: [desc(trackedPages.currentResults), desc(trackedPages.createdAt)],
      });
    }

    // 3. Delete ads specific to this page ID
    if (pageId && pageId !== "0" && !pageId.startsWith("pending-")) {
      await Promise.allSettled([
        db.delete(ads).where(or(eq(ads.pageId, pageId), eq(ads.pageId, id))),
        // Only delete products if no other sister pages share this domain
        remainingSisterPages.length === 0
          ? db.delete(scrapedProducts).where(or(eq(scrapedProducts.pageId, pageId), eq(scrapedProducts.pageId, id)))
          : Promise.resolve(),
      ]);
    } else {
      await Promise.allSettled([
        db.delete(ads).where(eq(ads.pageId, id)),
        remainingSisterPages.length === 0
          ? db.delete(scrapedProducts).where(eq(scrapedProducts.pageId, id))
          : Promise.resolve(),
      ]);
    }

    // 4. Delete tracked page record (cascades to scan_history, creative_scans, ad_observations)
    const [deleted] = await db
      .delete(trackedPages)
      .where(eq(trackedPages.id, id))
      .returning();

    // 5. Post-delete domain cleanup & primary re-election
    if (brandDomainId) {
      if (remainingSisterPages.length > 0 && wasPrimary) {
        // Re-elect next highest volume sister page as primary
        await db
          .update(trackedPages)
          .set({ pageRole: "primary", updatedAt: new Date() })
          .where(eq(trackedPages.id, remainingSisterPages[0].id));
      } else if (remainingSisterPages.length === 0) {
        // Remove empty brand_domains record
        const { brandDomains } = await import("@/db/schema");
        await db.delete(brandDomains).where(eq(brandDomains.id, brandDomainId));
      }
    }

    return NextResponse.json({
      success: true,
      message: remainingSisterPages.length > 0
        ? "Sister page removed; domain portfolio preserved."
        : "Tracked page, ads, and product catalog deleted successfully",
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
    const { displayName, notes, isWatchlisted, autoCreativeScan } = body;

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
    if (autoCreativeScan !== undefined) {
      updatePayload.autoCreativeScan = Boolean(autoCreativeScan);
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
