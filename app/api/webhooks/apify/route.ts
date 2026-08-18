import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creativeScans } from "@/db/schema";
import { fetchApifyDatasetItems } from "@/lib/apify";
import { ingestApifyDatasetItems } from "@/lib/apify-ingest";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const creativeScanId = searchParams.get("creativeScanId");

    const body = await req.json();
    const eventType = body?.eventType || body?.event;
    const eventData = body?.eventData || body;
    const datasetId = eventData?.defaultDatasetId || body?.defaultDatasetId;

    console.log(`[Apify Webhook] Event: ${eventType}, CreativeScanId: ${creativeScanId}`);

    if (!creativeScanId) {
      return NextResponse.json({ error: "Missing creativeScanId query parameter" }, { status: 400 });
    }

    const scanRecord = await db.query.creativeScans.findFirst({
      where: eq(creativeScans.id, creativeScanId),
    });

    if (!scanRecord) {
      return NextResponse.json({ error: "Creative scan record not found" }, { status: 404 });
    }

    // Handle failed / aborted runs
    if (eventType === "ACTOR.RUN.FAILED" || eventType === "ACTOR.RUN.ABORTED") {
      await db
        .update(creativeScans)
        .set({
          status: "failed",
          failureReason: eventType === "ACTOR.RUN.FAILED" ? "rate_limited" : "timeout",
          outcomeDetails: `Apify run status: ${eventType}`,
          finishedAt: new Date(),
        })
        .where(eq(creativeScans.id, creativeScanId));

      return NextResponse.json({ message: "Scan marked failed" });
    }

    if (!datasetId) {
      return NextResponse.json({ error: "Missing defaultDatasetId in webhook payload" }, { status: 400 });
    }

    // Fetch dataset items from Apify
    const items = await fetchApifyDatasetItems(datasetId);
    console.log(`[Apify Webhook] Extracted ${items.length} dataset items from Apify for dataset ${datasetId}`);

    const { ingestApifyDatasetItems } = await import("@/lib/apify-ingest");
    const { extractedCount } = await ingestApifyDatasetItems(creativeScanId, items);

    return NextResponse.json({
      success: true,
      creativeScanId,
      extractedCount,
    });
  } catch (error: any) {
    console.error("[Apify Webhook] Ingestion error:", error);
    return NextResponse.json({ error: error?.message || "Internal ingestion error" }, { status: 500 });
  }
}
