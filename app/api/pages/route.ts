import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, scanHistory, queue, ads, scrapedProducts, brandDomains } from "@/db/schema";
import { addSingleUrl } from "@/actions/add-url";
import { singleUrlSchema } from "@/lib/validators";
import { eq, ne, ilike, or, and, sql, desc, asc, inArray, gte, lte, isNotNull, isNull, count } from "drizzle-orm";
import { classifyScalingPattern } from "@/lib/scaling-classifier";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { validateAdminRole, validateApiSecret } from "@/lib/api-guard";
import { getCached, setCached, deleteByPrefix, deleteCached } from "@/lib/cache-service";

const PAGES_CACHE_TTL_SECONDS = 30; // 30 seconds global cache

export async function GET(request: Request) {
  const authError = await validateAdminRole(request);
  if (authError) return authError;

  try {
    const urlObj = new URL(request.url);
    const searchParams = urlObj.searchParams;

    const search = searchParams.get("search")?.trim();
    const statusFilter = searchParams.get("status")?.trim();
    const searchTypeFilter = searchParams.get("searchType")?.trim();
    const tab = searchParams.get("tab")?.trim() || "all";
    const sortBy = searchParams.get("sortBy")?.trim() || "createdAt";
    const sortOrder = searchParams.get("sortOrder")?.toLowerCase() === "asc" ? "asc" : "desc";
    const range = searchParams.get("range") ?? "7d";
    const rangeDays = ({ today: 1, "7d": 7, "15d": 15, "30d": 30 } as Record<string, number>)[range] ?? 7;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - rangeDays);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(5000, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const isLean = searchParams.get("lean") === "true" || limit > 100;
    const offset = (page - 1) * limit;

    // Resolve active workspace
    const activeWorkspace = await getActiveWorkspace(request);

    // Hybrid Cache Check (L1 Memory + L2 Upstash Redis) to eliminate duplicate DB waterfalls
    const forceRefresh = searchParams.get("_t") !== null || searchParams.get("refresh") === "true";
    const cleanParams = new URLSearchParams(searchParams);
    cleanParams.delete("_t");
    cleanParams.delete("refresh");
    const cacheKey = `cache:pages:${activeWorkspace.id}:${cleanParams.toString()}`;

    if (!forceRefresh) {
      const cached = await getCached<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL, Vary: PRIVATE_AUTH_VARY },
        });
      }
    }

    // Build base conditions array (workspace + search + filters, before tab scoping)
    const baseConditions: any[] = [
      eq(trackedPages.workspaceId, activeWorkspace.id),
    ];

    if (search) {
      const term = search.trim();
      const isNumericId = /^\d{4,25}$/.test(term);

      if (isNumericId) {
        // Fast-path: exact pageId (uses B-Tree index instantly) or display name match
        baseConditions.push(
          or(
            eq(trackedPages.pageId, term),
            ilike(trackedPages.displayName, `%${term}%`)
          )
        );
      } else {
        // Clean domain in case user pasted a URL or domain query (e.g. "https://brand.com/" -> "brand.com")
        const cleanDomain = term
          .replace(/^https?:\/\//i, "")
          .replace(/^www\./i, "")
          .replace(/\/.*$/, "")
          .toLowerCase();

        const searchClauses: any[] = [
          ilike(trackedPages.displayName, `%${term}%`),
          ilike(trackedPages.url, `%${term}%`),
        ];

        if (cleanDomain && cleanDomain.length > 2) {
          searchClauses.push(
            ilike(trackedPages.canonicalDomain, `%${cleanDomain}%`),
            ilike(trackedPages.landingPage, `%${cleanDomain}%`)
          );
        }

        if (/\d+/.test(term)) {
          searchClauses.push(ilike(trackedPages.pageId, `%${term}%`));
        }

        baseConditions.push(or(...searchClauses));
      }
    }

    const VALID_STATUSES = ["success", "pending", "scanning", "failed", "unclear"];
    if (statusFilter && statusFilter !== "all" && VALID_STATUSES.includes(statusFilter)) {
      baseConditions.push(eq(trackedPages.status, statusFilter));
    }

    const VALID_SEARCH_TYPES = ["page", "keyword_exact_phrase", "keyword_unordered"];
    if (searchTypeFilter && searchTypeFilter !== "all" && VALID_SEARCH_TYPES.includes(searchTypeFilter)) {
      baseConditions.push(eq(trackedPages.searchType, searchTypeFilter));
    }

    // Tag filtering (supports single tag or comma-separated list e.g. tag=scaling or tag=scaling,breakout)
    const tagFilter = searchParams.get("tag")?.trim()?.toLowerCase();
    if (tagFilter && tagFilter !== "all") {
      const tagList = tagFilter.split(",").map((t) => t.trim()).filter(Boolean);
      if (tagList.length === 1) {
        baseConditions.push(sql`${tagList[0]} = ANY(${trackedPages.tags})`);
      } else if (tagList.length > 1) {
        baseConditions.push(sql`${trackedPages.tags} && ARRAY[${sql.join(tagList.map((t) => sql`${t}`), sql`, `)}]::text[]`);
      }
    }

    // Compute cross-tab counts in a single fast SQL pass when searching
    let searchTabCounts: {
      all: number;
      active: number;
      watchlist: number;
      high_volume: number;
      attention: number;
    } | null = null;

    if (search) {
      const tabCountsResult = await db
        .select({
          all: sql<number>`count(*)`,
          active: sql<number>`count(*) FILTER (WHERE ${trackedPages.currentResults} >= 1)`,
          watchlist: sql<number>`count(*) FILTER (WHERE ${trackedPages.isWatchlisted} = true)`,
          high_volume: sql<number>`count(*) FILTER (WHERE ${trackedPages.currentResults} >= 50)`,
          attention: sql<number>`count(*) FILTER (WHERE ${trackedPages.currentResults} = 0 OR ${trackedPages.status} IN ('unclear', 'failed'))`,
        })
        .from(trackedPages)
        .where(and(...baseConditions));

      if (tabCountsResult[0]) {
        searchTabCounts = {
          all: Number(tabCountsResult[0].all || 0),
          active: Number(tabCountsResult[0].active || 0),
          watchlist: Number(tabCountsResult[0].watchlist || 0),
          high_volume: Number(tabCountsResult[0].high_volume || 0),
          attention: Number(tabCountsResult[0].attention || 0),
        };
      }
    }

    // Smart Tabs Filters applied on top of base conditions
    const conditions = [...baseConditions];
    if (tab === "active") {
      conditions.push(gte(trackedPages.currentResults, 1));
    } else if (tab === "watchlist") {
      conditions.push(eq(trackedPages.isWatchlisted, true));
    } else if (tab === "high_volume") {
      conditions.push(gte(trackedPages.currentResults, 50));
    } else if (tab === "attention") {
      conditions.push(or(eq(trackedPages.currentResults, 0), inArray(trackedPages.status, ["unclear", "failed"])));
    } else if (tab === "zero_ads") {
      conditions.push(and(eq(trackedPages.currentResults, 0), ne(trackedPages.holdStatus, "on_hold")));
    } else if (tab === "on_hold") {
      conditions.push(eq(trackedPages.holdStatus, "on_hold"));
    } else if (tab === "needs_review") {
      conditions.push(inArray(trackedPages.status, ["unclear", "failed"]));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort column
    const sortColumns: Record<string, any> = {
      displayName: trackedPages.displayName,
      currentResults: trackedPages.currentResults,
      lastChecked: trackedPages.lastChecked,
      lastCreativeScan: trackedPages.lastCreativeScan,
      status: trackedPages.status,
      createdAt: trackedPages.createdAt,
    };

    let orderClauses: any[] = [];
    if (sortBy === "difference") {
      const differenceSql = sql`(
        SELECT s.difference
        FROM scan_history s
        WHERE s.tracked_page_id = "trackedPages".id
        ORDER BY s.checked_at DESC
        LIMIT 1
      )`;
      orderClauses.push(
        sortOrder === "asc"
          ? sql`${differenceSql} ASC NULLS LAST`
          : sql`${differenceSql} DESC NULLS LAST`
      );
      orderClauses.push(desc(trackedPages.createdAt));
      orderClauses.push(desc(trackedPages.id));
    } else {
      const targetSortCol = sortColumns[sortBy] || trackedPages.createdAt;
      orderClauses.push(sortOrder === "asc" ? asc(targetSortCol) : desc(targetSortCol));
      if (sortBy !== "createdAt") {
        orderClauses.push(desc(trackedPages.createdAt));
      }
      orderClauses.push(desc(trackedPages.id));
    }

    // Total count calculation (derived directly from searchTabCounts when available, skipping extra query)
    let totalCount = 0;
    if (searchTabCounts) {
      if (tab === "all") totalCount = searchTabCounts.all;
      else if (tab === "active") totalCount = searchTabCounts.active;
      else if (tab === "watchlist") totalCount = searchTabCounts.watchlist;
      else if (tab === "high_volume") totalCount = searchTabCounts.high_volume;
      else if (tab === "attention") totalCount = searchTabCounts.attention;
      else {
        let countQuery = db.select({ count: sql<number>`count(*)` }).from(trackedPages);
        if (whereClause) {
          countQuery = countQuery.where(whereClause) as typeof countQuery;
        }
        const countResult = await countQuery;
        totalCount = Number(countResult[0]?.count ?? 0);
      }
    } else {
      let countQuery = db.select({ count: sql<number>`count(*)` }).from(trackedPages);
      if (whereClause) {
        countQuery = countQuery.where(whereClause) as typeof countQuery;
      }
      const countResult = await countQuery;
      totalCount = Number(countResult[0]?.count ?? 0);
    }
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const effectivePage = page > totalPages ? 1 : page;
    const effectiveOffset = (effectivePage - 1) * limit;

    // Fetch pages (skip execution if totalCount is 0) with explicit projection
    const pages =
      totalCount > 0
        ? await db.query.trackedPages.findMany({
            columns: {
              id: true,
              url: true,
              displayName: true,
              searchType: true,
              pageId: true,
              currentResults: true,
              lastChecked: true,
              lastSuccessAt: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              notes: true,
              tags: true,
              lastCreativeScan: true,
              isWatchlisted: true,
              discoveredPagesCount: true,
              holdStatus: true,
              lastKnownValidResults: true,
              holdStartedAt: true,
              consecutiveZeroScans: true,
              autoCreativeScan: true,
              brandDomainId: true,
              pageRole: true,
              canonicalDomain: true,
              landingPage: true,
              country: true,
              workspaceId: true,
            },
            ...(whereClause ? { where: whereClause } : {}),
            orderBy: orderClauses,
            limit,
            offset: effectiveOffset,
          })
        : [];

    // Fetch previous scan results & recent history points for these pages
    const pageIds = pages.map((p) => p.id);
    const pageIdValues = pages.map((p) => p.pageId).filter(Boolean) as string[];
    const domainIds = Array.from(new Set(pages.map((p) => p.brandDomainId).filter(Boolean))) as string[];

    let prevResultsMap: Record<string, number | null> = {};
    let historyPointsMap: Record<string, number[]> = {};
    let windowDeltaMap: Record<string, number> = {};
    let recentScans: Array<{ trackedPageId: string; results: number | null; rank: number }> = [];
    let queueMap: Record<string, { failureReason?: string | null; attempts?: number }> = {};
    let activeCreativeJobMap: Record<string, boolean> = {};
    let approxProductCountMap: Record<string, number> = {};
    let extractedAdCountMap: Record<string, number> = {};
    let domainMap: Record<
      string,
      {
        id: string;
        domain: string;
        displayName: string;
        category?: string | null;
        storePlatform?: string | null;
        linkedPagesCount: number;
        totalCombinedAds: number;
      }
    > = {};

    if (!isLean && pageIds.length > 0) {
      // 1. Build subqueries for concurrent Promise.all execution
      const rankedScansSubquery = db
        .select({
          trackedPageId: scanHistory.trackedPageId,
          results: scanHistory.results,
          rank: sql<number>`row_number() over (partition by ${scanHistory.trackedPageId} order by ${scanHistory.checkedAt} desc)`.as("rank"),
        })
        .from(scanHistory)
        .where(
          and(
            inArray(scanHistory.trackedPageId, pageIds),
            gte(scanHistory.checkedAt, sql`NOW() - INTERVAL '30 days'`),
            isNotNull(scanHistory.results)
          )
        )
        .as("ranked_scans");

      const recentScansPromise = db
        .select({
          trackedPageId: rankedScansSubquery.trackedPageId,
          results: rankedScansSubquery.results,
          rank: rankedScansSubquery.rank,
        })
        .from(rankedScansSubquery)
        .where(lte(rankedScansSubquery.rank, 8));

      const windowScansPromise = db
        .select({
          trackedPageId: scanHistory.trackedPageId,
          results: scanHistory.results,
        })
        .from(scanHistory)
        .where(
          and(
            inArray(scanHistory.trackedPageId, pageIds),
            gte(scanHistory.checkedAt, windowStart),
            isNotNull(scanHistory.results)
          )
        )
        .orderBy(asc(scanHistory.checkedAt));

      const queueEntriesPromise = db
        .select({
          trackedPageId: queue.trackedPageId,
          failureReason: queue.failureReason,
          attempts: queue.attempts,
          jobType: queue.jobType,
          status: queue.status,
        })
        .from(queue)
        .where(inArray(queue.trackedPageId, pageIds))
        .orderBy(desc(queue.createdAt));

      const adCountsPromise = pageIdValues.length > 0
        ? db
            .select({
              pageId: ads.pageId,
              activeCount: count(ads.id),
            })
            .from(ads)
            .where(and(inArray(ads.pageId, pageIdValues), eq(ads.isArchived, false)))
            .groupBy(ads.pageId)
        : Promise.resolve([]);

      const productCountsPromise = pageIdValues.length > 0
        ? db
            .select({
              pageId: scrapedProducts.pageId,
              productCount: count(scrapedProducts.id),
            })
            .from(scrapedProducts)
            .where(inArray(scrapedProducts.pageId, pageIdValues))
            .groupBy(scrapedProducts.pageId)
        : Promise.resolve([]);

      const domainPortfolioPromise = domainIds.length > 0
        ? Promise.all([
            db
              .select({
                id: brandDomains.id,
                domain: brandDomains.domain,
                displayName: brandDomains.displayName,
                category: brandDomains.category,
                storePlatform: brandDomains.storePlatform,
              })
              .from(brandDomains)
              .where(inArray(brandDomains.id, domainIds)),
            db
              .select({
                brandDomainId: trackedPages.brandDomainId,
                count: sql<number>`count(*)`,
                totalAds: sql<number>`coalesce(sum(${trackedPages.currentResults}), 0)`,
              })
              .from(trackedPages)
              .where(inArray(trackedPages.brandDomainId, domainIds))
              .groupBy(trackedPages.brandDomainId),
          ]).catch((err) => {
            console.warn("[Pages API] Error hydrating brand domains:", err);
            return [[], []] as [any[], any[]];
          })
        : Promise.resolve([[], []] as [any[], any[]]);

      // 2. Execute all enrichment subqueries concurrently in a single database roundtrip
      const [
        fetchedRecentScans,
        fetchedWindowScans,
        fetchedQueueEntries,
        fetchedAdCounts,
        fetchedProductCounts,
        [fetchedDomains, fetchedSisterPageRows]
      ] = await Promise.all([
        recentScansPromise,
        windowScansPromise,
        queueEntriesPromise,
        adCountsPromise,
        productCountsPromise,
        domainPortfolioPromise,
      ]);

      // Map queue entries (first encountered per page is latest due to desc(createdAt))
      for (const q of fetchedQueueEntries) {
        if (!q.trackedPageId) continue;
        if (!queueMap[q.trackedPageId]) {
          queueMap[q.trackedPageId] = {
            failureReason: q.failureReason,
            attempts: q.attempts ?? 0,
          };
        }
        if (q.jobType === "creative" && (q.status === "pending" || q.status === "running")) {
          activeCreativeJobMap[q.trackedPageId] = true;
        }
      }

      recentScans = fetchedRecentScans;

      // Map recent scan history for sparklines & previous results
      for (const s of recentScans) {
        if (Number(s.rank) === 2) {
          prevResultsMap[s.trackedPageId] = s.results;
        }
        if (s.results !== null) {
          if (!historyPointsMap[s.trackedPageId]) {
            historyPointsMap[s.trackedPageId] = [];
          }
          historyPointsMap[s.trackedPageId].push(s.results);
        }
      }

      // Reverse to chronological order (oldest -> newest) for sparklines
      for (const pId in historyPointsMap) {
        historyPointsMap[pId].reverse();
      }

      // Sanitize sparklines so temporary 0-glitches don't break visual trends:
      for (const p of pages) {
        if (historyPointsMap[p.id]) {
          historyPointsMap[p.id] = historyPointsMap[p.id].map((v, i, arr) => {
            if (v === 0) {
              const prevNonZero = arr.slice(0, i).reverse().find((x) => x > 0);
              const nextNonZero = arr.slice(i + 1).find((x) => x > 0);
              // Case A: Glitch in the past — flanked by positive counts (e.g. [170, 0, 175])
              if (prevNonZero && nextNonZero) return prevNonZero;
              // Case B: Ongoing hold — trailing zeros while page is on hold
              if (p.holdStatus === "on_hold" && prevNonZero && !nextNonZero) {
                return p.lastKnownValidResults ?? prevNonZero;
              }
            }
            return v;
          });
        }
      }

      // Map window deltas
      const windowResultsMap: Record<string, { first: number; last: number }> = {};
      for (const scan of fetchedWindowScans) {
        if (scan.results === null) continue;
        const result = Number(scan.results);
        if (!windowResultsMap[scan.trackedPageId]) {
          windowResultsMap[scan.trackedPageId] = { first: result, last: result };
        } else {
          windowResultsMap[scan.trackedPageId].last = result;
        }
      }

      for (const [trackedPageId, results] of Object.entries(windowResultsMap)) {
        windowDeltaMap[trackedPageId] = results.last - results.first;
      }



      // Map active ads and product counts per brand
      const brandAdCounts = new Map<string, number>();
      for (const row of fetchedAdCounts) {
        if (row.pageId) {
          brandAdCounts.set(row.pageId, Number(row.activeCount) || 0);
        }
      }

      const brandProductCounts = new Map<string, number>();
      for (const row of fetchedProductCounts) {
        if (row.pageId) {
          brandProductCounts.set(row.pageId, Number(row.productCount) || 0);
        }
      }

      for (const p of pages) {
        if (p.pageId) {
          if (brandProductCounts.has(p.pageId)) {
            approxProductCountMap[p.id] = brandProductCounts.get(p.pageId)!;
          }
          if (brandAdCounts.has(p.pageId)) {
            extractedAdCountMap[p.id] = brandAdCounts.get(p.pageId)!;
          }
        }
      }

      // Map brand domain portfolios
      if (domainIds.length > 0 && fetchedDomains.length > 0) {
        const sisterMap = Object.fromEntries(
          fetchedSisterPageRows.map((r: any) => [
            r.brandDomainId!,
            { count: Number(r.count), totalAds: Number(r.totalAds) },
          ])
        );

        domainMap = Object.fromEntries(
          fetchedDomains.map((d: any) => [
            d.id,
            {
              id: d.id,
              domain: d.domain,
              displayName: d.displayName,
              category: d.category,
              storePlatform: d.storePlatform,
              linkedPagesCount: sisterMap[d.id]?.count || 1,
              totalCombinedAds: sisterMap[d.id]?.totalAds || 0,
            },
          ])
        );
      }
    }

    const pagesWithPrev = pages.map((p) => {
      let prev = prevResultsMap[p.id] ?? null;
      if (p.currentResults && p.currentResults > 0 && prev === 0) {
        const lastNonZero = recentScans
          .filter((s) => s.trackedPageId === p.id && (s.results ?? 0) > 0)
          .sort((a, b) => Number(a.rank) - Number(b.rank))[1]?.results;
        if (lastNonZero !== undefined) {
          prev = lastNonZero;
        }
      }
      const difference =
        p.currentResults !== null && prev !== null ? p.currentResults - prev : null;
      const queueEntry = queueMap[p.id];
      const historyPoints = historyPointsMap[p.id] || (p.currentResults !== null ? [p.currentResults] : []);
      const effectiveResults = p.holdStatus === "on_hold"
        ? (p.lastKnownValidResults ?? p.currentResults)
        : p.currentResults;

      return {
        ...p,
        previousResults: prev,
        difference,
        windowDelta: Object.prototype.hasOwnProperty.call(windowDeltaMap, p.id)
          ? windowDeltaMap[p.id]
          : null,
        failureReason: queueEntry?.failureReason ?? null,
        attempts: queueEntry?.attempts ?? 0,
        notes: p.notes ?? null,
        isWatchlisted: p.isWatchlisted ?? false,
        isCreativeQueued: Boolean(activeCreativeJobMap[p.id]),
        historyPoints,
        scalingPattern: classifyScalingPattern(historyPoints, effectiveResults, null, {
          holdStatus: p.holdStatus,
          lastKnownValidResults: p.lastKnownValidResults,
          consecutiveZeroScans: p.consecutiveZeroScans,
        }),
        extractedAdCount: extractedAdCountMap[p.id] ?? 0,
        approxProductCount: approxProductCountMap[p.id] ?? null,
        holdStatus: p.holdStatus ?? "active",
        lastKnownValidResults: p.lastKnownValidResults ?? null,
        holdStartedAt: p.holdStartedAt ? p.holdStartedAt.toISOString() : null,
        consecutiveZeroScans: p.consecutiveZeroScans ?? 0,
        autoCreativeScan: p.autoCreativeScan ?? true,
        brandDomain: p.brandDomainId && domainMap[p.brandDomainId] ? domainMap[p.brandDomainId] : null,
      };
    });

    const responsePayload = {
      data: pagesWithPrev,
      pagination: {
        page: effectivePage,
        limit,
        total: totalCount,
        totalPages,
      },
      searchTabCounts,
    };

    // Store in Hybrid L1 (Memory) and L2 (Upstash Redis) cache
    await setCached(cacheKey, responsePayload, PAGES_CACHE_TTL_SECONDS);

    return NextResponse.json(responsePayload, {
      headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL, Vary: PRIVATE_AUTH_VARY },
    });
  } catch (error) {
    console.error("Error in GET /api/pages:", error);
    const message = process.env.DATABASE_URL?.includes("[YOUR-PASSWORD]")
      ? "Database password not configured in .env.local (contains [YOUR-PASSWORD])."
      : "Failed to fetch tracked pages";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await validateApiSecret(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const validated = singleUrlSchema.parse(body);
    const allowDuplicate = Boolean(body.allowDuplicate);

    const activeWorkspace = await getActiveWorkspace(request);
    const result = await addSingleUrl(validated.url, allowDuplicate, activeWorkspace.id);

    // Invalidate pages and stats cache on successful page creation
    if (result.success) {
      await deleteByPrefix(`cache:pages:${activeWorkspace.id}:`);
      await deleteCached(`cache:stats:${activeWorkspace.id}`);
    }

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.message,
          isDuplicate: result.isDuplicate,
          page: result.page,
        },
        { status: result.isDuplicate ? 409 : 400 }
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 });
    }
    console.error("Error in POST /api/pages:", error);
    const message =
      process.env.DATABASE_URL?.includes("[YOUR-PASSWORD]")
        ? "Database password not configured in .env.local (contains [YOUR-PASSWORD])."
        : "Failed to add URL. Please check database connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
