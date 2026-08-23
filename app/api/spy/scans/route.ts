import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creativeScans, queue, trackedPages, scanHistory } from "@/db/schema";
import { inArray, eq, and, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

import { extractUrlMetadata } from "@/lib/url-parser";

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

      const isPageTarget = Boolean(
        page.searchType === "page" ||
        (page.pageId && page.pageId !== "0" && !page.pageId.includes(" "))
      );
      const isFullScan = isPageTarget;

      if (runner === "apify") {
        // Fetch latest scan history to get positive count delta
        const latestHistory = await db.query.scanHistory.findFirst({
          where: eq(scanHistory.trackedPageId, page.id),
          orderBy: [sql`${scanHistory.checkedAt} desc`],
        });

        // For official page targets, scrape up to the brand's total active ads (page.currentResults, min 15, max 300) to ensure a complete sync
        const delta = isPageTarget
          ? Math.max(15, Math.min(300, page.currentResults || 30))
          : Math.max(1, latestHistory?.difference || page.currentResults || 15);

        const configObj = {
          runner: "apify",
          delta,
          isFullScan,
        };

        // Create creative_scans record for Apify
        const [newScan] = await db
          .insert(creativeScans)
          .values({
            trackedPageId: page.id,
            status: "running",
            startedAt: new Date(),
            configSnapshot: JSON.stringify(configObj),
            outcomeDetails: `Apify ${isFullScan ? "Full" : "Delta"} Cloud run launched for ${delta} ad(s) limit`,
          })
          .returning();

        // Mark tracked page status as scanning for real-time UI visibility
        await db
          .update(trackedPages)
          .set({ status: "scanning", updatedAt: new Date() })
          .where(eq(trackedPages.id, page.id));

        // Log notification that scan has started
        const { createNotification } = await import("@/lib/notifications");
        await createNotification({
          type: "ad_spy",
          title: "⚡ Apify Scan Started",
          message: `Started creative extraction for "${page.displayName || page.pageId || page.id}" (+${delta} ads)...`,
          severity: "info",
          trackedPageId: page.id,
          actionUrl: `/spy?trackedPageId=${page.id}`,
        });

        try {
          const { startApifyDeltaScan } = await import("@/lib/apify");
          const { pollApifyRunUntilDone } = await import("@/lib/apify-sync");

          const runRes = await startApifyDeltaScan({
            pageUrl: page.url,
            delta,
            creativeScanId: newScan.id,
            webhookBaseUrl,
            isFullScan,
          });

          // Update scan record with apifyRunId and defaultDatasetId
          if (runRes?.id) {
            await db
              .update(creativeScans)
              .set({
                configSnapshot: JSON.stringify({
                  ...configObj,
                  apifyRunId: runRes.id,
                  defaultDatasetId: runRes.defaultDatasetId,
                }),
                outcomeDetails: `Apify Cloud run launched (Run ID: ${runRes.id}, Dataset ID: ${runRes.defaultDatasetId})`,
              })
              .where(eq(creativeScans.id, newScan.id));

            // Launch background polling for dataset ingestion (handles local dev & webhook fallbacks)
            pollApifyRunUntilDone(newScan.id, runRes.id, runRes.defaultDatasetId);
          }

          enqueuedCount++;
          pageStatuses.push({
            id: page.id,
            displayName: page.displayName || page.pageId || page.id,
            status: "apify_launched",
            isScannedToday,
            lastCreativeScan: page.lastCreativeScan,
            message: `Launched ⚡ Apify Cloud scan for "${page.displayName || page.pageId || page.id}" (${delta} ads limit, full reconciliation enabled).`,
            runId: runRes?.id,
          });
        } catch (apifyErr: any) {
          await db
            .update(creativeScans)
            .set({
              status: "failed",
              failureReason: "apify_launch_failed",
              outcomeDetails: apifyErr?.message || "Apify launch failed",
              finishedAt: new Date(),
            })
            .where(eq(creativeScans.id, newScan.id));

          await db
            .update(trackedPages)
            .set({
              status: page.lastSuccessAt || page.currentResults !== null ? "success" : "failed",
              updatedAt: new Date(),
            })
            .where(eq(trackedPages.id, page.id));

          const { createNotification } = await import("@/lib/notifications");
          await createNotification({
            type: "system_alert",
            title: "⚠️ Apify Launch Failed",
            message: `Failed to launch Apify scan for "${page.displayName || page.pageId || page.id}": ${apifyErr?.message}`,
            severity: "error",
            trackedPageId: page.id,
          });

          pageStatuses.push({
            id: page.id,
            displayName: page.displayName || page.pageId || page.id,
            status: "failed",
            message: `Failed to launch Apify scan: ${apifyErr?.message}`,
          });
        }

        continue;
      }

      // Default: Local Playwright worker enqueue
      const [newScan] = await db
        .insert(creativeScans)
        .values({
          trackedPageId: page.id,
          status: "pending",
          configSnapshot: JSON.stringify({
            runner: "local",
            maxScrolls: 15,
            timeoutMs: 25000,
            isFullScan,
          }),
        })
        .returning();

      // Enqueue job into queue table
      await db.insert(queue).values({
        trackedPageId: page.id,
        jobType: "creative",
        creativeScanId: newScan.id,
        status: "pending",
      });

      // Update page status to pending for active scanning UI feedback
      await db
        .update(trackedPages)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(trackedPages.id, page.id));

      enqueuedCount++;
      pageStatuses.push({
        id: page.id,
        displayName: page.displayName || page.pageId || page.id,
        status: "enqueued",
        isScannedToday,
        lastCreativeScan: page.lastCreativeScan,
        message: isScannedToday
          ? `Queued Local Playwright scan for "${page.displayName || page.pageId || page.id}".`
          : `Queued Local Playwright scan for "${page.displayName || page.pageId || page.id}".`,
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
