import { db } from "@/db";
import { ads, adObservations, creativeScans, trackedPages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { uploadMediaFromUrlToB2, uploadMediaWithHashing, uploadStoryboardFrames, isB2Configured } from "@/lib/b2-storage";
import { extractStoryboardFrames } from "@/lib/video-storyboard";
import { linkAndAutoScrapeProduct } from "@/lib/product-ingest";

/**
 * Robustly extracts adArchiveId from multiple candidate fields & URL parameters.
 */
export function extractAdArchiveId(item: any): string {
  const direct = String(
    item.adArchiveId ||
    item.ad_archive_id ||
    item.archiveId ||
    item.id ||
    item.ad_id ||
    item.snapshot?.ad_archive_id ||
    ""
  ).trim();

  if (direct && direct !== "0") return direct;

  // Extract from ad_library_url (e.g. https://www.facebook.com/ads/library/?id=1497424319087029)
  const urlToParse = item.ad_library_url || item.url || "";
  const match = urlToParse.match(/[?&]id=(\d+)/);
  if (match && match[1]) {
    return match[1];
  }

  return "";
}

/**
 * Extracts and normalizes media URLs from Meta Ad Library JSON items (including Dynamic Creatives, Carousels & Video previews)
 */
export function extractMedia(item: any): {
  mediaType: "image" | "video" | "carousel" | "unknown";
  mediaUrls: string[];
  thumbnailUrl: string | null;
} {
  const urls: string[] = [];
  let preferredThumbnail: string | null = null;

  // 1. Check top-level direct fields
  const topMedia = item.media_url || item.image_url || item.display_url || item.imageUrl;
  if (topMedia && typeof topMedia === "string") urls.push(topMedia);

  const topVideo = item.video_url || item.video_hd_url || item.video_sd_url || item.videoUrl;
  if (topVideo && typeof topVideo === "string" && !urls.includes(topVideo)) urls.push(topVideo);

  // 2. Check snapshot cards array (Carousels and Dynamic Creatives)
  const cards = item.snapshot?.cards || item.cards || item.ad_creative_cards || [];
  if (Array.isArray(cards)) {
    for (const card of cards) {
      const cardMedia =
        card.original_image_url ||
        card.resized_image_url ||
        card.video_preview_image_url ||
        card.video_hd_url ||
        card.video_sd_url ||
        card.image_url;
      if (cardMedia && typeof cardMedia === "string" && !urls.includes(cardMedia)) {
        urls.push(cardMedia);
      }
    }
  }

  // 3. Check snapshot images array
  const images = item.snapshot?.images || item.images || [];
  if (Array.isArray(images)) {
    for (const img of images) {
      const imgUrl =
        img.original_image_url ||
        img.resized_image_url ||
        img.url ||
        img.watermarked_resized_image_url;
      if (imgUrl && typeof imgUrl === "string" && !urls.includes(imgUrl)) {
        urls.push(imgUrl);
      }
    }
  }

  // 4. Check snapshot videos array
  const videos = item.snapshot?.videos || item.videos || [];
  let hasVideoSource = Boolean(topVideo);
  if (Array.isArray(videos)) {
    for (const vid of videos) {
      const previewImg = vid.video_preview_image_url || vid.preview_url;
      if (previewImg && typeof previewImg === "string" && !preferredThumbnail) {
        preferredThumbnail = previewImg;
      }

      const vidUrl = vid.video_hd_url || vid.video_sd_url || vid.url;
      if (vidUrl && typeof vidUrl === "string") {
        hasVideoSource = true;
        if (!urls.includes(vidUrl)) urls.push(vidUrl);
      }
    }
  }

  // Determine media type
  let mediaType: "image" | "video" | "carousel" | "unknown" = "unknown";
  if (hasVideoSource || item.video_hd_url || urls.some((u) => u.includes(".mp4") || u.includes("/videos/") || u.includes("video."))) {
    mediaType = "video";
  } else if (urls.length > 1) {
    mediaType = "carousel";
  } else if (urls.length === 1) {
    mediaType = "image";
  }

  // Thumbnail fallback (always prioritize image over video file)
  const firstNonVideoUrl = urls.find((u) => !u.includes(".mp4") && !u.includes("/videos/"));
  const thumbnailUrl =
    preferredThumbnail ||
    firstNonVideoUrl ||
    item.snapshot?.page_profile_picture_url ||
    item.pageProfilePictureUrl ||
    null;

  return { mediaType, mediaUrls: urls, thumbnailUrl };
}

/**
 * Parses ad launch date safely, handling Unix timestamps in seconds vs milliseconds.
 */
export function parseAdStartDate(item: any): Date | null {
  const raw =
    item.startedRunningOn ||
    item.startDate ||
    item.start_date ||
    item.start_date_formatted ||
    item.snapshot?.creation_time;

  if (!raw) return null;

  if (typeof raw === "number" || (/^\d+$/.test(String(raw).trim()))) {
    const num = Number(raw);
    if (!isNaN(num)) {
      const ms = num < 10000000000 ? num * 1000 : num;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(raw);
  return !isNaN(d.getTime()) ? d : null;
}

/**
 * Strict Meta Page ID and Page Name extractor.
 * Strictly extracts real numeric Meta Page IDs (e.g. 104829104820) and clean display names.
 * NEVER returns UUIDs or dummy placeholder strings.
 */
export function extractPageInfo(item: any): { pageId: string | null; pageName: string | null } {
  const isNumericPageId = (str: any) => typeof str === "string" && /^\d{6,25}$/.test(str.trim());

  // Check all candidate keys in Apify dataset item
  const candidateIds = [
    item.pageId,
    item.page_id,
    item.snapshot?.page_id,
    item.publisher_page_id,
    item.snapshot?.publisher_page_id,
    typeof item.page_profile_uri === "string" ? item.page_profile_uri.match(/id=(\d+)/)?.[1] : null,
  ];

  let resolvedPageId: string | null = null;
  for (const cid of candidateIds) {
    if (cid !== undefined && cid !== null) {
      const clean = String(cid).trim();
      if (isNumericPageId(clean)) {
        resolvedPageId = clean;
        break;
      }
    }
  }

  const candidateNames = [
    item.pageName,
    item.page_name,
    item.snapshot?.page_name,
    item.snapshot?.byline,
    item.page_profile_name,
  ];

  let resolvedPageName: string | null = null;
  for (const cname of candidateNames) {
    if (cname && typeof cname === "string") {
      const clean = cname.trim();
      if (
        clean &&
        !clean.startsWith("http://") &&
        !clean.startsWith("https://") &&
        !clean.toLowerCase().startsWith("page ") &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)
      ) {
        resolvedPageName = clean;
        break;
      }
    }
  }

  return {
    pageId: resolvedPageId,
    pageName: resolvedPageName,
  };
}

/**
 * Ingests a list of dataset items returned from Apify into the database.
 * Enforces strict canonical ad de-duplication (by ad_archive_id) and observation de-duplication.
 */
export async function ingestApifyDatasetItems(
  creativeScanId: string,
  items: any[]
): Promise<{ success: boolean; extractedCount: number }> {
  const scanRecord = await db.query.creativeScans.findFirst({
    where: eq(creativeScans.id, creativeScanId),
  });

  if (!scanRecord) {
    throw new Error(`Creative scan record ${creativeScanId} not found.`);
  }

  if (scanRecord.status === "completed") {
    console.log(`[Apify Ingest] Scan ${creativeScanId} is already marked completed. Skipping duplicate ingestion.`);
    return { success: true, extractedCount: scanRecord.extractedCount || 0 };
  }

  const trackedPageId = scanRecord.trackedPageId;
  const pageRecord = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, trackedPageId),
  });

  const now = new Date();
  let extractedCount = 0;
  let detectedPageId: string | null = null;
  let detectedPageName: string | null = null;
  const discoveredPagesMap = new Map<string, { pageId: string; pageName: string | null; adCount: number }>();

  const isNumericString = (str?: string | null) => Boolean(str && /^\d{6,25}$/.test(str.trim()));

  for (const item of items) {
    const adArchiveId = extractAdArchiveId(item);
    if (!adArchiveId || adArchiveId === "0") continue;

    const { pageId: itemPageId, pageName: itemPageName } = extractPageInfo(item);

    // Never fallback to a database UUID!
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

    const linkUrl =
      item.linkUrl ||
      item.target_url ||
      item.snapshot?.link_url ||
      null;

    const startedRunningOn = parseAdStartDate(item);
    const { mediaType, mediaUrls: rawMediaUrls, thumbnailUrl: rawThumbnailUrl } = extractMedia(item);
    const duplicationCount = Math.max(1, Number(item.duplicationCount || item.collatedCount || 1));

    // 1. Strict Ad De-duplication: Upsert canonical ad record by adArchiveId immediately
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
        linkUrl,
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
          mediaUrls: sql`COALESCE(EXCLUDED.media_urls, ${ads.mediaUrls})`,
          thumbnailUrl: sql`COALESCE(EXCLUDED.thumbnail_url, ${ads.thumbnailUrl})`,
          lastSeenAt: now,
          updatedAt: now,
          isArchived: false,
          archivedAt: null,
        },
      })
      .returning();

    // 2. Best-effort background Backblaze B2 media backup (non-blocking for high speed)
    if (isB2Configured()) {
      (async () => {
        try {
          let updatedMediaUrls = rawMediaUrls;
          let updatedThumb = rawThumbnailUrl;
          let detectedMediaHash: string | null = null;
          let detectedPerceptualHash: string | null = null;
          let detectedStoryboardUrls: string[] | null = null;
          let hasChange = false;

          // 1. Process all media assets (Videos, Image Ads, Carousel cards)
          if (rawMediaUrls.length > 0) {
            const isVideo = mediaType === "video" || rawMediaUrls.some((u) => u.includes(".mp4") || u.includes("/videos/") || u.includes("video.") || u.includes("fbcdn.net/o1/v/"));
            const firstVid = rawMediaUrls.find((u) => u.includes(".mp4") || u.includes("/videos/") || u.includes("video.") || u.includes("fbcdn.net/o1/v/"));

            // 1a. Extract 5-shot storyboard frames for video ad hover scrubbing
            if (isVideo && firstVid) {
              try {
                const frames = await extractStoryboardFrames(firstVid, 5);
                if (frames.length > 0) {
                  const uploaded = await uploadStoryboardFrames(frames, adArchiveId);
                  if (uploaded.length > 0) {
                    detectedStoryboardUrls = uploaded;
                    hasChange = true;
                  }
                }
              } catch (e: any) {
                console.warn(`[Apify Ingest] Storyboard extraction error for ${adArchiveId}:`, e.message);
              }
            }

            const storedMediaUrls = await Promise.all(
              rawMediaUrls.map(async (url, idx) => {
                if (url.includes("backblazeb2.com") || url.includes("/api/spy/b2-media") || url.includes("files.catbox.moe")) return url;
                const isUrlVid = isVideo || url.includes(".mp4");
                
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

          if (hasChange || detectedMediaHash || detectedPerceptualHash || detectedStoryboardUrls) {
            const updatePayload: Record<string, any> = {
              mediaUrls: updatedMediaUrls,
              thumbnailUrl: updatedThumb,
            };
            if (detectedMediaHash) updatePayload.mediaHash = detectedMediaHash;
            if (detectedPerceptualHash) updatePayload.perceptualHash = detectedPerceptualHash;
            if (detectedStoryboardUrls) updatePayload.storyboardUrls = detectedStoryboardUrls;

            await db
              .update(ads)
              .set(updatePayload)
              .where(eq(ads.adArchiveId, adArchiveId));
          }
        } catch {}
      })();
    }

    if (upsertedAd) {
      // 2. Strict Observation De-duplication: Check if observation already exists for (creativeScanId, adId)
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

      // 3. Automated Product Landing Page Extraction & Background Scraper Trigger
      if (linkUrl) {
        linkAndAutoScrapeProduct({
          adId: upsertedAd.id,
          linkUrl,
          pageId: pageId || trackedPageId,
          adCopy: caption,
        }).catch((e) => console.warn(`[Apify Ingest] Auto-scrape product warning for ${adArchiveId}:`, e.message));
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

  // Initialize tracked page updates object
  const pageUpdates: any = {
    status: "success",
    lastCreativeScan: now,
    updatedAt: now,
  };

  if (candidatePages.length > 1 && pageRecord && pageRecord.searchType !== "page") {
    pageUpdates.discoveredPagesCount = candidatePages.length;
  }

  // Update tracked page metadata (status, timestamps, candidate counts)
  if (pageRecord && (!pageRecord.pageId || pageRecord.pageId === "0") && detectedPageId && isNumericString(detectedPageId)) {
    pageUpdates.pageId = detectedPageId;
    if (detectedPageName && (!pageRecord.displayName || pageRecord.displayName.startsWith("http"))) {
      pageUpdates.displayName = detectedPageName;
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
      console.log(`[Apify Ingest] Multi-page conflict: ${candidatePages.length} Facebook Pages detected for "${pageRecord.displayName || pageRecord.url}". Posting multi-page notification for user resolution.`);

      const { logMultiPageDetectedNotification } = await import("@/lib/notifications");
      await logMultiPageDetectedNotification({
        trackedPageId,
        domainName: pageRecord.displayName || pageRecord.url,
        candidatePages,
      });
    }
  }

  // Update tracked page ad count & record scan history entry from verified Apify results
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

    const prevResults = pageRecord?.currentResults ?? null;
    const difference = prevResults !== null ? activeAdCount - prevResults : null;

    await db
      .update(trackedPages)
      .set({
        currentResults: activeAdCount > 0 || isFullScan ? activeAdCount : pageRecord?.currentResults ?? 0,
        adCount: activeAdCount > 0 || isFullScan ? activeAdCount : pageRecord?.adCount ?? 0,
        lastChecked: now,
        lastSuccessAt: now,
        status: "success",
        updatedAt: now,
      })
      .where(eq(trackedPages.id, finalTrackedPageId));

    if (activeAdCount > 0 || isFullScan) {
      await db.insert(scanHistory).values({
        trackedPageId: finalTrackedPageId,
        results: activeAdCount,
        difference,
        checkedAt: now,
        status: "success",
      });
    }
  } catch (err) {
    console.error("[Apify Ingest] Error updating ad count and scan history:", err);
  }

  // Log central Ad Spy notification
  const { logAdSpyNotification } = await import("@/lib/notifications");
  await logAdSpyNotification({
    trackedPageId: finalTrackedPageId,
    brandName: detectedPageName || pageRecord?.displayName || "Tracked Brand",
    extractedCount,
    isFullScan,
    pageId: detectedPageId || pageRecord?.pageId || null,
  });

  return { success: true, extractedCount };
}
