import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages } from "@/db/schema";
import { eq, or, desc, sql, inArray } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { enrichAdsWithCreativeClusters, getAdCreativeKey } from "@/lib/creative-clustering";
import { calculateWinnerScore } from "@/lib/winner-score";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const targetAdId = searchParams.get("adId");
    const targetClusterKey = searchParams.get("clusterKey");
    const targetMediaHash = searchParams.get("mediaHash");
    const targetPHash = searchParams.get("perceptualHash");

    if (!targetAdId && !targetClusterKey && !targetMediaHash && !targetPHash) {
      return NextResponse.json(
        { error: "adId, clusterKey, mediaHash, or perceptualHash is required" },
        { status: 400 }
      );
    }

    let targetAd: any = null;

    if (targetAdId) {
      const [fetched] = await db
        .select()
        .from(ads)
        .where(eq(ads.id, targetAdId))
        .limit(1);
      targetAd = fetched;
    }

    // Fetch candidate ads
    // 1. If we have a targetMediaHash or targetAd with mediaHash, query by exact mediaHash
    const mediaHash = targetMediaHash || targetAd?.mediaHash;
    const pHash = targetPHash || targetAd?.perceptualHash;

    let candidateAdsRaw: any[] = [];

    if (mediaHash) {
      candidateAdsRaw = await db
        .selectDistinctOn([ads.id], {
          id: ads.id,
          adArchiveId: ads.adArchiveId,
          pageId: ads.pageId,
          pageName: ads.pageName,
          startedRunningOn: ads.startedRunningOn,
          caption: ads.caption,
          title: ads.title,
          ctaText: ads.ctaText,
          linkUrl: ads.linkUrl,
          mediaType: ads.mediaType,
          mediaUrls: ads.mediaUrls,
          thumbnailUrl: ads.thumbnailUrl,
          thumbnailStoragePath: ads.thumbnailStoragePath,
          storyboardUrls: ads.storyboardUrls,
          mediaHash: ads.mediaHash,
          perceptualHash: ads.perceptualHash,
          firstSeenAt: ads.firstSeenAt,
          lastSeenAt: ads.lastSeenAt,
          isArchived: ads.isArchived,
          archivedAt: ads.archivedAt,
          createdAt: ads.createdAt,
          updatedAt: ads.updatedAt,
          duplicationCount: adObservations.duplicationCount,
          isActive: adObservations.isActive,
          trackedPageId: adObservations.trackedPageId,
          pageDisplayName: trackedPages.displayName,
        })
        .from(ads)
        .innerJoin(adObservations, eq(ads.id, adObservations.adId))
        .leftJoin(trackedPages, eq(adObservations.trackedPageId, trackedPages.id))
        .where(eq(ads.mediaHash, mediaHash))
        .orderBy(ads.id, desc(adObservations.observedAt));
    }

    // If candidate list is empty or target has perceptual hash, query broader set to evaluate visual similarity
    if (candidateAdsRaw.length === 0) {
      candidateAdsRaw = await db
        .selectDistinctOn([ads.id], {
          id: ads.id,
          adArchiveId: ads.adArchiveId,
          pageId: ads.pageId,
          pageName: ads.pageName,
          startedRunningOn: ads.startedRunningOn,
          caption: ads.caption,
          title: ads.title,
          ctaText: ads.ctaText,
          linkUrl: ads.linkUrl,
          mediaType: ads.mediaType,
          mediaUrls: ads.mediaUrls,
          thumbnailUrl: ads.thumbnailUrl,
          thumbnailStoragePath: ads.thumbnailStoragePath,
          storyboardUrls: ads.storyboardUrls,
          mediaHash: ads.mediaHash,
          perceptualHash: ads.perceptualHash,
          firstSeenAt: ads.firstSeenAt,
          lastSeenAt: ads.lastSeenAt,
          isArchived: ads.isArchived,
          archivedAt: ads.archivedAt,
          createdAt: ads.createdAt,
          updatedAt: ads.updatedAt,
          duplicationCount: adObservations.duplicationCount,
          isActive: adObservations.isActive,
          trackedPageId: adObservations.trackedPageId,
          pageDisplayName: trackedPages.displayName,
        })
        .from(ads)
        .innerJoin(adObservations, eq(ads.id, adObservations.adId))
        .leftJoin(trackedPages, eq(adObservations.trackedPageId, trackedPages.id))
        .where(
          targetAd?.pageId
            ? eq(ads.pageId, targetAd.pageId)
            : or(
                sql`${ads.perceptualHash} IS NOT NULL`,
                sql`${ads.mediaHash} IS NOT NULL`
              )
        )
        .orderBy(ads.id, desc(adObservations.observedAt))
        .limit(200);
    }

    // Run clustering engine
    const enriched = enrichAdsWithCreativeClusters(candidateAdsRaw);

    // Filter to the matching cluster
    let resolvedKey = targetClusterKey;
    if (!resolvedKey && targetAdId) {
      const match = enriched.find((a) => a.id === targetAdId);
      if (match) resolvedKey = match.creativeClusterKey;
    }

    const clusterItems = resolvedKey
      ? enriched.filter((a) => a.creativeClusterKey === resolvedKey)
      : (targetAdId ? enriched.filter((a) => a.id === targetAdId) : enriched);

    const clusterSummary = clusterItems.length > 0 ? clusterItems[0].creativeMetrics : null;

    // Attach Winner Scores
    const formattedItems = clusterItems.map((item) => {
      const winner = calculateWinnerScore({
        startedRunningOn: item.startedRunningOn,
        firstSeenAt: item.firstSeenAt,
        lastSeenAt: item.lastSeenAt,
        duplicationCount: Number(item.duplicationCount || 1),
        isActive: Boolean(item.isActive),
        isArchived: Boolean(item.isArchived),
        mediaType: item.mediaType,
        productCreativeCount: 1,
      });

      return {
        ...item,
        pageName: item.pageName || item.pageDisplayName,
        signedThumbnailUrl: item.thumbnailUrl,
        winnerScore: winner.winnerScore,
        winnerTier: winner.winnerTier,
        isBreakout: winner.isBreakout,
        isEvergreen: winner.isEvergreen,
        daysRunning: winner.daysRunning,
      };
    });

    return NextResponse.json({
      items: formattedItems,
      clusterSummary,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch creative cluster" },
      { status: 500 }
    );
  }
}
