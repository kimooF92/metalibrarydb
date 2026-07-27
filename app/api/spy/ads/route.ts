import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages } from "@/db/schema";
import { eq, ilike, gte, lte, and, sql, desc, asc, or } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
      // trackedPageId is the UUID PK of tracked_pages — filter on adObservations.trackedPageId
      conditions.push(eq(adObservations.trackedPageId, trackedPageId));
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

    if (status && status !== "all") {
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
    let outerOrderBy = sortOrder === "asc" ? asc(subquery.startedRunningOn) : desc(subquery.startedRunningOn);
    if (sortBy === "duplication_count") {
      outerOrderBy = sortOrder === "asc" ? asc(subquery.duplicationCount) : desc(subquery.duplicationCount);
    } else if (sortBy === "first_seen_at") {
      outerOrderBy = sortOrder === "asc" ? asc(subquery.firstSeenAt) : desc(subquery.firstSeenAt);
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

    // Optional Supabase client for signing cached thumbnails
    let supabaseClient: any = null;
    if (supabaseUrl && supabaseKey) {
      supabaseClient = createClient(supabaseUrl, supabaseKey);
    }

    // Format final response items with signed URL fallback
    const items = await Promise.all(
      rows.map(async (row) => {
        let signedThumbnailUrl: string | null = null;
        if (row.thumbnailStoragePath && supabaseClient) {
          try {
            const { data } = await supabaseClient.storage
              .from("ad-thumbnails")
              .createSignedUrl(row.thumbnailStoragePath, 3600); // 1 hour expiration
            signedThumbnailUrl = data?.signedUrl || null;
          } catch {
            signedThumbnailUrl = null;
          }
        }

        return {
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
          thumbnailUrl: signedThumbnailUrl || row.thumbnailUrl,
          thumbnailStoragePath: row.thumbnailStoragePath,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          duplicationCount: Number(row.duplicationCount || 1),
          isActive: Boolean(row.isActive),
          trackedPageId: row.trackedPageId,
          signedThumbnailUrl: signedThumbnailUrl || row.thumbnailUrl,
        };
      })
    );

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
