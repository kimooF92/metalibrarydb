import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages } from "@/db/schema";
import { eq, ilike, gte, lte, and, sql, desc, asc, or, not, inArray } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

import { syncApifyRuns } from "@/lib/apify-sync";

export async function GET(req: NextRequest) {
  const authError = validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);

    const trackedPageId = searchParams.get("trackedPageId");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const minDaysRunning = parseInt(searchParams.get("minDaysRunning") || "0", 10);
    const minDuplications = parseInt(searchParams.get("minDuplications") || "1", 10);
    const mediaType = searchParams.get("mediaType");
    const status = searchParams.get("status");
    const ctaText = searchParams.get("ctaText");
    const isWatchlisted = searchParams.get("isWatchlisted") === "true";
    const excludePageIdsParam = searchParams.get("excludePageIds");
    const excludePageIds = excludePageIdsParam
      ? excludePageIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const smartPreset = searchParams.get("smartPreset");
    let sortBy = searchParams.get("sortBy") || "started_running_on";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;

    // Asynchronously synchronize completed active Apify runs in background without blocking feed load
    if (page === 1) {
      syncApifyRuns().catch((err) => {
        console.error("[Ad Feed] Apify sync error in background:", err);
      });
    }

    // Build conditions array
    const conditions = [];

    // Apply Smart Presets if designated
    if (smartPreset === "fast_scalers") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      conditions.push(gte(ads.startedRunningOn, sevenDaysAgo));
      conditions.push(gte(adObservations.duplicationCount, 3));
      conditions.push(eq(adObservations.isActive, true));
      if (!searchParams.get("sortBy")) sortBy = "duplication_count";
    } else if (smartPreset === "evergreen") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      conditions.push(lte(ads.startedRunningOn, thirtyDaysAgo));
      conditions.push(gte(adObservations.duplicationCount, 2));
      conditions.push(eq(adObservations.isActive, true));
    } else if (smartPreset === "viral_videos") {
      conditions.push(eq(ads.mediaType, "video"));
      conditions.push(gte(adObservations.duplicationCount, 3));
      conditions.push(eq(adObservations.isActive, true));
      if (!searchParams.get("sortBy")) sortBy = "duplication_count";
    } else if (smartPreset === "watchlist") {
      conditions.push(eq(trackedPages.isWatchlisted, true));
      conditions.push(eq(adObservations.isActive, true));
    } else if (smartPreset === "daily_radar") {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      conditions.push(gte(ads.startedRunningOn, twoDaysAgo));
      conditions.push(eq(adObservations.isActive, true));
    }

    const isUuid = (str: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (trackedPageId) {
      if (isUuid(trackedPageId)) {
        conditions.push(
          or(
            eq(adObservations.trackedPageId, trackedPageId),
            eq(trackedPages.id, trackedPageId),
            eq(ads.pageId, trackedPageId)
          )
        );
      } else {
        conditions.push(
          or(
            eq(trackedPages.pageId, trackedPageId),
            eq(ads.pageId, trackedPageId)
          )
        );
      }
    }

    if (isWatchlisted && smartPreset !== "watchlist") {
      conditions.push(eq(trackedPages.isWatchlisted, true));
    }

    if (excludePageIds.length > 0) {
      const uuidExcludes = excludePageIds.filter((id) => isUuid(id));
      const textExcludes = excludePageIds.filter((id) => !isUuid(id));

      if (textExcludes.length > 0) {
        conditions.push(not(inArray(ads.pageId, textExcludes)));
        conditions.push(
          or(
            sql`${trackedPages.pageId} IS NULL`,
            not(inArray(trackedPages.pageId, textExcludes))
          )
        );
      }

      if (uuidExcludes.length > 0) {
        conditions.push(not(inArray(adObservations.trackedPageId, uuidExcludes)));
        conditions.push(not(inArray(trackedPages.id, uuidExcludes)));
      }
    }

    if (ctaText && ctaText !== "all" && smartPreset !== "ecom_sales") {
      if (ctaText === "ecom_any") {
        conditions.push(
          or(
            ilike(ads.ctaText, "%Shop%"),
            ilike(ads.ctaText, "%Order%"),
            ilike(ads.ctaText, "%Buy%"),
            ilike(ads.ctaText, "%Commander%"),
            ilike(ads.ctaText, "%Acheter%")
          )
        );
      } else {
        conditions.push(ilike(ads.ctaText, `%${ctaText.trim()}%`));
      }
    }

    if (search && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(ads.caption, term),
          ilike(ads.title, term),
          ilike(ads.pageName, term),
          ilike(ads.adArchiveId, term),
          ilike(ads.linkUrl, term)
        )
      );
    }

    if (dateFrom && !smartPreset) {
      const fromDate = new Date(dateFrom);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(ads.startedRunningOn, fromDate));
      }
    }

    if (dateTo && !smartPreset) {
      const toDate = new Date(dateTo);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(ads.startedRunningOn, toDate));
      }
    }

    if (minDaysRunning > 0 && !smartPreset) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - minDaysRunning);
      conditions.push(lte(ads.startedRunningOn, cutoffDate));
    }

    if (minDuplications > 1 && !smartPreset) {
      conditions.push(gte(adObservations.duplicationCount, minDuplications));
    }

    if (mediaType && mediaType !== "all" && smartPreset !== "viral_videos") {
      conditions.push(eq(ads.mediaType, mediaType));
    }

    if (status === "archived") {
      conditions.push(eq(ads.isArchived, true));
    } else if (!smartPreset) {
      // Hide archived ads from main feed states (all, active, inactive)
      conditions.push(or(eq(ads.isArchived, false), sql`${ads.isArchived} IS NULL`));
      if (status === "active") {
        conditions.push(eq(adObservations.isActive, true));
      } else if (status === "inactive") {
        conditions.push(eq(adObservations.isActive, false));
      }
    } else {
      conditions.push(or(eq(ads.isArchived, false), sql`${ads.isArchived} IS NULL`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Build CTE subquery — innerJoin on adObservations so we always have duplication/active metadata.
    // DISTINCT ON (ads.id) keeps the latest observation per ad.
    const subquery = db
      .selectDistinctOn([ads.id], {
        id: ads.id,
        adArchiveId: ads.adArchiveId,
        pageId: ads.pageId,
        pageName: ads.pageName,
        startedRunningOn: ads.startedRunningOn,
        caption: ads.caption,
        title: ads.title,
        ctaText: ads.ctaText,
        linkUrl: ads.linkUrl,
        mediaType: ads.mediaType,
        mediaUrls: ads.mediaUrls,
        thumbnailUrl: ads.thumbnailUrl,
        thumbnailStoragePath: ads.thumbnailStoragePath,
        firstSeenAt: ads.firstSeenAt,
        lastSeenAt: ads.lastSeenAt,
        isArchived: ads.isArchived,
        archivedAt: ads.archivedAt,
        createdAt: ads.createdAt,
        updatedAt: ads.updatedAt,
        duplicationCount: adObservations.duplicationCount,
        isActive: adObservations.isActive,
        trackedPageId: adObservations.trackedPageId,
        pageDisplayName: trackedPages.displayName,
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .leftJoin(trackedPages, eq(adObservations.trackedPageId, trackedPages.id))
      .where(whereClause)
      .orderBy(ads.id, desc(adObservations.observedAt))
      .as("distinct_ads");

    // Outer sorting order
    let outerOrderBy = desc(subquery.startedRunningOn);

    if (sortBy === "oldest") {
      outerOrderBy = asc(subquery.startedRunningOn);
    } else if (sortBy === "duplication_count" || sortBy === "scale" || sortBy === "most_duplicated") {
      outerOrderBy = sortOrder === "asc" ? asc(subquery.duplicationCount) : desc(subquery.duplicationCount);
    } else if (sortBy === "recently_observed" || sortBy === "last_seen_at") {
      outerOrderBy = sortOrder === "asc" ? asc(subquery.lastSeenAt) : desc(subquery.lastSeenAt);
    } else if (sortBy === "first_seen_at") {
      outerOrderBy = sortOrder === "asc" ? asc(subquery.firstSeenAt) : desc(subquery.firstSeenAt);
    } else {
      // Default: newest started_running_on
      outerOrderBy = sortOrder === "asc" ? asc(subquery.startedRunningOn) : desc(subquery.startedRunningOn);
    }

    const rows = await db
      .select()
      .from(subquery)
      .orderBy(outerOrderBy)
      .limit(limit)
      .offset(offset);

    // Count total matching distinct ads
    const [countResult] = await db
      .select({ count: sql<number>`count(distinct ${ads.id})` })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .leftJoin(trackedPages, eq(adObservations.trackedPageId, trackedPages.id))
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    // Synchronous row mapping using stored public/CDN thumbnailUrl
    const items = rows.map((row) => ({
      id: row.id,
      adArchiveId: row.adArchiveId,
      pageId: row.pageId,
      pageName: row.pageName || row.pageDisplayName,
      startedRunningOn: row.startedRunningOn,
      caption: row.caption,
      title: row.title,
      ctaText: row.ctaText,
      linkUrl: row.linkUrl,
      mediaType: row.mediaType,
      mediaUrls: row.mediaUrls,
      thumbnailUrl: row.thumbnailUrl,
      thumbnailStoragePath: row.thumbnailStoragePath,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      duplicationCount: Number(row.duplicationCount || 1),
      isActive: Boolean(row.isActive),
      isArchived: Boolean(row.isArchived),
      archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
      trackedPageId: row.trackedPageId,
      signedThumbnailUrl: row.thumbnailUrl,
    }));

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch ad creatives" },
      { status: 500 }
    );
  }
}
