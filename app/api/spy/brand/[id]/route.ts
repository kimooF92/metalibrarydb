import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages, scanHistory, scrapedProducts, brandDomains } from "@/db/schema";
import { eq, desc, asc, and, or, inArray, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { calculateWinnerScore } from "@/lib/winner-score";
import { enrichAdsWithProductClusters } from "@/lib/product-clustering";
import { normalizeProductUrl } from "@/lib/firecrawl";
import { getCleanDomain } from "@/lib/utils";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { getCached, setCached, acquireLock, releaseLock, isLockOwner } from "@/lib/cache-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const isUuid = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const TRACKED_PAGE_COLUMNS = {
  id: true,
  pageId: true,
  displayName: true,
  profilePicUrl: true,
  url: true,
  country: true,
  landingPage: true,
  isWatchlisted: true,
  lastChecked: true,
  lastCreativeScan: true,
  status: true,
  currentResults: true,
  holdStatus: true,
  lastKnownValidResults: true,
  consecutiveZeroScans: true,
  lastSuccessAt: true,
  brandDomainId: true,
  pageRole: true,
  workspaceId: true,
} as const;

const BRAND_DOMAIN_COLUMNS = {
  id: true,
  domain: true,
  displayName: true,
  profilePicUrl: true,
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tStart = performance.now();
  const authError = await validateApiSecret(req);
  if (authError) return authError;
  const tAuthEnd = performance.now();

  let lockToken: string | null = null;
  let lockKey: string | null = null;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Brand ID or Page ID is required" }, { status: 400 });
    }

    const decodedId = decodeURIComponent(id).trim();
    const activeWorkspace = await getActiveWorkspace(req);

    // 1. Locate domain portfolio or tracked page record
    let brandDomain = await db.query.brandDomains.findFirst({
      where: isUuid(decodedId)
        ? or(eq(brandDomains.id, decodedId), eq(brandDomains.domain, decodedId.toLowerCase()))
        : eq(brandDomains.domain, decodedId.toLowerCase()),
      columns: BRAND_DOMAIN_COLUMNS,
    });

    let trackedPage: any = null;
    let pageId: string | null = null;
    let displayName: string = "";
    let sisterPages: any[] = [];

    if (brandDomain) {
      sisterPages = await db.query.trackedPages.findMany({
        where: eq(trackedPages.brandDomainId, brandDomain.id),
        columns: TRACKED_PAGE_COLUMNS,
        orderBy: [
          sql`CASE WHEN ${trackedPages.pageRole} = 'primary' THEN 0 ELSE 1 END`,
          desc(trackedPages.currentResults),
        ],
      });
      const primaryPage = sisterPages.find((p) => p.pageRole === "primary") || sisterPages[0] || null;
      pageId = primaryPage?.pageId || null;
      displayName = brandDomain.displayName || brandDomain.domain;
      trackedPage = primaryPage;
    } else {
      if (isUuid(decodedId)) {
        trackedPage = await db.query.trackedPages.findFirst({
          where: eq(trackedPages.id, decodedId),
          columns: TRACKED_PAGE_COLUMNS,
        });
        if (trackedPage) {
          pageId = trackedPage.pageId;
          displayName = trackedPage.displayName || `Brand ${trackedPage.pageId || decodedId}`;
        }
      }

      if (!trackedPage) {
        // Try finding by pageId, landingPage, displayName, or URL in tracked_pages
        trackedPage = await db.query.trackedPages.findFirst({
          where: or(
            eq(trackedPages.pageId, decodedId),
            sql`lower(${trackedPages.landingPage}) = ${decodedId.toLowerCase()}`,
            sql`lower(trim(${trackedPages.displayName})) = ${decodedId.toLowerCase()}`,
            eq(trackedPages.url, decodedId)
          ),
          columns: TRACKED_PAGE_COLUMNS,
        });
        if (trackedPage) {
          pageId = trackedPage.pageId || decodedId;
          displayName = trackedPage.displayName || `Brand ${trackedPage.pageId || decodedId}`;
        }
      }

      // Check if tracked page has brandDomainId
      if (trackedPage?.brandDomainId) {
        brandDomain = await db.query.brandDomains.findFirst({
          where: eq(brandDomains.id, trackedPage.brandDomainId),
          columns: BRAND_DOMAIN_COLUMNS,
        });
        if (brandDomain) {
          sisterPages = await db.query.trackedPages.findMany({
            where: eq(trackedPages.brandDomainId, brandDomain.id),
            columns: TRACKED_PAGE_COLUMNS,
            orderBy: [
              sql`CASE WHEN ${trackedPages.pageRole} = 'primary' THEN 0 ELSE 1 END`,
              desc(trackedPages.currentResults),
            ],
          });
        }
      }
    }

    // If still not in tracked_pages, look in ads table only if observed in this workspace
    if (!pageId && !brandDomain) {
      const sampleAd = await db.query.ads.findFirst({
        where: or(eq(ads.pageId, decodedId), eq(ads.pageName, decodedId)),
        columns: { id: true, pageId: true, pageName: true },
      });

      if (!sampleAd) {
        return NextResponse.json(
          { error: "Brand not found or has been deleted." },
          { status: 404 }
        );
      }

      // Check if sampleAd is actively observed by a tracked page in this workspace
      const activeObs = await db
        .select({ id: adObservations.id })
        .from(adObservations)
        .innerJoin(trackedPages, eq(adObservations.trackedPageId, trackedPages.id))
        .where(
          and(
            eq(adObservations.adId, sampleAd.id),
            eq(trackedPages.workspaceId, activeWorkspace.id)
          )
        )
        .limit(1);

      if (activeObs.length === 0) {
        return NextResponse.json(
          { error: "Brand not found or has been deleted from this workspace." },
          { status: 404 }
        );
      }

      pageId = sampleAd.pageId;
      displayName = sampleAd.pageName || `Brand ${sampleAd.pageId}`;
    }

    // Canonical brand identity resolution (prevents alias cache fragmentation)
    const canonicalBrandId = (trackedPage?.pageId || brandDomain?.domain || pageId || decodedId).toLowerCase();

    // Validate sister page sub-filter against resolved sister pages
    const rawFilterSisterPageId = req.nextUrl.searchParams.get("sisterPageId")?.trim();
    let filterSisterPageId: string | null = null;
    if (rawFilterSisterPageId) {
      const matchesSister = sisterPages.some((sp) => sp.pageId === rawFilterSisterPageId || sp.id === rawFilterSisterPageId);
      if (matchesSister || rawFilterSisterPageId === pageId) {
        filterSisterPageId = rawFilterSisterPageId;
      }
    }

    // Granular retrieval modes
    const isLean = req.nextUrl.searchParams.get("lean") === "true";
    const isProductsOnly = req.nextUrl.searchParams.get("scope") === "products";
    const modeSuffix = isProductsOnly ? ":products" : isLean ? ":lean" : "";

    // Tenant-safe canonical cache lookup with mode suffix
    const forceRefresh = req.nextUrl.searchParams.get("_t") !== null || req.nextUrl.searchParams.get("refresh") === "true";
    const cacheKey = `cache:brand:${activeWorkspace.id}:${canonicalBrandId}:${filterSisterPageId || "all"}${modeSuffix}`;

    if (!forceRefresh) {
      const cached = await getCached<any>(cacheKey, { l1MaxTtlMs: 300 * 1000 });
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
            Vary: PRIVATE_AUTH_VARY,
            "Server-Timing": `cache_hit;dur=${Math.round(performance.now() - tStart)}`,
          },
        });
      }
    }

    // Acquire distributed lock to prevent thundering herd stampedes on cold misses
    // TTL is 90 seconds (safely exceeding maxDuration = 60s), scoped with filter identity and mode
    lockKey = `lock:brand:${activeWorkspace.id}:${canonicalBrandId}:${filterSisterPageId || "all"}${modeSuffix}`;
    lockToken = await acquireLock(lockKey, 90);

    if (!lockToken) {
      // Follower backoff: check 3 times with progressive backoff (700ms, 900ms, 1200ms = 2.8s) to allow leader to finish
      const backoffMs = [700, 900, 1200];
      let followerWaitMs = 0;
      for (const delay of backoffMs) {
        followerWaitMs += delay;
        await new Promise((r) => setTimeout(r, delay));
        const cachedRetry = await getCached<any>(cacheKey, { l1MaxTtlMs: 300 * 1000 });
        if (cachedRetry) {
          return NextResponse.json(cachedRetry, {
            headers: {
              "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
              Vary: PRIVATE_AUTH_VARY,
              "Server-Timing": `follower_wait;dur=${Math.round(followerWaitMs)}, cache_hit;dur=${Math.round(performance.now() - tStart)}`,
            },
          });
        }
      }
      // If leader timed out or took >2.8s, follower falls back to computing from DB,
      // but will not attempt to overwrite cache unless it holds lock ownership.
    }

    const tLookupEnd = performance.now();

    // 2. Resolve Candidate Ad IDs with Two-Leg Indexed UNION (Guarantees zero ad omission)
    const targetPageIds: string[] = [];
    const targetTrackedPageIds: string[] = [];

    if (filterSisterPageId) {
      targetPageIds.push(filterSisterPageId);
      const matchedSister = sisterPages.find(
        (sp) => sp.pageId === filterSisterPageId || sp.id === filterSisterPageId
      );
      if (matchedSister?.id) targetTrackedPageIds.push(matchedSister.id);
    } else if (brandDomain && sisterPages.length > 0) {
      targetPageIds.push(...(sisterPages.map((p) => p.pageId).filter(Boolean) as string[]));
      targetTrackedPageIds.push(...sisterPages.map((p) => p.id));
    } else {
      if (pageId) targetPageIds.push(pageId);
      if (trackedPage?.id) targetTrackedPageIds.push(trackedPage.id);
    }

    const tAdStart = performance.now();

    // 2. Resolve Candidate Ads via Database-Side UNION Subquery (Zero application memory materialization)
    const subqueryParts = [];
    if (targetPageIds.length > 0) {
      const pageIdParams = targetPageIds.map((p) => sql`${p}`);
      subqueryParts.push(sql`SELECT id FROM ads WHERE page_id IN (${sql.join(pageIdParams, sql`, `)})`);
    }
    if (targetTrackedPageIds.length > 0) {
      const trackedParams = targetTrackedPageIds.map((tp) => sql`${tp}::uuid`);
      subqueryParts.push(sql`SELECT ad_id AS id FROM ad_observations WHERE tracked_page_id IN (${sql.join(trackedParams, sql`, `)})`);
    }

    // Concurrently kick off 30-day historical scan trajectory promise (non-blocking)
    const tHistStart = performance.now();
    let tHistDuration = 0;
    const historyPromise =
      trackedPage && !isProductsOnly
        ? db
            .select({
              id: scanHistory.id,
              results: scanHistory.results,
              difference: scanHistory.difference,
              checkedAt: scanHistory.checkedAt,
              status: scanHistory.status,
            })
            .from(scanHistory)
            .where(
              and(
                eq(scanHistory.trackedPageId, trackedPage.id),
                sql`${scanHistory.checkedAt} >= NOW() - INTERVAL '30 days'`
              )
            )
            .orderBy(asc(scanHistory.checkedAt))
            .limit(60)
            .then((rows) => {
              tHistDuration = Math.round(performance.now() - tHistStart);
              return rows;
            })
        : Promise.resolve([]);

    // Distinct-on ads query restricted to candidate IDs using database-side UNION
    let brandAdsRaw: any[] = [];
    if (subqueryParts.length > 0) {
      const candidateSubquery = sql`(${sql.join(subqueryParts, sql` UNION `)})`;
      brandAdsRaw = await db
        .selectDistinctOn([ads.id], {
          id: ads.id,
          adArchiveId: ads.adArchiveId,
          pageId: ads.pageId,
          pageName: ads.pageName,
          startedRunningOn: ads.startedRunningOn,
          caption: sql<string>`LEFT(${ads.caption}, 1000)`,
          title: ads.title,
          ctaText: ads.ctaText,
          linkUrl: ads.linkUrl,
          productId: ads.productId,
          mediaType: ads.mediaType,
          thumbnailUrl: ads.thumbnailUrl,
          firstSeenAt: ads.firstSeenAt,
          lastSeenAt: ads.lastSeenAt,
          isArchived: ads.isArchived,
          duplicationCount: adObservations.duplicationCount,
          isActive: adObservations.isActive,
          trackedPageId: adObservations.trackedPageId,
        })
        .from(ads)
        .leftJoin(adObservations, eq(ads.id, adObservations.adId))
        .where(sql`${ads.id} IN ${candidateSubquery}`)
        .orderBy(ads.id, desc(adObservations.observedAt));
    }
    const tAdsDuration = Math.round(performance.now() - tAdStart);

    if (brandAdsRaw.length === 0 && !trackedPage) {
      return NextResponse.json({ error: "Brand not found or no ads scanned yet" }, { status: 404 });
    }

    // Fallback displayName from ads if available
    if (!displayName && brandAdsRaw.length > 0) {
      displayName = brandAdsRaw[0].pageName || `Brand ${pageId}`;
    }

    // 3. Fetch linked scraped products & normalized landing page URLs
    const productIds = Array.from(
      new Set(brandAdsRaw.map((a) => a.productId).filter((id): id is string => Boolean(id)))
    );

    // Precompute normalized URLs once for distinct query
    const distinctNormalizedUrls = Array.from(
      new Set(
        brandAdsRaw
          .map((a) => (a.linkUrl ? normalizeProductUrl(a.linkUrl) : null))
          .filter((u): u is string => Boolean(u))
      )
    );

    const productQueryConditions = [];
    if (productIds.length > 0) {
      productQueryConditions.push(inArray(scrapedProducts.id, productIds));
    }
    if (pageId) {
      productQueryConditions.push(eq(scrapedProducts.pageId, pageId));
    }
    // Query products by ID, pageId, or normalized URL (using B-tree index idx_scraped_products_url)
    if (distinctNormalizedUrls.length > 0) {
      productQueryConditions.push(inArray(scrapedProducts.url, distinctNormalizedUrls));
    }

    let linkedProducts: any[] = [];
    if (productQueryConditions.length > 0) {
      if (isLean) {
        // Lean projection: fetch lightweight columns needed for pricing, platform, and counts
        linkedProducts = await db
          .select({
            id: scrapedProducts.id,
            url: scrapedProducts.url,
            domain: scrapedProducts.domain,
            pageId: scrapedProducts.pageId,
            currentPrice: scrapedProducts.currentPrice,
            originalPrice: scrapedProducts.originalPrice,
            currency: scrapedProducts.currency,
            discountOrOffer: scrapedProducts.discountOrOffer,
            metaPixelIds: scrapedProducts.metaPixelIds,
            phoneNumbers: scrapedProducts.phoneNumbers,
            whatsappNumbers: scrapedProducts.whatsappNumbers,
            storePlatform: scrapedProducts.storePlatform,
            scrapeStatus: scrapedProducts.scrapeStatus,
          })
          .from(scrapedProducts)
          .where(or(...productQueryConditions));
      } else {
        // Full projection for product catalog
        linkedProducts = await db
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
            offerCount: sql<number>`COALESCE(json_array_length(${scrapedProducts.allOffers}), 0)`.mapWith(Number),
            supplierCount: sql<number>`COALESCE(array_length(${scrapedProducts.supplierUrls}, 1), 0)`.mapWith(Number),
            metaPixelIds: scrapedProducts.metaPixelIds,
            phoneNumbers: scrapedProducts.phoneNumbers,
            whatsappNumbers: scrapedProducts.whatsappNumbers,
            storePlatform: scrapedProducts.storePlatform,
            deliveryCost: scrapedProducts.deliveryCost,
            category: scrapedProducts.category,
            subCategory: scrapedProducts.subCategory,
            targetAudience: scrapedProducts.targetAudience,
            isFavorite: scrapedProducts.isFavorite,
            scrapeStatus: scrapedProducts.scrapeStatus,
            failureReason: scrapedProducts.failureReason,
            lastScrapedAt: scrapedProducts.lastScrapedAt,
            createdAt: scrapedProducts.createdAt,
            updatedAt: scrapedProducts.updatedAt,
          })
          .from(scrapedProducts)
          .where(or(...productQueryConditions));
      }
    }

    const productMap = new Map<string, any>();
    const productUrlMap = new Map<string, any>();
    linkedProducts.forEach((p) => {
      productMap.set(p.id, p);
      if (p.url) productUrlMap.set(p.url, p);
    });

    // 4. If client requested product catalog only (scope=products), execute fast-path and short-circuit immediately
    if (isProductsOnly) {
      const brandProductsList: any[] = [];
      const scrapedProductUrls = new Set<string>();

      // Inverted index for matching ads
      const adsByProductId = new Map<string, any[]>();
      const adsByNormUrl = new Map<string, any[]>();

      for (const row of brandAdsRaw) {
        const normUrl = row.linkUrl ? normalizeProductUrl(row.linkUrl) : null;
        const winner = calculateWinnerScore({
          startedRunningOn: row.startedRunningOn,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
          duplicationCount: Number(row.duplicationCount || 1),
          isActive: Boolean(row.isActive),
          isArchived: Boolean(row.isArchived),
          mediaType: row.mediaType,
          productCreativeCount: 1,
        });

        const adObj = {
          ...row,
          normUrl,
          winnerScore: winner.winnerScore,
          isActive: Boolean(row.isActive),
          isArchived: Boolean(row.isArchived),
        };

        if (row.productId) {
          let list = adsByProductId.get(row.productId);
          if (!list) {
            list = [];
            adsByProductId.set(row.productId, list);
          }
          list.push(adObj);
        }
        if (normUrl) {
          let list = adsByNormUrl.get(normUrl);
          if (!list) {
            list = [];
            adsByNormUrl.set(normUrl, list);
          }
          list.push(adObj);
        }
      }

      linkedProducts.forEach((p) => {
        if (p.url) scrapedProductUrls.add(p.url);

        const matchedMap = new Map<string, any>();
        (adsByProductId.get(p.id) || []).forEach((ad) => matchedMap.set(ad.id, ad));
        if (p.url) {
          (adsByNormUrl.get(p.url) || []).forEach((ad) => matchedMap.set(ad.id, ad));
        }
        const matchingAds = Array.from(matchedMap.values());

        const linkedAdsCount = matchingAds.length;
        const activeAdsCount = matchingAds.filter((a) => a.isActive && !a.isArchived).length;
        const topThumb = matchingAds.find((a) => a.thumbnailUrl)?.thumbnailUrl || p.mainImageUrl;
        const maxScore = matchingAds.reduce((max, a) => Math.max(max, a.winnerScore || 0), 0);

        brandProductsList.push({
          ...p,
          brandName: trackedPage?.displayName || p.domain || "Brand",
          brandPageId: trackedPage?.pageId || pageId,
          brandProfilePic: trackedPage?.profilePicUrl || brandDomain?.profilePicUrl || null,
          brandHoldStatus: trackedPage?.holdStatus || "active",
          brandCurrentResults: trackedPage?.currentResults ?? null,
          linkedAdsCount,
          activeAdsCount,
          topCreativeThumbnail: topThumb,
          winnerScore: maxScore,
        });
      });

      distinctNormalizedUrls.forEach((normUrl) => {
        if (!scrapedProductUrls.has(normUrl)) {
          const matchingAds = adsByNormUrl.get(normUrl) || [];
          brandProductsList.push({
            id: `unscraped_${Buffer.from(normUrl).toString("base64").slice(0, 16)}`,
            url: normUrl,
            domain: getCleanDomain(normUrl),
            pageId: pageId,
            brandName: trackedPage?.displayName || getCleanDomain(normUrl),
            brandPageId: trackedPage?.pageId || pageId,
            brandProfilePic: trackedPage?.profilePicUrl || brandDomain?.profilePicUrl || null,
            brandHoldStatus: trackedPage?.holdStatus || "active",
            brandCurrentResults: trackedPage?.currentResults ?? null,
            title: matchingAds[0]?.title || "Unscraped Product Landing Page",
            currentPrice: null,
            originalPrice: null,
            currency: null,
            discountOrOffer: null,
            mainImageUrl: matchingAds.find((a) => a.thumbnailUrl)?.thumbnailUrl || null,
            galleryImages: [],
            allOffers: null,
            storePlatform: "other",
            deliveryCost: null,
            phoneNumbers: [],
            whatsappNumbers: [],
            metaPixelIds: [],
            scrapeStatus: "pending",
            failureReason: null,
            lastScrapedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            linkedAdsCount: matchingAds.length,
            activeAdsCount: matchingAds.filter((a) => a.isActive && !a.isArchived).length,
            topCreativeThumbnail: matchingAds.find((a) => a.thumbnailUrl)?.thumbnailUrl || null,
            winnerScore: matchingAds.reduce((max, a) => Math.max(max, a.winnerScore || 0), 0),
          });
        }
      });

      brandProductsList.sort(
        (a, b) => (b.linkedAdsCount || 0) - (a.linkedAdsCount || 0) || (b.activeAdsCount || 0) - (a.activeAdsCount || 0)
      );

      const pendingProductsCount = distinctNormalizedUrls.filter((u) => !productUrlMap.has(u)).length;
      const totalCatalogProductsCount = brandProductsList.length;

      const productsPayload = {
        success: true,
        products: brandProductsList,
        totalCatalogProducts: totalCatalogProductsCount,
        pendingProductsCount,
      };

      if (lockToken && lockKey && (await isLockOwner(lockKey, lockToken))) {
        await setCached(cacheKey, productsPayload, 300, { l1MaxTtlMs: 300 * 1000 });
      }

      return NextResponse.json(productsPayload, {
        headers: {
          "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
          Vary: PRIVATE_AUTH_VARY,
          "Server-Timing": `db_ads;dur=${Math.round(tAdsDuration)}, total;dur=${Math.round(performance.now() - tStart)}`,
        },
      });
    }

    // 4. Cluster analytics across brand ads
    const clusterMap = new Map<string, any>();
    if (brandAdsRaw.length > 0) {
      const enriched = enrichAdsWithProductClusters(
        brandAdsRaw.map((a) => ({
          id: a.id,
          pageId: a.pageId,
          linkUrl: a.linkUrl,
          caption: a.caption,
          title: a.title,
          mediaType: a.mediaType,
        }))
      );
      enriched.forEach((item) => clusterMap.set(item.id, item));
    }

    // 5. Enrich ads with winner score and precomputed normUrl (Single pass)
    const allEnrichedAds = brandAdsRaw.map((row) => {
      const normUrl = row.linkUrl ? normalizeProductUrl(row.linkUrl) : null;
      const cluster = clusterMap.get(row.id) || {
        productKey: `ad:${row.pageId}:${row.id}`,
        productName: row.title || "Product Offer",
        cleanProductUrl: null,
        productCreativeCount: 1,
        productVideoCount: row.mediaType === "video" ? 1 : 0,
        productImageCount: row.mediaType === "image" ? 1 : 0,
        brandProductCount: 1,
        brandTotalCreatives: 1,
        productSharePercent: 100,
        isFlagshipProduct: false,
      };

      const winner = calculateWinnerScore({
        startedRunningOn: row.startedRunningOn,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        duplicationCount: Number(row.duplicationCount || 1),
        isActive: Boolean(row.isActive),
        isArchived: Boolean(row.isArchived),
        mediaType: row.mediaType,
        productCreativeCount: cluster.productCreativeCount,
      });

      return {
        ...row,
        normUrl,
        duplicationCount: Number(row.duplicationCount || 1),
        isActive: Boolean(row.isActive),
        isArchived: Boolean(row.isArchived),
        winnerScore: winner.winnerScore,
        winnerTier: winner.winnerTier,
        isBreakout: winner.isBreakout,
        isEvergreen: winner.isEvergreen,
        daysRunning: winner.daysRunning,
        product: row.productId ? productMap.get(row.productId) || null : null,
        productKey: cluster.productKey,
        productName: cluster.productName,
        cleanProductUrl: cluster.cleanProductUrl,
        productCreativeCount: cluster.productCreativeCount,
        productSharePercent: cluster.productSharePercent,
        isFlagshipProduct: cluster.isFlagshipProduct,
      };
    });

    // Build Inverted Index Maps for O(1) matching with ad deduplication
    type EnrichedAd = (typeof allEnrichedAds)[number];
    const adsByProductId = new Map<string, EnrichedAd[]>();
    const adsByNormUrl = new Map<string, EnrichedAd[]>();

    for (const ad of allEnrichedAds) {
      if (ad.productId) {
        let list = adsByProductId.get(ad.productId);
        if (!list) {
          list = [];
          adsByProductId.set(ad.productId, list);
        }
        list.push(ad);
      }
      if (ad.normUrl) {
        let list = adsByNormUrl.get(ad.normUrl);
        if (!list) {
          list = [];
          adsByNormUrl.set(ad.normUrl, list);
        }
        list.push(ad);
      }
    }

    // 6. Aggregate Summary Metrics
    const totalAdsCaptured = allEnrichedAds.length;
    const activeAds = allEnrichedAds.filter((a) => a.isActive && !a.isArchived);
    const inactiveAds = allEnrichedAds.filter((a) => !a.isActive && !a.isArchived);
    const archivedAds = allEnrichedAds.filter((a) => a.isArchived);

    const activeAdsCount = activeAds.length;
    const inactiveAdsCount = inactiveAds.length;
    const archivedAdsCount = archivedAds.length;

    const totalDuplicationCount = activeAds.reduce((sum, a) => sum + (a.duplicationCount || 1), 0);
    const avgDuplicationsPerAd = activeAdsCount > 0 ? Number((totalDuplicationCount / activeAdsCount).toFixed(1)) : 1;

    const winnerCount = allEnrichedAds.filter((a) => a.winnerScore >= 70).length;
    const breakoutCount = allEnrichedAds.filter((a) => a.isBreakout).length;
    const evergreenCount = allEnrichedAds.filter((a) => a.daysRunning >= 30 && a.isActive).length;

    // Media Distribution
    const mediaCounts: Record<string, number> = { video: 0, image: 0, carousel: 0, other: 0 };
    allEnrichedAds.forEach((a) => {
      const type = (a.mediaType || "other").toLowerCase();
      if (type === "video") mediaCounts.video++;
      else if (type === "image") mediaCounts.image++;
      else if (type === "carousel") mediaCounts.carousel++;
      else mediaCounts.other++;
    });

    const mediaDistribution = {
      video: mediaCounts.video,
      image: mediaCounts.image,
      carousel: mediaCounts.carousel,
      other: mediaCounts.other,
      videoPercent: totalAdsCaptured > 0 ? Math.round((mediaCounts.video / totalAdsCaptured) * 100) : 0,
      imagePercent: totalAdsCaptured > 0 ? Math.round((mediaCounts.image / totalAdsCaptured) * 100) : 0,
      carouselPercent: totalAdsCaptured > 0 ? Math.round((mediaCounts.carousel / totalAdsCaptured) * 100) : 0,
    };

    // Longevity Distribution
    const longevityCounts = {
      fresh: 0, // < 7 days
      scaling: 0, // 7 - 30 days
      evergreen: 0, // 30 - 90 days
      veteran: 0, // 90+ days
    };

    allEnrichedAds.forEach((a) => {
      const days = a.daysRunning;
      if (days < 7) longevityCounts.fresh++;
      else if (days <= 30) longevityCounts.scaling++;
      else if (days <= 90) longevityCounts.evergreen++;
      else longevityCounts.veteran++;
    });

    // CTA Distribution
    const ctaCounts: Record<string, number> = {};
    allEnrichedAds.forEach((a) => {
      const cta = a.ctaText?.trim() || "No CTA";
      ctaCounts[cta] = (ctaCounts[cta] || 0) + 1;
    });

    const ctaDistribution = Object.entries(ctaCounts)
      .map(([cta, count]) => ({
        cta,
        count,
        percent: totalAdsCaptured > 0 ? Math.round((count / totalAdsCaptured) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Product Clustering Summary
    const productGroups = new Map<string, {
      productKey: string;
      productName: string;
      cleanProductUrl: string | null;
      creativeCount: number;
      videoCount: number;
      imageCount: number;
      activeCount: number;
      maxDuplications: number;
      isFlagship: boolean;
      sharePercent: number;
      product: any | null;
    }>();

    allEnrichedAds.forEach((ad) => {
      const key = ad.productKey || `single:${ad.id}`;
      const existing = productGroups.get(key);
      const isVid = ad.mediaType === "video";
      const isImg = ad.mediaType === "image";
      const isAct = ad.isActive && !ad.isArchived;

      if (!existing) {
        productGroups.set(key, {
          productKey: key,
          productName: ad.productName || "Product Offer",
          cleanProductUrl: ad.cleanProductUrl,
          creativeCount: 1,
          videoCount: isVid ? 1 : 0,
          imageCount: isImg ? 1 : 0,
          activeCount: isAct ? 1 : 0,
          maxDuplications: ad.duplicationCount || 1,
          isFlagship: ad.isFlagshipProduct || false,
          sharePercent: 0,
          product: ad.product,
        });
      } else {
        existing.creativeCount++;
        if (isVid) existing.videoCount++;
        if (isImg) existing.imageCount++;
        if (isAct) existing.activeCount++;
        existing.maxDuplications = Math.max(existing.maxDuplications, ad.duplicationCount || 1);
        if (ad.isFlagshipProduct) existing.isFlagship = true;
        if (!existing.product && ad.product) existing.product = ad.product;
      }
    });

    const productClusters = Array.from(productGroups.values())
      .map((p) => ({
        ...p,
        sharePercent: totalAdsCaptured > 0 ? Math.round((p.creativeCount / totalAdsCaptured) * 100) : 100,
      }))
      .sort((a, b) => b.creativeCount - a.creativeCount);

    // Top 3 Winner Creatives Spotlight (preserves adArchiveId for AdCard UI and Meta links)
    const topWinners = [...allEnrichedAds]
      .sort(
        (a, b) =>
          b.winnerScore - a.winnerScore ||
          (b.duplicationCount || 0) - (a.duplicationCount || 0) ||
          new Date(b.startedRunningOn || 0).getTime() - new Date(a.startedRunningOn || 0).getTime() ||
          b.id.localeCompare(a.id)
      )
      .slice(0, 3);

    // 7. Historical Scan Trajectory (retrieved concurrently with ads query)
    const history = await historyPromise;

    // 8. Brand Products Catalog Compilation (O(1) Inverted Index with deduplicated matches)
    const brandProductsList: any[] = [];
    const scrapedProductUrls = new Set<string>();

    if (!isLean) {
      linkedProducts.forEach((p) => {
        if (p.url) scrapedProductUrls.add(p.url);

        // Deduplicate matching ads by ad.id
        const matchedMap = new Map<string, EnrichedAd>();
        (adsByProductId.get(p.id) || []).forEach((ad) => matchedMap.set(ad.id, ad));
        if (p.url) {
          (adsByNormUrl.get(p.url) || []).forEach((ad) => matchedMap.set(ad.id, ad));
        }
        const matchingAds = Array.from(matchedMap.values());

        const linkedAdsCount = matchingAds.length;
        const activeAdsCount = matchingAds.filter((a) => a.isActive && !a.isArchived).length;
        const topThumb = matchingAds.find((a) => a.thumbnailUrl)?.thumbnailUrl || p.mainImageUrl;
        const maxScore = matchingAds.reduce((max, a) => Math.max(max, a.winnerScore || 0), 0);

        brandProductsList.push({
          ...p,
          brandName: trackedPage?.displayName || p.domain || "Brand",
          brandPageId: trackedPage?.pageId || pageId,
          brandHoldStatus: trackedPage?.holdStatus || "active",
          brandCurrentResults: trackedPage?.currentResults ?? null,
          linkedAdsCount,
          activeAdsCount,
          topCreativeThumbnail: topThumb,
          winnerScore: maxScore,
        });
      });

      // Also include detected landing URLs that are pending scrape
      distinctNormalizedUrls.forEach((normUrl) => {
        if (!scrapedProductUrls.has(normUrl)) {
          const matchingAds = adsByNormUrl.get(normUrl) || [];

          brandProductsList.push({
            id: `unscraped_${Buffer.from(normUrl).toString("base64").slice(0, 16)}`,
            url: normUrl,
            domain: getCleanDomain(normUrl),
            pageId: pageId,
            brandName: trackedPage?.displayName || getCleanDomain(normUrl),
            brandPageId: trackedPage?.pageId || pageId,
            brandHoldStatus: trackedPage?.holdStatus || "active",
            brandCurrentResults: trackedPage?.currentResults ?? null,
            title: matchingAds[0]?.title || "Unscraped Product Landing Page",
            currentPrice: null,
            originalPrice: null,
            currency: null,
            discountOrOffer: null,
            mainImageUrl: matchingAds.find((a) => a.thumbnailUrl)?.thumbnailUrl || null,
            galleryImages: [],
            allOffers: null,
            storePlatform: "other",
            deliveryCost: null,
            phoneNumbers: [],
            whatsappNumbers: [],
            metaPixelIds: [],
            scrapeStatus: "pending",
            failureReason: null,
            lastScrapedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            linkedAdsCount: matchingAds.length,
            activeAdsCount: matchingAds.filter((a) => a.isActive && !a.isArchived).length,
            topCreativeThumbnail: matchingAds.find((a) => a.thumbnailUrl)?.thumbnailUrl || null,
            winnerScore: matchingAds.reduce((max, a) => Math.max(max, a.winnerScore || 0), 0),
          });
        }
      });

      // Sort products by linkedAdsCount descending, then activeAdsCount descending
      brandProductsList.sort(
        (a, b) => (b.linkedAdsCount || 0) - (a.linkedAdsCount || 0) || (b.activeAdsCount || 0) - (a.activeAdsCount || 0)
      );
    }

    const pendingProductsCount = distinctNormalizedUrls.filter((u) => !productUrlMap.has(u)).length;
    const totalCatalogProductsCount = isLean
      ? linkedProducts.length + pendingProductsCount
      : brandProductsList.length;

    // 9. Store Tech & Tracking Detectors
    const detectedPlatforms = new Set<string>();
    const detectedPixels = new Set<string>();
    const detectedPhones = new Set<string>();
    const detectedWhatsapp = new Set<string>();

    linkedProducts.forEach((p) => {
      if (p.storePlatform && p.storePlatform !== "other") detectedPlatforms.add(p.storePlatform);
      if (p.metaPixelIds) p.metaPixelIds.forEach((id: string) => detectedPixels.add(id));
      if (p.phoneNumbers) p.phoneNumbers.forEach((ph: string) => detectedPhones.add(ph));
      if (p.whatsappNumbers) p.whatsappNumbers.forEach((w: string) => detectedWhatsapp.add(w));
    });

    // 10. Creative Launch Velocity & Testing Cadence
    const nowMs = Date.now();
    const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;

    let launchedLast7Days = 0;
    let launchedLast30Days = 0;
    let maxDaysRunning = 0;
    let totalDaysRunning = 0;

    allEnrichedAds.forEach((a) => {
      const days = a.daysRunning || 0;
      totalDaysRunning += days;
      if (a.isActive && days > maxDaysRunning) {
        maxDaysRunning = days;
      }
      const startTime = a.startedRunningOn ? new Date(a.startedRunningOn).getTime() : 0;
      if (startTime >= sevenDaysAgoMs || days <= 7) {
        launchedLast7Days++;
      }
      if (startTime >= thirtyDaysAgoMs || days <= 30) {
        launchedLast30Days++;
      }
    });

    const activeRetentionRate = totalAdsCaptured > 0 ? Math.round((activeAdsCount / totalAdsCaptured) * 100) : 0;
    const avgLifespanDays = totalAdsCaptured > 0 ? Math.round(totalDaysRunning / totalAdsCaptured) : 0;

    const launchVelocity = {
      launchedLast7Days,
      launchedLast30Days,
      activeRetentionRate,
      longestRunningDays: maxDaysRunning,
      avgLifespanDays,
      testingIntensity:
        launchedLast7Days >= 10
          ? "High Velocity Testing"
          : launchedLast7Days >= 3
          ? "Active Testing"
          : "Maintenance Mode",
    };

    // 11. Commercial Strategy & Pricing Intelligence
    const validPrices: number[] = [];
    let detectedCurrency: string = "TND";
    let productsWithDiscountCount = 0;
    let hasFreeDelivery = false;

    linkedProducts.forEach((p) => {
      if (p.currency && (!detectedCurrency || detectedCurrency === "TND")) detectedCurrency = p.currency;
      if (p.deliveryCost && p.deliveryCost.toLowerCase().includes("gratuit")) {
        hasFreeDelivery = true;
      }
      if (p.discountOrOffer || (p.originalPrice && p.currentPrice && p.originalPrice !== p.currentPrice)) {
        productsWithDiscountCount++;
      }

      if (p.currentPrice) {
        const cleanStr = p.currentPrice.replace(/[^0-9.,]/g, "").replace(",", ".");
        const val = parseFloat(cleanStr);
        if (!isNaN(val) && val > 0 && val < 50000) {
          validPrices.push(val);
        }
      }
    });

    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;
    const avgPrice = validPrices.length > 0 ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length) : null;

    const commercialStrategy = {
      totalCatalogProducts: totalCatalogProductsCount,
      scrapedProductsCount: linkedProducts.length,
      minPrice,
      maxPrice,
      avgPrice,
      currency: detectedCurrency,
      discountedProductsCount: productsWithDiscountCount,
      hasFreeDelivery,
    };

    const responsePayload = {
      success: true,
      brand: {
        id: trackedPage?.id || null,
        pageId: pageId,
        displayName: displayName,
        profilePicUrl: trackedPage?.profilePicUrl || brandDomain?.profilePicUrl || null,
        url: trackedPage?.url || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${pageId}&search_type=page&media_type=all`,
        country: trackedPage?.country || null,
        landingPage: trackedPage?.landingPage || null,
        isWatchlisted: Boolean(trackedPage?.isWatchlisted),
        lastChecked: trackedPage?.lastChecked || null,
        lastCreativeScan: trackedPage?.lastCreativeScan || null,
        status: trackedPage?.status || "active",
        currentResults: trackedPage?.currentResults ?? totalAdsCaptured,
        isTracked: Boolean(trackedPage),
        holdStatus: trackedPage?.holdStatus || "active",
        lastKnownValidResults: trackedPage?.lastKnownValidResults ?? null,
        consecutiveZeroScans: trackedPage?.consecutiveZeroScans ?? 0,
      },
      summary: {
        totalAdsCaptured,
        activeAdsCount,
        inactiveAdsCount,
        archivedAdsCount,
        totalDuplicationCount,
        avgDuplicationsPerAd,
        winnerCount,
        breakoutCount,
        evergreenCount,
        evergreenRate: totalAdsCaptured > 0 ? Math.round((evergreenCount / totalAdsCaptured) * 100) : 0,
        distinctProductsCount: totalCatalogProductsCount || productClusters.length,
        totalProductsCount: totalCatalogProductsCount,
        pendingProductsCount,
      },
      mediaDistribution,
      longevityDistribution: {
        fresh: longevityCounts.fresh,
        scaling: longevityCounts.scaling,
        evergreen: longevityCounts.evergreen,
        veteran: longevityCounts.veteran,
        freshPercent: totalAdsCaptured > 0 ? Math.round((longevityCounts.fresh / totalAdsCaptured) * 100) : 0,
        scalingPercent: totalAdsCaptured > 0 ? Math.round((longevityCounts.scaling / totalAdsCaptured) * 100) : 0,
        evergreenPercent: totalAdsCaptured > 0 ? Math.round((longevityCounts.evergreen / totalAdsCaptured) * 100) : 0,
        veteranPercent: totalAdsCaptured > 0 ? Math.round((longevityCounts.veteran / totalAdsCaptured) * 100) : 0,
      },
      ctaDistribution,
      launchVelocity,
      commercialStrategy,
      productClusters,
      products: isLean ? [] : brandProductsList,
      topWinners,
      history,
      brandDomain: brandDomain || null,
      sisterPages: sisterPages.map((sp) => ({
        id: sp.id,
        pageId: sp.pageId,
        displayName: sp.displayName,
        pageRole: sp.pageRole,
        currentResults: sp.currentResults,
      })),
      isDomainPortfolio: Boolean(brandDomain && sisterPages.length > 1),
      storeTech: {
        platforms: Array.from(detectedPlatforms),
        pixelIds: Array.from(detectedPixels),
        phoneNumbers: Array.from(detectedPhones),
        whatsappNumbers: Array.from(detectedWhatsapp),
      },
    };

    const tComputeEnd = performance.now();
    let tCacheWrite = 0;

    // Store in Upstash Redis + L1 Memory Cache (TTL: 300s) ONLY if this instance still actively owns the lock in Redis.
    // Prevents expired/superseded calculations from overwriting fresh cache.
    if (lockToken && lockKey && (await isLockOwner(lockKey, lockToken))) {
      const tCwStart = performance.now();
      await setCached(cacheKey, responsePayload, 300, { l1MaxTtlMs: 300 * 1000 });
      tCacheWrite = performance.now() - tCwStart;
    }

    const timingHeaders = [
      `auth;dur=${Math.round(tAuthEnd - tStart)}`,
      `lookup;dur=${Math.round(tLookupEnd - tAuthEnd)}`,
      `db_ads;dur=${Math.round(tAdsDuration)}`,
      `db_history;dur=${Math.round(tHistDuration)}`,
      `compute;dur=${Math.round(tComputeEnd - tAdStart - tAdsDuration)}`,
      `cache_write;dur=${Math.round(tCacheWrite)}`,
      `total;dur=${Math.round(performance.now() - tStart)}`,
    ].join(", ");

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
        Vary: PRIVATE_AUTH_VARY,
        "Server-Timing": timingHeaders,
      },
    });
  } catch (err: any) {
    console.error("[Brand Analytics API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load brand analytics" },
      {
        status: 500,
        headers: {
          "Server-Timing": `error;dur=${Math.round(performance.now() - tStart)}`,
        },
      }
    );
  } finally {
    if (lockToken && lockKey) {
      await releaseLock(lockKey, lockToken).catch(() => {});
    }
  }
}
