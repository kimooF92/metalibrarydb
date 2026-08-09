import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, creativeScans, trackedPages } from "@/db/schema";
import { fetchApifyDatasetItems } from "@/lib/apify";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Robustly extracts adArchiveId from multiple candidate fields & URL parameters.
 */
function extractAdArchiveId(item: any): string {
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
function extractMedia(item: any): {
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

    const trackedPageId = scanRecord.trackedPageId;
    const pageRecord = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, trackedPageId),
    });

    const now = new Date();
    let extractedCount = 0;

    for (const item of items) {
      const adArchiveId = extractAdArchiveId(item);

      if (!adArchiveId || adArchiveId === "0") continue;

      const pageId = String(
        item.pageId || item.page_id || pageRecord?.pageId || "0"
      ).trim();

      const pageName =
        item.pageName || item.page_name || pageRecord?.displayName || `Page ${pageId}`;

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

      let startedRunningOn: Date | null = null;
      if (item.startedRunningOn || item.startDate || item.start_date || item.start_date_formatted || item.snapshot?.creation_time) {
        const rawDate = item.startedRunningOn || item.startDate || item.start_date || item.start_date_formatted || item.snapshot?.creation_time;
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) startedRunningOn = parsed;
      }

      const { mediaType, mediaUrls, thumbnailUrl } = extractMedia(item);

      // Upsert canonical ad record
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
            pageName,
            caption: sql`COALESCE(EXCLUDED.caption, ${ads.caption})`,
            title: sql`COALESCE(EXCLUDED.title, ${ads.title})`,
            ctaText: sql`COALESCE(EXCLUDED.cta_text, ${ads.ctaText})`,
            mediaType: sql`COALESCE(EXCLUDED.media_type, ${ads.mediaType})`,
            mediaUrls: sql`COALESCE(EXCLUDED.media_urls, ${ads.mediaUrls})`,
            thumbnailUrl: sql`COALESCE(EXCLUDED.thumbnail_url, ${ads.thumbnailUrl})`,
            lastSeenAt: now,
            updatedAt: now,
          },
        })
        .returning();

      if (upsertedAd) {
        // Insert observation record
        await db.insert(adObservations).values({
          creativeScanId,
          adId: upsertedAd.id,
          trackedPageId,
          isActive: true,
          duplicationCount: Number(item.duplicationCount || item.collatedCount || 1),
          observedAt: now,
        });

        extractedCount++;
      }
    }

    // Update creative scan completion
    await db
      .update(creativeScans)
      .set({
        status: "completed",
        extractedCount,
        finishedAt: now,
        outcomeDetails: `Successfully extracted ${extractedCount} ad(s) via Apify Delta Cloud`,
      })
      .where(eq(creativeScans.id, creativeScanId));

    // Update tracked page last creative scan timestamp
    await db
      .update(trackedPages)
      .set({
        lastCreativeScan: now,
        updatedAt: now,
      })
      .where(eq(trackedPages.id, trackedPageId));

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
