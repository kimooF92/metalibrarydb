import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, scrapedProducts, trackedPages, discoveredPages, brandDomains } from "@/db/schema";
import { eq, ilike, and, sql, desc, asc, or, count, inArray, isNull, isNotNull, gte } from "drizzle-orm";
import { validateApiSecret, validateAdminRole, getRoleFromRequest } from "@/lib/api-guard";
import { PRIVATE_AUTH_VARY, PRIVATE_DETAIL_CACHE_CONTROL, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { getActiveWorkspace } from "@/lib/workspace-server";
import {
  NICHE_TAXONOMY,
  resolveSubNicheDbValues,
  parseNicheParam,
  parseSubNicheParam,
  resolveNicheDbCategories,
} from "@/lib/niches-taxonomy";

import { getCached, setCached, deleteByPrefix, deleteCached, buildCanonicalFilterHash } from "@/lib/cache-service";

const ALLOWED_PRODUCT_FILTERS = [
  "id", "productId", "search", "domain", "brand", "platform", "category", "niche",
  "subCategory", "subNiche", "hasOffer", "isFavorite", "status", "hideInactive",
  "adLaunch", "adLaunchFilter", "adLaunchFrom", "adLaunchTo", "stillRunning",
  "activeStatus", "smartPreset", "preset", "discovery", "discoveryFrom", "discoveryTo",
  "sortBy", "sortOrder", "includeStats", "page", "limit", "lean"
];

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PRODUCTS_REDIS_CACHE_TTL = 30; // 30 seconds global Upstash Redis cache

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const role = (await getRoleFromRequest(req)) || "admin";
    const favColumn = role === "staff" ? scrapedProducts.isFavoriteStaff : scrapedProducts.isFavorite;
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id") || searchParams.get("productId");
    const search = searchParams.get("search");
    const domain = searchParams.get("domain");
    const brand = searchParams.get("brand");
    const platform = searchParams.get("platform");
    const category = searchParams.get("category");
    const hasOffer = searchParams.get("hasOffer") === "true";
    const isFavoriteOnly = searchParams.get("isFavorite") === "true";
    const status = searchParams.get("status") || "all";
    const hideInactive = searchParams.get("hideInactive") === "true";
    const adLaunch = searchParams.get("adLaunch") || searchParams.get("adLaunchFilter") || "all";
    const adLaunchFrom = searchParams.get("adLaunchFrom");
    const adLaunchTo = searchParams.get("adLaunchTo");
    const stillRunningParam = searchParams.get("stillRunning");
    const stillRunning = stillRunningParam !== null
      ? stillRunningParam === "true"
      : (adLaunch !== "all" || hideInactive);
    const activeStatus = searchParams.get("activeStatus") || (hideInactive || stillRunning ? "active" : "all");
    const smartPreset = searchParams.get("smartPreset") || searchParams.get("preset") || "all";
    const discovery = searchParams.get("discovery") || "all";
    const discoveryFrom = searchParams.get("discoveryFrom");
    const discoveryTo = searchParams.get("discoveryTo");
    const sortBy = searchParams.get("sortBy") || "latest";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const includeStats = searchParams.get("includeStats") === "true";
    // Full product fields are only allowed for a single on-demand detail read.
    const includeDetails = Boolean(id);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;
    const isLean = searchParams.get("lean") === "true" || limit > 50;

    const activeWorkspace = await getActiveWorkspace(req);

    // Hybrid Upstash Redis cache check to eliminate duplicate DB waterfalls across all serverless instances
    const forceRefresh = searchParams.get("_t") !== null || searchParams.get("refresh") === "true";
    const filterHash = buildCanonicalFilterHash(searchParams, ALLOWED_PRODUCT_FILTERS);
    const cacheKey = `cache:products:${activeWorkspace.id}:${role}:${filterHash}`;

    if (!forceRefresh && !includeDetails) {
      const cached = await getCached<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL, Vary: PRIVATE_AUTH_VARY },
        });
      }
    }

    const conditions: any[] = [
      sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`,
    ];

    // Filter by specific product ID if requested (for deep-linking & direct sharing)
    if (id && id.trim() !== "") {
      const trimmedId = id.trim();
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmedId);
      if (isUuid) {
        conditions.push(eq(scrapedProducts.id, trimmedId));
      } else {
        conditions.push(eq(scrapedProducts.url, trimmedId));
      }
    } else {
      conditions.push(eq(scrapedProducts.workspaceId, activeWorkspace.id));
    }

    // Filter by Active / Inactive (Off-Air) Ads status
    const requireActiveAds = activeStatus === "active" || hideInactive || stillRunning;
    if (activeStatus === "discovered") {
      // Show imported discovery products that are successfully scraped, even before ad creative scan runs
      conditions.push(
        eq(scrapedProducts.scrapeStatus, "success"),
        sql`EXISTS (
          SELECT 1 FROM ${discoveredPages}
          WHERE ${discoveredPages.pageId} = ${scrapedProducts.pageId}
        )`
      );
    } else if (requireActiveAds) {
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

    // Filter by category / niche (supports single or comma-separated multi-select, slugs, or dbCategories)
    const categoryParams = [
      ...searchParams.getAll("category"),
      ...searchParams.getAll("niche"),
    ].filter((p) => Boolean(p) && p !== "all");

    if (categoryParams.length > 0) {
      const rawCategories = Array.from(new Set(categoryParams.flatMap((p) => parseNicheParam(p))));
      const mappedCategories = Array.from(new Set(rawCategories.flatMap((raw) => resolveNicheDbCategories(raw))));

      const includesGeneral = mappedCategories.some(
        (c) => c === "General & Other" || c.toLowerCase() === "other" || c === "general-seasonal"
      );
      const standardCategories = mappedCategories.filter(
        (c) => c !== "General & Other" && c.toLowerCase() !== "other" && c !== "general-seasonal"
      );

      const categoryConditions: any[] = [];
      if (standardCategories.length === 1) {
        categoryConditions.push(eq(scrapedProducts.category, standardCategories[0]));
      } else if (standardCategories.length > 1) {
        categoryConditions.push(inArray(scrapedProducts.category, standardCategories));
      }

      if (includesGeneral) {
        categoryConditions.push(
          or(
            eq(scrapedProducts.category, "General & Other"),
            isNull(scrapedProducts.category),
            eq(scrapedProducts.category, "")
          )
        );
      }

      if (categoryConditions.length === 1) {
        conditions.push(categoryConditions[0]);
      } else if (categoryConditions.length > 1) {
        conditions.push(or(...categoryConditions));
      }
    }

    // Filter by sub-category / sub-niche (supports single or comma-separated multi-select, slugs, or dbValues)
    const subCategoryParams = [
      ...searchParams.getAll("subCategory"),
      ...searchParams.getAll("subNiche"),
    ].filter((p) => Boolean(p) && p !== "all");

    if (subCategoryParams.length > 0) {
      const rawSubCategories = Array.from(new Set(subCategoryParams.flatMap((p) => parseSubNicheParam(p))));
      const resolvedDbValues = Array.from(
        new Set(rawSubCategories.flatMap((raw) => resolveSubNicheDbValues(raw)))
      );
      if (resolvedDbValues.length === 1) {
        conditions.push(eq(scrapedProducts.subCategory, resolvedDbValues[0]));
      } else if (resolvedDbValues.length > 1) {
        conditions.push(inArray(scrapedProducts.subCategory, resolvedDbValues));
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
      conditions.push(eq(favColumn, true));
    }

    // Smart Preset: Newly Discovered (last 7 days)
    if (smartPreset === "new_discovered") {
      conditions.push(sql`${scrapedProducts.createdAt} >= NOW() - INTERVAL '7 days'`);
    }

    // Discovery Date Filters (presets or custom range)
    if (discovery === "today") {
      conditions.push(sql`${scrapedProducts.createdAt} >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`);
    } else if (discovery === "yesterday") {
      conditions.push(
        sql`${scrapedProducts.createdAt} >= date_trunc('day', NOW() AT TIME ZONE 'UTC' - INTERVAL '1 day') AND ${scrapedProducts.createdAt} < date_trunc('day', NOW() AT TIME ZONE 'UTC')`
      );
    } else if (discovery === "last_3d") {
      conditions.push(sql`${scrapedProducts.createdAt} >= NOW() - INTERVAL '3 days'`);
    } else if (discovery === "last_7d") {
      conditions.push(sql`${scrapedProducts.createdAt} >= NOW() - INTERVAL '7 days'`);
    } else if (discovery === "last_14d") {
      conditions.push(sql`${scrapedProducts.createdAt} >= NOW() - INTERVAL '14 days'`);
    } else if (discovery === "last_30d") {
      conditions.push(sql`${scrapedProducts.createdAt} >= NOW() - INTERVAL '30 days'`);
    } else if (discovery === "this_month") {
      conditions.push(sql`${scrapedProducts.createdAt} >= date_trunc('month', NOW() AT TIME ZONE 'UTC')`);
    } else if (discovery === "custom" || (!discovery && (discoveryFrom || discoveryTo))) {
      if (discoveryFrom && /^\d{4}-\d{2}-\d{2}$/.test(discoveryFrom.trim())) {
        conditions.push(sql`${scrapedProducts.createdAt} >= ${discoveryFrom.trim() + " 00:00:00"}::timestamptz`);
      }
      if (discoveryTo && /^\d{4}-\d{2}-\d{2}$/.test(discoveryTo.trim())) {
        conditions.push(sql`${scrapedProducts.createdAt} < (${discoveryTo.trim() + " 00:00:00"}::timestamptz + INTERVAL '1 day')`);
      }
    }

    // Ad Launch Date / Winner Longevity Filters (7d+, 15d+, 21d+, 30d+, custom)
    const stillRunningClause = stillRunning ? sql` AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)` : sql``;

    if (adLaunch === "7d" || adLaunch === "last_7d") {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) <= NOW() - INTERVAL '7 days'
          ${stillRunningClause}
        )`
      );
    } else if (adLaunch === "15d" || adLaunch === "14d" || adLaunch === "last_15d" || adLaunch === "last_14d") {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) <= NOW() - INTERVAL '14 days'
          ${stillRunningClause}
        )`
      );
    } else if (adLaunch === "21d" || adLaunch === "last_21d") {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) <= NOW() - INTERVAL '21 days'
          ${stillRunningClause}
        )`
      );
    } else if (adLaunch === "30d" || adLaunch === "last_30d" || adLaunch === "month" || adLaunch === "1m") {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) <= NOW() - INTERVAL '30 days'
          ${stillRunningClause}
        )`
      );
    } else if (adLaunch === "custom" || (!adLaunch && (adLaunchFrom || adLaunchTo))) {
      const launchConditions: any[] = [];
      if (adLaunchFrom && /^\d{4}-\d{2}-\d{2}$/.test(adLaunchFrom.trim())) {
        launchConditions.push(
          sql`COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) >= ${adLaunchFrom.trim() + " 00:00:00"}::timestamptz`
        );
      }
      if (adLaunchTo && /^\d{4}-\d{2}-\d{2}$/.test(adLaunchTo.trim())) {
        launchConditions.push(
          sql`COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) < (${adLaunchTo.trim() + " 00:00:00"}::timestamptz + INTERVAL '1 day')`
        );
      }
      if (stillRunning) {
        launchConditions.push(sql`(${ads.isArchived} = false OR ${ads.isArchived} IS NULL)`);
      }
      if (launchConditions.length > 0) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM ${ads}
            WHERE ${ads.productId} = ${scrapedProducts.id}
            AND ${and(...launchConditions)}
          )`
        );
      }
    }

    // Smart Preset: Breakout Scalers (validated age 7-30 days with a fresh scaling push: >= 3 new ads or >= 3 duplication surge)
    if (smartPreset === "breakout") {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${ads} a1
          WHERE a1.product_id = ${scrapedProducts.id}
          AND (a1.is_archived = false OR a1.is_archived IS NULL)
          AND COALESCE(a1.started_running_on, a1.first_seen_at) <= NOW() - INTERVAL '7 days'
          AND COALESCE(a1.started_running_on, a1.first_seen_at) >= NOW() - INTERVAL '30 days'
        ) AND (
          (
            SELECT COUNT(a2.id) FROM ${ads} a2
            WHERE a2.product_id = ${scrapedProducts.id}
            AND (a2.is_archived = false OR a2.is_archived IS NULL)
            AND COALESCE(a2.started_running_on, a2.first_seen_at) >= NOW() - INTERVAL '7 days'
          ) >= 3
          OR
          EXISTS (
            SELECT 1 FROM ${ads} a3
            JOIN ${adObservations} ao ON ao.ad_id = a3.id
            WHERE a3.product_id = ${scrapedProducts.id}
            AND (a3.is_archived = false OR a3.is_archived IS NULL)
            AND ao.is_active = true
            AND ao.observed_at >= NOW() - INTERVAL '7 days'
            AND ao.duplication_count >= 3
          )
        )`
      );
    }

    // Smart Preset: Most Scaled (products with active scaled ads: >= 2 active running ads)
    if (smartPreset === "most_scaled") {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
          GROUP BY ${ads.productId}
          HAVING COUNT(${ads.id}) >= 2
        )`
      );
    }

    // Smart Preset: Evergreen (ads running >= 30 days or discovered >= 30 days)
    if (smartPreset === "top_lasting") {
      conditions.push(
        sql`(${scrapedProducts.createdAt} <= NOW() - INTERVAL '30 days' OR EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) <= NOW() - INTERVAL '30 days'
        ))`
      );
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
    if (sortBy === "title" || sortBy === "title_asc") {
      orderByClauses.push(
        sortOrder === "desc" ? desc(scrapedProducts.title) : asc(scrapedProducts.title)
      );
      orderByClauses.push(desc(scrapedProducts.createdAt));
    } else if (sortBy === "title_desc") {
      orderByClauses.push(desc(scrapedProducts.title));
      orderByClauses.push(desc(scrapedProducts.createdAt));
    } else if (sortBy === "price_asc") {
      orderByClauses.push(asc(safePriceSql));
    } else if (sortBy === "price_desc") {
      orderByClauses.push(desc(safePriceSql));
    } else if (sortBy === "oldest" || sortBy === "discovered_asc") {
      orderByClauses.push(asc(scrapedProducts.createdAt));
    } else if (sortBy === "launched_desc" || sortBy === "newest_launched") {
      orderByClauses.push(
        sql`(SELECT MAX(COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt})) FROM ${ads} WHERE ${ads.productId} = ${scrapedProducts.id}) DESC NULLS LAST`
      );
    } else if (sortBy === "launched_asc" || sortBy === "oldest_launched" || sortBy === "top_lasting" || sortBy === "longevity" || sortBy === "longest_running") {
      orderByClauses.push(
        sql`(SELECT MIN(COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt})) FROM ${ads} WHERE ${ads.productId} = ${scrapedProducts.id}) ASC NULLS LAST`
      );
    } else if (sortBy === "most_scaled" || sortBy === "ads") {
      orderByClauses.push(
        sql`(SELECT COUNT(${ads.id}) FROM ${ads} WHERE ${ads.productId} = ${scrapedProducts.id} AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)) DESC`
      );
    } else {
      // Default: latest discovery
      orderByClauses.push(
        sortOrder === "asc" ? asc(scrapedProducts.createdAt) : desc(scrapedProducts.createdAt)
      );
    }
    orderByClauses.push(desc(scrapedProducts.id));

    // Execute fast primary queries in parallel (lean, indexed product select + count)
    const productSelection = {
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
      storePlatform: scrapedProducts.storePlatform,
      deliveryCost: scrapedProducts.deliveryCost,
      category: scrapedProducts.category,
      subCategory: scrapedProducts.subCategory,
      targetAudience: scrapedProducts.targetAudience,
      isFavorite: favColumn,
      scrapeStatus: scrapedProducts.scrapeStatus,
      failureReason: scrapedProducts.failureReason,
      lastScrapedAt: scrapedProducts.lastScrapedAt,
      createdAt: scrapedProducts.createdAt,
      updatedAt: scrapedProducts.updatedAt,
      offerCount: sql<number>`COALESCE(json_array_length(${scrapedProducts.allOffers}), 0)`.mapWith(Number),
      supplierCount: sql<number>`COALESCE(array_length(${scrapedProducts.supplierUrls}, 1), 0)`.mapWith(Number),
      ...(includeDetails
        ? {
            galleryImages: scrapedProducts.galleryImages,
            allOffers: scrapedProducts.allOffers,
            phoneNumbers: scrapedProducts.phoneNumbers,
            whatsappNumbers: scrapedProducts.whatsappNumbers,
            metaPixelIds: scrapedProducts.metaPixelIds,
            supplierUrls: scrapedProducts.supplierUrls,
          }
        : {}),
    };

    const [rawProducts, totalCountResult] = await Promise.all([
      db
        .select(productSelection)
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

    // Also collect page IDs directly associated with products to ensure brandHoldStatus is always accurate
    const pageIdsFromProducts = Array.from(
      new Set(rawProducts.map((p) => p.pageId).filter((pid): pid is string => Boolean(pid && pid.trim())))
    );
    const pageMap = new Map<string, any>();
    const obsMetricsMap = new Map<string, { maxDuplications: number; maxSurge: number }>();

    const asyncLookups: Promise<any>[] = [];

    if (!isLean && productIds.length > 0) {
      asyncLookups.push(
        db
          .select({
            productId: ads.productId,
            linkedAdsCount: sql<number>`COUNT(${ads.id})`.mapWith(Number),
            activeAdsCount: sql<number>`COUNT(CASE WHEN ${ads.isArchived} = false OR ${ads.isArchived} IS NULL THEN ${ads.id} END)`.mapWith(Number),
            recentAdsCount: sql<number>`COUNT(CASE WHEN (${ads.isArchived} = false OR ${ads.isArchived} IS NULL) AND COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) >= NOW() - INTERVAL '7 days' THEN 1 END)`.mapWith(Number),
            videoAdsCount: sql<number>`COUNT(CASE WHEN ${ads.mediaType} = 'video' THEN 1 END)`.mapWith(Number),
            hasCarouselAd: sql<boolean>`COALESCE(BOOL_OR(${ads.mediaType} = 'carousel'), false)`,
            earliestAdDate: sql<string>`MIN(COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}))`,
            latestAdDate: sql<string>`MAX(${ads.lastSeenAt})`,
            brandName: sql<string>`MAX(COALESCE(${trackedPages.displayName}, ${ads.pageName}))`,
            brandPageId: sql<string>`MAX(${ads.pageId})`,
            brandProfilePic: sql<string>`MAX(${trackedPages.profilePicUrl})`,
            brandHoldStatus: sql<string>`MAX(${trackedPages.holdStatus})`,
            brandCurrentResults: sql<number>`MAX(${trackedPages.currentResults})`.mapWith(Number),
            topCreativeThumbnail: sql<string>`MAX(COALESCE(NULLIF(${ads.thumbnailUrl}, ''), NULLIF(${ads.thumbnailStoragePath}, '')))`,
          })
          .from(ads)
          .leftJoin(trackedPages, eq(trackedPages.pageId, ads.pageId))
          .where(inArray(ads.productId, productIds))
          .groupBy(ads.productId)
          .then((rows) => {
            rows.forEach((m) => {
              if (m.productId) metricsMap.set(m.productId, m);
            });
          })
          .catch((metricsErr) => {
            console.warn("[Products API] Ad metrics batch lookup warning:", metricsErr);
          })
      );

      // Batch query duplication scale and 7-day surge from ad observations
      asyncLookups.push(
        db
          .select({
            productId: ads.productId,
            maxDuplications: sql<number>`MAX(${adObservations.duplicationCount})`.mapWith(Number),
            maxSurge: sql<number>`
              COALESCE(
                MAX(CASE WHEN ${adObservations.observedAt} >= NOW() - INTERVAL '7 days' THEN ${adObservations.duplicationCount} ELSE 0 END) -
                MIN(CASE WHEN ${adObservations.observedAt} >= NOW() - INTERVAL '7 days' THEN ${adObservations.duplicationCount} ELSE NULL END),
                0
              )
            `.mapWith(Number),
          })
          .from(adObservations)
          .innerJoin(ads, eq(ads.id, adObservations.adId))
          .where(
            and(
              inArray(ads.productId, productIds),
              eq(adObservations.isActive, true),
              gte(adObservations.observedAt, sql`NOW() - INTERVAL '14 days'`)
            )
          )
          .groupBy(ads.productId)
          .then((rows) => {
            rows.forEach((row) => {
              if (row.productId) {
                obsMetricsMap.set(row.productId, {
                  maxDuplications: row.maxDuplications || 1,
                  maxSurge: Math.max(0, row.maxSurge || 0),
                });
              }
            });
          })
          .catch((obsErr) => {
            console.warn("[Products API] Ad observations batch lookup warning:", obsErr);
          })
      );
    }

    if (!isLean && pageIdsFromProducts.length > 0) {
      asyncLookups.push(
        db
          .select({
            pageId: trackedPages.pageId,
            displayName: trackedPages.displayName,
            profilePicUrl: trackedPages.profilePicUrl,
            holdStatus: trackedPages.holdStatus,
            currentResults: trackedPages.currentResults,
          })
          .from(trackedPages)
          .where(inArray(trackedPages.pageId, pageIdsFromProducts))
          .then((rows) => {
            rows.forEach((row) => {
              if (row.pageId) pageMap.set(row.pageId, row);
            });
          })
          .catch((pageErr) => {
            console.warn("[Products API] Tracked pages batch lookup warning:", pageErr);
          })
      );
    }

    // Also look up domain profile pics for products whose domain matches brandDomains
    const domainsFromProducts = Array.from(
      new Set(rawProducts.map((p) => p.domain).filter((d): d is string => Boolean(d && d.trim())))
    );
    const domainPicMap = new Map<string, string>();

    if (!isLean && domainsFromProducts.length > 0) {
      asyncLookups.push(
        db
          .select({
            domain: brandDomains.domain,
            profilePicUrl: brandDomains.profilePicUrl,
          })
          .from(brandDomains)
          .where(and(inArray(brandDomains.domain, domainsFromProducts), isNotNull(brandDomains.profilePicUrl)))
          .then((rows) => {
            rows.forEach((row) => {
              if (row.domain && row.profilePicUrl) domainPicMap.set(row.domain, row.profilePicUrl);
            });
          })
          .catch((domainErr) => {
            console.warn("[Products API] Brand domains batch lookup warning:", domainErr);
          })
      );
    }

    if (asyncLookups.length > 0) {
      await Promise.all(asyncLookups);
    }

    // Merge ad metrics into product objects
    const products = rawProducts.map((p) => {
      const m = metricsMap.get(p.id);
      const pageInfo = p.pageId ? pageMap.get(p.pageId) : null;
      const earliest = m?.earliestAdDate || p.createdAt;
      const brandHoldStatus = (m?.brandHoldStatus || pageInfo?.holdStatus || "active") as any;
      const isProductActive = (m?.activeAdsCount || 0) > 0 && brandHoldStatus !== "inactive";
      const endTimestamp = isProductActive || !m?.latestAdDate
        ? Date.now()
        : new Date(m.latestAdDate).getTime();
      const daysRunning = earliest
        ? Math.max(1, Math.round((endTimestamp - new Date(earliest).getTime()) / 86400000))
        : 1;

      const brandPageId = m?.brandPageId || p.pageId || null;
      const brandName = m?.brandName || pageInfo?.displayName || null;
      const brandProfilePic =
        m?.brandProfilePic ||
        pageInfo?.profilePicUrl ||
        (p.domain ? domainPicMap.get(p.domain) : null) ||
        null;
      const brandCurrentResults = typeof m?.brandCurrentResults === "number"
        ? m.brandCurrentResults
        : typeof pageInfo?.currentResults === "number"
        ? pageInfo.currentResults
        : null;

      const obs = obsMetricsMap.get(p.id);
      const maxDuplications = Math.max(obs?.maxDuplications || 1, 1);
      const recentNewAds = m?.recentAdsCount || 0;
      const duplicationSurge = obs?.maxSurge || 0;
      const effectiveSurge = Math.max(recentNewAds, duplicationSurge);

      // Breakout product:
      // 1. Brand is active (not on hold / inactive)
      // 2. Active ads running currently
      // 3. Validated product age: 7 to 30 days running
      // 4. Scaling push: >= 3 new ads launched this week OR >= 3 duplication surge (or >= 3 copies with fresh activity)
      const isBreakout = Boolean(
        brandHoldStatus !== "on_hold" &&
        brandHoldStatus !== "inactive" &&
        (m?.activeAdsCount || 0) > 0 &&
        daysRunning >= 7 &&
        daysRunning <= 30 &&
        (effectiveSurge >= 3 || (maxDuplications >= 3 && recentNewAds >= 2))
      );

      // Compute Breakout Confidence Score (0-100) & Tier
      let breakoutScore: number | undefined;
      let breakoutTier: "hard" | "standard" | "soft" | null = null;

      if (isBreakout) {
        // A. Scale Score (0 - 40 pts)
        let scaleScore = 15;
        if (maxDuplications >= 16) scaleScore = 40;
        else if (maxDuplications >= 9) scaleScore = 35;
        else if (maxDuplications >= 5) scaleScore = 28;
        else if (maxDuplications >= 3) scaleScore = 20;

        // B. Surge Score (0 - 35 pts)
        let surgeScore = 15;
        if (effectiveSurge >= 8) surgeScore = 35;
        else if (effectiveSurge >= 5) surgeScore = 25;
        else if (effectiveSurge >= 3) surgeScore = 20;

        // C. Longevity Sweet-Spot (0 - 15 pts)
        let longevityScore = 10;
        if (daysRunning >= 11 && daysRunning <= 18) longevityScore = 15; // Golden breakout zone
        else if (daysRunning >= 7 && daysRunning <= 10) longevityScore = 12;

        // D. Content Bonus (0 - 10 pts)
        let contentBonus = 0;
        if ((m?.videoAdsCount || 0) > 0) contentBonus += 4;
        if ((m?.linkedAdsCount || 0) >= 5) contentBonus += 6;
        else if ((m?.linkedAdsCount || 0) >= 3) contentBonus += 3;

        breakoutScore = Math.min(100, scaleScore + surgeScore + longevityScore + contentBonus);
        breakoutTier = breakoutScore >= 75 ? "hard" : breakoutScore >= 50 ? "standard" : "soft";
      }

      return {
        ...p,
        linkedAdsCount: m?.linkedAdsCount || 0,
        activeAdsCount: m?.activeAdsCount || 0,
        hasCarouselAd: Boolean(m?.hasCarouselAd),
        maxDuplications,
        earliestAdDate: m?.earliestAdDate || null,
        latestAdDate: m?.latestAdDate || null,
        brandName,
        brandPageId,
        brandProfilePic,
        brandHoldStatus,
        brandCurrentResults,
        topCreativeThumbnail: m?.topCreativeThumbnail || null,
        daysRunning,
        isBreakout,
        breakoutScore,
        breakoutTier,
        breakoutSurge: effectiveSurge,
      };
    });

    // In-memory sort fallback for ad-metrics specific sorts (breakout / most_scaled / top_lasting)
    if (sortBy === "breakout") {
      products.sort((a, b) => {
        if (a.isBreakout !== b.isBreakout) return a.isBreakout ? -1 : 1;
        if (a.isBreakout && b.isBreakout) {
          return (b.breakoutScore || 0) - (a.breakoutScore || 0);
        }
        return (b.maxDuplications || 1) - (a.maxDuplications || 1) || (b.activeAdsCount || 0) - (a.activeAdsCount || 0);
      });
    } else if (sortBy === "most_scaled" || sortBy === "ads") {
      products.sort((a, b) => (b.activeAdsCount || 0) - (a.activeAdsCount || 0) || (b.maxDuplications || 1) - (a.maxDuplications || 1));
    } else if (sortBy === "top_lasting" || sortBy === "longevity") {
      products.sort((a, b) => (b.daysRunning || 1) - (a.daysRunning || 1));
    }

    const total = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const responsePayload = {
      success: true,
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    if (!forceRefresh && !includeDetails) {
      await setCached(cacheKey, responsePayload, PRODUCTS_REDIS_CACHE_TTL).catch(() => {});
    }

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": includeDetails ? PRIVATE_DETAIL_CACHE_CONTROL : PRIVATE_READ_CACHE_CONTROL,
        Vary: PRIVATE_AUTH_VARY,
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
    const activeWorkspace = await getActiveWorkspace(req);
    const role = (await getRoleFromRequest(req)) || "admin";
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
      if (role === "staff") {
        updateData.isFavoriteStaff = Boolean(isFavorite);
      } else {
        updateData.isFavorite = Boolean(isFavorite);
      }
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

    const favColumn = role === "staff" ? scrapedProducts.isFavoriteStaff : scrapedProducts.isFavorite;

    const [updatedProduct] = await db
      .update(scrapedProducts)
      .set(updateData)
      .where(eq(scrapedProducts.id, id))
      .returning({
        id: scrapedProducts.id,
        title: scrapedProducts.title,
        currentPrice: scrapedProducts.currentPrice,
        originalPrice: scrapedProducts.originalPrice,
        discountOrOffer: scrapedProducts.discountOrOffer,
        deliveryCost: scrapedProducts.deliveryCost,
        category: scrapedProducts.category,
        subCategory: scrapedProducts.subCategory,
        storePlatform: scrapedProducts.storePlatform,
        url: scrapedProducts.url,
        domain: scrapedProducts.domain,
        mainImageUrl: scrapedProducts.mainImageUrl,
        supplierUrls: scrapedProducts.supplierUrls,
        isFavorite: favColumn,
        updatedAt: scrapedProducts.updatedAt,
      });

    // Invalidate products, spy ads, stats, and brand cache for this workspace
    if (activeWorkspace) {
      const ws = activeWorkspace.id;
      const brandKey = (updatedProduct?.domain || "").toLowerCase();
      await Promise.allSettled([
        deleteByPrefix(`cache:products:${ws}:`),
        deleteByPrefix(`cache:spy_ads:${ws}:`),
        deleteCached(`cache:stats:${ws}`),
        brandKey ? deleteByPrefix(`cache:brand:${ws}:${brandKey}:`) : Promise.resolve(),
      ]);
    }

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
  const authError = await validateAdminRole(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Product id is required." },
        { status: 400 }
      );
    }

    // Unlink product_id from ads
    await db
      .update(ads)
      .set({ productId: null })
      .where(eq(ads.productId, id));

    // Mark product as deleted and purge ephemeral raw_extract to protect 500 MB disk quota
    const [deletedProduct] = await db
      .update(scrapedProducts)
      .set({
        scrapeStatus: "deleted",
        rawExtract: null,
        isFavorite: false,
        isFavoriteStaff: false,
        updatedAt: new Date(),
      })
      .where(eq(scrapedProducts.id, id))
      .returning({ domain: scrapedProducts.domain });

    // Invalidate products, spy ads, stats, and brand cache for this workspace
    if (activeWorkspace) {
      const ws = activeWorkspace.id;
      const brandKey = (deletedProduct?.domain || "").toLowerCase();
      await Promise.allSettled([
        deleteByPrefix(`cache:products:${ws}:`),
        deleteByPrefix(`cache:spy_ads:${ws}:`),
        deleteCached(`cache:stats:${ws}`),
        brandKey ? deleteByPrefix(`cache:brand:${ws}:${brandKey}:`) : Promise.resolve(),
      ]);
    }

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
