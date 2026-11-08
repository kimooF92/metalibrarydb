import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { tasks, runs } from "@trigger.dev/sdk";
import { isFbCdnUrlExpired } from "@/lib/fb-cdn";

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
    const searchParams = req.nextUrl?.searchParams || new URL(req.url).searchParams;
    const forceRefresh = searchParams.get("force") === "true";

    // 1. Fast skip: If media was refreshed within the last 5 minutes and is not expired, skip Trigger.dev
    const isVideo = adRecord.mediaType === "video" || (adRecord.mediaUrls && adRecord.mediaUrls.some((u) => u.includes(".mp4")));
    const firstVideo = adRecord.mediaUrls?.find((u) => u.includes(".mp4") || u.includes("/videos/"));
    const isThumbExpired = adRecord.thumbnailUrl ? isFbCdnUrlExpired(adRecord.thumbnailUrl) : false;
    const isVidExpired = firstVideo ? isFbCdnUrlExpired(firstVideo) : false;
    const recentRefreshMs = Date.now() - new Date(adRecord.updatedAt || 0).getTime();

    if (!forceRefresh && recentRefreshMs < 5 * 60 * 1000 && !isThumbExpired && (!isVideo || (firstVideo && !isVidExpired))) {
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
        message: "Ad media is currently fresh and valid.",
        adArchiveUrl,
      });
    }

    let refreshResult: RefreshAdMediaResult | null = null;

    // 2. PRIMARY & ONLY ENGINE: Trigger.dev Cloud Task (Zero Apify credits, runs Playwright in Docker)
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
        console.error(`[Ad Refresh] Trigger.dev task execution issue: ${triggerErr?.message}`);
      }
    } else {
      console.warn("[Ad Refresh] TRIGGER_SECRET_KEY not set; Trigger.dev cannot run.");
    }

    if (!refreshResult || !refreshResult.success) {
      return NextResponse.json({
        success: false,
        message: refreshResult?.error || "Could not refresh media right now. Click 'Watch on Meta Ad Library' to view.",
        adArchiveUrl,
      });
    }

    const isAdActive = refreshResult.isActive ?? true;

    // 3. Auto-unarchive if Meta confirms active
    if (isAdActive && adRecord.isArchived) {
      await db
        .update(ads)
        .set({
          isArchived: false,
          archivedAt: null,
          lastSeenAt: new Date(),
        })
        .where(eq(ads.id, id));
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

    return NextResponse.json({
      success: true,
      ad: {
        ...(finalAd || adRecord),
        isActive: isAdActive,
        isArchived: isAdActive ? false : Boolean(finalAd?.isArchived ?? adRecord.isArchived),
      },
      isActive: isAdActive,
      refreshedVideoUrl: refreshResult.refreshedVideoUrl,
      refreshedThumbnailUrl: refreshResult.refreshedThumbnailUrl,
      message: refreshResult.message || (isAdActive ? "Media refreshed and ad is actively running on Meta." : "Media refreshed. Ad has ended on Meta."),
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
