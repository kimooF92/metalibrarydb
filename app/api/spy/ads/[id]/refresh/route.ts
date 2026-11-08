import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { tasks, runs } from "@trigger.dev/sdk";
import { scrapeSingleAdViaApify, getApifyTokens } from "@/lib/apify";
import { extractMedia, extractAdActiveStatus } from "@/lib/apify-ingest";
import { uploadMediaFromUrlToB2, isB2Configured } from "@/lib/b2-storage";
import { deleteByPrefix } from "@/lib/cache-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s max on platforms supporting it

export interface RefreshAdMediaResult {
  success: boolean;
  adId?: string;
  adArchiveId?: string;
  isActive?: boolean;
  isArchived?: boolean;
  mediaUrls?: string[];
  thumbnailUrl?: string | null;
  refreshedVideoUrl?: string | null;
  refreshedThumbnailUrl?: string | null;
  message?: string;
  error?: string;
}

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
    const searchParams = req.nextUrl?.searchParams || new URL(req.url).searchParams;
    const forceRefresh = searchParams.get("force") === "true";

    if (hasB2Thumb && (hasB2Video || adRecord.mediaType === "image") && !forceRefresh) {
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

    let refreshResult: RefreshAdMediaResult | null = null;

    // 2. PRIMARY: Trigger.dev Cloud Background Task Engine (Zero Apify credits, runs Playwright in Docker)
    if (process.env.TRIGGER_SECRET_KEY) {
      try {
        console.log(`[Ad Refresh] Dispatching Trigger.dev task 'refresh-ad-media' for ad: ${adRecord.adArchiveId}...`);
        const handle = await tasks.trigger("refresh-ad-media", {
          adId: id,
          adArchiveId: adRecord.adArchiveId,
          force: forceRefresh,
        });

        // Safe poll bounded to 25s to prevent Vercel Gateway Timeout (504/500)
        const startTime = Date.now();
        const MAX_WAIT_MS = 25000;
        let pollRun: any = null;

        while (Date.now() - startTime < MAX_WAIT_MS) {
          pollRun = await runs.retrieve(handle.id);
          if (pollRun && pollRun.isCompleted) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        if (pollRun && pollRun.isCompleted && pollRun.output) {
          refreshResult = pollRun.output as RefreshAdMediaResult;
        } else {
          console.warn(`[Ad Refresh] Trigger.dev run ${handle.id} status: ${pollRun?.status || "timed_out"}`);
        }
      } catch (triggerErr: any) {
        console.warn(`[Ad Refresh] Trigger.dev task execution issue (${triggerErr?.message}), falling back to Apify`);
      }
    }

    // 3. FAILOVER: Apify Actor Failover (HTTP API that works 100% on Vercel serverless without Playwright)
    if (!refreshResult || !refreshResult.success) {
      const tokens = getApifyTokens();
      if (tokens.length > 0) {
        console.log(`[Ad Refresh] Falling back to Apify actor failover for Ad ID: ${adRecord.adArchiveId}...`);
        const scrapedItem = await scrapeSingleAdViaApify(adRecord.adArchiveId);

        if (scrapedItem) {
          const isAdActive = extractAdActiveStatus(scrapedItem);
          const { mediaUrls: extractedUrls, thumbnailUrl: extractedThumb, mediaType } = extractMedia(scrapedItem);

          let finalVideoUrl = extractedUrls.find((u) => u.includes(".mp4") || mediaType === "video") || null;
          let finalThumbnailUrl = extractedThumb || (extractedUrls.length > 0 ? extractedUrls[0] : null);

          if (isB2Configured()) {
            if (finalVideoUrl && finalVideoUrl.startsWith("http")) {
              const b2Vid = await uploadMediaFromUrlToB2(
                finalVideoUrl,
                "videos",
                `${adRecord.adArchiveId}_refreshed_${Date.now()}`
              );
              if (b2Vid) finalVideoUrl = b2Vid;
            }

            if (finalThumbnailUrl && finalThumbnailUrl.startsWith("http")) {
              const b2Thumb = await uploadMediaFromUrlToB2(
                finalThumbnailUrl,
                "thumbnails",
                `${adRecord.adArchiveId}_refreshed_${Date.now()}`
              );
              if (b2Thumb) finalThumbnailUrl = b2Thumb;
            }
          }

          await db
            .update(adObservations)
            .set({
              isActive: isAdActive,
              observedAt: new Date(),
            })
            .where(eq(adObservations.adId, id));

          deleteByPrefix("cache:spy_ads:").catch(() => {});

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
        }
      }
    }

    if (!refreshResult || !refreshResult.success) {
      return NextResponse.json({
        success: false,
        message: refreshResult?.error || "Could not refresh media right now. Click 'Watch on Meta Ad Library' to view.",
        adArchiveUrl,
      });
    }

    // 4. Fetch updated ad record for clean response
    const [finalAd] = await db
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

    const isAdActive = refreshResult.isActive ?? true;

    return NextResponse.json({
      success: true,
      ad: {
        ...(finalAd || adRecord),
        isActive: isAdActive,
      },
      isActive: isAdActive,
      refreshedVideoUrl: refreshResult.refreshedVideoUrl,
      refreshedThumbnailUrl: refreshResult.refreshedThumbnailUrl,
      message: refreshResult.message || "Media refreshed successfully.",
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
