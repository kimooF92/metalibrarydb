import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, creativeScans, ads, adObservations } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { getApifyTokens, startApifyDeltaScan, fetchApifyDatasetItems } from "@/lib/apify";
import { ingestApifyDatasetItems } from "@/lib/apify-ingest";
import { getApifyRunStatus } from "@/lib/apify-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const { trackedPageId, adIds } = body;

    if (!trackedPageId && (!Array.isArray(adIds) || adIds.length === 0)) {
      return NextResponse.json(
        { error: "trackedPageId or adIds array is required" },
        { status: 400 }
      );
    }

    const tokens = getApifyTokens();
    if (tokens.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Apify API token not configured in environment variables.",
        },
        { status: 200 }
      );
    }

    // 1. Refresh by trackedPageId (All ads for a brand)
    if (trackedPageId) {
      const [page] = await db
        .select()
        .from(trackedPages)
        .where(
          trackedPageId.includes("-")
            ? eq(trackedPages.id, trackedPageId)
            : eq(trackedPages.pageId, trackedPageId)
        )
        .limit(1);

      if (!page || !page.url) {
        return NextResponse.json(
          { success: false, message: "Tracked brand page not found or has invalid URL." },
          { status: 404 }
        );
      }

      console.log(`[Bulk Refresh] Launching brand refresh for "${page.displayName || page.pageId}"...`);

      // Create creative_scans record
      const [newScan] = await db
        .insert(creativeScans)
        .values({
          trackedPageId: page.id,
          status: "running",
          startedAt: new Date(),
          configSnapshot: JSON.stringify({ runner: "apify", mode: "drawer_bulk_refresh", isFullScan: true }),
          outcomeDetails: `Bulk brand ad refresh triggered from drawer for "${page.displayName || page.pageId}"`,
        })
        .returning();

      const delta = Math.max(15, Math.min(350, page.currentResults || 30));
      const host = req.headers.get("host") || "localhost:3000";
      const protocol = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
      const webhookBaseUrl = `${protocol}://${host}`;

      const runRes = await startApifyDeltaScan({
        pageUrl: page.url,
        delta,
        creativeScanId: newScan.id,
        webhookBaseUrl,
        isFullScan: true,
        maxCap: 350,
      });

      if (!runRes?.id) {
        await db
          .update(creativeScans)
          .set({ status: "failed", failureReason: "apify_launch_failed", finishedAt: new Date() })
          .where(eq(creativeScans.id, newScan.id));

        return NextResponse.json({
          success: false,
          message: "Failed to launch Apify cloud scraper for this brand.",
        });
      }

      // Update scan record with apify run details
      await db
        .update(creativeScans)
        .set({
          configSnapshot: JSON.stringify({
            runner: "apify",
            mode: "drawer_bulk_refresh",
            isFullScan: true,
            apifyRunId: runRes.id,
            defaultDatasetId: runRes.defaultDatasetId,
          }),
        })
        .where(eq(creativeScans.id, newScan.id));

      // Synchronously poll Apify for up to 30 seconds to provide instant refresh in UI
      let datasetId = runRes.defaultDatasetId;
      let finalStatus = "RUNNING";
      const maxAttempts = 7; // 7 * 4s = ~28 seconds
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, 4000));
        const statusDetails = await getApifyRunStatus(runRes.id);
        finalStatus = statusDetails?.status || "RUNNING";
        datasetId = statusDetails?.defaultDatasetId || datasetId;

        if (finalStatus === "SUCCEEDED" || finalStatus === "FAILED" || finalStatus === "ABORTED") {
          break;
        }
      }

      if (finalStatus === "SUCCEEDED" && datasetId) {
        console.log(`[Bulk Refresh] Apify finished! Ingesting dataset items from ${datasetId}...`);
        const items = await fetchApifyDatasetItems(datasetId);
        const ingestRes = await ingestApifyDatasetItems(newScan.id, items);

        await db
          .update(creativeScans)
          .set({
            status: "completed",
            extractedCount: ingestRes.extractedCount,
            outcomeDetails: `Successfully refreshed ${ingestRes.extractedCount} ad creative(s) for ${page.displayName}`,
            finishedAt: new Date(),
          })
          .where(eq(creativeScans.id, newScan.id));

        return NextResponse.json({
          success: true,
          status: "completed",
          extractedCount: ingestRes.extractedCount,
          message: `Successfully refreshed ${ingestRes.extractedCount} ad creative(s) for "${page.displayName || page.pageId}".`,
        });
      }

      // If still running after 28s, background webhook/sync will finalize it
      return NextResponse.json({
        success: true,
        status: "processing",
        message: `Refresh scan queued in the cloud for "${page.displayName || page.pageId}". It will complete in the background in ~30 seconds.`,
      });
    }

    return NextResponse.json({ success: false, message: "Invalid request params" }, { status: 400 });
  } catch (err: any) {
    console.error("[Bulk Refresh Error]:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to bulk refresh brand ads",
      },
      { status: 200 }
    );
  }
}
