import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scrapedProducts, ads } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { findCompetitorMatches } from "@/lib/product-matcher";
import { ScrapedProduct } from "@/types";

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { success: false, error: "productId query parameter is required." },
        { status: 400 }
      );
    }

    // 1. Fetch target product
    const [targetProduct] = await db
      .select()
      .from(scrapedProducts)
      .where(eq(scrapedProducts.id, productId));

    if (!targetProduct) {
      return NextResponse.json(
        { success: false, error: "Target product not found." },
        { status: 404 }
      );
    }

    // 2. Fetch all products with linked ad counts
    const adCountsSubquery = db
      .select({
        productId: ads.productId,
        linkedAdsCount: sql<number>`count(distinct ${ads.id})`.as("linked_ads_count"),
      })
      .from(ads)
      .where(sql`${ads.productId} IS NOT NULL`)
      .groupBy(ads.productId)
      .as("ad_counts");

    const allProducts = await db
      .select({
        id: scrapedProducts.id,
        url: scrapedProducts.url,
        domain: scrapedProducts.domain,
        pageId: scrapedProducts.pageId,
        title: scrapedProducts.title,
        currentPrice: scrapedProducts.currentPrice,
        originalPrice: scrapedProducts.originalPrice,
        currency: scrapedProducts.currency,
        discountOrOffer: scrapedProducts.discountOrOffer,
        mainImageUrl: scrapedProducts.mainImageUrl,
        galleryImages: scrapedProducts.galleryImages,
        allOffers: scrapedProducts.allOffers,
        scrapeStatus: scrapedProducts.scrapeStatus,
        failureReason: scrapedProducts.failureReason,
        lastScrapedAt: scrapedProducts.lastScrapedAt,
        createdAt: scrapedProducts.createdAt,
        updatedAt: scrapedProducts.updatedAt,
        linkedAdsCount: sql<number>`COALESCE(${adCountsSubquery.linkedAdsCount}, 0)`.mapWith(Number),
      })
      .from(scrapedProducts)
      .leftJoin(adCountsSubquery, eq(scrapedProducts.id, adCountsSubquery.productId));

    // 3. Find algorithmic competitor matches
    const benchmark = findCompetitorMatches(
      targetProduct as unknown as ScrapedProduct,
      allProducts as unknown as (ScrapedProduct & { linkedAdsCount?: number })[],
      0.40
    );

    return NextResponse.json({
      success: true,
      targetProduct,
      benchmark,
    });
  } catch (err: any) {
    console.error("[Competitors API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
