import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages } from "@/db/schema";
import { eq, ilike, gte, lte, and, sql, desc, asc, or } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

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
    const sortBy = searchParams.get("sortBy") || "started_running_on";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;

    // Build conditions array
    const conditions = [];

    if (trackedPageId) {
      // trackedPageId can be the UUID PK of tracked_pages or pageId string — filter flexibly
      conditions.push(
        or(
          eq(adObservations.trackedPageId, trackedPageId),
          eq(trackedPages.pageId, trackedPageId),
          eq(ads.pageId, trackedPageId)
        )
      );
    }

    if (search && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(ads.caption, term),
          ilike(ads.title, term),
          ilike(ads.pageName, term),
          ilike(ads.adArchiveId, term)
        )
      );
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(ads.startedRunningOn, fromDate));
      }
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(ads.startedRunningOn, toDate));
      }
    }

    if (minDaysRunning > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - minDaysRunning);
      conditions.push(lte(ads.startedRunningOn, cutoffDate));
    }

    if (minDuplications > 1) {
      conditions.push(gte(adObservations.duplicationCount, minDuplications));
    }

    if (mediaType && mediaType !== "all") {
      conditions.push(eq(ads.mediaType, mediaType));
    }

    if (status === "archived") {
      conditions.push(eq(ads.isArchived, true));
    } else {
      // Hide archived ads from main feed states (all, active, inactive)
      conditions.push(or(eq(ads.isArchived, false), sql`${ads.isArchived} IS NULL`));
      if (status === "active") {
        conditions.push(eq(adObservations.isActive, true));
      } else if (status === "inactive") {
        conditions.push(eq(adObservations.isActive, false));
      }
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
