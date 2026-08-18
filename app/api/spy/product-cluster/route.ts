import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { extractProductClusterKey, enrichAdsWithProductClusters } from "@/lib/product-clustering";
import { calculateWinnerScore } from "@/lib/winner-score";

export async function GET(req: NextRequest) {
  const authError = validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const pageId = searchParams.get("pageId");
    const targetProductKey = searchParams.get("productKey");
    const targetAdId = searchParams.get("adId");

    if (!pageId && !targetAdId) {
      return NextResponse.json(
        { error: "pageId or adId is required" },
        { status: 400 }
      );
    }

    let targetBrandPageId = pageId;

    // If adId provided, retrieve the ad's pageId first
    if (targetAdId && !targetBrandPageId) {
      const [targetAd] = await db
        .select({ pageId: ads.pageId })
        .from(ads)
        .where(eq(ads.id, targetAdId))
        .limit(1);

      if (!targetAd) {
        return NextResponse.json({ error: "Target ad not found" }, { status: 404 });
      }
      targetBrandPageId = targetAd.pageId;
    }

    if (!targetBrandPageId) {
      return NextResponse.json({ error: "Could not resolve brand pageId" }, { status: 400 });
    }

    // Fetch all ads from this brand
    const brandAdsRaw = await db
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
      .where(eq(ads.pageId, targetBrandPageId))
      .orderBy(ads.id, desc(adObservations.observedAt));

    if (brandAdsRaw.length === 0) {
      return NextResponse.json({
        items: [],
        clusterSummary: null,
      });
    }

    // Run clustering engine across the brand's catalog
    const enrichedAds = enrichAdsWithProductClusters(brandAdsRaw);

    // Determine target product key if not explicitly given
    let activeProductKey = targetProductKey;
    if (!activeProductKey && targetAdId) {
      const match = enrichedAds.find((a) => a.id === targetAdId);
      if (match) activeProductKey = match.productKey;
    }

    // Filter ads matching this specific product cluster
    const clusterItems = activeProductKey
      ? enrichedAds.filter((a) => a.productKey === activeProductKey)
      : enrichedAds;

    // Sort by startedRunningOn desc
    clusterItems.sort((a, b) => {
      const timeA = a.startedRunningOn ? new Date(a.startedRunningOn).getTime() : 0;
      const timeB = b.startedRunningOn ? new Date(b.startedRunningOn).getTime() : 0;
      return timeB - timeA;
    });

    // Compute cluster summary
    const firstItem = clusterItems[0];
    const totalCopies = clusterItems.reduce((sum, item) => sum + (item.duplicationCount || 1), 0);
    const activeAdsCount = clusterItems.filter((i) => i.isActive).length;

    const clusterSummary = firstItem
      ? {
          productKey: firstItem.productKey,
          productName: firstItem.productName,
          cleanProductUrl: firstItem.cleanProductUrl,
          brandName: firstItem.pageName || firstItem.pageDisplayName || `Brand ${targetBrandPageId}`,
          pageId: targetBrandPageId,
          totalCreatives: clusterItems.length,
          videoCount: clusterItems.filter((i) => i.mediaType === "video").length,
          imageCount: clusterItems.filter((i) => i.mediaType !== "video").length,
          activeAdsCount,
          totalRunningCopies: totalCopies,
          brandTotalProducts: firstItem.brandProductCount,
          productSharePercent: firstItem.productSharePercent,
          isFlagship: firstItem.isFlagshipProduct,
        }
      : null;

    // Enrich each cluster item with winner metrics
    const items = clusterItems.map((item) => {
      const winnerMetrics = calculateWinnerScore({
        startedRunningOn: item.startedRunningOn,
        firstSeenAt: item.firstSeenAt,
        lastSeenAt: item.lastSeenAt,
        duplicationCount: Number(item.duplicationCount || 1),
        isActive: Boolean(item.isActive),
        isArchived: Boolean(item.isArchived),
        mediaType: item.mediaType,
        productCreativeCount: clusterItems.length,
      });

      return {
        ...item,
        pageName: item.pageName || item.pageDisplayName,
        signedThumbnailUrl: item.thumbnailUrl,
        winnerScore: winnerMetrics.winnerScore,
        winnerTier: winnerMetrics.winnerTier,
        isBreakout: winnerMetrics.isBreakout,
        isEvergreen: winnerMetrics.isEvergreen,
        daysRunning: winnerMetrics.daysRunning,
      };
    });

    return NextResponse.json({
      clusterSummary,
      items,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch product cluster" },
      { status: 500 }
    );
  }
}
