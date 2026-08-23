import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, scrapedProducts } from "@/db/schema";
import { eq, ilike, and, sql, desc, asc, or, count } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search");
    const domain = searchParams.get("domain");
    const hasOffer = searchParams.get("hasOffer") === "true";
    const status = searchParams.get("status") || "success";
    const sortBy = searchParams.get("sortBy") || "latest";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (status && status !== "all") {
      conditions.push(eq(scrapedProducts.scrapeStatus, status));
    }

    if (domain && domain.trim() !== "") {
      conditions.push(ilike(scrapedProducts.domain, `%${domain.trim()}%`));
    }

    if (hasOffer) {
      conditions.push(sql`${scrapedProducts.discountOrOffer} IS NOT NULL AND ${scrapedProducts.discountOrOffer} != ''`);
    }

    if (search && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(scrapedProducts.title, term),
          ilike(scrapedProducts.domain, term),
          ilike(scrapedProducts.url, term),
          ilike(scrapedProducts.discountOrOffer, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Subquery: Count linked ads per product
    const adCountsSubquery = db
      .select({
        productId: ads.productId,
        linkedAdsCount: count(ads.id).as("linked_ads_count"),
      })
      .from(ads)
      .where(sql`${ads.productId} IS NOT NULL`)
      .groupBy(ads.productId)
      .as("ad_counts");

    // Main query
    let baseQuery = db
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
        phoneNumbers: scrapedProducts.phoneNumbers,
        whatsappNumbers: scrapedProducts.whatsappNumbers,
        metaPixelIds: scrapedProducts.metaPixelIds,
        storePlatform: scrapedProducts.storePlatform,
        deliveryCost: scrapedProducts.deliveryCost,
        scrapeStatus: scrapedProducts.scrapeStatus,
        failureReason: scrapedProducts.failureReason,
        lastScrapedAt: scrapedProducts.lastScrapedAt,
        createdAt: scrapedProducts.createdAt,
        updatedAt: scrapedProducts.updatedAt,
        linkedAdsCount: sql<number>`COALESCE(${adCountsSubquery.linkedAdsCount}, 0)`.mapWith(Number),
      })
      .from(scrapedProducts)
      .leftJoin(adCountsSubquery, eq(scrapedProducts.id, adCountsSubquery.productId))
      .where(whereClause);

    // Sorting with multi-tiered deterministic tie-breakers
    let orderByClauses: any[] = [];
    if (sortBy === "ads") {
      orderByClauses.push(
        sortOrder === "asc"
          ? asc(sql`COALESCE(${adCountsSubquery.linkedAdsCount}, 0)`)
          : desc(sql`COALESCE(${adCountsSubquery.linkedAdsCount}, 0)`)
      );
      orderByClauses.push(desc(scrapedProducts.createdAt));
      orderByClauses.push(desc(scrapedProducts.id));
    } else if (sortBy === "title") {
      orderByClauses.push(
        sortOrder === "asc" ? asc(scrapedProducts.title) : desc(scrapedProducts.title)
      );
      orderByClauses.push(desc(scrapedProducts.createdAt));
      orderByClauses.push(desc(scrapedProducts.id));
    } else {
      // Default: latest
      orderByClauses.push(
        sortOrder === "asc" ? asc(scrapedProducts.createdAt) : desc(scrapedProducts.createdAt)
      );
      orderByClauses.push(desc(scrapedProducts.id));
    }

    const [rows, totalResult, statsResult] = await Promise.all([
      baseQuery.orderBy(...orderByClauses).limit(limit).offset(offset),
      db
        .select({ count: count() })
        .from(scrapedProducts)
        .where(whereClause),
      db
        .select({
          total: count(),
          withOffers: sql<number>`COUNT(CASE WHEN ${scrapedProducts.discountOrOffer} IS NOT NULL AND ${scrapedProducts.discountOrOffer} != '' THEN 1 END)`.mapWith(Number),
          successful: sql<number>`COUNT(CASE WHEN ${scrapedProducts.scrapeStatus} = 'success' THEN 1 END)`.mapWith(Number),
        })
        .from(scrapedProducts),
    ]);

    const total = totalResult[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      products: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: {
        totalProducts: statsResult[0]?.total || 0,
        successfulProducts: statsResult[0]?.successful || 0,
        withOffersCount: statsResult[0]?.withOffers || 0,
      },
    });
  } catch (err: any) {
    console.error("[Products API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Product ID is required for deletion." },
        { status: 400 }
      );
    }

    await db.delete(scrapedProducts).where(eq(scrapedProducts.id, id));

    return NextResponse.json({ success: true, message: "Product deleted successfully." });
  } catch (err: any) {
    console.error("[Products Delete API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
