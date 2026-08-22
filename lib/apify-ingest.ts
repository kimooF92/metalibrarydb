import { db } from "@/db";
import { ads, adObservations, creativeScans, trackedPages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { uploadMediaFromUrlToB2, isB2Configured } from "@/lib/b2-storage";

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
      const previewImg = vid.video_preview_image_url;
      if (previewImg && typeof previewImg === "string" && !preferredThumbnail) {
        preferredThumbnail = previewImg;
      }

      const vidUrl = vid.video_hd_url || vid.video_sd_url || previewImg;
      if (vidUrl && typeof vidUrl === "string") {
        hasVideoSource = true;
        if (!urls.includes(vidUrl)) urls.push(vidUrl);
      }
    }
  }

  // Determine media type
  let mediaType: "image" | "video" | "carousel" | "unknown" = "unknown";
  if (hasVideoSource || item.video_hd_url) {
    mediaType = "video";
  } else if (urls.length > 1) {
    mediaType = "carousel";
  } else if (urls.length === 1) {
    mediaType = "image";
  }

  // Thumbnail fallback
  const thumbnailUrl =
    preferredThumbnail ||
    urls[0] ||
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

  const trackedPageId = scanRecord.trackedPageId;
  const pageRecord = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, trackedPageId),
  });

  const now = new Date();
  let extractedCount = 0;
  let detectedPageId: string | null = null;
  let detectedPageName: string | null = null;

  for (const item of items) {
    const adArchiveId = extractAdArchiveId(item);
    if (!adArchiveId || adArchiveId === "0") continue;

    const rawPageId = String(
      item.pageId || item.page_id || pageRecord?.pageId || "0"
    ).trim();

    const pageId = rawPageId !== "0" ? rawPageId : (pageRecord?.pageId || "0");
    if (pageId && pageId !== "0" && !detectedPageId) {
      detectedPageId = pageId;
    }

    const pageName =
      item.pageName || item.page_name || pageRecord?.displayName || `Page ${pageId}`;

    if (pageName && !detectedPageName) {
      detectedPageName = pageName;
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

    // Best-effort Backblaze B2 media backup
    let mediaUrls = rawMediaUrls;
    let thumbnailUrl = rawThumbnailUrl;

    if (isB2Configured()) {
      if (mediaType === "video" && rawMediaUrls.length > 0) {
        const b2VideoUrls = await Promise.all(
          rawMediaUrls.map(async (url, idx) => {
            if (url.includes("backblazeb2.com") || url.includes("/api/spy/b2-media")) return url;
            const b2Url = await uploadMediaFromUrlToB2(url, "videos", `${adArchiveId}_${idx}`);
            return b2Url || url;
          })
        );
        mediaUrls = b2VideoUrls;
      }

      if (rawThumbnailUrl && !rawThumbnailUrl.includes("backblazeb2.com") && !rawThumbnailUrl.includes("/api/spy/b2-media")) {
        const b2Thumb = await uploadMediaFromUrlToB2(rawThumbnailUrl, "thumbnails", adArchiveId);
        if (b2Thumb) thumbnailUrl = b2Thumb;
      }
    }

    // 1. Strict Ad De-duplication: Upsert canonical ad record by adArchiveId
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
        mediaUrls,
        thumbnailUrl,
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

  // Update tracked page
  const pageUpdates: any = {
    lastCreativeScan: now,
    updatedAt: now,
  };

  // If pageId was missing on tracked_pages, populate it from Apify extracted item
  if (pageRecord && (!pageRecord.pageId || pageRecord.pageId === "0") && detectedPageId) {
    pageUpdates.pageId = detectedPageId;
    if (detectedPageName && (!pageRecord.displayName || pageRecord.displayName.startsWith("http"))) {
      pageUpdates.displayName = detectedPageName;
    }
  }

  await db
    .update(trackedPages)
    .set(pageUpdates)
    .where(eq(trackedPages.id, trackedPageId));

  return { success: true, extractedCount };
}
