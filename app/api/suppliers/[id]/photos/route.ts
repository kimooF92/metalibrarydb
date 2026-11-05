import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { supplierPhotos } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers/[id]/photos
 * Fetches paginated photos for a supplier.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "40", 10)));
    const offset = (page - 1) * limit;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(supplierPhotos)
      .where(eq(supplierPhotos.supplierId, id));

    const total = Number(countResult?.count || 0);

    const photos = await db
      .select({
        id: supplierPhotos.id,
        supplierId: supplierPhotos.supplierId,
        albumUrl: supplierPhotos.albumUrl,
        albumTitle: supplierPhotos.albumTitle,
        photoUrl: supplierPhotos.photoUrl,
        rawMetaUrl: supplierPhotos.rawMetaUrl,
        caption: supplierPhotos.caption,
        postedAt: supplierPhotos.postedAt,
        isPromotedToProduct: supplierPhotos.isPromotedToProduct,
        promotedProductId: supplierPhotos.promotedProductId,
        createdAt: supplierPhotos.createdAt,
      })
      .from(supplierPhotos)
      .where(eq(supplierPhotos.supplierId, id))
      .orderBy(desc(supplierPhotos.postedAt), desc(supplierPhotos.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      photos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err: any) {
    console.error("[API Suppliers PHOTOS] Error:", err);
    return NextResponse.json({ error: "Failed to fetch photos", message: err?.message }, { status: 500 });
  }
}

