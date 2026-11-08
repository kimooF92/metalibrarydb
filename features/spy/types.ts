import type { Ad, ScrapedProduct, AdFilterParams, BrandOption } from "@/types";
import type { BrandCadenceAnalytics } from "@/types/cadence";
import type { BrandTabId } from "@/components/spy/brand-deep-dive-tabs";
import type { LucideIcon } from "lucide-react";

// Re-export shared types for feature convenience
export type { AdFilterParams, BrandOption, BrandTabId };

export interface SmartPill {
  id: string;
  label: string;
  icon: LucideIcon | any;
  colorClass: string;
  activeColorClass: string;
  description: string;
}

export interface SpyFiltersProps {
  filters: AdFilterParams;
  viewMode: "grid" | "list";
  filteredCount?: number;
  totalCount?: number;
  isLoading?: boolean;
  onViewModeChange: (mode: "grid" | "list") => void;
  onFilterChange: (newFilters: Partial<AdFilterParams>) => void;
  onReset: () => void;
}

export interface AdCardProps {
  ad: Ad;
  onArchiveToggle?: () => void;
  onExcludeBrand?: (pageId: string) => void;
  onMediaRefreshed?: (newAd: Ad) => void;
}

export interface AdMediaConfig {
  firstVideoUrl: string | null;
  displayThumbnail: string | null;
  isVideoAd: boolean;
  isVideoExpired: boolean;
  canPlayVideo: boolean;
  isCarousel: boolean;
  previewImages: string[];
  carouselIndex: number;
  isProxied: boolean;
  imgError: boolean;
  videoError: boolean;
  isLoadingMedia: boolean;
  isPlayingVideo: boolean;
  activeImageSrc: string | null;
  mediaType?: string | null;
  title?: string | null;
}

export interface AdActionsConfig {
  destinationUrl: string | null;
  targetDomain: string | null;
  ctaText?: string | null;
  extractedProduct: ScrapedProduct | null;
  isExtractingProduct: boolean;
  isRefreshingMedia: boolean;
  isArchiving: boolean;
  isArchived: boolean;
  canPlayVideo: boolean;
  firstVideoUrl: string | null;
  displayThumbnail: string | null;
  isVideoAd: boolean;
  adArchiveId: string;
  startedRunningOn?: string | null;
  firstSeenAt?: string | null;
}

export interface BrandAnalyticsData {
  success: boolean;
  brand: {
    id: string | null;
    pageId: string;
    displayName: string;
    profilePicUrl?: string | null;
    url: string;
    country: string | null;
    landingPage: string | null;
    isWatchlisted: boolean;
    lastChecked: string | null;
    lastCreativeScan: string | null;
    status: string;
    currentResults: number;
    isTracked: boolean;
    holdStatus?: string | null;
    lastKnownValidResults?: number | null;
    consecutiveZeroScans?: number | null;
    lastSuccessAt?: string | null;
  };
  summary: {
    totalAdsCaptured: number;
    activeAdsCount: number;
    inactiveAdsCount: number;
    archivedAdsCount: number;
    totalDuplicationCount: number;
    avgDuplicationsPerAd: number;
    winnerCount: number;
    breakoutCount: number;
    evergreenCount: number;
    evergreenRate: number;
    distinctProductsCount: number;
    totalProductsCount?: number;
    pendingProductsCount?: number;
  };
  mediaDistribution: {
    video: number;
    image: number;
    carousel: number;
    other: number;
    videoPercent: number;
    imagePercent: number;
    carouselPercent: number;
  };
  longevityDistribution: {
    fresh: number;
    scaling: number;
    evergreen: number;
    veteran: number;
    freshPercent: number;
    scalingPercent: number;
    evergreenPercent: number;
    veteranPercent: number;
  };
  ctaDistribution: Array<{ cta: string; count: number; percent: number }>;
  launchVelocity?: {
    launchedLast7Days: number;
    launchedLast30Days: number;
    activeRetentionRate: number;
    longestRunningDays: number;
    avgLifespanDays: number;
    testingIntensity: string;
  };
  commercialStrategy?: {
    totalCatalogProducts: number;
    scrapedProductsCount: number;
    minPrice: number | null;
    maxPrice: number | null;
    avgPrice: number | null;
    currency: string;
    discountedProductsCount: number;
    hasFreeDelivery: boolean;
  };
  cadence?: BrandCadenceAnalytics;
  productClusters: Array<{
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
  }>;
  products?: ScrapedProduct[];
  topWinners: Ad[];
  history: Array<{
    id: string;
    results: number;
    difference: number;
    checkedAt: string;
    status: string;
  }>;
  brandDomain?: {
    id: string;
    domain: string;
    displayName: string;
  } | null;
  sisterPages?: Array<{
    id: string;
    pageId: string;
    displayName: string;
    pageRole: "primary" | "satellite" | "backup" | null;
    currentResults: number;
  }>;
  isDomainPortfolio?: boolean;
  storeTech: {
    platforms: string[];
    pixelIds: string[];
    phoneNumbers: string[];
    whatsappNumbers: string[];
  };
}

export interface BrandDeepDiveViewProps {
  id: string;
  isModal?: boolean;
  initialTab?: BrandTabId;
  onClose?: () => void;
}

