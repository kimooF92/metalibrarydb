import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, scrapedProducts } from "@/db/schema";
import { eq, ilike, and, sql, desc, asc, or, count, inArray, isNull } from "drizzle-orm";
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
    const category = searchParams.get("category");
    const hasOffer = searchParams.get("hasOffer") === "true";
    const isFavoriteOnly = searchParams.get("isFavorite") === "true";
    const status = searchParams.get("status") || "all";
    const hideInactive = searchParams.get("hideInactive") === "true";
    const activeStatus = searchParams.get("activeStatus") || (hideInactive ? "active" : "all");
    const smartPreset = searchParams.get("smartPreset") || "all";
    const sortBy = searchParams.get("sortBy") || "latest";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const includeStats = searchParams.get("includeStats") === "true";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;

    const conditions: any[] = [
      sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`,
    ];

    // Filter by Active / Inactive (Off-Air) Ads status
    if (activeStatus === "active" || hideInactive) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
        )`
      );
    } else if (activeStatus === "inactive") {
      conditions.push(
        sql`NOT EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
        )`
      );
    }

    // Filter by scrape status (success, pending, failed)
    if (status && status !== "all") {
      if (status === "pending") {
        conditions.push(
          or(
            eq(scrapedProducts.scrapeStatus, "pending"),
            eq(scrapedProducts.scrapeStatus, "failed"),
            isNull(scrapedProducts.currentPrice)
          )
        );
      } else {
        conditions.push(eq(scrapedProducts.scrapeStatus, status));
      }
    }

    // Filter by category
    if (category && category !== "all") {
      if (category === "General & Other" || category === "other") {
        conditions.push(
          or(
            eq(scrapedProducts.category, "General & Other"),
            isNull(scrapedProducts.category),
            eq(scrapedProducts.category, "")
          )
        );
      } else {
        conditions.push(eq(scrapedProducts.category, category));
      }
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

    // Search filter across title, domain, URL, offer, category
    if (search && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(scrapedProducts.title, term),
          ilike(scrapedProducts.domain, term),
          ilike(scrapedProducts.url, term),
          ilike(scrapedProducts.discountOrOffer, term),
          ilike(scrapedProducts.category, term),
          ilike(scrapedProducts.subCategory, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fast Sorting Order directly on scraped_products
    const safePriceSql = sql`COALESCE(NULLIF(SUBSTRING(REPLACE(${scrapedProducts.currentPrice}, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0)`;

    let orderByClauses: any[] = [];
    if (sortBy === "title") {
      orderByClauses.push(
        sortOrder === "asc" ? asc(scrapedProducts.title) : desc(scrapedProducts.title)
      );
      orderByClauses.push(desc(scrapedProducts.createdAt));
    } else if (sortBy === "price_asc") {
      orderByClauses.push(asc(safePriceSql));
    } else if (sortBy === "price_desc") {
      orderByClauses.push(desc(safePriceSql));
    } else {
      // Default: latest discovery
      orderByClauses.push(
        sortOrder === "asc" ? asc(scrapedProducts.createdAt) : desc(scrapedProducts.createdAt)
      );
    }
    orderByClauses.push(desc(scrapedProducts.id));

    // Execute fast primary queries in parallel (lean, indexed product select + count)
    const [rawProducts, totalCountResult] = await Promise.all([
      db
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
          category: scrapedProducts.category,
          subCategory: scrapedProducts.subCategory,
          targetAudience: scrapedProducts.targetAudience,
          supplierUrls: scrapedProducts.supplierUrls,
          isFavorite: scrapedProducts.isFavorite,
          scrapeStatus: scrapedProducts.scrapeStatus,
          failureReason: scrapedProducts.failureReason,
          lastScrapedAt: scrapedProducts.lastScrapedAt,
          createdAt: scrapedProducts.createdAt,
          updatedAt: scrapedProducts.updatedAt,
        })
        .from(scrapedProducts)
        .where(whereClause)
        .orderBy(...orderByClauses)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(scrapedProducts)
        .where(whereClause),
    ]);

    // Batch query linked ad metrics for this page's products in 1 query
    const productIds = rawProducts.map((p) => p.id);
    const metricsMap = new Map<string, any>();

    if (productIds.length > 0) {
      try {
        const metricsRows = await db
          .select({
            productId: ads.productId,
            linkedAdsCount: sql<number>`COUNT(${ads.id})`.mapWith(Number),
            activeAdsCount: sql<number>`COUNT(CASE WHEN ${ads.isArchived} = false OR ${ads.isArchived} IS NULL THEN ${ads.id} END)`.mapWith(Number),
            earliestAdDate: sql<string>`MIN(COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}))`,
            latestAdDate: sql<string>`MAX(${ads.lastSeenAt})`,
            brandName: sql<string>`MAX(${ads.pageName})`,
            brandPageId: sql<string>`MAX(${ads.pageId})`,
            topCreativeThumbnail: sql<string>`MAX(COALESCE(${ads.thumbnailStoragePath}, ${ads.thumbnailUrl}))`,
          })
          .from(ads)
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

    return NextResponse.json({
      success: true,
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    console.error("[Products API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load products" },
      { status: 500 }
    );
  }
}

function extractPageId(input?: string | null): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check if it's pure digits
  if (/^[0-9]+$/.test(trimmed)) {
    return trimmed;
  }

  // Check if it's a Meta Ad Library URL: view_all_page_id=(\d+) or page_id=(\d+) or id=(\d+)
  const match = trimmed.match(/(?:view_all_page_id|page_id|id)=([0-9]+)/i);
  if (match && match[1]) {
    return match[1];
  }

  // Facebook profile / page URL pattern
  const profileMatch = trimmed.match(/facebook\.com\/profile\.php\?id=([0-9]+)/i);
  if (profileMatch && profileMatch[1]) {
    return profileMatch[1];
  }

  return trimmed;
}

export async function PATCH(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const {
      id,
      isFavorite,
      supplierUrls,
      title,
      url,
      mainImageUrl,
      currentPrice,
      originalPrice,
      discountOrOffer,
      deliveryCost,
      category,
      subCategory,
      storePlatform,
      pageId,
      metaAdLibraryUrl,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Product id is required." },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (isFavorite !== undefined) {
      updateData.isFavorite = Boolean(isFavorite);
    }

    if (title !== undefined) {
      updateData.title = typeof title === "string" ? title.trim() : null;
    }

    if (url !== undefined && typeof url === "string" && url.trim()) {
      updateData.url = url.trim();
      try {
        const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
        updateData.domain = parsed.hostname.replace(/^www\./, "");
      } catch {}
    }

    if (mainImageUrl !== undefined) {
      updateData.mainImageUrl = typeof mainImageUrl === "string" ? mainImageUrl.trim() : null;
    }

    if (currentPrice !== undefined) {
      updateData.currentPrice = typeof currentPrice === "string" ? currentPrice.trim() : null;
    }

    if (originalPrice !== undefined) {
      updateData.originalPrice = typeof originalPrice === "string" ? originalPrice.trim() : null;
    }

    if (discountOrOffer !== undefined) {
      updateData.discountOrOffer = typeof discountOrOffer === "string" ? discountOrOffer.trim() : null;
    }

    if (deliveryCost !== undefined) {
      updateData.deliveryCost = typeof deliveryCost === "string" ? deliveryCost.trim() : null;
    }

    if (category !== undefined) {
      updateData.category = typeof category === "string" ? category.trim() : null;
    }

    if (subCategory !== undefined) {
      updateData.subCategory = typeof subCategory === "string" ? subCategory.trim() : null;
    }

    if (storePlatform !== undefined) {
      updateData.storePlatform = typeof storePlatform === "string" ? storePlatform.trim() : null;
    }

    // Handle Page ID / Meta Ad Library URL parsing
    const rawPageId = pageId !== undefined ? pageId : metaAdLibraryUrl;
    if (rawPageId !== undefined) {
      const parsedPageId = extractPageId(rawPageId);
      updateData.pageId = parsedPageId;
    }

    if (supplierUrls !== undefined) {
      // Validate, clean, and deduplicate array of URL strings
      updateData.supplierUrls = Array.isArray(supplierUrls)
        ? Array.from(
            new Set(
              supplierUrls
                .filter((u: any) => typeof u === "string" && u.trim().length > 0)
                .map((u: string) => u.trim())
            )
          )
        : [];
    }

    const [updatedProduct] = await db
      .update(scrapedProducts)
      .set(updateData)
      .where(eq(scrapedProducts.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      message: "Product updated successfully.",
      product: updatedProduct,
      supplierUrls: updateData.supplierUrls,
    });
  } catch (err: any) {
    console.error("[Products PATCH API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update product" },
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

    // Mark product as deleted so background sync/scrapers never resurrect it
    await db
      .update(scrapedProducts)
      .set({
        scrapeStatus: "deleted",
        isFavorite: false,
        updatedAt: new Date(),
      })
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
