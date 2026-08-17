import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { scrapeSingleAdViaApify, getApifyTokens } from "@/lib/apify";
import { extractMedia } from "@/lib/apify-ingest";
import { uploadMediaFromUrlToB2, isB2Configured } from "@/lib/b2-storage";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing ad ID" }, { status: 400 });
    }

    const [adRecord] = await db.select().from(ads).where(eq(ads.id, id)).limit(1);
    if (!adRecord) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    if (!adRecord.adArchiveId) {
      return NextResponse.json({ error: "Ad lacks archive ID" }, { status: 400 });
    }

    const adArchiveUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${adRecord.adArchiveId}`;

    const tokens = getApifyTokens();
    if (tokens.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Apify API token not configured. View directly on Meta Ad Library.",
        adArchiveUrl,
      });
    }

    console.log(`[Ad Refresh] Requesting fresh media from Apify for Ad ID: ${adRecord.adArchiveId}...`);
    const scrapedItem = await scrapeSingleAdViaApify(adRecord.adArchiveId);

    if (!scrapedItem) {
      return NextResponse.json({
        success: false,
        message: "Apify could not extract fresh media right now. Click 'Watch on Meta Ad Library' to view.",
        adArchiveUrl,
      });
    }

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
      })
      .where(eq(ads.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      ad: updatedAd,
      refreshedVideoUrl: finalVideoUrl,
      refreshedThumbnailUrl: finalThumbnailUrl,
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
