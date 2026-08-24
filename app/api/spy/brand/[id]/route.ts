import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages, scanHistory, scrapedProducts } from "@/db/schema";
import { eq, desc, asc, and, or, inArray, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { calculateWinnerScore } from "@/lib/winner-score";
import { enrichAdsWithProductClusters } from "@/lib/product-clustering";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { normalizeProductUrl } from "@/lib/firecrawl";
import { getCleanDomain } from "@/lib/utils";

const isUuid = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Brand ID or Page ID is required" }, { status: 400 });
    }

    const decodedId = decodeURIComponent(id).trim();

    // 1. Locate tracked page or ad record for this brand identifier
    let trackedPage: any = null;
    let pageId: string | null = null;
    let displayName: string = "";

    if (isUuid(decodedId)) {
      trackedPage = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.id, decodedId),
      });
      if (trackedPage) {
        pageId = trackedPage.pageId;
        displayName = trackedPage.displayName || `Brand ${trackedPage.pageId || decodedId}`;
      }
    }

    if (!trackedPage) {
      // Try finding by pageId in tracked_pages
      trackedPage = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.pageId, decodedId),
      });
      if (trackedPage) {
        pageId = trackedPage.pageId;
        displayName = trackedPage.displayName || `Brand ${trackedPage.pageId || decodedId}`;
      }
    }

    // If still not in tracked_pages, look in ads table
    if (!pageId) {
      const sampleAd = await db.query.ads.findFirst({
        where: or(eq(ads.pageId, decodedId), eq(ads.pageName, decodedId)),
      });
      if (sampleAd) {
        pageId = sampleAd.pageId;
        displayName = sampleAd.pageName || `Brand ${sampleAd.pageId}`;
      } else {
        pageId = decodedId;
        displayName = `Brand ${decodedId}`;
      }
    }

    // 2. Fetch all ads for this brand (distinct by ad id with latest observation)
    const adConditions = [];
    if (trackedPage) {
      adConditions.push(
        or(
          eq(ads.pageId, pageId!),
          eq(adObservations.trackedPageId, trackedPage.id)
        )
      );
    } else {
      adConditions.push(eq(ads.pageId, pageId!));
    }

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
        productId: ads.productId,
        mediaType: ads.mediaType,
        mediaUrls: ads.mediaUrls,
        thumbnailUrl: ads.thumbnailUrl,
        thumbnailStoragePath: ads.thumbnailStoragePath,
        storyboardUrls: ads.storyboardUrls,
        firstSeenAt: ads.firstSeenAt,
        lastSeenAt: ads.lastSeenAt,
        isArchived: ads.isArchived,
        archivedAt: ads.archivedAt,
        createdAt: ads.createdAt,
        updatedAt: ads.updatedAt,
        duplicationCount: adObservations.duplicationCount,
        isActive: adObservations.isActive,
        trackedPageId: adObservations.trackedPageId,
      })
      .from(ads)
      .leftJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(or(...adConditions))
      .orderBy(ads.id, desc(adObservations.observedAt));

    if (brandAdsRaw.length === 0 && !trackedPage) {
      return NextResponse.json({ error: "Brand not found or no ads scanned yet" }, { status: 404 });
    }

    // Fallback displayName from ads if available
    if (!displayName && brandAdsRaw.length > 0) {
      displayName = brandAdsRaw[0].pageName || `Brand ${pageId}`;
    }

    // 3. Fetch linked scraped products & normalized landing page URLs
    const productIds = Array.from(
      new Set(brandAdsRaw.map((a) => a.productId).filter((id): id is string => Boolean(id)))
    );

    const distinctNormalizedUrls = Array.from(
      new Set(
        brandAdsRaw
          .map((a) => (a.linkUrl ? normalizeProductUrl(a.linkUrl) : null))
          .filter((u): u is string => Boolean(u))
      )
    );

    const productQueryConditions = [];
    if (productIds.length > 0) {
      productQueryConditions.push(inArray(scrapedProducts.id, productIds));
    }
    if (pageId) {
      productQueryConditions.push(eq(scrapedProducts.pageId, pageId));
    }
    if (distinctNormalizedUrls.length > 0) {
      productQueryConditions.push(inArray(scrapedProducts.url, distinctNormalizedUrls));
    }

    let linkedProducts: any[] = [];
    if (productQueryConditions.length > 0) {
      linkedProducts = await db
        .select()
        .from(scrapedProducts)
        .where(or(...productQueryConditions));
    }

    const productMap = new Map<string, any>();
    const productUrlMap = new Map<string, any>();
    linkedProducts.forEach((p) => {
      productMap.set(p.id, p);
      if (p.url) productUrlMap.set(p.url, p);
    });

    // 4. Cluster analytics across brand ads
    const clusterMap = new Map<string, any>();
    if (brandAdsRaw.length > 0) {
      const enriched = enrichAdsWithProductClusters(
        brandAdsRaw.map((a) => ({
          id: a.id,
          pageId: a.pageId,
          linkUrl: a.linkUrl,
          caption: a.caption,
          title: a.title,
          mediaType: a.mediaType,
        }))
      );
      enriched.forEach((item) => clusterMap.set(item.id, item));
    }

    // 5. Enrich ads with winner score and cluster details
    const allEnrichedAds = brandAdsRaw.map((row) => {
      const cluster = clusterMap.get(row.id) || {
        productKey: `ad:${row.pageId}:${row.id}`,
        productName: row.title || "Product Offer",
        cleanProductUrl: null,
        productCreativeCount: 1,
        productVideoCount: row.mediaType === "video" ? 1 : 0,
        productImageCount: row.mediaType === "image" ? 1 : 0,
        brandProductCount: 1,
        brandTotalCreatives: 1,
        productSharePercent: 100,
        isFlagshipProduct: false,
      };

      const winner = calculateWinnerScore({
        startedRunningOn: row.startedRunningOn,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        duplicationCount: Number(row.duplicationCount || 1),
        isActive: Boolean(row.isActive),
        isArchived: Boolean(row.isArchived),
        mediaType: row.mediaType,
        productCreativeCount: cluster.productCreativeCount,
      });

      return {
        ...row,
        duplicationCount: Number(row.duplicationCount || 1),
        isActive: Boolean(row.isActive),
        isArchived: Boolean(row.isArchived),
        winnerScore: winner.winnerScore,
        winnerTier: winner.winnerTier,
        isBreakout: winner.isBreakout,
        isEvergreen: winner.isEvergreen,
        daysRunning: winner.daysRunning,
        product: row.productId ? productMap.get(row.productId) || null : null,
        productKey: cluster.productKey,
        productName: cluster.productName,
        cleanProductUrl: cluster.cleanProductUrl,
        productCreativeCount: cluster.productCreativeCount,
        productSharePercent: cluster.productSharePercent,
        isFlagshipProduct: cluster.isFlagshipProduct,
      };
    });

    // 6. Aggregate Summary Metrics
    const totalAdsCaptured = allEnrichedAds.length;
    const activeAds = allEnrichedAds.filter((a) => a.isActive && !a.isArchived);
    const inactiveAds = allEnrichedAds.filter((a) => !a.isActive && !a.isArchived);
    const archivedAds = allEnrichedAds.filter((a) => a.isArchived);

    const activeAdsCount = activeAds.length;
    const inactiveAdsCount = inactiveAds.length;
    const archivedAdsCount = archivedAds.length;

    const totalDuplicationCount = activeAds.reduce((sum, a) => sum + (a.duplicationCount || 1), 0);
    const avgDuplicationsPerAd = activeAdsCount > 0 ? Number((totalDuplicationCount / activeAdsCount).toFixed(1)) : 1;

    const winnerCount = allEnrichedAds.filter((a) => a.winnerScore >= 70).length;
    const breakoutCount = allEnrichedAds.filter((a) => a.isBreakout).length;
    const evergreenCount = allEnrichedAds.filter((a) => a.daysRunning >= 30 && a.isActive).length;

    // Media Distribution
    const mediaCounts: Record<string, number> = { video: 0, image: 0, carousel: 0, other: 0 };
    allEnrichedAds.forEach((a) => {
      const type = (a.mediaType || "other").toLowerCase();
      if (type === "video") mediaCounts.video++;
      else if (type === "image") mediaCounts.image++;
      else if (type === "carousel") mediaCounts.carousel++;
      else mediaCounts.other++;
    });

    const mediaDistribution = {
      video: mediaCounts.video,
      image: mediaCounts.image,
      carousel: mediaCounts.carousel,
      other: mediaCounts.other,
      videoPercent: totalAdsCaptured > 0 ? Math.round((mediaCounts.video / totalAdsCaptured) * 100) : 0,
      imagePercent: totalAdsCaptured > 0 ? Math.round((mediaCounts.image / totalAdsCaptured) * 100) : 0,
      carouselPercent: totalAdsCaptured > 0 ? Math.round((mediaCounts.carousel / totalAdsCaptured) * 100) : 0,
    };

    // Longevity Distribution
    const longevityCounts = {
      fresh: 0, // < 7 days
      scaling: 0, // 7 - 30 days
      evergreen: 0, // 30 - 90 days
      veteran: 0, // 90+ days
    };

    allEnrichedAds.forEach((a) => {
      const days = a.daysRunning;
      if (days < 7) longevityCounts.fresh++;
      else if (days <= 30) longevityCounts.scaling++;
      else if (days <= 90) longevityCounts.evergreen++;
      else longevityCounts.veteran++;
    });

    // CTA Distribution
    const ctaCounts: Record<string, number> = {};
    allEnrichedAds.forEach((a) => {
      const cta = a.ctaText?.trim() || "No CTA";
      ctaCounts[cta] = (ctaCounts[cta] || 0) + 1;
    });

    const ctaDistribution = Object.entries(ctaCounts)
      .map(([cta, count]) => ({
        cta,
        count,
        percent: totalAdsCaptured > 0 ? Math.round((count / totalAdsCaptured) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Product Clustering Summary
    const productGroups = new Map<string, {
      productKey: string;
      productName: string;
      cleanProductUrl: string | null;
      creativeCount: number;
      videoCount: number;
      imageCount: number;
      activeCount: number;
      maxDuplications: number;
      isFlagship: boolean;
      sharePercent: number;
      product: any | null;
    }>();

    allEnrichedAds.forEach((ad) => {
      const key = ad.productKey || `single:${ad.id}`;
      const existing = productGroups.get(key);
      const isVid = ad.mediaType === "video";
      const isImg = ad.mediaType === "image";
      const isAct = ad.isActive && !ad.isArchived;

      if (!existing) {
        productGroups.set(key, {
          productKey: key,
          productName: ad.productName || "Product Offer",
          cleanProductUrl: ad.cleanProductUrl,
          creativeCount: 1,
          videoCount: isVid ? 1 : 0,
          imageCount: isImg ? 1 : 0,
          activeCount: isAct ? 1 : 0,
          maxDuplications: ad.duplicationCount || 1,
          isFlagship: ad.isFlagshipProduct || false,
          sharePercent: 0,
          product: ad.product,
        });
      } else {
        existing.creativeCount++;
        if (isVid) existing.videoCount++;
        if (isImg) existing.imageCount++;
        if (isAct) existing.activeCount++;
        existing.maxDuplications = Math.max(existing.maxDuplications, ad.duplicationCount || 1);
        if (ad.isFlagshipProduct) existing.isFlagship = true;
        if (!existing.product && ad.product) existing.product = ad.product;
      }
    });

    const productClusters = Array.from(productGroups.values())
      .map((p) => ({
        ...p,
        sharePercent: totalAdsCaptured > 0 ? Math.round((p.creativeCount / totalAdsCaptured) * 100) : 100,
      }))
      .sort((a, b) => b.creativeCount - a.creativeCount);

    // Top 3 Winner Creatives Spotlight
    const topWinners = [...allEnrichedAds]
      .sort(
        (a, b) =>
          b.winnerScore - a.winnerScore ||
          (b.duplicationCount || 0) - (a.duplicationCount || 0) ||
          new Date(b.startedRunningOn || 0).getTime() - new Date(a.startedRunningOn || 0).getTime() ||
          b.id.localeCompare(a.id)
      )
      .slice(0, 3);

    // 7. Historical Scan Trajectory (if tracked)
    let history: any[] = [];
    if (trackedPage) {
      history = await db
        .select({
          id: scanHistory.id,
          results: scanHistory.results,
          difference: scanHistory.difference,
          checkedAt: scanHistory.checkedAt,
          status: scanHistory.status,
        })
        .from(scanHistory)
        .where(eq(scanHistory.trackedPageId, trackedPage.id))
        .orderBy(asc(scanHistory.checkedAt))
        .limit(60);
    }

    // 8. Brand Products Catalog Compilation
    const brandProductsList: any[] = [];
    const scrapedProductUrls = new Set<string>();

    linkedProducts.forEach((p) => {
      if (p.url) scrapedProductUrls.add(p.url);

      const matchingAds = allEnrichedAds.filter(
        (ad) =>
          ad.productId === p.id ||
          (ad.linkUrl && normalizeProductUrl(ad.linkUrl) === p.url)
      );

      const linkedAdsCount = matchingAds.length;
      const activeAdsCount = matchingAds.filter((a) => a.isActive && !a.isArchived).length;
      const topThumb =
        matchingAds.find((a) => a.thumbnailUrl)?.thumbnailUrl ||
        matchingAds.find((a) => a.mediaUrls?.[0])?.mediaUrls?.[0] ||
        p.mainImageUrl;
      const maxScore = matchingAds.reduce((max, a) => Math.max(max, a.winnerScore || 0), 0);

      brandProductsList.push({
        ...p,
        linkedAdsCount,
        activeAdsCount,
        topCreativeThumbnail: topThumb,
        winnerScore: maxScore,
      });
    });

    // Also include detected landing URLs that are pending scrape
    distinctNormalizedUrls.forEach((normUrl) => {
      if (!scrapedProductUrls.has(normUrl)) {
        const matchingAds = allEnrichedAds.filter(
          (ad) => ad.linkUrl && normalizeProductUrl(ad.linkUrl) === normUrl
        );

        brandProductsList.push({
          id: `unscraped_${Buffer.from(normUrl).toString("base64").slice(0, 16)}`,
          url: normUrl,
          domain: getCleanDomain(normUrl),
          pageId: pageId,
          title: matchingAds[0]?.title || "Unscraped Product Landing Page",
          currentPrice: null,
          originalPrice: null,
          currency: null,
          discountOrOffer: null,
          mainImageUrl: matchingAds.find((a) => a.thumbnailUrl)?.thumbnailUrl || null,
          galleryImages: [],
          allOffers: null,
          storePlatform: "other",
          deliveryCost: null,
          phoneNumbers: [],
          whatsappNumbers: [],
          metaPixelIds: [],
          scrapeStatus: "pending",
          failureReason: null,
          lastScrapedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          linkedAdsCount: matchingAds.length,
          activeAdsCount: matchingAds.filter((a) => a.isActive && !a.isArchived).length,
          topCreativeThumbnail: matchingAds.find((a) => a.thumbnailUrl)?.thumbnailUrl || null,
          winnerScore: matchingAds.reduce((max, a) => Math.max(max, a.winnerScore || 0), 0),
        });
      }
    });

    // Sort products by linkedAdsCount descending, then activeAdsCount descending
    brandProductsList.sort(
      (a, b) => (b.linkedAdsCount || 0) - (a.linkedAdsCount || 0) || (b.activeAdsCount || 0) - (a.activeAdsCount || 0)
    );

    // 9. Store Tech & Tracking Detectors
    const detectedPlatforms = new Set<string>();
    const detectedPixels = new Set<string>();
    const detectedPhones = new Set<string>();
    const detectedWhatsapp = new Set<string>();

    linkedProducts.forEach((p) => {
      if (p.storePlatform && p.storePlatform !== "other") detectedPlatforms.add(p.storePlatform);
      if (p.metaPixelIds) p.metaPixelIds.forEach((id: string) => detectedPixels.add(id));
      if (p.phoneNumbers) p.phoneNumbers.forEach((ph: string) => detectedPhones.add(ph));
      if (p.whatsappNumbers) p.whatsappNumbers.forEach((w: string) => detectedWhatsapp.add(w));
    });

    return NextResponse.json({
      success: true,
      brand: {
        id: trackedPage?.id || null,
        pageId: pageId,
        displayName: displayName,
        url: trackedPage?.url || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${pageId}&search_type=page&media_type=all`,
        country: trackedPage?.country || null,
        landingPage: trackedPage?.landingPage || null,
        isWatchlisted: Boolean(trackedPage?.isWatchlisted),
        lastChecked: trackedPage?.lastChecked || null,
        lastCreativeScan: trackedPage?.lastCreativeScan || null,
        status: trackedPage?.status || "active",
        currentResults: trackedPage?.currentResults || totalAdsCaptured,
        isTracked: Boolean(trackedPage),
      },
      summary: {
        totalAdsCaptured,
        activeAdsCount,
        inactiveAdsCount,
        archivedAdsCount,
        totalDuplicationCount,
        avgDuplicationsPerAd,
        winnerCount,
        breakoutCount,
        evergreenCount,
        evergreenRate: totalAdsCaptured > 0 ? Math.round((evergreenCount / totalAdsCaptured) * 100) : 0,
        distinctProductsCount: brandProductsList.length || productClusters.length,
      },
      mediaDistribution,
      longevityDistribution: {
        fresh: longevityCounts.fresh,
        scaling: longevityCounts.scaling,
        evergreen: longevityCounts.evergreen,
        veteran: longevityCounts.veteran,
        freshPercent: totalAdsCaptured > 0 ? Math.round((longevityCounts.fresh / totalAdsCaptured) * 100) : 0,
        scalingPercent: totalAdsCaptured > 0 ? Math.round((longevityCounts.scaling / totalAdsCaptured) * 100) : 0,
        evergreenPercent: totalAdsCaptured > 0 ? Math.round((longevityCounts.evergreen / totalAdsCaptured) * 100) : 0,
        veteranPercent: totalAdsCaptured > 0 ? Math.round((longevityCounts.veteran / totalAdsCaptured) * 100) : 0,
      },
      ctaDistribution,
      productClusters,
      products: brandProductsList,
      topWinners,
      history,
      storeTech: {
        platforms: Array.from(detectedPlatforms),
        pixelIds: Array.from(detectedPixels),
        phoneNumbers: Array.from(detectedPhones),
        whatsappNumbers: Array.from(detectedWhatsapp),
      },
    });
  } catch (err: any) {
    console.error("[Brand Analytics API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load brand analytics" },
      { status: 500 }
    );
  }
}
