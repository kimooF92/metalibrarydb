import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scrapedProducts, ads, adObservations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const product = await db.query.scrapedProducts.findFirst({
      where: eq(scrapedProducts.id, id),
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const now = new Date();

    // Reset linked ads to un-archived/pending state so the verifier checks all of them
    const updatedAds = await db
      .update(ads)
      .set({
        isArchived: false,
        archivedAt: null,
        updatedAt: now,
      })
      .where(eq(ads.productId, id))
      .returning({ id: ads.id });

    // Update product updatedAt
    await db
      .update(scrapedProducts)
      .set({
        updatedAt: now,
      })
      .where(eq(scrapedProducts.id, id));

    return NextResponse.json({
      success: true,
      productId: id,
      resetAdsCount: updatedAds.length,
      message: `Successfully marked ${updatedAds.length} linked ads as pending for verification scan.`,
    });
  } catch (error: any) {
    console.error("[Queue Verify API] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to mark product for ad verification" },
      { status: 500 }
    );
  }
}
