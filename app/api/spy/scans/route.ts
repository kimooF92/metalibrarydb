import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { dispatchCreativeScanForBrand } from "@/lib/creative-scan-dispatch";

export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { trackedPageIds, runner = "local" } = body;

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
          error: "No eligible pages found with valid Meta Ad Library search URLs.",
          ineligibleCount,
        },
        { status: 400 }
      );
    }

    let enqueuedCount = 0;
    let skippedCount = 0;
    const pageStatuses: any[] = [];

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const webhookBaseUrl = `${protocol}://${host}`;

    for (const page of eligiblePages) {
      const result = await dispatchCreativeScanForBrand({
        trackedPageId: page.id,
        runner,
        priority: 5,
        webhookBaseUrl,
      });

      if (result.status === "already_queued") {
        skippedCount++;
      } else if (result.status === "failed") {
        // scan launch failed
      } else {
        enqueuedCount++;
      }

      pageStatuses.push({
        id: page.id,
        displayName: result.displayName || page.displayName || page.pageId || page.id,
        status: result.status,
        isScannedToday: result.isScannedToday,
        lastCreativeScan: result.lastCreativeScan,
        message: result.message,
        runId: result.runId,
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
          : `Enqueued ${enqueuedCount} scan job(s). ${skippedCount} already in queue.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to enqueue creative scans" },
      { status: 500 }
    );
  }
}
