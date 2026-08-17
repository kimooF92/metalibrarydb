import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, scanHistory, queue } from "@/db/schema";
import { addSingleUrl } from "@/actions/add-url";
import { singleUrlSchema } from "@/lib/validators";
import { eq, ilike, or, and, sql, desc, asc, inArray, gte, lte, isNotNull } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search")?.trim();
    const statusFilter = searchParams.get("status")?.trim();
    const searchTypeFilter = searchParams.get("searchType")?.trim();
    const tab = searchParams.get("tab")?.trim() || "all";
    const sortBy = searchParams.get("sortBy")?.trim() || "createdAt";
    const sortOrder = searchParams.get("sortOrder")?.toLowerCase() === "asc" ? "asc" : "desc";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(5000, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const offset = (page - 1) * limit;

    // Build conditions array
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(trackedPages.displayName, `%${search}%`),
          ilike(trackedPages.pageId, `%${search}%`),
          ilike(trackedPages.url, `%${search}%`)
        )
      );
    }

    if (statusFilter && statusFilter !== "all") {
      conditions.push(eq(trackedPages.status, statusFilter));
    }

    if (searchTypeFilter && searchTypeFilter !== "all") {
      conditions.push(eq(trackedPages.searchType, searchTypeFilter));
    }

    // Smart Tabs Filters
    if (tab === "watchlist") {
      conditions.push(eq(trackedPages.isWatchlisted, true));
    } else if (tab === "high_volume") {
      conditions.push(gte(trackedPages.currentResults, 50));
    } else if (tab === "attention") {
      conditions.push(or(eq(trackedPages.currentResults, 0), inArray(trackedPages.status, ["unclear", "failed"])));
    } else if (tab === "zero_ads") {
      conditions.push(eq(trackedPages.currentResults, 0));
    } else if (tab === "needs_review") {
      conditions.push(inArray(trackedPages.status, ["unclear", "failed"]));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort column
    const sortColumns: Record<string, any> = {
      displayName: trackedPages.displayName,
      currentResults: trackedPages.currentResults,
      lastChecked: trackedPages.lastChecked,
      status: trackedPages.status,
      createdAt: trackedPages.createdAt,
    };

    let orderClause;
    if (sortBy === "difference") {
      const differenceSql = sql`(
        SELECT s.difference
        FROM scan_history s
        WHERE s.tracked_page_id = "trackedPages".id
        ORDER BY s.checked_at DESC
        LIMIT 1
      )`;
      orderClause = sortOrder === "asc"
        ? sql`${differenceSql} ASC NULLS LAST`
        : sql`${differenceSql} DESC NULLS LAST`;
    } else {
      const targetSortCol = sortColumns[sortBy] || trackedPages.createdAt;
      orderClause = sortOrder === "asc" ? asc(targetSortCol) : desc(targetSortCol);
    }

    // Total count query
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(trackedPages);
    if (whereClause) {
      countQuery = countQuery.where(whereClause) as typeof countQuery;
    }
    const countResult = await countQuery;
    const totalCount = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const effectivePage = page > totalPages ? 1 : page;
    const effectiveOffset = (effectivePage - 1) * limit;

    // Fetch pages
    const pages = await db.query.trackedPages.findMany({
      ...(whereClause ? { where: whereClause } : {}),
      orderBy: [orderClause],
      limit,
      offset: effectiveOffset,
    });

    // Fetch previous scan results & recent history points for these pages
    const pageIds = pages.map((p) => p.id);
    let prevResultsMap: Record<string, number | null> = {};
    let historyPointsMap: Record<string, number[]> = {};

    if (pageIds.length > 0) {
      const rankedScans = db
        .select({
          trackedPageId: scanHistory.trackedPageId,
          results: scanHistory.results,
          rank: sql<number>`row_number() over (partition by ${scanHistory.trackedPageId} order by ${scanHistory.checkedAt} desc)`.as("rank"),
        })
        .from(scanHistory)
        .where(and(inArray(scanHistory.trackedPageId, pageIds), isNotNull(scanHistory.results)))
        .as("ranked_scans");

      const recentScans = await db
        .select({
          trackedPageId: rankedScans.trackedPageId,
          results: rankedScans.results,
          rank: rankedScans.rank,
        })
        .from(rankedScans)
        .where(lte(rankedScans.rank, 8));

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
    }

    // Fetch latest queue entry per page for failureReason + attempts
    let queueMap: Record<string, { failureReason?: string | null; attempts?: number }> = {};
    if (pageIds.length > 0) {
      // Apply the visible-page filter inside the window query for the same reason
      // as scan history: do not rank every queue row on each table request.
      const rankedQueue = db
        .select({
          trackedPageId: queue.trackedPageId,
          failureReason: queue.failureReason,
          attempts: queue.attempts,
          rank: sql<number>`row_number() over (partition by ${queue.trackedPageId} order by ${queue.createdAt} desc)`.as("rank"),
        })
        .from(queue)
        .where(inArray(queue.trackedPageId, pageIds))
        .as("ranked_queue");

      const latestQueue = await db
        .select({
          trackedPageId: rankedQueue.trackedPageId,
          failureReason: rankedQueue.failureReason,
          attempts: rankedQueue.attempts,
        })
        .from(rankedQueue)
        .where(eq(rankedQueue.rank, 1));
      queueMap = Object.fromEntries(
        latestQueue.map((q) => [q.trackedPageId, { failureReason: q.failureReason, attempts: q.attempts ?? 0 }])
      );
    }

    // Fetch active creative queue entries
    let activeCreativeJobMap: Record<string, boolean> = {};
    if (pageIds.length > 0) {
      const activeCreativeJobs = await db
        .select({ trackedPageId: queue.trackedPageId })
        .from(queue)
        .where(
          and(
            inArray(queue.trackedPageId, pageIds),
            eq(queue.jobType, "creative"),
            inArray(queue.status, ["pending", "running"])
          )
        );
      activeCreativeJobMap = Object.fromEntries(activeCreativeJobs.map((q) => [q.trackedPageId, true]));
    }

    const pagesWithPrev = pages.map((p) => {
      const prev = prevResultsMap[p.id] ?? null;
      const difference =
        p.currentResults !== null && prev !== null ? p.currentResults - prev : null;
      const queueEntry = queueMap[p.id];
      const historyPoints = historyPointsMap[p.id] || (p.currentResults !== null ? [p.currentResults] : []);

      return {
        ...p,
        previousResults: prev,
        difference,
        failureReason: queueEntry?.failureReason ?? null,
        attempts: queueEntry?.attempts ?? 0,
        notes: p.notes ?? null,
        isWatchlisted: p.isWatchlisted ?? false,
        isCreativeQueued: Boolean(activeCreativeJobMap[p.id]),
        historyPoints,
      };
    });

    return NextResponse.json({
      data: pagesWithPrev,
      pagination: {
        page: effectivePage,
        limit,
        total: totalCount,
        totalPages,
      },
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
  try {
    const body = await request.json();
    const validated = singleUrlSchema.parse(body);
    const allowDuplicate = Boolean(body.allowDuplicate);

    const result = await addSingleUrl(validated.url, allowDuplicate);

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
