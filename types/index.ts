export interface TrackedPage {
  id: string;
  url: string;
  displayName: string | null;
  searchType: string | null;
  pageId: string | null;
  currentResults: number | null;
  previousResults?: number | null;
  difference?: number | null;
  lastChecked: string | null;
  lastSuccessAt: string | null;
  status: "pending" | "scanning" | "success" | "failed" | "unclear";
  createdAt: string;
  updatedAt: string;
  // Extended fields
  failureReason?: string | null;
  attempts?: number | null;
  notes?: string | null;
  isWatchlisted?: boolean;
  lastCreativeScan?: string | null;
  isCreativeQueued?: boolean;
  historyPoints?: number[];
  approxProductCount?: number | null;
  extractedAdCount?: number | null;
  discoveredPagesCount?: number | null;
}

export interface ScanHistoryEntry {
  id: string;
  trackedPageId: string;
  results: number | null;
  difference: number | null;
  checkedAt: string;
  status: "success" | "failed" | "unclear";
  failureReason?: string | null;
}

export interface WorkerState {
  id: number;
  isPaused: boolean;
  consecutiveFailures: number;
  lastFailureAt: string | null;
  backoffUntil: string | null;
  scansThisHour: number;
  hourWindowStart: string | null;
  scansToday: number;
  dayWindowStart: string | null;
  updatedAt: string;
}

export interface DashboardStats {
  totalPages: number;
  pending: number;
  scanning: number;
  completed: number;
  failed: number;
  unclear: number;
  averageResults: number;
  highestResults: number;
  lastImport: {
    id: string;
    filename: string;
    createdAt: string;
    totalRows: number;
  } | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TopMover {
  id: string;
  displayName: string | null;
  url: string;
  currentResults: number | null;
  difference: number;
}

export interface CreativeScan {
  id: string;
  trackedPageId: string;
  status: "pending" | "running" | "completed" | "partial" | "failed";
  configSnapshot?: string | null;
  outcomeDetails?: string | null;
  extractedCount: number;
  failureReason?: "captcha" | "rate_limited" | "payload_not_found" | "parse_error" | "timeout" | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface ScrapedProduct {
  id: string;
  url: string;
  domain: string | null;
  pageId: string | null;
  title: string | null;
  currentPrice: string | null;
  originalPrice: string | null;
  currency: string | null;
  discountOrOffer: string | null;
  mainImageUrl: string | null;
  galleryImages?: string[] | null;
  allOffers?: Array<{ tierName: string; price: string; savings?: string }> | null;
  rawExtract?: any;
  phoneNumbers?: string[] | null;
  whatsappNumbers?: string[] | null;
  metaPixelIds?: string[] | null;
  storePlatform?: string | null;
  deliveryCost?: string | null;
  category?: string | null;
  subCategory?: string | null;
  targetAudience?: "unisex" | "men" | "women" | "kids" | null;
  supplierUrls?: string[] | null;
  isFavorite?: boolean;
  scrapeStatus: "pending" | "scraping" | "success" | "failed";
  failureReason?: string | null;
  lastScrapedAt: string | null;
  createdAt: string;
  updatedAt: string;
  linkedAdsCount?: number;
  activeAdsCount?: number;
  maxDuplications?: number;
  daysRunning?: number;
  brandName?: string | null;
  brandPageId?: string | null;
  topCreativeThumbnail?: string | null;
  earliestAdDate?: string | null;
  latestAdDate?: string | null;
}

export interface Ad {
  id: string;
  adArchiveId: string;
  pageId: string;
  pageName: string | null;
  startedRunningOn: string | null;
  caption: string | null;
  title: string | null;
  ctaText: string | null;
  linkUrl: string | null;
  productId?: string | null;
  product?: ScrapedProduct | null;
  mediaType: "image" | "video" | "carousel" | "unknown" | null;
  mediaUrls: string[] | null;
  thumbnailUrl: string | null;
  thumbnailStoragePath: string | null;
  storyboardUrls?: string[] | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;

  // Joined observation fields for feed display
  duplicationCount?: number;
  isActive?: boolean;
  isArchived?: boolean;
  archivedAt?: string | null;
  trackedPageId?: string;
  signedThumbnailUrl?: string | null;

  // Media Hashing & Creative Clustering Intelligence
  mediaHash?: string | null;
  perceptualHash?: string | null;
  creativeClusterKey?: string;
  creativeMetrics?: {
    clusterKey: string;
    totalAdSets: number;
    distinctBrandsCount: number;
    brands: Array<{
      pageId: string;
      pageName: string;
      firstSeenAt: string | Date | null;
      adCount: number;
    }>;
    originalCreator: {
      pageId: string;
      pageName: string;
      firstSeenAt: string | Date | null;
      adCount: number;
    } | null;
    isCrossBrand: boolean;
    isScalingWinner: boolean;
    firstSeenAt: Date | string | null;
    lastSeenAt: Date | string | null;
    activeAdsCount: number;
    mediaType: string;
  };
  creativeVariants?: any[];

  // Winner Score & Breakout Intelligence
  winnerScore?: number;
  winnerTier?: "super" | "high" | "promising" | "testing";
  isBreakout?: boolean;
  isEvergreen?: boolean;
  daysRunning?: number;
  winnerBreakdown?: {
    longevityPts: number;
    scalePts: number;
    recencyPts: number;
    bonusPts: number;
  };

  // Product Clustering & Creative Angle Intelligence
  productKey?: string;
  productName?: string;
  cleanProductUrl?: string | null;
  productCreativeCount?: number;
  productVideoCount?: number;
  productImageCount?: number;
  brandProductCount?: number;
  brandTotalCreatives?: number;
  productSharePercent?: number;
  isFlagshipProduct?: boolean;
}

export interface AdObservation {
  id: string;
  creativeScanId: string;
  adId: string;
  trackedPageId: string;
  isActive: boolean | null;
  duplicationCount: number;
  collationId?: string | null;
  observedAt: string;
}

export interface AdSpyStats {
  totalAdsCaptured: number;
  launchedLast7Days: number;
  scaledAdsCount: number; // ads with duplicationCount >= 5
  mediaDistribution: {
    image: number;
    video: number;
    carousel: number;
    other: number;
  };
}

export interface BrandOption {
  id: string;
  pageId: string;
  displayName: string;
  adCount?: number;
  isWatchlisted?: boolean;
}

export interface AdFilterParams {
  trackedPageId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  minDaysRunning?: number;
  minDuplications?: number;
  minWinnerScore?: number;
  minProductCreatives?: number;
  productKey?: string;
  productId?: string;
  mediaType?: "all" | "image" | "video" | "carousel";
  status?: "all" | "active" | "inactive" | "archived" | "unknown";
  ctaText?: string;
  isWatchlisted?: boolean;
  excludePageIds?: string[];
  smartPreset?: string;
  groupBy?: "none" | "creative";
  sortBy?:
    | "started_running_on"
    | "oldest"
    | "duplication_count"
    | "recently_observed"
    | "first_seen_at"
    | "winner_score"
    | "product_creatives";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  enabled?: boolean;
}
