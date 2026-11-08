import { Page } from "playwright";
import { db } from "../../db";
import { trackedPages, queue, scrapedProducts } from "../../db/schema";
import { eq, and, asc } from "drizzle-orm";
import { scanMetaAdPage } from "../scanner";
import { scanAdCreatives } from "../scanners/ad-spy-crawler";
import { mergeExactMatchWithPageId } from "../../actions/merge-pages";
import { isValidPageId } from "../../lib/utils";
import { isCategoryUrl } from "../../lib/url-parser";
import {
  markJobCompleted,
  markJobFailed,
  markCreativeJobCompleted,
  markCreativeJobFailed,
  markDiscoveryJobCompleted,
  markDiscoveryJobFailed,
  enqueueOrEscalateJob,
} from "../db";
import { recordSuccessfulScan } from "../throttle";
import { handleFailure, handleSuccess } from "../backoff";
import { deleteCached, deleteByPrefix } from "../../lib/cache-service";
import { broadcastScanStep } from "../../lib/realtime-scan";

export interface JobDispatchContext {
  queueJob: any;
  trackedPage: any;
  discoveredPage: any;
  creativeScan: any;
  browserPage: Page;
  ranJobs: number;
  isCountOnly?: boolean;
  onMoverDetected?: (mover: {
    name: string;
    diff: number;
    currentResults: number;
    trackedPageId: string;
    pageId?: string;
  }) => void;
}

export interface JobDispatchResult {
  success: boolean;
  circuitBreakerTripped?: boolean;
}

export async function dispatchQueueJob(ctx: JobDispatchContext): Promise<JobDispatchResult> {
  const { queueJob, trackedPage, discoveredPage, creativeScan, browserPage: page, ranJobs, isCountOnly } = ctx;
  const jobType = queueJob.jobType || "count";
  const targetDisplayName =
    trackedPage?.displayName ||
    trackedPage?.id ||
    discoveredPage?.displayName ||
    discoveredPage?.pageId ||
    queueJob.id;

  // 1. Durable background product scraping job
  if (jobType === "product_scrape") {
    if (isCountOnly) return { success: true };

    const PRODUCT_COLUMNS = {
      id: true,
      url: true,
      title: true,
      currentPrice: true,
      scrapeStatus: true,
      workspaceId: true,
      pageId: true,
    } as const;

    let targetProduct: any = null;
    if (queueJob.failureReason?.startsWith("product:")) {
      const pId = queueJob.failureReason.replace("product:", "");
      targetProduct = await db.query.scrapedProducts.findFirst({
        where: eq(scrapedProducts.id, pId),
        columns: PRODUCT_COLUMNS,
      });
    }
    if (!targetProduct && queueJob.trackedPageId && trackedPage?.pageId) {
      targetProduct = await db.query.scrapedProducts.findFirst({
        where: and(
          eq(scrapedProducts.scrapeStatus, "pending"),
          eq(scrapedProducts.pageId, trackedPage.pageId)
        ),
        orderBy: [asc(scrapedProducts.createdAt)],
        columns: PRODUCT_COLUMNS,
      });
    }
    if (!targetProduct) {
      targetProduct = await db.query.scrapedProducts.findFirst({
        where: eq(scrapedProducts.scrapeStatus, "pending"),
        orderBy: [asc(scrapedProducts.createdAt)],
        columns: PRODUCT_COLUMNS,
      });
    }

    if (!targetProduct) {
      console.log(`[Product Scrape Job] No pending product found for queue job ${queueJob.id}. Marking completed.`);
      await db
        .update(queue)
        .set({ status: "completed", finishedAt: new Date() })
        .where(eq(queue.id, queueJob.id));
      return { success: true };
    }

    if (targetProduct.url && isCategoryUrl(targetProduct.url)) {
      console.log(`[Product Scrape Job] Skipping category URL: ${targetProduct.url}. Marking ignored.`);
      await db
        .update(scrapedProducts)
        .set({
          scrapeStatus: "ignored",
          failureReason: "Category URL ignored - not a product page",
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scrapedProducts.id, targetProduct.id));

      await db
        .update(queue)
        .set({ status: "completed", finishedAt: new Date() })
        .where(eq(queue.id, queueJob.id));

      if (queueJob.failureReason?.startsWith("product:")) {
        await db
          .update(queue)
          .set({ status: "completed", finishedAt: new Date() })
          .where(
            and(
              eq(queue.jobType, "product_scrape"),
              eq(queue.status, "pending"),
              eq(queue.failureReason, queueJob.failureReason)
            )
          );
      }
      return { success: true };
    }

    const hasForeignPrice = Boolean(
      targetProduct.currentPrice &&
      /(?:\$|€|£|\b(?:USD|EUR|GBP)\b)/i.test(targetProduct.currentPrice)
    );

    if ((targetProduct.scrapeStatus === "success" && !hasForeignPrice) || targetProduct.scrapeStatus === "ignored") {
      console.log(`[Product Scrape Job] Product "${targetProduct.title || targetProduct.url}" already in status "${targetProduct.scrapeStatus}". Marking completed.`);
      await db
        .update(queue)
        .set({ status: "completed", finishedAt: new Date() })
        .where(eq(queue.id, queueJob.id));

      if (queueJob.failureReason?.startsWith("product:")) {
        await db
          .update(queue)
          .set({ status: "completed", finishedAt: new Date() })
          .where(
            and(
              eq(queue.jobType, "product_scrape"),
              eq(queue.status, "pending"),
              eq(queue.failureReason, queueJob.failureReason)
            )
          );
      }
      return { success: true };
    }

    console.log(`[Product Scrape Job] 🛒 Extracting product landing page: ${targetProduct.url}`);
    const { processProductExtraction } = await import("../../lib/product-ingest");
    const res = await processProductExtraction(targetProduct.id, targetProduct.url, {
      workspaceId: targetProduct.workspaceId || queueJob.workspaceId || null,
    });

    const finishDate = new Date();
    const finishStatus = res.success ? "completed" : "failed";
    await db
      .update(queue)
      .set({
        status: finishStatus,
        finishedAt: finishDate,
        failureReason: res.error || queueJob.failureReason,
      })
      .where(eq(queue.id, queueJob.id));

    if (queueJob.failureReason?.startsWith("product:")) {
      await db
        .update(queue)
        .set({
          status: finishStatus,
          finishedAt: finishDate,
          failureReason: res.error || queueJob.failureReason,
        })
        .where(
          and(
            eq(queue.jobType, "product_scrape"),
            eq(queue.status, "pending"),
            eq(queue.failureReason, queueJob.failureReason)
          )
        );
    }
    return { success: res.success };
  }

  // 2. Discovery page count verification job
  if (jobType === "discovery_count" && discoveredPage) {
    const selectedCountry = discoveredPage.country || "TN";
    const discoveryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${selectedCountry}&view_all_page_id=${discoveredPage.pageId}&search_type=page&media_type=all`;
    const outcome = await scanMetaAdPage(page, discoveryUrl);

    if (outcome.status === "success" || outcome.status === "unclear") {
      console.log(
        `[Discovery Verify Success] Status: ${outcome.status} | Verified Ad Count: ${outcome.results ?? "N/A"}`
      );
      await markDiscoveryJobCompleted(
        queueJob.id,
        discoveredPage.id,
        outcome.results
      );
      await recordSuccessfulScan();
      await handleSuccess();
      return { success: true };
    } else {
      console.warn(
        `[Discovery Verify Failed] Reason: ${outcome.failureReason}`
      );
      await markDiscoveryJobFailed(
        queueJob.id,
        discoveredPage.id,
        outcome.failureReason || "navigation_error"
      );
      await handleFailure();
      return { success: false };
    }
  }

  // 3. Ad Spy Creative Extraction
  if (jobType === "creative" && creativeScan && trackedPage) {
    const outcome = await scanAdCreatives(
      page,
      trackedPage.id,
      trackedPage.url,
      creativeScan.id,
      "ALL"
    );
    const pageIdsFound = (outcome.extractedPageIds || []).filter(isValidPageId);

    if (pageIdsFound.length === 1 && trackedPage.searchType !== "page") {
      const singlePageId = pageIdsFound[0];
      console.log(
        `[Auto-Merge] Exact match page "${targetDisplayName}" resolved to single Meta Page ID "${singlePageId}". Merging records and queueing Page ID creative scan...`
      );
      const mergeRes = await mergeExactMatchWithPageId(trackedPage.id, singlePageId);
      const finalPageId = mergeRes.mergedPageId || trackedPage.id;

      const { logPageMergedNotification } = await import("../../lib/notifications");
      await logPageMergedNotification({
        trackedPageId: finalPageId,
        originalName: trackedPage.displayName || trackedPage.url,
        resolvedPageName: `Page ${singlePageId}`,
        resolvedPageId: singlePageId,
      }).catch(() => {});

      if (mergeRes.mergedPageId) {
        await enqueueOrEscalateJob(mergeRes.mergedPageId, "creative", 10);
        await markCreativeJobCompleted(
          queueJob.id,
          creativeScan.id,
          0,
          "completed"
        );
        await recordSuccessfulScan();
        await handleSuccess();
        return { success: true };
      }
    } else if (pageIdsFound.length > 1) {
      console.log(
        `[Discovered Pages] Keyword search target "${targetDisplayName}" revealed ${pageIdsFound.length} unique Facebook Page IDs (${pageIdsFound.join(", ")}). Saved to Discovered Pages for user review.`
      );
      await db
        .update(trackedPages)
        .set({ discoveredPagesCount: pageIdsFound.length })
        .where(eq(trackedPages.id, trackedPage.id))
        .catch(() => {});
      const { logMultiPageDetectedNotification } = await import("../../lib/notifications");
      await logMultiPageDetectedNotification({
        trackedPageId: trackedPage.id,
        domainName: trackedPage.displayName || trackedPage.url,
        candidatePages: pageIdsFound.map((pid) => ({ pageId: pid })),
      }).catch(() => {});
    }

    if (outcome.status === "completed" || outcome.status === "partial") {
      console.log(
        `[Creative Success] Status: ${outcome.status} | Extracted: ${outcome.extractedCount} ads`
      );
      await markCreativeJobCompleted(
        queueJob.id,
        creativeScan.id,
        outcome.extractedCount,
        outcome.status
      );
      await recordSuccessfulScan();
      await handleSuccess();

      if (trackedPage.workspaceId) {
        const canonicalKey = (trackedPage.pageId || trackedPage.id).toLowerCase();
        Promise.allSettled([
          deleteCached(`cache:stats:${trackedPage.workspaceId}`),
          deleteByPrefix(`cache:dashboard:overview:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:pages:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:products:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:fresh_winners:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:spy_ads:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:brand:${trackedPage.workspaceId}:${canonicalKey}:`),
        ]).catch(() => {});
      }
      return { success: true };
    } else {
      console.warn(
        `[Creative Failed] Reason: ${outcome.failureReason} | Details: ${outcome.outcomeDetails}`
      );
      await markCreativeJobFailed(
        queueJob.id,
        creativeScan.id,
        outcome.failureReason || "timeout",
        outcome.outcomeDetails
      );
      await handleFailure();
      return { success: false };
    }
  }

  // 4. Result Count Scan for Tracked Page
  if (trackedPage) {
    const onProgress = async (step: string, label: string, percent: number) => {
      await broadcastScanStep({
        jobId: queueJob.id,
        pageId: trackedPage.id,
        displayName: targetDisplayName,
        country: trackedPage.country || "TN",
        profilePicUrl: trackedPage.profilePicUrl,
        jobType: "count",
        step: step as any,
        label,
        percent,
        batchIndex: ranJobs + 1,
        timestamp: Date.now(),
      }).catch(() => {});
    };

    await onProgress("launching", "1. Connecting browser session...", 15);

    const outcome = await scanMetaAdPage(page, trackedPage.url, onProgress, {
      previousCount: trackedPage.currentResults,
      brandName: trackedPage.displayName,
    });

    if (outcome.status === "success" || outcome.status === "unclear") {
      console.log(
        `[Count Success] Status: ${outcome.status} | Results: ${outcome.results ?? "N/A"}`
      );
      const res = await markJobCompleted(
        queueJob.id,
        trackedPage.id,
        outcome.results,
        outcome.status,
        { failureReason: outcome.failureReason, page, profilePicUrl: outcome.profilePicUrl }
      );

      await broadcastScanStep({
        jobId: queueJob.id,
        pageId: trackedPage.id,
        displayName: targetDisplayName,
        country: trackedPage.country || "TN",
        profilePicUrl: outcome.profilePicUrl || trackedPage.profilePicUrl,
        jobType: "count",
        step: "completed",
        label: `Scan complete: ${outcome.results ?? 0} active ads found.`,
        percent: 100,
        activeAds: outcome.results,
        previousAds: trackedPage.currentResults,
        diff: res?.difference ?? null,
        batchIndex: ranJobs + 1,
        timestamp: Date.now(),
      }).catch(() => {});

      if (res?.circuitBreakerTripped) {
        console.warn(
          "[Worker] 🛑 Circuit Breaker tripped during count scan. Halting scanning batch to protect data integrity."
        );
        return { success: true, circuitBreakerTripped: true };
      }

      if (res && res.difference && res.difference > 0 && ctx.onMoverDetected) {
        ctx.onMoverDetected({
          name: res.brandName || trackedPage.displayName || "Brand",
          diff: res.difference,
          currentResults: res.results || 0,
          trackedPageId: trackedPage.id,
          pageId: trackedPage.pageId || undefined,
        });
      }

      // Auto-Resolve / Auto-Merge Exact Match Search Targets during Local Count Scan
      if (trackedPage.searchType !== "page" || !trackedPage.pageId) {
        try {
          const { extractPageIdsFromPage } = await import("../dom-scanner");
          const rawCandidates = await extractPageIdsFromPage(page);
          const pageCandidates = rawCandidates.filter((c) => isValidPageId(c.pageId));

          if (pageCandidates.length === 1) {
            const single = pageCandidates[0];
            console.log(
              `[Local Count Auto-Merge] Exact match page "${targetDisplayName}" resolved to Meta Page ID "${single.pageId}" (${single.pageName || "Verified Brand"}). Auto-upgrading...`
            );
            const mergeRes = await mergeExactMatchWithPageId(
              trackedPage.id,
              single.pageId,
              single.pageName
            );

            const finalPageId = mergeRes.mergedPageId || trackedPage.id;
            const { logPageMergedNotification } = await import("../../lib/notifications");
            await logPageMergedNotification({
              trackedPageId: finalPageId,
              originalName: trackedPage.displayName || trackedPage.url,
              resolvedPageName: single.pageName || `Page ${single.pageId}`,
              resolvedPageId: single.pageId,
            });

            await enqueueOrEscalateJob(finalPageId, "creative", 10);
          } else if (pageCandidates.length > 1) {
            console.log(
              `[Local Multi-Page Conflict] Detected ${pageCandidates.length} candidate Facebook Pages for "${targetDisplayName}". Posting notification for user review.`
            );
            await db
              .update(trackedPages)
              .set({ discoveredPagesCount: pageCandidates.length })
              .where(eq(trackedPages.id, trackedPage.id));

            const { logMultiPageDetectedNotification } = await import("../../lib/notifications");
            await logMultiPageDetectedNotification({
              trackedPageId: trackedPage.id,
              domainName: trackedPage.displayName || trackedPage.url,
              candidatePages: pageCandidates.map((c) => ({
                pageId: c.pageId,
                pageName: c.pageName,
                adCount: outcome.results || 0,
              })),
            });
          }
        } catch (err) {
          console.warn("[Local Count Page Extraction] Non-fatal error resolving Page ID:", err);
        }
      }

      await recordSuccessfulScan();
      await handleSuccess();

      if (trackedPage.workspaceId) {
        const canonicalKey = (trackedPage.pageId || trackedPage.id).toLowerCase();
        Promise.allSettled([
          deleteCached(`cache:stats:${trackedPage.workspaceId}`),
          deleteByPrefix(`cache:dashboard:overview:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:pages:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:products:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:fresh_winners:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:spy_ads:${trackedPage.workspaceId}:`),
          deleteByPrefix(`cache:brand:${trackedPage.workspaceId}:${canonicalKey}:`),
        ]).catch(() => {});
      }
      return { success: true };
    } else {
      console.warn(
        `[Count Failed] Reason: ${outcome.failureReason}`
      );
      await markJobFailed(queueJob.id, trackedPage.id, outcome.failureReason || "navigation_error");
      await broadcastScanStep({
        jobId: queueJob.id,
        pageId: trackedPage.id,
        displayName: targetDisplayName,
        country: trackedPage.country || "TN",
        profilePicUrl: trackedPage.profilePicUrl,
        jobType: "count",
        step: "failed",
        label: `Scan failed: ${outcome.failureReason || "Could not load ad library."}`,
        percent: 100,
        batchIndex: ranJobs + 1,
        timestamp: Date.now(),
      }).catch(() => {});

      await handleFailure();
      return { success: false };
    }
  }

  return { success: true };
}

