import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { scrapeSingleAdViaApify, getApifyTokens } from "@/lib/apify";
import { extractMedia, extractAdActiveStatus } from "@/lib/apify-ingest";
import { uploadMediaFromUrlToB2, isB2Configured } from "@/lib/b2-storage";
import { deleteByPrefix } from "@/lib/cache-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing ad ID" }, { status: 400 });
    }

    const [adRecord] = await db
      .select({
        id: ads.id,
        adArchiveId: ads.adArchiveId,
        mediaUrls: ads.mediaUrls,
        thumbnailUrl: ads.thumbnailUrl,
        pageId: ads.pageId,
        pageName: ads.pageName,
        caption: ads.caption,
        title: ads.title,
        linkUrl: ads.linkUrl,
        productId: ads.productId,
        mediaType: ads.mediaType,
        startedRunningOn: ads.startedRunningOn,
        firstSeenAt: ads.firstSeenAt,
        lastSeenAt: ads.lastSeenAt,
        isArchived: ads.isArchived,
        archivedAt: ads.archivedAt,
        createdAt: ads.createdAt,
        updatedAt: ads.updatedAt,
      })
      .from(ads)
      .where(eq(ads.id, id))
      .limit(1);

    if (!adRecord) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    if (!adRecord.adArchiveId) {
      return NextResponse.json({ error: "Ad lacks archive ID" }, { status: 400 });
    }

    const adArchiveUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${adRecord.adArchiveId}`;

    // 1. Check if media is already permanently preserved in Backblaze B2 (unless force refresh requested)
    const b2Endpoint = process.env.B2_ENDPOINT || "backblazeb2.com";
    const hasB2Video = adRecord.mediaUrls?.some((u) => u.includes(b2Endpoint) || u.includes("b2/"));
    const hasB2Thumb = adRecord.thumbnailUrl?.includes(b2Endpoint) || adRecord.thumbnailUrl?.includes("b2/");
    const forceRefresh = req.nextUrl.searchParams.get("force") === "true";

    if (hasB2Video && hasB2Thumb && !forceRefresh) {
      const [obs] = await db
        .select({ isActive: adObservations.isActive })
        .from(adObservations)
        .where(eq(adObservations.adId, id))
        .limit(1);

      const isActiveState = obs?.isActive !== null && obs?.isActive !== undefined ? Boolean(obs.isActive) : true;

      return NextResponse.json({
        success: true,
        ad: {
          ...adRecord,
          isActive: isActiveState,
        },
        isActive: isActiveState,
        message: "Media is permanently preserved in Backblaze B2 storage.",
        adArchiveUrl,
      });
    }

    const tokens = getApifyTokens();
    if (tokens.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Apify API token not configured. View directly on Meta Ad Library.",
        adArchiveUrl,
      });
    }

    console.log(`[Ad Refresh] Requesting fresh media and active status from Apify for Ad ID: ${adRecord.adArchiveId}...`);
    const scrapedItem = await scrapeSingleAdViaApify(adRecord.adArchiveId);

    if (!scrapedItem) {
      return NextResponse.json({
        success: false,
        message: "Apify could not extract fresh media right now. Click 'Watch on Meta Ad Library' to view.",
        adArchiveUrl,
      });
    }

    // Extract active/inactive status from Meta payload
    const isAdActive = extractAdActiveStatus(scrapedItem);

    // Extract fresh media URLs from Apify item payload
    const { mediaUrls: extractedUrls, thumbnailUrl: extractedThumb, mediaType } = extractMedia(scrapedItem);

    let finalVideoUrl = extractedUrls.find((u) => u.includes(".mp4") || mediaType === "video") || null;
    let finalThumbnailUrl = extractedThumb || (extractedUrls.length > 0 ? extractedUrls[0] : null);

    // If Backblaze B2 is configured, backup the fresh media immediately
    if (isB2Configured()) {
      if (finalVideoUrl && finalVideoUrl.startsWith("http")) {
        console.log(`[Ad Refresh] Uploading refreshed video to B2 storage: ${finalVideoUrl.substring(0, 60)}...`);
        const b2Vid = await uploadMediaFromUrlToB2(
          finalVideoUrl,
          "videos",
          `${adRecord.adArchiveId}_refreshed_${Date.now()}`
        );
        if (b2Vid) finalVideoUrl = b2Vid;
      }

      if (finalThumbnailUrl && finalThumbnailUrl.startsWith("http")) {
        console.log(`[Ad Refresh] Uploading refreshed thumbnail to B2 storage: ${finalThumbnailUrl.substring(0, 60)}...`);
        const b2Thumb = await uploadMediaFromUrlToB2(
          finalThumbnailUrl,
          "thumbnails",
          `${adRecord.adArchiveId}_refreshed_${Date.now()}`
        );
        if (b2Thumb) finalThumbnailUrl = b2Thumb;
      }
    }

    // 1. Update observation record in DB so isActive is updated in all queries
    await db
      .update(adObservations)
      .set({
        isActive: isAdActive,
        observedAt: new Date(),
      })
      .where(eq(adObservations.adId, id));

    // 2. Invalidate spy ads cache in Redis non-blockingly
    deleteByPrefix("cache:spy_ads:").catch(() => {});

    // 3. Update the canonical ad record
    const updatedMediaUrls = finalVideoUrl
      ? [finalVideoUrl, ...(adRecord.mediaUrls?.filter((u) => u !== finalVideoUrl) || [])]
      : extractedUrls.length > 0
      ? extractedUrls
      : adRecord.mediaUrls;

    const [updatedAd] = await db
      .update(ads)
      .set({
        mediaUrls: updatedMediaUrls,
        thumbnailUrl: finalThumbnailUrl || adRecord.thumbnailUrl,
        updatedAt: new Date(),
        ...(isAdActive ? { lastSeenAt: new Date() } : {}),
      })
      .where(eq(ads.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      ad: {
        ...updatedAd,
        isActive: isAdActive,
      },
      isActive: isAdActive,
      refreshedVideoUrl: finalVideoUrl,
      refreshedThumbnailUrl: finalThumbnailUrl,
      message: isAdActive
        ? "Media refreshed and ad is actively running on Meta."
        : "Media refreshed. Meta confirms ad has ended (inactive).",
    });
  } catch (err: any) {
    console.error("[Ad Refresh Error]:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to refresh ad",
        message: "Could not refresh media. Click 'Watch on Meta Ad Library' to view.",
      },
      { status: 200 }
    );
  }
}
