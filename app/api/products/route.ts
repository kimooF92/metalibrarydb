import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, scrapedProducts } from "@/db/schema";
import { eq, ilike, and, sql, desc, asc, or, count, inArray } from "drizzle-orm";
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
          ilike(scrapedProducts.domain, brandTerm),
          eq(scrapedProducts.pageId, brand.trim())
        )
      );
    }

    // Filter by e-commerce platform (Shopify, YouCan, WooCommerce)
    if (platform && platform !== "all") {
      conditions.push(ilike(scrapedProducts.storePlatform, `%${platform.trim()}%`));
    }

    // Filter by promotional offers
    if (hasOffer || smartPreset === "with_offers") {
      conditions.push(
        sql`${scrapedProducts.discountOrOffer} IS NOT NULL AND ${scrapedProducts.discountOrOffer} != ''`
      );
    }

    // Filter by Favorite / Starred status
    if (isFavoriteOnly || smartPreset === "favorites") {
      conditions.push(eq(scrapedProducts.isFavorite, true));
    }

    // Smart Preset: Newly Discovered (last 7 days)
    if (smartPreset === "new_discovered") {
      conditions.push(sql`${scrapedProducts.createdAt} >= NOW() - INTERVAL '7 days'`);
    }

    // Search filter across title, domain, URL, offer
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

    // Fast Sorting Order directly on scraped_products
    let orderByClauses: any[] = [];
    if (sortBy === "title") {
      orderByClauses.push(
        sortOrder === "asc" ? asc(scrapedProducts.title) : desc(scrapedProducts.title)
      );
      orderByClauses.push(desc(scrapedProducts.createdAt));
    } else if (sortBy === "price_asc") {
      orderByClauses.push(
        asc(sql`NULLIF(REGEXP_REPLACE(${scrapedProducts.currentPrice}, '[^0-9.]', '', 'g'), '')::numeric`)
      );
    } else if (sortBy === "price_desc") {
      orderByClauses.push(
        desc(sql`NULLIF(REGEXP_REPLACE(${scrapedProducts.currentPrice}, '[^0-9.]', '', 'g'), '')::numeric`)
      );
    } else {
      // Default: latest discovery
      orderByClauses.push(
        sortOrder === "asc" ? asc(scrapedProducts.createdAt) : desc(scrapedProducts.createdAt)
      );
    }
    orderByClauses.push(desc(scrapedProducts.id));

    // Execute fast primary queries in parallel
    const [rawProducts, totalCountResult, statsResult] = await Promise.all([
      db
        .select()
        .from(scrapedProducts)
        .where(whereClause)
        .orderBy(...orderByClauses)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(scrapedProducts)
        .where(whereClause),
      // Fast KPI summary metrics across products
      page === 1
        ? db
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
            .from(scrapedProducts)
        : Promise.resolve([]),
    ]);

    const productIds = rawProducts.map((p) => p.id);
    const metricsMap = new Map<string, any>();

    // Batch fetch ad metrics ONLY for the 24 returned products (ultra-fast indexed IN query <5ms)
    if (productIds.length > 0) {
      try {
        const metricsRows = await db
          .select({
            productId: ads.productId,
            linkedAdsCount: sql<number>`COUNT(DISTINCT ${ads.id})`.mapWith(Number),
            activeAdsCount: sql<number>`COUNT(DISTINCT CASE WHEN ${adObservations.isActive} = true AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL) THEN ${ads.id} END)`.mapWith(Number),
            maxDuplications: sql<number>`MAX(COALESCE(${adObservations.duplicationCount}, 1))`.mapWith(Number),
            earliestAdDate: sql<string>`MIN(COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}))`,
            latestAdDate: sql<string>`MAX(${ads.lastSeenAt})`,
            brandName: sql<string>`MAX(${ads.pageName})`,
            brandPageId: sql<string>`MAX(${ads.pageId})`,
            topCreativeThumbnail: sql<string>`MAX(COALESCE(${ads.thumbnailStoragePath}, ${ads.thumbnailUrl}))`,
          })
          .from(ads)
          .leftJoin(adObservations, eq(adObservations.adId, ads.id))
          .where(inArray(ads.productId, productIds))
          .groupBy(ads.productId);

        metricsRows.forEach((m) => {
          if (m.productId) {
            metricsMap.set(m.productId, m);
          }
        });
      } catch (metricsErr) {
        console.warn("[Products API] Ad metrics batch lookup warning:", metricsErr);
      }
    }

    // Merge ad metrics into product objects
    const products = rawProducts.map((p) => {
      const m = metricsMap.get(p.id);
      const earliest = m?.earliestAdDate || p.createdAt;
      const daysRunning = earliest
        ? Math.max(1, Math.round((Date.now() - new Date(earliest).getTime()) / 86400000))
        : 1;

      return {
        ...p,
        linkedAdsCount: m?.linkedAdsCount || 0,
        activeAdsCount: m?.activeAdsCount || 0,
        maxDuplications: m?.maxDuplications || 1,
        earliestAdDate: m?.earliestAdDate || null,
        latestAdDate: m?.latestAdDate || null,
        brandName: m?.brandName || null,
        brandPageId: m?.brandPageId || p.pageId || null,
        topCreativeThumbnail: m?.topCreativeThumbnail || null,
        daysRunning,
      };
    });

    // In-memory sort fallback for ad-metrics specific presets (most_scaled / top_lasting)
    if (sortBy === "most_scaled" || sortBy === "ads" || smartPreset === "most_scaled") {
      products.sort((a, b) => (b.activeAdsCount || 0) - (a.activeAdsCount || 0) || (b.maxDuplications || 1) - (a.maxDuplications || 1));
    } else if (sortBy === "top_lasting" || sortBy === "longevity" || smartPreset === "top_lasting") {
      products.sort((a, b) => (b.daysRunning || 1) - (a.daysRunning || 1));
    }

    const total = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const statsObj = statsResult && statsResult.length > 0 ? statsResult[0] : null;

    return NextResponse.json({
      success: true,
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: statsObj
        ? {
            totalProducts: statsObj.total || 0,
            successfulProducts: statsObj.successful || 0,
            pendingProducts: statsObj.pending || 0,
            withOffersCount: statsObj.withOffers || 0,
            favoritesCount: statsObj.favoritesCount || 0,
            newThisWeekCount: statsObj.newThisWeek || 0,
            platforms: {
              shopify: statsObj.shopifyCount || 0,
              youcan: statsObj.youcanCount || 0,
              woocommerce: statsObj.woocommerceCount || 0,
            },
          }
        : undefined,
    });
  } catch (err: any) {
    console.error("[Products API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load products" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { id, isFavorite } = body;

    if (!id || typeof isFavorite !== "boolean") {
      return NextResponse.json(
        { error: "Product id and boolean isFavorite are required." },
        { status: 400 }
      );
    }

    await db
      .update(scrapedProducts)
      .set({
        isFavorite,
        updatedAt: new Date(),
      })
      .where(eq(scrapedProducts.id, id));

    return NextResponse.json({
      success: true,
      id,
      isFavorite,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update favorite status" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Product id is required." },
        { status: 400 }
      );
    }

    // Unlink product_id from ads first
    await db
      .update(ads)
      .set({ productId: null })
      .where(eq(ads.productId, id));

    // Delete scraped product
    await db
      .delete(scrapedProducts)
      .where(eq(scrapedProducts.id, id));

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete product" },
      { status: 500 }
    );
  }
}
