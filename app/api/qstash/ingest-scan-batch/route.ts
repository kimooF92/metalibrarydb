import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { db } from "@/db";
import { ads, adObservations, creativeScans, trackedPages } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { BatchIngestPayloadSchema, type RawAdItem } from "@/lib/qstash-types";
import { enqueueProductScrape } from "@/lib/qstash";
import { reconcileArchivedAds } from "@/lib/ad-reconciliation";
import { deleteCached, deleteByPrefix } from "@/lib/cache-service";
import { checkAndRecordBreakout } from "@/lib/breakout-detector";
import { timingSafeEqual } from "@/lib/auth";
import { batchFindProductIdsByUrls } from "@/lib/product-url-matcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s execution budget on Vercel

export async function handleBatchIngest(req: Request | NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = BatchIngestPayloadSchema.safeParse(rawBody);

    if (!parseResult.success) {
      // 400 Bad Request is non-retryable by QStash, preventing poison pill retry loops
      return NextResponse.json(
        { error: "Invalid payload structure", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const { creativeScanId, trackedPageId, pageId, scanQuality, ads: batchAds, observedAt } = parseResult.data;

    // 1. Authorize Scan & Page Relation (Derive workspaceId from DB to guarantee tenant isolation)
    const [pageRecord] = await db
      .select({
        id: trackedPages.id,
        pageId: trackedPages.pageId,
        workspaceId: trackedPages.workspaceId,
        displayName: trackedPages.displayName,
      })
      .from(trackedPages)
      .where(eq(trackedPages.id, trackedPageId))
      .limit(1);

    if (!pageRecord) {
      return NextResponse.json({ error: "Tracked page not found" }, { status: 400 });
    }

    const [scanRecord] = await db
      .select({ id: creativeScans.id })
      .from(creativeScans)
      .where(
        and(
          eq(creativeScans.id, creativeScanId),
          eq(creativeScans.trackedPageId, trackedPageId)
        )
      )
      .limit(1);

    if (!scanRecord) {
      return NextResponse.json({ error: "Creative scan does not belong to page" }, { status: 400 });
    }

    // 2. De-duplicate ads in memory by adArchiveId before bulk inserting
    const adMap = new Map<string, RawAdItem>();
    for (const ad of batchAds) {
      const existing = adMap.get(ad.adArchiveId);
      if (!existing) {
        adMap.set(ad.adArchiveId, { ...ad });
      } else {
        existing.duplicationCount = Math.max(existing.duplicationCount, ad.duplicationCount);
        existing.isActive = existing.isActive || ad.isActive;
        if (!existing.caption && ad.caption) existing.caption = ad.caption;
        if (!existing.title && ad.title) existing.title = ad.title;
        if (!existing.linkUrl && ad.linkUrl) existing.linkUrl = ad.linkUrl;
        if (!existing.thumbnailUrl && ad.thumbnailUrl) existing.thumbnailUrl = ad.thumbnailUrl;
        if (existing.mediaUrls.length === 0 && ad.mediaUrls.length > 0) existing.mediaUrls = ad.mediaUrls;
      }
    }
    const uniqueAds = Array.from(adMap.values());

    const archiveIdToUuid = new Map<string, string>();
    const CHUNK_SIZE = 50;

    // 3. Fast Bulk Upsert into `ads` table in chunks of 50
    if (uniqueAds.length > 0) {
      // Auto-link incoming ads with existing scraped_products matching landing URLs ($0 API tokens)
      const batchUrls = uniqueAds
        .map((a) => a.linkUrl)
        .filter((u): u is string => Boolean(u && u.trim()));
      const urlMatcher = await batchFindProductIdsByUrls(batchUrls);

      for (let i = 0; i < uniqueAds.length; i += CHUNK_SIZE) {
        const chunk = uniqueAds.slice(i, i + CHUNK_SIZE);
        const adInsertValues = chunk.map((a) => ({
          adArchiveId: a.adArchiveId,
          pageId: a.pageId || pageId,
          pageName: a.pageName || pageRecord.displayName,
          startedRunningOn: a.startedRunningOn ? new Date(a.startedRunningOn) : null,
          caption: a.caption,
          title: a.title,
          ctaText: a.ctaText,
          linkUrl: a.linkUrl,
          productId: urlMatcher.getProductId(a.linkUrl),
          mediaType: a.mediaType,
          mediaUrls: a.mediaUrls,
          thumbnailUrl: a.thumbnailUrl,
          firstSeenAt: new Date(observedAt),
          lastSeenAt: new Date(observedAt),
          updatedAt: new Date(),
          isArchived: false,
          archivedAt: null,
        }));

        const upsertedChunk = await db
          .insert(ads)
          .values(adInsertValues)
          .onConflictDoUpdate({
            target: ads.adArchiveId,
            set: {
              pageName: sql`COALESCE(EXCLUDED.page_name, ${ads.pageName})`,
              caption: sql`COALESCE(EXCLUDED.caption, ${ads.caption})`,
              title: sql`COALESCE(EXCLUDED.title, ${ads.title})`,
              ctaText: sql`COALESCE(EXCLUDED.cta_text, ${ads.ctaText})`,
              productId: sql`COALESCE(${ads.productId}, EXCLUDED.product_id)`,
              mediaType: sql`COALESCE(EXCLUDED.media_type, ${ads.mediaType})`,
              mediaUrls: sql`CASE 
                WHEN EXISTS (SELECT 1 FROM unnest(${ads.mediaUrls}) AS u WHERE u LIKE '%b2%' OR u LIKE '%backblazeb2%') THEN ${ads.mediaUrls}
                WHEN array_length(EXCLUDED.media_urls, 1) > 0 THEN EXCLUDED.media_urls 
                ELSE ${ads.mediaUrls} 
              END`,
              thumbnailUrl: sql`CASE 
                WHEN ${ads.thumbnailUrl} LIKE 'https://f005.backblazeb2.com%' OR ${ads.thumbnailUrl} LIKE '%b2%' THEN ${ads.thumbnailUrl} 
                ELSE COALESCE(EXCLUDED.thumbnail_url, ${ads.thumbnailUrl}) 
              END`,
              lastSeenAt: new Date(observedAt),
              updatedAt: new Date(),
              isArchived: false,
              archivedAt: null,
            },
          })
          .returning({ id: ads.id, adArchiveId: ads.adArchiveId });

        for (const row of upsertedChunk) {
          archiveIdToUuid.set(row.adArchiveId, row.id);
        }
      }

      // 4. Bulk Insert & Update `ad_observations` table
      const existingObs = await db
        .select({
          id: adObservations.id,
          adId: adObservations.adId,
          duplicationCount: adObservations.duplicationCount,
        })
        .from(adObservations)
        .where(eq(adObservations.creativeScanId, creativeScanId));

      const existingMap = new Map(existingObs.map((o) => [o.adId, o]));
      const newObservations: Array<typeof adObservations.$inferInsert> = [];

      for (const ad of uniqueAds) {
        const adUuid = archiveIdToUuid.get(ad.adArchiveId);
        if (!adUuid) continue;

        const existing = existingMap.get(adUuid);
        if (existing) {
          if (ad.duplicationCount > existing.duplicationCount) {
            await db
              .update(adObservations)
              .set({
                duplicationCount: Math.max(ad.duplicationCount, existing.duplicationCount),
                isActive: ad.isActive,
                observedAt: new Date(observedAt),
              })
              .where(eq(adObservations.id, existing.id));
          }
        } else {
          newObservations.push({
            creativeScanId,
            adId: adUuid,
            trackedPageId,
            isActive: ad.isActive,
            duplicationCount: ad.duplicationCount,
            collationId: ad.collationId || null,
            observedAt: new Date(observedAt),
          });
        }
      }

      if (newObservations.length > 0) {
        for (let i = 0; i < newObservations.length; i += CHUNK_SIZE) {
          await db.insert(adObservations).values(newObservations.slice(i, i + CHUNK_SIZE));
        }
      }

      // Reactivate any prior inactive observations for these canonical ads
      const canonicalAdIds = Array.from(archiveIdToUuid.values());
      if (canonicalAdIds.length > 0) {
        await db
          .update(adObservations)
          .set({ isActive: true })
          .where(
            and(
              inArray(adObservations.adId, canonicalAdIds),
              eq(adObservations.isActive, false)
            )
          );
      }

      // 5. Breakout Detection & Chained E-Commerce Product Scraping
      for (const ad of uniqueAds) {
        const adUuid = archiveIdToUuid.get(ad.adArchiveId);
        if (adUuid && ad.duplicationCount >= 3) {
          checkAndRecordBreakout({
            adId: adUuid,
            adArchiveId: ad.adArchiveId,
            pageId: ad.pageId || pageId,
            brandName: ad.pageName || pageRecord.displayName || "Brand",
            trackedPageId,
            currentDuplication: ad.duplicationCount,
            startedRunningOn: ad.startedRunningOn ? new Date(ad.startedRunningOn) : null,
            firstSeenAt: new Date(observedAt),
            lastSeenAt: new Date(observedAt),
            mediaType: ad.mediaType,
            linkUrl: ad.linkUrl || null,
            isActive: ad.isActive,
          }).catch((err) =>
            console.warn("[QStash Batch Ingest] Breakout check notice:", err?.message || err)
          );
        }

        if (ad.linkUrl && ad.ctaText && /shop|order|buy|get offer/i.test(ad.ctaText)) {
          // Avoid exhausting scraping API quota if the product is already matched ($0 API cost)
          if (!urlMatcher.getProductId(ad.linkUrl)) {
            enqueueProductScrape({
              url: ad.linkUrl,
              pageId,
              workspaceId: pageRecord.workspaceId,
            }).catch(() => { });
          }
        }
      }
    }

    const isAuthoritativeComplete = scanQuality === "complete";

    // 6. Update Scan Status (Strictly mark partial when crawl did not reach verified completion)
    await db
      .update(creativeScans)
      .set({
        status: isAuthoritativeComplete ? "completed" : "partial",
        extractedCount: uniqueAds.length,
        failureReason: null,
        outcomeDetails: isAuthoritativeComplete
          ? `Scan completed with ${uniqueAds.length} ads ingested`
          : `Partial scan batch ingested with ${uniqueAds.length} ads`,
        finishedAt: new Date(),
      })
      .where(eq(creativeScans.id, creativeScanId));

    // 7. Delayed Archive Reconciliation (Safely runs ONLY on authoritative complete scans)
    if (isAuthoritativeComplete) {
      const activeArchiveIds = new Set(
        uniqueAds.filter((a) => a.isActive).map((a) => a.adArchiveId)
      );
      await reconcileArchivedAds(
        trackedPageId,
        creativeScanId,
        activeArchiveIds,
        new Date(observedAt),
        { isFullScan: true }
      ).catch((err) =>
        console.warn("[QStash Batch Ingest] Archive reconciliation notice:", err?.message || err)
      );
    } else {
      console.warn(`[QStash Batch Ingest] ⚠️ Skipping archival reconciliation: scanQuality is '${scanQuality}' (partial/unclear).`);
    }

    // 8. Invalidate Workspace, Brand & Product Caches
    if (pageRecord.workspaceId) {
      const wsId = pageRecord.workspaceId;
      const targetPageId = pageRecord.pageId || pageId;
      deleteCached(`cache:stats:${wsId}`).catch(() => { });
      deleteByPrefix(`cache:spy_ads:${wsId}:`).catch(() => { });
      deleteByPrefix(`cache:dashboard:overview:${wsId}:`).catch(() => { });
      if (targetPageId) {
        deleteByPrefix(`cache:brand:${wsId}:${targetPageId}:`).catch(() => { });
      }
      deleteByPrefix(`cache:brand:${wsId}:${trackedPageId}:`).catch(() => { });
      deleteByPrefix(`cache:products:${wsId}:`).catch(() => { });
    }

    return NextResponse.json({
      success: true,
      creativeScanId,
      ingestedCount: uniqueAds.length,
    });
  } catch (error: any) {
    console.error("[QStash Batch Ingest Error]:", error);
    // 500 triggers QStash automatic retry with exponential backoff
    return NextResponse.json(
      { error: "Internal processing error", message: error?.message },
      { status: 500 }
    );
  }
}

// Fail-Closed Signature Verification Wrapper
export async function POST(req: Request | NextRequest) {
  // 1. Fast-path authorization: If caller provides valid internal API secret or APP_PASSWORD
  const apiSecretHeader = req.headers.get("x-api-secret");
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const configuredApiSecret = process.env.API_SECRET || process.env.APP_PASSWORD;

  const isAuthorizedSecret =
    Boolean(configuredApiSecret) &&
    ((apiSecretHeader && timingSafeEqual(apiSecretHeader, configuredApiSecret!)) ||
      (bearerToken && timingSafeEqual(bearerToken, configuredApiSecret!)));

  if (isAuthorizedSecret) {
    return handleBatchIngest(req);
  }

  // 2. Cryptographic signature verification via Upstash QStash
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentSigningKey || !nextSigningKey) {
    // Only permit unauthenticated bypass strictly during local development
    if (process.env.NODE_ENV === "development") {
      return handleBatchIngest(req);
    }
    console.error("[QStash Error] Missing QSTASH_CURRENT_SIGNING_KEY or QSTASH_NEXT_SIGNING_KEY in environment");
    return NextResponse.json(
      { error: "Server configuration missing: QStash signing keys are required." },
      { status: 500 }
    );
  }

  const verified = verifySignatureAppRouter(handleBatchIngest, {
    currentSigningKey,
    nextSigningKey,
    clockTolerance: 60,
  });

  return verified(req);
}
