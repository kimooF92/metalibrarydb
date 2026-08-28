import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, scrapedProducts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

function extractAdArchiveId(input?: string | null): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pure digits (adArchiveId)
  if (/^[0-9]+$/.test(trimmed)) {
    return trimmed;
  }

  // Meta Ad Library URL containing id=(\d+)
  const match = trimmed.match(/[?&]id=([0-9]+)/i);
  if (match && match[1]) {
    return match[1];
  }

  return trimmed;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;
    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const body = await req.json();
    const { adArchiveId: rawInput, adUrl } = body;
    const adArchiveId = extractAdArchiveId(rawInput || adUrl);

    if (!adArchiveId) {
      return NextResponse.json(
        { error: "Invalid Ad ID or Meta Ad Library URL. Could not extract Ad ID." },
        { status: 400 }
      );
    }

    // Verify product exists
    const [product] = await db
      .select({
        id: scrapedProducts.id,
        pageId: scrapedProducts.pageId,
        url: scrapedProducts.url,
      })
      .from(scrapedProducts)
      .where(eq(scrapedProducts.id, productId));

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Check if ad exists in DB
    const [existingAd] = await db
      .select()
      .from(ads)
      .where(eq(ads.adArchiveId, adArchiveId));

    if (existingAd) {
      // Link existing ad to this product
      const [updated] = await db
        .update(ads)
        .set({
          productId: product.id,
          pageId: existingAd.pageId || product.pageId || "manual",
          updatedAt: new Date(),
        })
        .where(eq(ads.id, existingAd.id))
        .returning();

      return NextResponse.json({
        success: true,
        message: "Ad linked to product successfully.",
        ad: updated,
        created: false,
      });
    }

    // Insert new ad record linked to this product
    const [newAd] = await db
      .insert(ads)
      .values({
        adArchiveId,
        pageId: product.pageId || "manual",
        productId: product.id,
        linkUrl: product.url,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      success: true,
      message: "New ad creative created and linked to product.",
      ad: newAd,
      created: true,
    });
  } catch (err: any) {
    console.error("[Link Ad API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to link ad creative" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;
    const body = await req.json();
    const { adId, adArchiveId } = body;

    if (!adId && !adArchiveId) {
      return NextResponse.json(
        { error: "adId or adArchiveId is required to unlink." },
        { status: 400 }
      );
    }

    const condition = adId
      ? and(eq(ads.id, adId), eq(ads.productId, productId))
      : and(eq(ads.adArchiveId, adArchiveId), eq(ads.productId, productId));

    await db
      .update(ads)
      .set({
        productId: null,
        updatedAt: new Date(),
      })
      .where(condition!);

    return NextResponse.json({
      success: true,
      message: "Ad unlinked from product successfully.",
    });
  } catch (err: any) {
    console.error("[Unlink Ad API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to unlink ad creative" },
      { status: 500 }
    );
  }
}
