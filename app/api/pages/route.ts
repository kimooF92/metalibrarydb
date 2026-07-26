import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, scanHistory, queue } from "@/db/schema";
import { addSingleUrl } from "@/actions/add-url";
import { singleUrlSchema } from "@/lib/validators";
import { eq, ilike, or, and, sql, desc, asc, inArray, gte } from "drizzle-orm";

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
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
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

    const targetSortCol = sortColumns[sortBy] || trackedPages.createdAt;
    const orderClause = sortOrder === "asc" ? asc(targetSortCol) : desc(targetSortCol);

    // Subquery for previous results (the scan history result prior to current_results)
    const prevScanSubquery = db
      .select({
        trackedPageId: scanHistory.trackedPageId,
        previousResults: scanHistory.results,
        rn: sql<number>`row_number() over (partition by ${scanHistory.trackedPageId} order by ${scanHistory.checkedAt} desc)`.as("rn"),
      })
      .from(scanHistory)
      .as("prev_scans");

    // Total count query
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(trackedPages);
    if (whereClause) {
      countQuery = countQuery.where(whereClause) as typeof countQuery;
    }
    const countResult = await countQuery;
    const count = countResult[0]?.count ?? 0;

    // Fetch pages
    const pages = await db.query.trackedPages.findMany({
      ...(whereClause ? { where: whereClause } : {}),
      orderBy: [orderClause],
      limit,
      offset,
    });

    // Fetch previous scan results for these pages
    const pageIds = pages.map((p) => p.id);
    let prevResultsMap: Record<string, number | null> = {};

    if (pageIds.length > 0) {
      // Find second most recent scan result for difference display
      const prevScans = await db
        .select({
          trackedPageId: scanHistory.trackedPageId,
          results: scanHistory.results,
        })
        .from(scanHistory)
        .where(
          and(
            inArray(scanHistory.trackedPageId, pageIds),
            sql`${scanHistory.id} in (
              select id from (
                select id, row_number() over (partition by tracked_page_id order by checked_at desc) as rn
                from scan_history
              ) t where rn = 2
            )`
          )
        );

      prevResultsMap = Object.fromEntries(
        prevScans.map((s) => [s.trackedPageId, s.results])
      );
    }

    // Fetch latest queue entry per page for failureReason + attempts
    let queueMap: Record<string, { failureReason?: string | null; attempts?: number }> = {};
    if (pageIds.length > 0) {
      const latestQueue = await db
        .select({
          trackedPageId: queue.trackedPageId,
          failureReason: queue.failureReason,
          attempts: queue.attempts,
        })
        .from(queue)
        .where(
          and(
            inArray(queue.trackedPageId, pageIds),
            sql`${queue.id} in (
              select id from (
                select id, row_number() over (partition by tracked_page_id order by created_at desc) as rn
                from queue
              ) t where rn = 1
            )`
          )
        );
      queueMap = Object.fromEntries(
        latestQueue.map((q) => [q.trackedPageId, { failureReason: q.failureReason, attempts: q.attempts ?? 0 }])
      );
    }

    const pagesWithPrev = pages.map((p) => {
      const prev = prevResultsMap[p.id] ?? null;
      const difference =
        p.currentResults !== null && prev !== null ? p.currentResults - prev : null;
      const queueEntry = queueMap[p.id];

      return {
        ...p,
        previousResults: prev,
        difference,
        failureReason: queueEntry?.failureReason ?? null,
        attempts: queueEntry?.attempts ?? 0,
        notes: p.notes ?? null,
        isWatchlisted: p.isWatchlisted ?? false,
      };
    });

    return NextResponse.json({
      data: pagesWithPrev,
      pagination: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
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
