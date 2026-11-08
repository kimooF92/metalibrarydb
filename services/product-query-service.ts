import { db } from "@/db";
import {
  ads,
  adObservations,
  scrapedProducts,
  trackedPages,
  discoveredPages,
  brandDomains,
} from "@/db/schema";
import {
  eq,
  ilike,
  and,
  sql,
  desc,
  asc,
  or,
  count,
  inArray,
  isNull,
  isNotNull,
  gte,
} from "drizzle-orm";
import {
  resolveSubNicheDbValues,
  parseNicheParam,
  parseSubNicheParam,
  resolveNicheDbCategories,
} from "@/lib/niches-taxonomy";
import { CarouselItemSummary } from "@/types";
import {
  resolveTimezone,
  getStartOfTodaySql,
  getStartOfYesterdaySql,
  getStartOfMonthSql,
} from "@/lib/timezone";
import {
  getCached,
  setCached,
  buildCanonicalFilterHash,
} from "@/lib/cache-service";

export const ALLOWED_PRODUCT_FILTERS = [
  "id",
  "productId",
  "search",
  "domain",
  "brand",
  "platform",
  "category",
  "niche",
  "subCategory",
  "subNiche",
  "hasOffer",
  "isFavorite",
  "status",
  "hideInactive",
  "adLaunch",
  "adLaunchFilter",
  "adLaunchFrom",
  "adLaunchTo",
  "stillRunning",
  "activeStatus",
  "smartPreset",
  "preset",
  "discovery",
  "discoveryFrom",
  "discoveryTo",
  "sortBy",
  "sortOrder",
  "includeStats",
  "page",
  "limit",
  "lean",
  "groupCarousels",
  "tz",
];

export const PRODUCTS_REDIS_CACHE_TTL = 180; // 3 minutes Upstash Redis cache (protects Supabase egress)

/**
 * Builds deterministic Redis cache key for products query (BUG-04)
 */
export function buildCanonicalProductCacheKey(
  searchParams: URLSearchParams,
  workspaceId: string,
  role: string
): string {
  const filterHash = buildCanonicalFilterHash(searchParams, ALLOWED_PRODUCT_FILTERS);
  return `cache:products:${workspaceId}:${role}:${filterHash}`;
}

export interface FetchProductsOptions {
  searchParams: URLSearchParams;
  workspaceId: string;
  countryCode?: string;
  role: string;
  clientTz?: string | null;
}

export interface ProductsQueryResult {
  success: boolean;
  products: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  groupedCarouselsCount: number;
  totalItemsRepresented: number;
  fromCache?: boolean;
}

/**
 * Groups sibling products belonging to the same brand / carousel campaign into master bundles.
 * Preserves BUG-02 and BUG-22 invariants:
 * - If skipGrouping is true (e.g. single product / includeDetails), skip immediately.
 * - Caps consolidated list to limit.
 */
export function groupProductsIntoCarousels(
  products: any[],
  limit: number,
  skipGrouping?: boolean
): any[] {
  if (skipGrouping) {
    return products.slice(0, limit);
  }

  const carouselGroups = new Map<string, any[]>();

  for (const p of products) {
    if (p.hasCarouselAd) {
      const groupKey = p.brandPageId
        ? `brand:${p.brandPageId}`
        : p.pageId
        ? `page:${p.pageId}`
        : p.domain
        ? `domain:${p.domain.toLowerCase()}`
        : null;

      if (groupKey) {
        const existing = carouselGroups.get(groupKey) || [];
        existing.push(p);
        carouselGroups.set(groupKey, existing);
      }
    }
  }

  const consolidated: any[] = [];
  const processedGroupKeys = new Set<string>();

  for (const p of products) {
    if (p.hasCarouselAd) {
      const groupKey = p.brandPageId
        ? `brand:${p.brandPageId}`
        : p.pageId
        ? `page:${p.pageId}`
        : p.domain
        ? `domain:${p.domain.toLowerCase()}`
        : null;

      if (groupKey) {
        if (processedGroupKeys.has(groupKey)) continue;
        processedGroupKeys.add(groupKey);

        const group = carouselGroups.get(groupKey) || [p];
        if (group.length > 1) {
          // Rank within cluster so the highest active ads / strongest product serves as Hero (index 0)
          group.sort(
            (a, b) =>
              (b.activeAdsCount || 0) - (a.activeAdsCount || 0) ||
              (b.linkedAdsCount || 0) - (a.linkedAdsCount || 0) ||
              (b.maxDuplications || 1) - (a.maxDuplications || 1)
          );

          const hero = { ...group[0] };
          hero.isCarouselBundle = true;
          hero.carouselBundleCount = group.length;
          hero.carouselItems = group.map((item) => ({
            id: item.id,
            url: item.url,
            title: item.title,
            currentPrice: item.currentPrice,
            originalPrice: item.originalPrice,
            currency: item.currency,
            discountOrOffer: item.discountOrOffer,
            mainImageUrl: item.mainImageUrl,
            activeAdsCount: item.activeAdsCount,
            linkedAdsCount: item.linkedAdsCount,
            isFavorite: item.isFavorite,
            createdAt: item.createdAt,
          }));
          consolidated.push(hero);
          continue;
        } else {
          consolidated.push(p);
          continue;
        }
      }
    }
    consolidated.push(p);
  }

  return consolidated.slice(0, limit);
}

/**
 * Builds lean, explicit Drizzle column selections for scraped_products (BUG-01)
 */
export function buildProductProjections(
  includeDetails: boolean,
  favColumn: any
) {
  return {
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
}

/**
 * Fetches products from database with lean projections, pagination, filtering, and caching
 */
export async function fetchProducts(
  options: FetchProductsOptions
): Promise<ProductsQueryResult> {
  const { searchParams, workspaceId, countryCode, role, clientTz } = options;

  const favColumn =
    role === "staff" ? scrapedProducts.isFavoriteStaff : scrapedProducts.isFavorite;

  const id = searchParams.get("id") || searchParams.get("productId");
  const search = searchParams.get("search");
  const domain = searchParams.get("domain");
  const brand = searchParams.get("brand");
  const platform = searchParams.get("platform");
  const hasOffer = searchParams.get("hasOffer") === "true";
  const isFavoriteOnly = searchParams.get("isFavorite") === "true";
  const status = searchParams.get("status") || "all";
  const hideInactive = searchParams.get("hideInactive") === "true";
  const adLaunch = searchParams.get("adLaunch") || searchParams.get("adLaunchFilter") || "all";
  const adLaunchFrom = searchParams.get("adLaunchFrom");
  const adLaunchTo = searchParams.get("adLaunchTo");
  const stillRunningParam = searchParams.get("stillRunning");
  const stillRunning =
    stillRunningParam !== null
      ? stillRunningParam === "true"
      : adLaunch !== "all" || hideInactive;
  const activeStatus =
    searchParams.get("activeStatus") || (hideInactive || stillRunning ? "active" : "all");
  const smartPreset = searchParams.get("smartPreset") || searchParams.get("preset") || "all";
  const discovery = searchParams.get("discovery") || "all";
  const discoveryFrom = searchParams.get("discoveryFrom");
  const discoveryTo = searchParams.get("discoveryTo");
  const sortBy = searchParams.get("sortBy") || "latest";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const includeDetails = Boolean(id);
  const groupCarouselsParam = searchParams.get("groupCarousels");
  const groupCarousels =
    groupCarouselsParam !== null ? groupCarouselsParam === "true" : true;

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
  const offset = (page - 1) * limit;
  const isLean = searchParams.get("lean") === "true" || limit > 50;
  // BUG-22: Guard rawLimit when includeDetails is true
  const rawLimit =
    groupCarousels && !includeDetails ? Math.min(100, Math.max(limit, limit * 2)) : limit;

  const userTz = resolveTimezone({
    clientTz,
    countryCode,
  });

  const forceRefresh =
    searchParams.get("_t") !== null || searchParams.get("refresh") === "true";
  const cacheKey = buildCanonicalProductCacheKey(searchParams, workspaceId, role);

  if (!forceRefresh && !includeDetails) {
    const cached = await getCached<ProductsQueryResult>(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  const conditions: any[] = [
    sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`,
  ];

  // Filter by specific product ID if requested (for deep-linking & direct sharing)
  if (id && id.trim() !== "") {
    const trimmedId = id.trim();
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      trimmedId
    );
    if (isUuid) {
      conditions.push(eq(scrapedProducts.id, trimmedId));
    } else {
      conditions.push(eq(scrapedProducts.url, trimmedId));
    }
  } else {
    conditions.push(eq(scrapedProducts.workspaceId, workspaceId));
  }

  // Filter by Active / Inactive (Off-Air) Ads status
  const requireActiveAds = activeStatus === "active" || hideInactive || stillRunning;
  if (activeStatus === "discovered") {
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

  // BUG-21: Preserve Niche Taxonomy helpers exactly
  const categoryParams = [
    ...searchParams.getAll("category"),
    ...searchParams.getAll("niche"),
  ].filter((p) => Boolean(p) && p !== "all");

  if (categoryParams.length > 0) {
    const rawCategories = Array.from(new Set(categoryParams.flatMap((p) => parseNicheParam(p))));
    const mappedCategories = Array.from(
      new Set(rawCategories.flatMap((raw) => resolveNicheDbCategories(raw)))
    );

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

  // Filter by sub-category / sub-niche (BUG-21)
  const subCategoryParams = [
    ...searchParams.getAll("subCategory"),
    ...searchParams.getAll("subNiche"),
  ].filter((p) => Boolean(p) && p !== "all");

  if (subCategoryParams.length > 0) {
    const rawSubCategories = Array.from(
      new Set(subCategoryParams.flatMap((p) => parseSubNicheParam(p)))
    );
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
      or(ilike(scrapedProducts.domain, brandTerm), eq(scrapedProducts.pageId, brand.trim()))
    );
  }

  // Filter by e-commerce platform
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

  // Discovery Date Filters
  if (discovery === "today") {
    conditions.push(sql`${scrapedProducts.createdAt} >= ${getStartOfTodaySql(userTz)}`);
  } else if (discovery === "yesterday") {
    conditions.push(
      sql`${scrapedProducts.createdAt} >= ${getStartOfYesterdaySql(userTz)} AND ${scrapedProducts.createdAt} < ${getStartOfTodaySql(userTz)}`
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
    conditions.push(sql`${scrapedProducts.createdAt} >= ${getStartOfMonthSql(userTz)}`);
  } else if (discovery === "custom" || (!discovery && (discoveryFrom || discoveryTo))) {
    if (discoveryFrom && /^\d{4}-\d{2}-\d{2}$/.test(discoveryFrom.trim())) {
      conditions.push(sql`${scrapedProducts.createdAt} >= ${discoveryFrom.trim() + " 00:00:00"}::timestamptz`);
    }
    if (discoveryTo && /^\d{4}-\d{2}-\d{2}$/.test(discoveryTo.trim())) {
      conditions.push(sql`${scrapedProducts.createdAt} < (${discoveryTo.trim() + " 00:00:00"}::timestamptz + INTERVAL '1 day')`);
    }
  }

  // Ad Launch Date Filters
  const stillRunningClause = stillRunning
    ? sql` AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)`
    : sql``;

  if (adLaunch === "7d" || adLaunch === "last_7d") {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${ads}
        WHERE ${ads.productId} = ${scrapedProducts.id}
        AND COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) <= NOW() - INTERVAL '7 days'
        ${stillRunningClause}
      )`
    );
  } else if (
    adLaunch === "15d" ||
    adLaunch === "14d" ||
    adLaunch === "last_15d" ||
    adLaunch === "last_14d"
  ) {
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
  } else if (
    adLaunch === "30d" ||
    adLaunch === "last_30d" ||
    adLaunch === "month" ||
    adLaunch === "1m"
  ) {
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

  // Breakout Scalers Preset
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

  // Most Scaled Preset
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

  // Evergreen Preset
  if (smartPreset === "top_lasting") {
    conditions.push(
      sql`(${scrapedProducts.createdAt} <= NOW() - INTERVAL '30 days' OR EXISTS (
        SELECT 1 FROM ${ads}
        WHERE ${ads.productId} = ${scrapedProducts.id}
        AND COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) <= NOW() - INTERVAL '30 days'
      ))`
    );
  }

  // Search filter
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
  } else if (
    sortBy === "launched_asc" ||
    sortBy === "oldest_launched" ||
    sortBy === "top_lasting" ||
    sortBy === "longevity" ||
    sortBy === "longest_running"
  ) {
    orderByClauses.push(
      sql`(SELECT MIN(COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt})) FROM ${ads} WHERE ${ads.productId} = ${scrapedProducts.id}) ASC NULLS LAST`
    );
  } else if (sortBy === "most_scaled" || sortBy === "ads") {
    orderByClauses.push(
      sql`(SELECT COUNT(${ads.id}) FROM ${ads} WHERE ${ads.productId} = ${scrapedProducts.id} AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)) DESC`
    );
  } else {
    orderByClauses.push(
      sortOrder === "asc" ? asc(scrapedProducts.createdAt) : desc(scrapedProducts.createdAt)
    );
  }
  orderByClauses.push(desc(scrapedProducts.id));

  const productSelection = buildProductProjections(includeDetails, favColumn);

  const [rawProducts, totalCountResult] = await Promise.all([
    db
      .select(productSelection)
      .from(scrapedProducts)
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(rawLimit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(scrapedProducts)
      .where(whereClause),
  ]);

  const productIds = rawProducts.map((p) => p.id);
  const metricsMap = new Map<string, any>();
  const pageIdsFromProducts = Array.from(
    new Set(rawProducts.map((p) => p.pageId).filter((pid): pid is string => Boolean(pid && pid.trim())))
  );
  const pageMap = new Map<string, any>();
  const obsMetricsMap = new Map<string, { maxDuplications: number; maxSurge: number }>();
  const asyncLookups: Promise<any>[] = [];

  // BUG-01: Isolate & strictly guard correlated subqueries
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
          console.warn("[Products Query Service] Ad metrics batch lookup warning:", metricsErr);
        })
    );

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
          console.warn("[Products Query Service] Ad observations batch lookup warning:", obsErr);
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
          console.warn("[Products Query Service] Tracked pages batch lookup warning:", pageErr);
        })
    );
  }

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
        .where(
          and(inArray(brandDomains.domain, domainsFromProducts), isNotNull(brandDomains.profilePicUrl))
        )
        .then((rows) => {
          rows.forEach((row) => {
            if (row.domain && row.profilePicUrl) domainPicMap.set(row.domain, row.profilePicUrl);
          });
        })
        .catch((domainErr) => {
          console.warn("[Products Query Service] Brand domains batch lookup warning:", domainErr);
        })
    );
  }

  if (asyncLookups.length > 0) {
    await Promise.all(asyncLookups);
  }

  const products = rawProducts.map((p) => {
    const m = metricsMap.get(p.id);
    const pageInfo = p.pageId ? pageMap.get(p.pageId) : null;
    const earliest = m?.earliestAdDate || p.createdAt;
    const brandHoldStatus = (m?.brandHoldStatus || pageInfo?.holdStatus || "active") as any;
    const isProductActive = (m?.activeAdsCount || 0) > 0 && brandHoldStatus !== "inactive";
    const endTimestamp =
      isProductActive || !m?.latestAdDate ? Date.now() : new Date(m.latestAdDate).getTime();
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
    const brandCurrentResults =
      typeof m?.brandCurrentResults === "number"
        ? m.brandCurrentResults
        : typeof pageInfo?.currentResults === "number"
        ? pageInfo.currentResults
        : null;

    const obs = obsMetricsMap.get(p.id);
    const maxDuplications = Math.max(obs?.maxDuplications || 1, 1);
    const recentNewAds = m?.recentAdsCount || 0;
    const duplicationSurge = obs?.maxSurge || 0;
    const effectiveSurge = Math.max(recentNewAds, duplicationSurge);

    const isBreakout = Boolean(
      brandHoldStatus !== "on_hold" &&
        brandHoldStatus !== "inactive" &&
        (m?.activeAdsCount || 0) > 0 &&
        daysRunning >= 7 &&
        daysRunning <= 30 &&
        (effectiveSurge >= 3 || (maxDuplications >= 3 && recentNewAds >= 2))
    );

    let breakoutScore: number | undefined;
    let breakoutTier: "hard" | "standard" | "soft" | null = null;

    if (isBreakout) {
      let scaleScore = 15;
      if (maxDuplications >= 16) scaleScore = 40;
      else if (maxDuplications >= 9) scaleScore = 35;
      else if (maxDuplications >= 5) scaleScore = 28;
      else if (maxDuplications >= 3) scaleScore = 20;

      let surgeScore = 15;
      if (effectiveSurge >= 8) surgeScore = 35;
      else if (effectiveSurge >= 5) surgeScore = 25;
      else if (effectiveSurge >= 3) surgeScore = 20;

      let longevityScore = 10;
      if (daysRunning >= 11 && daysRunning <= 18) longevityScore = 15;
      else if (daysRunning >= 7 && daysRunning <= 10) longevityScore = 12;

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
      isCarouselBundle: false as boolean,
      carouselBundleCount: 1 as number,
      carouselItems: null as CarouselItemSummary[] | null,
    };
  });

  // In-memory sort fallback for ad-metrics specific sorts
  if (sortBy === "breakout") {
    products.sort((a, b) => {
      if (a.isBreakout !== b.isBreakout) return a.isBreakout ? -1 : 1;
      if (a.isBreakout && b.isBreakout) {
        return (b.breakoutScore || 0) - (a.breakoutScore || 0);
      }
      return (
        (b.maxDuplications || 1) - (a.maxDuplications || 1) ||
        (b.activeAdsCount || 0) - (a.activeAdsCount || 0)
      );
    });
  } else if (sortBy === "most_scaled" || sortBy === "ads") {
    products.sort(
      (a, b) =>
        (b.activeAdsCount || 0) - (a.activeAdsCount || 0) ||
        (b.maxDuplications || 1) - (a.maxDuplications || 1)
    );
  } else if (sortBy === "top_lasting" || sortBy === "longevity") {
    products.sort((a, b) => (b.daysRunning || 1) - (a.daysRunning || 1));
  }

  // BUG-02 & BUG-22: Group carousels with strict skip guard
  const finalProducts = groupCarousels
    ? groupProductsIntoCarousels(products, limit, includeDetails)
    : products.slice(0, limit);

  const total = totalCountResult[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);

  const responsePayload: ProductsQueryResult = {
    success: true,
    products: finalProducts,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
    groupedCarouselsCount: finalProducts.filter((p) => p.isCarouselBundle).length,
    totalItemsRepresented: finalProducts.reduce(
      (acc, p) => acc + (p.carouselBundleCount || 1),
      0
    ),
  };

  if (!forceRefresh && !includeDetails) {
    await setCached(cacheKey, responsePayload, PRODUCTS_REDIS_CACHE_TTL).catch(() => {});
  }

  return responsePayload;
}

