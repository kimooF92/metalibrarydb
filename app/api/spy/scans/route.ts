import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creativeScans, queue, trackedPages } from "@/db/schema";
import { inArray, eq, and } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  const authError = validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { trackedPageIds } = body;

    if (!Array.isArray(trackedPageIds) || trackedPageIds.length === 0) {
      return NextResponse.json(
        { error: "trackedPageIds array is required" },
        { status: 400 }
      );
    }

    // 1. Fetch requested pages
    const pages = await db.query.trackedPages.findMany({
      where: inArray(trackedPages.id, trackedPageIds),
    });

    const eligiblePages = pages.filter((p) => p.url && p.url.trim() !== "");
    const ineligibleCount = pages.length - eligiblePages.length;

    if (eligiblePages.length === 0) {
      return NextResponse.json(
        {
          error: "No eligible pages found with valid Meta Ad Library URLs.",
          ineligibleCount,
        },
        { status: 400 }
      );
    }

    let enqueuedCount = 0;
    let skippedCount = 0;
    const pageStatuses: any[] = [];

    for (const page of eligiblePages) {
      const lastScanDate = page.lastCreativeScan ? new Date(page.lastCreativeScan) : null;
      const isScannedToday = Boolean(
        lastScanDate && lastScanDate.toDateString() === new Date().toDateString()
      );

      // Check if page already has a pending or running creative job in queue
      const existingJob = await db.query.queue.findFirst({
        where: and(
          eq(queue.trackedPageId, page.id),
          eq(queue.jobType, "creative"),
          inArray(queue.status, ["pending", "running"])
        ),
      });

      if (existingJob) {
        skippedCount++;
        pageStatuses.push({
          id: page.id,
          displayName: page.displayName || page.pageId || page.id,
          status: "already_queued",
          isScannedToday,
          lastCreativeScan: page.lastCreativeScan,
          message: `Creative scan for "${page.displayName || page.pageId || page.id}" is ALREADY QUEUED in progress.`,
        });
        continue;
      }

      // Create creative_scans record
      const [newScan] = await db
        .insert(creativeScans)
        .values({
          trackedPageId: page.id,
          status: "pending",
          configSnapshot: JSON.stringify({ maxScrolls: 15, timeoutMs: 25000 }),
        })
        .returning();

      // Enqueue job into queue table
      await db.insert(queue).values({
        trackedPageId: page.id,
        jobType: "creative",
        creativeScanId: newScan.id,
        status: "pending",
      });

      enqueuedCount++;
      pageStatuses.push({
        id: page.id,
        displayName: page.displayName || page.pageId || page.id,
        status: "enqueued",
        isScannedToday,
        lastCreativeScan: page.lastCreativeScan,
        message: isScannedToday
          ? `Queued creative scan for "${page.displayName || page.pageId || page.id}". (Note: Brand was already scanned earlier today).`
          : `Queued creative scan for "${page.displayName || page.pageId || page.id}".`,
      });
    }

    return NextResponse.json({
      success: true,
      enqueuedCount,
      skippedCount,
      ineligibleCount,
      pageStatuses,
      message:
        pageStatuses.length === 1
          ? pageStatuses[0].message
          : `Enqueued ${enqueuedCount} creative scan job(s). ${skippedCount} already in queue.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to enqueue creative scans" },
      { status: 500 }
    );
  }
}
