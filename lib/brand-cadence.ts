import { normalizeProductUrl } from "./firecrawl";
import {
  BrandCadenceAnalytics,
  AdInjectionBucket,
  ProductLaunchRecord,
  DayOfWeekCadence,
} from "../types/cadence";


export interface CadenceAdInput {
  id: string;
  adArchiveId?: string | null;
  startedRunningOn?: string | Date | null;
  firstSeenAt?: string | Date | null;
  lastSeenAt?: string | Date | null;
  linkUrl?: string | null;
  productId?: string | null;
  mediaType?: string | null;
  duplicationCount?: number | null;
  isActive?: boolean | null;
  isArchived?: boolean | null;
  winnerScore?: number | null;
}

export interface CadenceProductInput {
  id: string;
  url?: string | null;
  title?: string | null;
  mainImageUrl?: string | null;
  currentPrice?: string | null;
  currency?: string | null;
  createdAt?: string | Date | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Format a Date to YYYY-MM-DD
 */
function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get start of ISO week (Monday 00:00:00)
 */
function getStartOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Pure In-Memory Brand Cadence & Footprint Calculator.
 * Operates entirely on already-loaded ads and products with 0 extra DB queries and 0 egress cost.
 */
export function computeBrandCadence(
  ads: CadenceAdInput[],
  products: CadenceProductInput[] = []
): BrandCadenceAnalytics {
  const now = new Date();
  const nowMs = now.getTime();

  // 1. Build Inverted Index from Product ID / Normalized URL to Ads
  const adsByProductId = new Map<string, CadenceAdInput[]>();
  const adsByNormUrl = new Map<string, CadenceAdInput[]>();

  for (const ad of ads) {
    if (ad.productId) {
      let list = adsByProductId.get(ad.productId);
      if (!list) {
        list = [];
        adsByProductId.set(ad.productId, list);
      }
      list.push(ad);
    }
    if (ad.linkUrl) {
      const norm = normalizeProductUrl(ad.linkUrl);
      if (norm) {
        let list = adsByNormUrl.get(norm);
        if (!list) {
          list = [];
          adsByNormUrl.set(norm, list);
        }
        list.push(ad);
      }
    }
  }

  // 2. Resolve True Product Launch Dates & Lifecycles
  const productLaunchRecords: ProductLaunchRecord[] = [];
  const processedProductIds = new Set<string>();

  for (const prod of products) {
    processedProductIds.add(prod.id);
    const normUrl = prod.url ? normalizeProductUrl(prod.url) : null;

    // Collect all matching ads for this product
    const matchedAdsMap = new Map<string, CadenceAdInput>();
    (adsByProductId.get(prod.id) || []).forEach((a) => matchedAdsMap.set(a.id, a));
    if (normUrl) {
      (adsByNormUrl.get(normUrl) || []).forEach((a) => matchedAdsMap.set(a.id, a));
    }
    const matchedAds = Array.from(matchedAdsMap.values());

    // True launch date is the earliest startedRunningOn (or firstSeenAt) of matching ads
    let earliestLaunchMs = Infinity;
    let maxCopies = 1;
    let activeAdsCount = 0;

    for (const ad of matchedAds) {
      const startStr = ad.startedRunningOn || ad.firstSeenAt;
      if (startStr) {
        const ms = new Date(startStr).getTime();
        if (!isNaN(ms) && ms < earliestLaunchMs) {
          earliestLaunchMs = ms;
        }
      }
      const copies = Number(ad.duplicationCount || 1);
      if (copies > maxCopies) maxCopies = copies;
      if (ad.isActive && !ad.isArchived) activeAdsCount++;
    }

    // Fallback to product createdAt if no ad timestamps found
    if (earliestLaunchMs === Infinity && prod.createdAt) {
      const fallbackMs = new Date(prod.createdAt).getTime();
      if (!isNaN(fallbackMs)) earliestLaunchMs = fallbackMs;
    }

    const hasTimestamp = earliestLaunchMs !== Infinity;
    const launchDate = hasTimestamp ? new Date(earliestLaunchMs) : now;
    const daysSinceLaunch = Math.max(0, Math.floor((nowMs - launchDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Lifecycle Status Classifier
    let status: ProductLaunchRecord["status"] = "testing";
    const totalAdsInjected = matchedAds.length;

    if (activeAdsCount > 0) {
      if (daysSinceLaunch >= 30 && maxCopies >= 3) {
        status = "winner";
      } else if (daysSinceLaunch >= 14 || maxCopies >= 3) {
        status = "scaling";
      } else {
        status = "testing";
      }
    } else {
      // Inactive product
      if (daysSinceLaunch < 7 || totalAdsInjected <= 2) {
        status = "killed";
      } else {
        status = "killed";
      }
    }

    productLaunchRecords.push({
      id: prod.id,
      url: prod.url || "",
      title: prod.title || "Product Offer",
      mainImageUrl: prod.mainImageUrl || null,
      currentPrice: prod.currentPrice || null,
      currency: prod.currency || null,
      launchedAt: launchDate.toISOString(),
      daysSinceLaunch,
      totalAdsInjected,
      activeAdsCount,
      maxCopies,
      status,
      adIds: matchedAds.map((a) => a.id),
    });
  }

  // Sort launch records by launch date descending
  productLaunchRecords.sort(
    (a, b) => new Date(b.launchedAt).getTime() - new Date(a.launchedAt).getTime()
  );

  // 3. Product Lifecycle Funnel Metrics
  const totalProductsTested = productLaunchRecords.length;
  let quickKills = 0;
  let activeTesting = 0;
  let scalingWinners = 0;

  for (const p of productLaunchRecords) {
    if (p.status === "killed") quickKills++;
    else if (p.status === "testing") activeTesting++;
    else if (p.status === "scaling" || p.status === "winner") scalingWinners++;
  }

  const winRate =
    totalProductsTested > 0 ? Math.round((scalingWinners / totalProductsTested) * 100) : 0;

  // 4. Day of Week Pattern (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  let totalValidAdsForDay = 0;

  for (const ad of ads) {
    const rawTime = ad.startedRunningOn || ad.firstSeenAt;
    if (rawTime) {
      const dt = new Date(rawTime);
      if (!isNaN(dt.getTime())) {
        const dayIdx = dt.getDay(); // 0-6
        dayCounts[dayIdx]++;
        totalValidAdsForDay++;
      }
    }
  }

  const dayOfWeekPattern: DayOfWeekCadence[] = dayCounts.map((count, dayIndex) => ({
    dayName: DAY_NAMES[dayIndex],
    dayIndex,
    adCount: count,
    percentage:
      totalValidAdsForDay > 0 ? Math.round((count / totalValidAdsForDay) * 100) : 0,
  }));

  // 5. Time Series Bucketing (Days, Weeks, Months)

  // Pre-parse ad timestamps for fast bucket tests
  const parsedAds = ads
    .map((ad) => {
      const timeStr = ad.startedRunningOn || ad.firstSeenAt;
      const ms = timeStr ? new Date(timeStr).getTime() : NaN;
      return {
        ad,
        ms,
        isValid: !isNaN(ms),
      };
    })
    .filter((a) => a.isValid);

  // Pre-parse product launch timestamps
  const parsedProducts = productLaunchRecords.map((p) => ({
    record: p,
    ms: new Date(p.launchedAt).getTime(),
  }));

  // Helper to aggregate ads and products within [startMs, endMs]
  function buildBucket(
    periodKey: string,
    label: string,
    startMs: number,
    endMs: number
  ): AdInjectionBucket {
    let totalAds = 0;
    let totalCopies = 0;
    let videoCount = 0;
    let imageCount = 0;
    let carouselCount = 0;
    let otherCount = 0;
    const adIds: string[] = [];

    for (const { ad, ms } of parsedAds) {
      if (ms >= startMs && ms <= endMs) {
        totalAds++;
        const copies = Number(ad.duplicationCount || 1);
        totalCopies += copies;
        adIds.push(ad.id);

        const mType = (ad.mediaType || "").toLowerCase();
        if (mType === "video") videoCount++;
        else if (mType === "image") imageCount++;
        else if (mType === "carousel") carouselCount++;
        else otherCount++;
      }
    }

    const matchedProductIds: string[] = [];
    for (const { record, ms } of parsedProducts) {
      if (ms >= startMs && ms <= endMs) {
        matchedProductIds.push(record.id);
      }
    }

    return {
      periodKey,
      label,
      dateStart: new Date(startMs).toISOString(),
      dateEnd: new Date(endMs).toISOString(),
      totalAds,
      totalCopies,
      videoCount,
      imageCount,
      carouselCount,
      otherCount,
      newProductsLaunched: matchedProductIds.length,
      productIds: matchedProductIds,
      adIds,
    };
  }

  // A. Days Bucket: Last 30 Days (Rolling)
  const dayBuckets: AdInjectionBucket[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const startMs = d.getTime();

    const dEnd = new Date(d);
    dEnd.setHours(23, 59, 59, 999);
    const endMs = dEnd.getTime();

    const periodKey = toDateStr(d);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dayBuckets.push(buildBucket(periodKey, label, startMs, endMs));
  }

  // B. Weeks Bucket: Last 16 Weeks (Monday - Sunday)
  const weekBuckets: AdInjectionBucket[] = [];
  const currentWeekStart = getStartOfWeek(now);

  for (let i = 15; i >= 0; i--) {
    const wStart = new Date(currentWeekStart);
    wStart.setDate(wStart.getDate() - i * 7);
    wStart.setHours(0, 0, 0, 0);
    const startMs = wStart.getTime();

    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 6);
    wEnd.setHours(23, 59, 59, 999);
    const endMs = wEnd.getTime();

    const periodKey = `W_${toDateStr(wStart)}`;
    const label = `Wk ${wStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    weekBuckets.push(buildBucket(periodKey, label, startMs, endMs));
  }

  // C. Months Bucket: Last 12 Months
  const monthBuckets: AdInjectionBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
    const startMs = mStart.getTime();

    const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const endMs = mEnd.getTime();

    const periodKey = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, "0")}`;
    const label = mStart.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    monthBuckets.push(buildBucket(periodKey, label, startMs, endMs));
  }

  return {
    timeSeries: {
      days: dayBuckets,
      weeks: weekBuckets,
      months: monthBuckets,
    },
    productLifecycleFunnel: {
      totalProductsTested,
      quickKills,
      activeTesting,
      scalingWinners,
      winRate,
    },
    dayOfWeekPattern,
    recentProductLaunches: productLaunchRecords.slice(0, 50),
  };
}
