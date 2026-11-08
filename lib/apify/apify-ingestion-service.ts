import { db } from "@/db";
import { ads, adObservations, creativeScans, trackedPages, brandDomains } from "@/db/schema";
import { eq, and, sql, desc, ne, isNull, or } from "drizzle-orm";
import { uploadMediaWithHashing, isB2Configured, registerPendingB2Upload } from "@/lib/b2-storage";
import { linkAndAutoScrapeProduct } from "@/lib/product-ingest";
import { checkAndRecordBreakout } from "@/lib/breakout-detector";
import { resolveDestinationUrl } from "@/lib/utils";
import { selectBestProductCandidateUrl } from "@/lib/discovery-product-selector";
import {
  extractAdArchiveId,
  extractMedia,
  parseAdStartDate,
  extractPageInfo,
} from "./apify-normalizer";

/**
 * Ingests a list of dataset items returned from Apify into the database.
 * Enforces strict canonical ad de-duplication (by ad_archive_id) and observation de-duplication.
 * Preserves Backblaze B2 permanent storage URLs (BUG-11), prevents dataset error false descaling (BUG-13),
 * and strictly isolates numeric Meta Page IDs from database UUIDs (BUG-12).
 */
export async function ingestApifyDatasetItems(
  creativeScanId: string,
  items: any[]
): Promise<{ success: boolean; extractedCount: number; newProductsCount: number }> {
  const scanRecord = await db.query.creativeScans.findFirst({
    where: eq(creativeScans.id, creativeScanId),
  });

  if (!scanRecord) {
    throw new Error(`Creative scan record ${creativeScanId} not found.`);
  }

  if (scanRecord.status === "completed") {
    console.log(`[Apify Ingest] Scan ${creativeScanId} is already marked completed. Skipping duplicate ingestion.`);
    return { success: true, extractedCount: scanRecord.extractedCount || 0, newProductsCount: 0 };
  }

  const trackedPageId = scanRecord.trackedPageId;
  const pageRecord = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, trackedPageId),
  });

  const now = new Date();

  // Apify can report actor/input failures as dataset items while the run
  // itself still has a SUCCEEDED status. Never treat those items as ads or a
  // successful zero-result scan (BUG-13 mitigation).
  const datasetError = items.find(
    (item) => item && typeof item.error === "string" && item.error.trim()
  );
  if (datasetError) {
    const message = `Apify dataset returned an error: ${datasetError.error.trim()}`;
    const pageStatus =
      pageRecord && (pageRecord.lastSuccessAt || pageRecord.currentResults !== null)
        ? "success"
        : "failed";

    await db
      .update(creativeScans)
      .set({
        status: "failed",
        failureReason: "apify_dataset_error",
        outcomeDetails: message,
        finishedAt: now,
      })
      .where(eq(creativeScans.id, creativeScanId));

    await db
      .update(trackedPages)
      .set({ status: pageStatus, updatedAt: now })
      .where(eq(trackedPages.id, trackedPageId));

    const { createNotification } = await import("@/lib/notifications");
    await createNotification({
      type: "system_alert",
      title: "Ad Fetch Incomplete",
      message: "Could not download newest ads. Will retry automatically.",
      severity: "error",
      trackedPageId,
      actionUrl: `/spy?trackedPageId=${trackedPageId}`,
    });

    throw new Error(message);
  }

  let extractedCount = 0;
  let newProductsCount = 0;
  let detectedPageId: string | null = null;
  let detectedPageName: string | null = null;
  let detectedProfilePicUrl: string | null = null;
  const discoveredPagesMap = new Map<string, { pageId: string; pageName: string | null; adCount: number }>();

  const isNumericString = (str?: string | null) => Boolean(str && /^\d{6,25}$/.test(str.trim()));

  for (const item of items) {
    const adArchiveId = extractAdArchiveId(item);
    if (!adArchiveId || adArchiveId === "0") continue;

    const { pageId: itemPageId, pageName: itemPageName, profilePicUrl: itemProfilePicUrl } = extractPageInfo(item);
    if (itemProfilePicUrl && !detectedProfilePicUrl) {
      detectedProfilePicUrl = itemProfilePicUrl;
    }

    // Never fallback to a database UUID! (BUG-12 mitigation)
    const pageId =
      itemPageId ||
      (isNumericString(pageRecord?.pageId) ? pageRecord!.pageId! : "0");

    if (pageId && pageId !== "0" && !detectedPageId) {
      detectedPageId = pageId;
    }

    const pageName =
      itemPageName ||
      (pageRecord?.displayName && !pageRecord.displayName.startsWith("http") ? pageRecord.displayName : null) ||
      (pageId !== "0" ? `Page ${pageId}` : "Unknown Brand");

    if (pageName && !detectedPageName) {
      detectedPageName = pageName;
    }

    // Track unique Meta Page IDs in this scan
    if (itemPageId && itemPageId !== "0") {
      const existing = discoveredPagesMap.get(itemPageId);
      if (existing) {
        existing.adCount += 1;
        if (!existing.pageName && itemPageName) existing.pageName = itemPageName;
      } else {
        discoveredPagesMap.set(itemPageId, { pageId: itemPageId, pageName: itemPageName, adCount: 1 });
      }
    }

    const caption =
      item.caption ||
      item.ad_creative_body ||
      item.body ||
      item.snapshot?.body?.text ||
      null;

    const title =
      item.title ||
      item.ad_creative_link_title ||
      item.snapshot?.title ||
      null;

    const ctaText =
      item.ctaText ||
      item.cta_text ||
      item.snapshot?.cta_text ||
      null;

    const cards = Array.isArray(item.snapshot?.cards)
      ? item.snapshot.cards
      : Array.isArray(item.cards)
      ? item.cards
      : [];
    const primaryCardUrl = cards[0]?.link_url ? resolveDestinationUrl(cards[0].link_url) : null;
    const topLevelUrl = resolveDestinationUrl(
      item.linkUrl ||
      item.target_url ||
      item.snapshot?.link_url ||
      null
    );

    // Prioritize deep product-page candidate across primary card and top-level URL
    let effectiveLinkUrl: string | null = null;
    const directCandidates = [primaryCardUrl, topLevelUrl].filter(Boolean) as string[];
    if (directCandidates.length > 0) {
      const bestCandidate = selectBestProductCandidateUrl(directCandidates);
      effectiveLinkUrl = bestCandidate?.url || topLevelUrl || primaryCardUrl;
    }

    const isSocialOrMissing =
      !effectiveLinkUrl ||
      effectiveLinkUrl.includes("wa.me") ||
      effectiveLinkUrl.includes("whatsapp.com") ||
      effectiveLinkUrl.includes("m.me") ||
      effectiveLinkUrl.includes("facebook.com");

    if (isSocialOrMissing && caption) {
      const rawMatches = caption.match(/https?:\/\/[^\s"'<>)\]]+/gi) || [];
      if (rawMatches.length > 0) {
        const candidate = selectBestProductCandidateUrl(rawMatches);
        if (candidate && candidate.source === "product_page") {
          effectiveLinkUrl = candidate.url;
        }
      }
    }

    const startedRunningOn = parseAdStartDate(item);
    const { mediaType, mediaUrls: rawMediaUrls, thumbnailUrl: rawThumbnailUrl } = extractMedia(item);
    const duplicationCount = Math.max(1, Number(item.duplicationCount || item.collatedCount || 1));

    // 1. Strict Ad De-duplication: Upsert canonical ad record by adArchiveId immediately
    // Preserves permanent Backblaze B2 URLs using SQL conditional expressions (BUG-11 mitigation)
    const [upsertedAd] = await db
      .insert(ads)
      .values({
        adArchiveId,
        pageId,
        pageName,
        startedRunningOn,
        caption,
        title,
        ctaText,
        linkUrl: effectiveLinkUrl,
        mediaType,
        mediaUrls: rawMediaUrls,
        thumbnailUrl: rawThumbnailUrl,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: ads.adArchiveId,
        set: {
          pageName: sql`COALESCE(EXCLUDED.page_name, ${ads.pageName})`,
          caption: sql`COALESCE(EXCLUDED.caption, ${ads.caption})`,
          title: sql`COALESCE(EXCLUDED.title, ${ads.title})`,
          ctaText: sql`COALESCE(EXCLUDED.cta_text, ${ads.ctaText})`,
          mediaType: sql`COALESCE(EXCLUDED.media_type, ${ads.mediaType})`,
          mediaUrls: sql`CASE 
            WHEN EXISTS (SELECT 1 FROM unnest(${ads.mediaUrls}) AS u WHERE u LIKE '%b2%' OR u LIKE '%backblazeb2%') THEN ${ads.mediaUrls}
            ELSE COALESCE(EXCLUDED.media_urls, ${ads.mediaUrls})
          END`,
          thumbnailUrl: sql`CASE 
            WHEN ${ads.thumbnailUrl} LIKE '%b2%' OR ${ads.thumbnailUrl} LIKE '%backblazeb2%' THEN ${ads.thumbnailUrl}
            ELSE COALESCE(EXCLUDED.thumbnail_url, ${ads.thumbnailUrl})
          END`,
          lastSeenAt: now,
          updatedAt: now,
          isArchived: false,
          archivedAt: null,
        },
      })
      .returning({ id: ads.id });

    // 2. Best-effort background Backblaze B2 media backup (tracked in drain queue)
    if (isB2Configured()) {
      registerPendingB2Upload(
        (async () => {
          try {
            let updatedMediaUrls = rawMediaUrls;
            let updatedThumb = rawThumbnailUrl;
            let detectedMediaHash: string | null = null;
            let detectedPerceptualHash: string | null = null;
            let hasChange = false;

            // 1. Process all media assets (Videos, Image Ads, Carousel cards)
            if (rawMediaUrls.length > 0) {
              const storedMediaUrls = await Promise.all(
                rawMediaUrls.map(async (url, idx) => {
                  if (url.includes("backblazeb2.com") || url.includes("/api/spy/b2-media") || url.includes("files.catbox.moe")) return url;
                  const isUrlVid =
                    mediaType === "video" ||
                    url.includes(".mp4") ||
                    url.includes("/videos/") ||
                    url.includes("video.") ||
                    url.includes("fbcdn.net/o1/v/");
                  
                  // Skip uploading heavy full MP4 to storage to save 99.8% bandwidth & storage
                  if (isUrlVid) return url;

                  const uploadRes = await uploadMediaWithHashing(url, "images", `${adArchiveId}_${idx}`).catch(() => null);
                  if (uploadRes?.url) {
                    hasChange = true;
                    if (uploadRes.mediaHash && !detectedMediaHash) detectedMediaHash = uploadRes.mediaHash;
                    if (uploadRes.perceptualHash && !detectedPerceptualHash) detectedPerceptualHash = uploadRes.perceptualHash;
                    return uploadRes.url;
                  }
                  return url;
                })
              );
              updatedMediaUrls = storedMediaUrls;
            }

            // 2. Process Thumbnail / Image media
            if (rawThumbnailUrl) {
              if (!rawThumbnailUrl.includes("backblazeb2.com") && !rawThumbnailUrl.includes("/api/spy/b2-media")) {
                const thumbRes = await uploadMediaWithHashing(rawThumbnailUrl, "thumbnails", adArchiveId).catch(() => null);
                if (thumbRes?.url) {
                  updatedThumb = thumbRes.url;
                  if (thumbRes.mediaHash && !detectedMediaHash) detectedMediaHash = thumbRes.mediaHash;
                  if (thumbRes.perceptualHash) detectedPerceptualHash = thumbRes.perceptualHash;
                  hasChange = true;
                }
              }
            }

            if (hasChange || detectedMediaHash || detectedPerceptualHash) {
              const updatePayload: Record<string, any> = {
                mediaUrls: updatedMediaUrls,
                thumbnailUrl: updatedThumb,
                updatedAt: new Date(),
              };
              if (updatedThumb && (updatedThumb.includes("b2") || updatedThumb.includes("backblaze"))) {
                updatePayload.thumbnailStoragePath = `b2/thumbnails/${detectedMediaHash || adArchiveId}.webp`;
              }
              if (detectedMediaHash) updatePayload.mediaHash = detectedMediaHash;
              if (detectedPerceptualHash) updatePayload.perceptualHash = detectedPerceptualHash;
              await db
                .update(ads)
                .set(updatePayload)
                .where(eq(ads.adArchiveId, adArchiveId));
            }
          } catch {}
        })()
      );
    }

    if (upsertedAd) {
      // 2a. Check prior observation from a previous scan to detect velocity jumps
      let priorDuplication: number | undefined = undefined;
      try {
        const priorObs = await db.query.adObservations.findFirst({
          where: and(
            eq(adObservations.adId, upsertedAd.id),
            ne(adObservations.creativeScanId, creativeScanId)
          ),
          orderBy: [desc(adObservations.observedAt)],
        });
        if (priorObs) {
          priorDuplication = priorObs.duplicationCount;
        }
      } catch {}

      // 2b. Strict Observation De-duplication: Check if observation already exists for (creativeScanId, adId)
      const existingObservation = await db.query.adObservations.findFirst({
        where: and(
          eq(adObservations.creativeScanId, creativeScanId),
          eq(adObservations.adId, upsertedAd.id)
        ),
      });

      if (existingObservation) {
        // Update duplication count and ensure isActive: true
        await db
          .update(adObservations)
          .set({
            duplicationCount: Math.max(duplicationCount, existingObservation.duplicationCount),
            isActive: true,
            observedAt: now,
          })
          .where(eq(adObservations.id, existingObservation.id));
      } else {
        // Insert new observation record
        await db.insert(adObservations).values({
          creativeScanId,
          adId: upsertedAd.id,
          trackedPageId,
          isActive: true,
          duplicationCount,
          observedAt: now,
        });
      }

      // Also reactivate all observations for this ad so legacy inactive observations don't shadow active status
      await db
        .update(adObservations)
        .set({ isActive: true })
        .where(and(eq(adObservations.adId, upsertedAd.id), eq(adObservations.isActive, false)));

      // 2c. Check for Breakout Velocity Alert (e.g. 1 -> 3+ copies in <= 7d)
      if (duplicationCount >= 3) {
        checkAndRecordBreakout({
          adId: upsertedAd.id,
          adArchiveId,
          pageId: (pageId && !pageId.includes("-")) ? pageId : (detectedPageId && !detectedPageId.includes("-") ? detectedPageId : ""),
          brandName: pageName || pageRecord?.displayName || "Brand",
          trackedPageId,
          currentDuplication: duplicationCount,
          prevDuplication: priorDuplication ?? existingObservation?.duplicationCount,
          startedRunningOn,
          firstSeenAt: now,
          lastSeenAt: now,
          mediaType,
          linkUrl: effectiveLinkUrl,
          isActive: true,
        }).catch((err) => console.warn("[Apify Ingest] Breakout check error:", err));
      }

      // 3. Automated Product Landing Page Extraction & Background Scraper Trigger
      if (effectiveLinkUrl) {
        try {
          const effectiveWsId = pageRecord?.workspaceId || null;
          const prodRes = await linkAndAutoScrapeProduct({
            adId: upsertedAd.id,
            linkUrl: effectiveLinkUrl,
            pageId: (pageId && !pageId.includes("-")) ? pageId : (detectedPageId && !detectedPageId.includes("-") ? detectedPageId : null),
            adCopy: caption,
            workspaceId: effectiveWsId,
          });
          if (prodRes?.isNew) {
            newProductsCount++;
          }
        } catch (e: any) {
          console.warn(`[Apify Ingest] Auto-scrape product warning for ${adArchiveId}:`, e.message);
        }
      }

      extractedCount++;
    }
  }

  // Determine if this scan is an explicit Full Page Scan (Runs archival reconciliation for official page targets)
  let config: any = {};
  try {
    config = JSON.parse(scanRecord.configSnapshot || "{}");
  } catch {}

  const isOfficialPageTarget = Boolean(
    pageRecord && (
      pageRecord.searchType === "page" ||
      (pageRecord.pageId && pageRecord.pageId !== "0" && !pageRecord.pageId.includes(" "))
    )
  );

  const isExplicitDelta = Boolean(config.isFullScan === false || config.isDeltaScan === true);
  const isFullScan = !isExplicitDelta && Boolean(
    config.isFullScan === true ||
    config.mode === "drawer_bulk_refresh" ||
    (isOfficialPageTarget && !config.delta)
  );

  // Require non-empty items OR explicit zero-state flag to prevent actor errors/empty payloads from wiping active ads
  if (isFullScan && (items.length > 0 || config.isVerifiedZeroState === true)) {
    const currentlyObservedArchiveIds = new Set<string>();
    for (const item of items) {
      const archiveId = extractAdArchiveId(item);
      if (archiveId && archiveId !== "0") {
        currentlyObservedArchiveIds.add(archiveId);
      }
    }

    const { reconcileArchivedAds } = await import("@/lib/ad-reconciliation");
    await reconcileArchivedAds(trackedPageId, creativeScanId, currentlyObservedArchiveIds, now, {
      isVerifiedZeroState: Boolean(config.isVerifiedZeroState === true),
      isFullScan: true,
    });
  }

  // Update creative scan record
  await db
    .update(creativeScans)
    .set({
      status: "completed",
      extractedCount,
      finishedAt: now,
      outcomeDetails: `Successfully extracted ${extractedCount} ad(s) via Apify Cloud${isFullScan ? " (Full Page Scan & Reconciliation Completed)" : ""}`,
    })
    .where(eq(creativeScans.id, creativeScanId));

  // Multi-Page vs Single-Page Brand Resolution
  const candidatePages = Array.from(discoveredPagesMap.values());

  const shouldUpdateProfilePic =
    Boolean(detectedProfilePicUrl) &&
    detectedProfilePicUrl !== pageRecord?.profilePicUrl &&
    (!pageRecord?.profilePicUrl ||
      pageRecord.profilePicUrl.includes("fbcdn.net") ||
      pageRecord.profilePicUrl.includes("facebook.com"));

  // Initialize tracked page updates object
  const pageUpdates: any = {
    status: (pageRecord?.holdStatus === "on_hold" || pageRecord?.holdStatus === "inactive") && extractedCount === 0
      ? (pageRecord?.status || "success")
      : "success",
    ...(extractedCount > 0 && (pageRecord?.holdStatus === "on_hold" || pageRecord?.holdStatus === "inactive")
      ? { holdStatus: "active", consecutiveZeroScans: 0, lastKnownValidResults: null }
      : {}),
    lastCreativeScan: now,
    ...(shouldUpdateProfilePic ? { profilePicUrl: detectedProfilePicUrl } : {}),
    updatedAt: now,
  };

  if (shouldUpdateProfilePic && pageRecord?.brandDomainId) {
    try {
      await db
        .update(brandDomains)
        .set({ profilePicUrl: detectedProfilePicUrl, updatedAt: now })
        .where(
          and(
            eq(brandDomains.id, pageRecord.brandDomainId),
            or(
              isNull(brandDomains.profilePicUrl),
              eq(brandDomains.profilePicUrl, ""),
              sql`${brandDomains.profilePicUrl} LIKE '%fbcdn.net%'`,
              sql`${brandDomains.profilePicUrl} LIKE '%facebook.com%'`
            )
          )
        );
    } catch {}
  }

  if (candidatePages.length > 1 && pageRecord && pageRecord.searchType !== "page") {
    pageUpdates.discoveredPagesCount = candidatePages.length;
  }

  // Update tracked page metadata (status, timestamps, candidate counts)
  if (pageRecord && (!pageRecord.pageId || pageRecord.pageId === "0") && detectedPageId && isNumericString(detectedPageId)) {
    pageUpdates.pageId = detectedPageId;
    if (detectedPageName && (!pageRecord.displayName || pageRecord.displayName.startsWith("http"))) {
      pageUpdates.displayName = detectedPageName;
    }

    // Backfill any ads in this scan that had page_id = '0'
    try {
      await db.execute(sql`
        UPDATE ads
        SET page_id = ${detectedPageId},
            page_name = COALESCE(NULLIF(${detectedPageName || null}, ''), page_name),
            updated_at = NOW()
        WHERE (page_id = '0' OR page_id IS NULL OR page_id = '')
          AND id IN (
            SELECT ad_id FROM ad_observations WHERE tracked_page_id = ${trackedPageId}
          )
      `);
    } catch (adErr) {
      console.warn("[Apify Ingest] Non-fatal error backfilling ads with detectedPageId:", adErr);
    }

    // Backfill any unlinked scraped products for this domain
    const targetDomain = pageRecord.landingPage || pageRecord.displayName;
    if (targetDomain && targetDomain.includes(".")) {
      try {
        await db.execute(sql`
          UPDATE scraped_products
          SET page_id = COALESCE(page_id, ${detectedPageId}),
              workspace_id = COALESCE(${pageRecord.workspaceId || null}, workspace_id),
              brand_domain_id = COALESCE(${pageRecord.brandDomainId || null}, brand_domain_id),
              updated_at = NOW()
          WHERE (lower(domain) = ${targetDomain.toLowerCase().trim()} OR url ILIKE ${`%${targetDomain.trim()}%`})
            AND (page_id IS NULL OR page_id = '0' OR workspace_id IS NULL OR workspace_id != ${pageRecord.workspaceId})
        `);
      } catch (prodErr) {
        console.warn("[Apify Ingest] Non-fatal error backfilling scraped_products:", prodErr);
      }
    }

    if (pageRecord.workspaceId) {
      try {
        await db.execute(sql`
          UPDATE scraped_products
          SET workspace_id = ${pageRecord.workspaceId},
              brand_domain_id = COALESCE(${pageRecord.brandDomainId || null}, brand_domain_id),
              updated_at = NOW()
          WHERE page_id = ${detectedPageId}
            AND (workspace_id IS NULL OR workspace_id != ${pageRecord.workspaceId})
        `);
      } catch (prodErr) {
        console.warn("[Apify Ingest] Non-fatal error syncing scraped_products workspace_id by page_id:", prodErr);
      }
    }
  }

  await db
    .update(trackedPages)
    .set(pageUpdates)
    .where(eq(trackedPages.id, trackedPageId));

  let finalTrackedPageId = trackedPageId;

  if (pageRecord && pageRecord.searchType !== "page") {
    if (candidatePages.length === 1) {
      const single = candidatePages[0];
      console.log(`[Apify Ingest] Exact match resolved to single Meta Page ID "${single.pageId}" (${single.pageName}). Auto-merging...`);
      const { mergeExactMatchWithPageId } = await import("@/actions/merge-pages");
      const mergeResult = await mergeExactMatchWithPageId(trackedPageId, single.pageId, single.pageName);

      if (mergeResult?.mergedPageId) {
        finalTrackedPageId = mergeResult.mergedPageId;
      }

      const { logPageMergedNotification } = await import("@/lib/notifications");
      await logPageMergedNotification({
        trackedPageId: finalTrackedPageId,
        originalName: pageRecord.displayName || pageRecord.url,
        resolvedPageName: single.pageName || `Page ${single.pageId}`,
        resolvedPageId: single.pageId,
      });
    } else if (candidatePages.length > 1) {
      console.log(`[Apify Ingest] Multi-page detected: ${candidatePages.length} Facebook Pages detected for "${pageRecord.displayName || pageRecord.url}".`);

      const targetDomain = pageRecord.landingPage || pageRecord.displayName || pageRecord.url;
      try {
        const { getOrCreateBrandDomain, linkPageToDomain } = await import("@/lib/domain-portfolio");
        const bDomain = await getOrCreateBrandDomain(targetDomain, pageRecord.displayName, pageRecord.workspaceId);

        // Fetch app settings for autoDomainLink
        const { appSettings } = await import("@/db/schema");
        const settings = await db.query.appSettings.findFirst({
          where: eq(appSettings.id, "default"),
        });

        const shouldAutoLink = settings?.autoDomainLink ?? true;

        if (shouldAutoLink) {
          // Link the current domain record as satellite
          await linkPageToDomain(trackedPageId, bDomain.id, "satellite");

          // Sort candidates by ad count descending
          const sortedCandidates = [...candidatePages].sort((a, b) => (b.adCount || 0) - (a.adCount || 0));

          let linkedCount = 0;
          let primaryName = "";

          for (let i = 0; i < sortedCandidates.length; i++) {
            const cand = sortedCandidates[i];
            const isPrimary = i === 0;

            const existingSister = await db.query.trackedPages.findFirst({
              where: eq(trackedPages.pageId, cand.pageId),
            });

            if (!existingSister) {
              const pageCountry = pageRecord.country || "ALL";
              const newPageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${cand.pageId}&search_type=page&media_type=all`;
              await db
                .insert(trackedPages)
                .values({
                  url: newPageUrl,
                  pageId: cand.pageId,
                  displayName: cand.pageName || `Page ${cand.pageId}`,
                  searchType: "page",
                  country: pageCountry,
                  brandDomainId: bDomain.id,
                  workspaceId: pageRecord.workspaceId,
                  pageRole: isPrimary ? "primary" : "satellite",
                  canonicalDomain: bDomain.domain,
                  status: "success",
                  currentResults: cand.adCount || 0,
                  lastChecked: now,
                  lastSuccessAt: now,
                  lastCreativeScan: now,
                });
              linkedCount++;
              if (isPrimary) primaryName = cand.pageName || `Page ${cand.pageId}`;
            } else {
              await linkPageToDomain(existingSister.id, bDomain.id, isPrimary ? "primary" : "satellite");
              linkedCount++;
              if (isPrimary) primaryName = existingSister.displayName || `Page ${cand.pageId}`;
            }
          }

          // Clear candidate alert badge since pages are now linked
          await db
            .update(trackedPages)
            .set({ discoveredPagesCount: 0, updatedAt: now })
            .where(eq(trackedPages.id, trackedPageId));

          const { logDomainPortfolioLinkedNotification } = await import("@/lib/notifications");
          await logDomainPortfolioLinkedNotification({
            trackedPageId,
            domainName: bDomain.domain,
            brandDomainId: bDomain.id,
            pageCount: linkedCount,
            primaryPageName: primaryName || bDomain.displayName,
          });
        } else {
          // If autoDomainLink is disabled, post warning notification for user manual resolution
          const { logMultiPageDetectedNotification } = await import("@/lib/notifications");
          await logMultiPageDetectedNotification({
            trackedPageId,
            domainName: pageRecord.displayName || pageRecord.url,
            candidatePages,
          });
        }
      } catch (domainErr) {
        console.warn("[Apify Ingest] Error auto-linking domain portfolio:", domainErr);
        const { logMultiPageDetectedNotification } = await import("@/lib/notifications");
        await logMultiPageDetectedNotification({
          trackedPageId,
          domainName: pageRecord.displayName || pageRecord.url,
          candidatePages,
        });
      }
    }
  }

  // Update tracked page stored adCount and pair latest count scan with this creative scan
  try {
    const { scanHistory } = await import("@/db/schema");
    const [activeCountRes] = await db
      .select({ count: sql<number>`count(distinct ${adObservations.adId})` })
      .from(adObservations)
      .where(
        and(
          eq(adObservations.trackedPageId, finalTrackedPageId),
          eq(adObservations.isActive, true)
        )
      );

    const activeAdCount = Number(activeCountRes?.count || 0);

    // Update trackedPages.adCount (stored DB creative count) without modifying currentResults (live Meta search count)
    await db
      .update(trackedPages)
      .set({
        adCount: activeAdCount > 0 ? activeAdCount : pageRecord?.adCount ?? 0,
        lastSuccessAt: now,
        status: (pageRecord?.holdStatus === "on_hold" || pageRecord?.holdStatus === "inactive") && activeAdCount === 0
          ? (pageRecord?.status || "success")
          : "success",
        ...(activeAdCount > 0 && (pageRecord?.holdStatus === "on_hold" || pageRecord?.holdStatus === "inactive")
          ? { holdStatus: "active", consecutiveZeroScans: 0, lastKnownValidResults: null }
          : {}),
        updatedAt: now,
      })
      .where(eq(trackedPages.id, finalTrackedPageId));

    // Pair latest scanHistory entry with this creative scan date without injecting fake count results
    const latestScan = await db.query.scanHistory.findFirst({
      where: eq(scanHistory.trackedPageId, finalTrackedPageId),
      orderBy: [desc(scanHistory.checkedAt)],
      columns: { id: true },
    });
    if (latestScan) {
      await db
        .update(scanHistory)
        .set({ creativeScannedAt: now })
        .where(eq(scanHistory.id, latestScan.id));
    }
  } catch (err) {
    console.error("[Apify Ingest] Error updating ad count and pairing creative scan:", err);
  }

  // Log central Ad Spy notification
  const { logAdSpyNotification } = await import("@/lib/notifications");
  await logAdSpyNotification({
    trackedPageId: finalTrackedPageId,
    brandName: detectedPageName || pageRecord?.displayName || "Tracked Brand",
    extractedCount,
    isFullScan,
    newProductsCount,
    pageId: detectedPageId || pageRecord?.pageId || null,
  });

  return { success: true, extractedCount, newProductsCount };
}

