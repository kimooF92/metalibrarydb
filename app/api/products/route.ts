import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, scrapedProducts } from "@/db/schema";
import { eq, ilike, and, sql, desc, asc, or, count } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search");
    const domain = searchParams.get("domain");
    const brand = searchParams.get("brand");
    const platform = searchParams.get("platform");
    const hasOffer = searchParams.get("hasOffer") === "true";
    const isFavoriteOnly = searchParams.get("isFavorite") === "true";
    const status = searchParams.get("status") || "all";
    const smartPreset = searchParams.get("smartPreset") || "all";
    const sortBy = searchParams.get("sortBy") || "latest";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;

    // Subquery: Aggregate ad metrics per product
    const adMetricsSubquery = db
      .select({
        productId: ads.productId,
        linkedAdsCount: sql<number>`COUNT(DISTINCT ${ads.id})`.mapWith(Number).as("linked_ads_count"),
        activeAdsCount: sql<number>`COUNT(DISTINCT CASE WHEN ${adObservations.isActive} = true AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL) THEN ${ads.id} END)`.mapWith(Number).as("active_ads_count"),
        maxDuplications: sql<number>`MAX(COALESCE(${adObservations.duplicationCount}, 1))`.mapWith(Number).as("max_duplications"),
        earliestAdDate: sql<string>`MIN(COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}))`.as("earliest_ad_date"),
        latestAdDate: sql<string>`MAX(${ads.lastSeenAt})`.as("latest_ad_date"),
        brandName: sql<string>`MAX(${ads.pageName})`.as("brand_name"),
        brandPageId: sql<string>`MAX(${ads.pageId})`.as("brand_page_id"),
        topCreativeThumbnail: sql<string>`MAX(COALESCE(${ads.thumbnailStoragePath}, ${ads.thumbnailUrl}))`.as("top_creative_thumbnail"),
      })
      .from(ads)
      .leftJoin(adObservations, eq(adObservations.adId, ads.id))
      .where(sql`${ads.productId} IS NOT NULL`)
      .groupBy(ads.productId)
      .as("ad_metrics");

    const conditions = [];

    // Filter by scrape status (success, pending, failed)
    if (status && status !== "all") {
      conditions.push(eq(scrapedProducts.scrapeStatus, status));
    }

    // Filter by domain
    if (domain && domain.trim() !== "") {
      conditions.push(ilike(scrapedProducts.domain, `%${domain.trim()}%`));
    }

    // Filter by Brand Name or Brand Page ID
    if (brand && brand.trim() !== "") {
      const brandTerm = `%${brand.trim()}%`;
      conditions.push(
        or(
          ilike(adMetricsSubquery.brandName, brandTerm),
          eq(scrapedProducts.pageId, brand.trim()),
          eq(adMetricsSubquery.brandPageId, brand.trim())
        )
      );
    }

    // Filter by e-commerce platform (Shopify, YouCan, WooCommerce)
    if (platform && platform !== "all") {
      conditions.push(ilike(scrapedProducts.storePlatform, `%${platform.trim()}%`));
    }

    // Filter by promotional offers
    if (hasOffer || smartPreset === "with_offers") {
      conditions.push(sql`${scrapedProducts.discountOrOffer} IS NOT NULL AND ${scrapedProducts.discountOrOffer} != ''`);
    }

    // Filter by Favorite / Starred status
    if (isFavoriteOnly || smartPreset === "favorites") {
      conditions.push(eq(scrapedProducts.isFavorite, true));
    }

    // Smart Preset: Newly Discovered (last 7 days)
    if (smartPreset === "new_discovered") {
      conditions.push(sql`${scrapedProducts.createdAt} >= NOW() - INTERVAL '7 days'`);
    }

    // Smart Preset: Top Lasting / Evergreen (running 30+ days with active ads)
    if (smartPreset === "top_lasting") {
      conditions.push(
        and(
          sql`COALESCE(${adMetricsSubquery.activeAdsCount}, 0) > 0`,
          sql`(${scrapedProducts.createdAt} <= NOW() - INTERVAL '30 days' OR ${adMetricsSubquery.earliestAdDate} <= NOW() - INTERVAL '30 days')`
        )
      );
    }

    // Smart Preset: Most Scaled (multiple active ads running)
    if (smartPreset === "most_scaled") {
      conditions.push(
        or(
          sql`COALESCE(${adMetricsSubquery.activeAdsCount}, 0) >= 2`,
          sql`COALESCE(${adMetricsSubquery.maxDuplications}, 1) >= 2`
        )
      );
    }

    // Search filter across title, domain, URL, offer, and brand
    if (search && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(scrapedProducts.title, term),
          ilike(scrapedProducts.domain, term),
          ilike(scrapedProducts.url, term),
          ilike(scrapedProducts.discountOrOffer, term),
          ilike(adMetricsSubquery.brandName, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Main query with enriched ad, favorite, and longevity analytics
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
        isFavorite: scrapedProducts.isFavorite,
        scrapeStatus: scrapedProducts.scrapeStatus,
        failureReason: scrapedProducts.failureReason,
        lastScrapedAt: scrapedProducts.lastScrapedAt,
        createdAt: scrapedProducts.createdAt,
        updatedAt: scrapedProducts.updatedAt,
        linkedAdsCount: sql<number>`COALESCE(${adMetricsSubquery.linkedAdsCount}, 0)`.mapWith(Number),
        activeAdsCount: sql<number>`COALESCE(${adMetricsSubquery.activeAdsCount}, 0)`.mapWith(Number),
        maxDuplications: sql<number>`COALESCE(${adMetricsSubquery.maxDuplications}, 1)`.mapWith(Number),
        earliestAdDate: adMetricsSubquery.earliestAdDate,
        latestAdDate: adMetricsSubquery.latestAdDate,
        brandName: adMetricsSubquery.brandName,
        brandPageId: adMetricsSubquery.brandPageId,
        topCreativeThumbnail: adMetricsSubquery.topCreativeThumbnail,
        daysRunning: sql<number>`
          GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(${adMetricsSubquery.earliestAdDate}, ${scrapedProducts.createdAt}))) / 86400))
        `.mapWith(Number),
      })
      .from(scrapedProducts)
      .leftJoin(adMetricsSubquery, eq(scrapedProducts.id, adMetricsSubquery.productId))
      .where(whereClause);

    // Sorting Logic
    let orderByClauses: any[] = [];
    if (sortBy === "most_scaled" || sortBy === "ads") {
      orderByClauses.push(
        sortOrder === "asc"
          ? asc(sql`COALESCE(${adMetricsSubquery.activeAdsCount}, 0)`)
          : desc(sql`COALESCE(${adMetricsSubquery.activeAdsCount}, 0)`)
      );
      orderByClauses.push(desc(sql`COALESCE(${adMetricsSubquery.maxDuplications}, 1)`));
      orderByClauses.push(desc(scrapedProducts.createdAt));
    } else if (sortBy === "top_lasting" || sortBy === "longevity") {
      orderByClauses.push(
        sortOrder === "asc"
          ? asc(sql`COALESCE(${adMetricsSubquery.earliestAdDate}, ${scrapedProducts.createdAt})`)
          : desc(sql`COALESCE(${adMetricsSubquery.earliestAdDate}, ${scrapedProducts.createdAt})`)
      );
      orderByClauses.push(desc(sql`COALESCE(${adMetricsSubquery.activeAdsCount}, 0)`));
    } else if (sortBy === "title") {
      orderByClauses.push(
        sortOrder === "asc" ? asc(scrapedProducts.title) : desc(scrapedProducts.title)
      );
      orderByClauses.push(desc(scrapedProducts.createdAt));
    } else if (sortBy === "price_asc") {
      orderByClauses.push(asc(sql`NULLIF(REGEXP_REPLACE(${scrapedProducts.currentPrice}, '[^0-9.]', '', 'g'), '')::numeric`));
    } else if (sortBy === "price_desc") {
      orderByClauses.push(desc(sql`NULLIF(REGEXP_REPLACE(${scrapedProducts.currentPrice}, '[^0-9.]', '', 'g'), '')::numeric`));
    } else {
      // Default: latest discovery
      orderByClauses.push(
        sortOrder === "asc" ? asc(scrapedProducts.createdAt) : desc(scrapedProducts.createdAt)
      );
    }
    orderByClauses.push(desc(scrapedProducts.id));

    // Parallel DB fetches for products, count, and dashboard KPIs
    const [rows, totalResult, statsResult] = await Promise.all([
      baseQuery.orderBy(...orderByClauses).limit(limit).offset(offset),
      db
        .select({ count: count() })
        .from(scrapedProducts)
        .leftJoin(adMetricsSubquery, eq(scrapedProducts.id, adMetricsSubquery.productId))
        .where(whereClause),
      db
        .select({
          total: count(),
          withOffers: sql<number>`COUNT(CASE WHEN ${scrapedProducts.discountOrOffer} IS NOT NULL AND ${scrapedProducts.discountOrOffer} != '' THEN 1 END)`.mapWith(Number),
          favoritesCount: sql<number>`COUNT(CASE WHEN ${scrapedProducts.isFavorite} = true THEN 1 END)`.mapWith(Number),
          successful: sql<number>`COUNT(CASE WHEN ${scrapedProducts.scrapeStatus} = 'success' THEN 1 END)`.mapWith(Number),
          pending: sql<number>`COUNT(CASE WHEN ${scrapedProducts.scrapeStatus} = 'pending' THEN 1 END)`.mapWith(Number),
          newThisWeek: sql<number>`COUNT(CASE WHEN ${scrapedProducts.createdAt} >= NOW() - INTERVAL '7 days' THEN 1 END)`.mapWith(Number),
          shopifyCount: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%shopify%' THEN 1 END)`.mapWith(Number),
          youcanCount: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%youcan%' THEN 1 END)`.mapWith(Number),
          woocommerceCount: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%woocommerce%' THEN 1 END)`.mapWith(Number),
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
        pendingProducts: statsResult[0]?.pending || 0,
        withOffersCount: statsResult[0]?.withOffers || 0,
        favoritesCount: statsResult[0]?.favoritesCount || 0,
        newThisWeekCount: statsResult[0]?.newThisWeek || 0,
        platforms: {
          shopify: statsResult[0]?.shopifyCount || 0,
          youcan: statsResult[0]?.youcanCount || 0,
          woocommerce: statsResult[0]?.woocommerceCount || 0,
        },
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

export async function PATCH(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const { id, isFavorite } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Product ID is required." },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (typeof isFavorite === "boolean") {
      updatePayload.isFavorite = isFavorite;
    }

    const [updatedProduct] = await db
      .update(scrapedProducts)
      .set(updatePayload)
      .where(eq(scrapedProducts.id, id))
      .returning();

    if (!updatedProduct) {
      return NextResponse.json(
        { success: false, error: "Product not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      product: updatedProduct,
      message: `Product ${isFavorite ? "added to" : "removed from"} favorites.`,
    });
  } catch (err: any) {
    console.error("[Products PATCH API] Error:", err);
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
