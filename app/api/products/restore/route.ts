import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, scrapedProducts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Product id is required." },
        { status: 400 }
      );
    }

    // Reactivate product back to active success state
    const [restored] = await db
      .update(scrapedProducts)
      .set({
        scrapeStatus: "success",
        updatedAt: new Date(),
      })
      .where(eq(scrapedProducts.id, id))
      .returning();

    if (!restored) {
      return NextResponse.json(
        { success: false, error: "Product not found." },
        { status: 404 }
      );
    }

    // Re-link ads that point to this product's URL
    if (restored.url) {
      await db
        .update(ads)
        .set({ productId: restored.id, updatedAt: new Date() })
        .where(eq(ads.linkUrl, restored.url));
    }

    return NextResponse.json({
      success: true,
      message: "Product restored successfully.",
      product: restored,
    });
  } catch (err: any) {
    console.error("[Restore Product Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to restore product" },
      { status: 500 }
    );
  }
}
