import { NextResponse } from "next/server";
import { db } from "@/db";
import { creativeScans, queue, trackedPages } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";

export interface SmallPageNeedingScan {
  id: string;
  displayName: string;
  url: string;
  pageId: string | null;
  currentResults: number;
  lastCreativeScan: string | null;
  status: string;
  holdStatus: string | null;
  reason: "in_queue" | "never_scanned" | "new_ads";
  latestDifference: number;
  isInQueue: boolean;
}

export async function GET() {
  try {
    // Selects small pages (< 20 active ads) that legitimately need a local creative scan:
    // 1. Pages already enqueued with an active 'creative' job in queue (in_queue)
    // 2. Pages that have NEVER had a creative scan (never_scanned)
    // 3. Pages with verified new ads detected since their last creative scan (new_ads with delta >= 2)
    // Pages undergoing routine count refresh with 0 new ads are strictly excluded.
    const rawRows: any = await db.execute(sql`
      WITH active_creative_queue AS (
        SELECT DISTINCT tracked_page_id
        FROM queue
        WHERE job_type = 'creative' AND status IN ('pending', 'running')
      )
      SELECT 
        tp.id,
        tp.display_name,
        tp.url,
        tp.current_results,
        tp.last_creative_scan,
        tp.page_id,
        tp.status,
        tp.hold_status,
        CASE 
          WHEN acq.tracked_page_id IS NOT NULL THEN 'in_queue'
          WHEN tp.last_creative_scan IS NULL THEN 'never_scanned'
          ELSE 'new_ads'
        END as reason,
        COALESCE(lsh.difference, 0) as latest_difference,
        (acq.tracked_page_id IS NOT NULL) as is_in_queue
      FROM tracked_pages tp
      LEFT JOIN active_creative_queue acq ON acq.tracked_page_id = tp.id
      LEFT JOIN LATERAL (
        SELECT s.difference, s.results, s.checked_at
        FROM scan_history s
        WHERE s.tracked_page_id = tp.id AND s.status = 'success'
        ORDER BY s.checked_at DESC
        LIMIT 1
      ) lsh ON true
      WHERE 
        tp.current_results > 0 
        AND tp.current_results < 20
        AND (tp.hold_status IS NULL OR (tp.hold_status != 'on_hold' AND tp.hold_status != 'inactive'))
        AND (tp.search_type IS NULL OR tp.search_type != 'keyword_exact_phrase')
        AND (
          acq.tracked_page_id IS NOT NULL
          OR tp.last_creative_scan IS NULL
          OR (
            lsh.difference IS NOT NULL 
            AND lsh.difference >= 2 
            AND (tp.last_creative_scan IS NULL OR lsh.checked_at > tp.last_creative_scan)
          )
        )
      ORDER BY 
        CASE WHEN acq.tracked_page_id IS NOT NULL THEN 0 ELSE 1 END,
        tp.current_results DESC
    `);

    const pages: SmallPageNeedingScan[] = (rawRows || []).map((r: any) => ({
      id: r.id,
      displayName: r.display_name || "Unknown Brand",
      url: r.url || "",
      pageId: r.page_id,
      currentResults: Number(r.current_results || 0),
      lastCreativeScan: r.last_creative_scan ? new Date(r.last_creative_scan).toISOString() : null,
      status: r.status || "unknown",
      holdStatus: r.hold_status,
      reason: r.reason,
      latestDifference: Number(r.latest_difference || 0),
      isInQueue: Boolean(r.is_in_queue),
    }));

    const inQueueCount = pages.filter((p) => p.isInQueue).length;
    const pendingEnqueueCount = pages.length - inQueueCount;

    return NextResponse.json(
      {
        success: true,
        count: pages.length,
        inQueueCount,
        pendingEnqueueCount,
        pages,
      },
      {
        headers: {
          "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
          Vary: PRIVATE_AUTH_VARY,
        },
      }
    );
  } catch (error) {
    console.error("Error in GET /api/worker/small-pages-scan:", error);
    return NextResponse.json(
      { success: false, error: "Failed to query small pages needing scan" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Fetch small pages needing creative scan that are not yet in queue:
    // (Never scanned OR verified new ads with delta >= 2 since last creative scan)
    const rawRows: any = await db.execute(sql`
      WITH active_creative_queue AS (
        SELECT DISTINCT tracked_page_id
        FROM queue
        WHERE job_type = 'creative' AND status IN ('pending', 'running')
      )
      SELECT 
        tp.id,
        tp.display_name,
        tp.current_results,
        tp.last_creative_scan,
        CASE 
          WHEN tp.last_creative_scan IS NULL THEN 'never_scanned'
          ELSE 'new_ads'
        END as reason,
        COALESCE(lsh.difference, tp.current_results) as latest_difference
      FROM tracked_pages tp
      LEFT JOIN active_creative_queue acq ON acq.tracked_page_id = tp.id
      LEFT JOIN LATERAL (
        SELECT s.difference, s.results, s.checked_at
        FROM scan_history s
        WHERE s.tracked_page_id = tp.id AND s.status = 'success'
        ORDER BY s.checked_at DESC
        LIMIT 1
      ) lsh ON true
      WHERE 
        acq.tracked_page_id IS NULL
        AND tp.current_results > 0 
        AND tp.current_results < 20
        AND (tp.hold_status IS NULL OR (tp.hold_status != 'on_hold' AND tp.hold_status != 'inactive'))
        AND (tp.search_type IS NULL OR tp.search_type != 'keyword_exact_phrase')
        AND (
          tp.last_creative_scan IS NULL
          OR (
            lsh.difference IS NOT NULL 
            AND lsh.difference >= 2 
            AND (tp.last_creative_scan IS NULL OR lsh.checked_at > tp.last_creative_scan)
          )
        )
      ORDER BY tp.current_results DESC
    `);

    const pagesToEnqueue = rawRows || [];
    let enqueuedCount = 0;

    for (const page of pagesToEnqueue) {
      try {
        const [scanRecord] = await db
          .insert(creativeScans)
          .values({
            trackedPageId: page.id,
            status: "pending",
            configSnapshot: JSON.stringify({
              runner: "playwright",
              manualEnqueue: true,
              reason: page.reason,
              delta: page.latest_difference,
              totalResults: page.current_results,
            }),
            outcomeDetails: `Enqueued for local Playwright creative scan (${page.reason}${page.latest_difference ? `, +${page.latest_difference} ads` : ""})`,
          })
          .returning();

        await db.insert(queue).values({
          trackedPageId: page.id,
          jobType: "creative",
          creativeScanId: scanRecord.id,
          status: "pending",
          priority: 5,
        });

        await db
          .update(trackedPages)
          .set({ status: "pending", updatedAt: new Date() })
          .where(eq(trackedPages.id, page.id));

        enqueuedCount++;
      } catch (err) {
        console.error(`Failed to enqueue small page ${page.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      enqueuedCount,
      message: `Successfully enqueued ${enqueuedCount} small page(s) for local Playwright scan.`,
    });
  } catch (error) {
    console.error("Error in POST /api/worker/small-pages-scan:", error);
    return NextResponse.json(
      { success: false, error: "Failed to enqueue small pages for scan" },
      { status: 500 }
    );
  }
}
