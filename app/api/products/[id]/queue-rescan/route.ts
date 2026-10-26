import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scrapedProducts, queue, trackedPages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { deleteByPrefix } from "@/lib/cache-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const product = await db.query.scrapedProducts.findFirst({
      where: eq(scrapedProducts.id, id),
      columns: {
        id: true,
        title: true,
        url: true,
        pageId: true,
        workspaceId: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const now = new Date();

    // 1. Mark product as pending so it is eligible for residential scraper pickup
    await db
      .update(scrapedProducts)
      .set({
        scrapeStatus: "pending",
        failureReason: "Queued for local worker residential price extraction",
        updatedAt: now,
      })
      .where(eq(scrapedProducts.id, id));

    // 2. Resolve trackedPage ID if available
    let trackedPageUuid: string | null = null;
    if (product.pageId) {
      try {
        const page = await db.query.trackedPages.findFirst({
          where: eq(trackedPages.pageId, product.pageId),
          columns: { id: true },
        });
        if (page) trackedPageUuid = page.id;
      } catch {}
    }

    // 3. Enqueue durable high-priority job for local worker
    await db
      .insert(queue)
      .values({
        trackedPageId: trackedPageUuid,
        jobType: "product_scrape",
        status: "pending",
        priority: 10, // Top priority for immediate local pickup
        failureReason: `product:${id}`,
        workspaceId: product.workspaceId || null,
      })
      .onConflictDoNothing();

    // Invalidate product cache
    await deleteByPrefix("cache:products:").catch(() => {});

    return NextResponse.json({
      success: true,
      productId: id,
      title: product.title,
      message: "Product marked as pending and queued for local residential price extraction.",
    });
  } catch (error: any) {
    console.error("[Queue Rescan API] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to queue product for local price extraction" },
      { status: 500 }
    );
  }
}
