import { areVisuallyIdentical, getHammingDistance, extractMetaBaseAssetId } from "./media-hasher";

export interface CreativeBrandInfo {
  pageId: string;
  pageName: string;
  firstSeenAt: string | Date | null;
  adCount: number;
}

export interface CreativeClusterMetrics {
  clusterKey: string;
  totalAdSets: number;
  distinctBrandsCount: number;
  brands: CreativeBrandInfo[];
  originalCreator: CreativeBrandInfo | null;
  isCrossBrand: boolean;
  isScalingWinner: boolean;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  activeAdsCount: number;
  mediaType: string;
}

export interface EnrichedCreativeAd {
  [key: string]: any;
  creativeClusterKey?: string;
  creativeMetrics?: CreativeClusterMetrics;
  creativeVariants?: any[];
}

/**
 * Robustly resolves a cluster grouping key for an ad.
 * Prioritizes: mediaHash -> perceptualHash -> Meta CDN Base Asset ID -> clean thumbnail URL -> adArchiveId.
 */
export function getAdCreativeKey(ad: any): string {
  if (ad.mediaHash && ad.mediaHash.trim()) {
    return `hash:${ad.mediaHash.trim()}`;
  }
  if (ad.perceptualHash && ad.perceptualHash.trim() && ad.perceptualHash.length === 16) {
    return `phash:${ad.perceptualHash.trim().toLowerCase()}`;
  }

  const thumbUrl = ad.thumbnailUrl || (ad.mediaUrls && ad.mediaUrls[0]) || "";
  const baseAsset = extractMetaBaseAssetId(thumbUrl);
  if (baseAsset) {
    return `asset:${baseAsset}`;
  }

  if (thumbUrl) {
    // Strip ephemeral query parameters
    try {
      const parsed = new URL(thumbUrl);
      return `url:${parsed.origin}${parsed.pathname}`;
    } catch {
      return `url:${thumbUrl.split("?")[0]}`;
    }
  }

  return `ad:${ad.adArchiveId || ad.id}`;
}

/**
 * Enriches a list of ads with visual creative clustering.
 * Groups exact content hashes as well as near-identical perceptual hashes (Hamming distance <= 6).
 */
export function enrichAdsWithCreativeClusters<T extends Record<string, any>>(adsList: T[]): Array<T & EnrichedCreativeAd> {
  if (!adsList || adsList.length === 0) return [];

  // Group 1: Exact keys map (hash:..., asset:..., url:...)
  const clusterGroups: Array<{
    clusterKey: string;
    representativePerceptualHash: string | null;
    items: T[];
  }> = [];

  for (const ad of adsList) {
    const rawKey = getAdCreativeKey(ad);
    const pHash = ad.perceptualHash && ad.perceptualHash.length === 16 ? ad.perceptualHash.toLowerCase() : null;

    let matchedGroup: (typeof clusterGroups)[number] | null = null;

    // 1. Check exact key match
    matchedGroup = clusterGroups.find((g) => g.clusterKey === rawKey) || null;

    // 2. If no exact match and we have a perceptual hash, check visual similarity with existing groups
    if (!matchedGroup && pHash) {
      matchedGroup =
        clusterGroups.find(
          (g) =>
            g.representativePerceptualHash &&
            areVisuallyIdentical(g.representativePerceptualHash, pHash, 6)
        ) || null;
    }

    if (matchedGroup) {
      matchedGroup.items.push(ad);
      if (!matchedGroup.representativePerceptualHash && pHash) {
        matchedGroup.representativePerceptualHash = pHash;
      }
    } else {
      clusterGroups.push({
        clusterKey: rawKey,
        representativePerceptualHash: pHash,
        items: [ad],
      });
    }
  }

  // Calculate cluster metrics and map back to each ad
  const enrichedMap = new Map<string, CreativeClusterMetrics>();
  const variantsMap = new Map<string, T[]>();

  for (const group of clusterGroups) {
    const items = group.items;
    const totalAdSets = items.length;

    // Group by Brand / Page
    const brandMap = new Map<string, CreativeBrandInfo>();
    let earliestLaunch: Date | null = null;
    let latestObservation: Date | null = null;
    let activeAdsCount = 0;

    for (const item of items) {
      const pageId = String(item.pageId || "0");
      const pageName = String(item.pageName || item.pageDisplayName || `Page ${pageId}`);
      const launchDate = item.startedRunningOn ? new Date(item.startedRunningOn) : (item.firstSeenAt ? new Date(item.firstSeenAt) : null);
      const observedDate = item.lastSeenAt ? new Date(item.lastSeenAt) : new Date();

      if (launchDate && (!earliestLaunch || launchDate < earliestLaunch)) {
        earliestLaunch = launchDate;
      }
      if (observedDate && (!latestObservation || observedDate > latestObservation)) {
        latestObservation = observedDate;
      }
      if (item.isActive !== false && !item.isArchived) {
        activeAdsCount++;
      }

      const existingBrand = brandMap.get(pageId);
      if (existingBrand) {
        existingBrand.adCount++;
        if (launchDate && (!existingBrand.firstSeenAt || launchDate < new Date(existingBrand.firstSeenAt))) {
          existingBrand.firstSeenAt = launchDate;
        }
      } else {
        brandMap.set(pageId, {
          pageId,
          pageName,
          firstSeenAt: launchDate,
          adCount: 1,
        });
      }
    }

    const brands = Array.from(brandMap.values()).sort((a, b) => {
      if (a.firstSeenAt && b.firstSeenAt) {
        return new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime();
      }
      return b.adCount - a.adCount;
    });

    const originalCreator = brands.length > 0 ? brands[0] : null;
    const distinctBrandsCount = brands.length;
    const isCrossBrand = distinctBrandsCount > 1;
    const isScalingWinner = totalAdSets >= 3 || isCrossBrand;

    const metrics: CreativeClusterMetrics = {
      clusterKey: group.clusterKey,
      totalAdSets,
      distinctBrandsCount,
      brands,
      originalCreator,
      isCrossBrand,
      isScalingWinner,
      firstSeenAt: earliestLaunch,
      lastSeenAt: latestObservation,
      activeAdsCount,
      mediaType: items[0]?.mediaType || "unknown",
    };

    enrichedMap.set(group.clusterKey, metrics);
    variantsMap.set(group.clusterKey, items);
  }

  // Return original ads with enriched cluster metrics
  return adsList.map((ad) => {
    const rawKey = getAdCreativeKey(ad);
    const pHash = ad.perceptualHash && ad.perceptualHash.length === 16 ? ad.perceptualHash.toLowerCase() : null;

    let group = clusterGroups.find((g) => g.clusterKey === rawKey);
    if (!group && pHash) {
      group = clusterGroups.find(
        (g) => g.representativePerceptualHash && areVisuallyIdentical(g.representativePerceptualHash, pHash, 6)
      );
    }

    const metrics = group ? enrichedMap.get(group.clusterKey) : undefined;
    const variants = group ? variantsMap.get(group.clusterKey) : undefined;

    return {
      ...ad,
      creativeClusterKey: group?.clusterKey || rawKey,
      creativeMetrics: metrics,
      creativeVariants: variants,
    };
  });
}

/**
 * Returns 1 Hero Representative Ad per unique visual creative cluster,
 * with aggregated metrics and child variants attached.
 */
export function getDeduplicatedCreativeHeroAds<T extends Record<string, any>>(adsList: T[]): Array<T & EnrichedCreativeAd> {
  const enriched = enrichAdsWithCreativeClusters(adsList);
  const seenClusters = new Set<string>();
  const heroAds: Array<T & EnrichedCreativeAd> = [];

  for (const ad of enriched) {
    const clusterKey = ad.creativeClusterKey || getAdCreativeKey(ad);
    if (!seenClusters.has(clusterKey)) {
      seenClusters.add(clusterKey);
      heroAds.push(ad);
    }
  }

  return heroAds;
}
