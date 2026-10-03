import { ScrapedProduct, TrackedPage } from "./index";

export type MainAnalyticsTab = "products" | "ads" | "pages";
export type DateRange = "today" | "7d" | "15d" | "30d";

export interface ProductCategoryStats {
  name: string;
  count: number;
  storesCount: number;
  opportunityScore: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  withOffersCount: number;
  offerRate: number;
  platforms: {
    shopify: number;
    youcan: number;
    woocommerce: number;
  };
}

export interface ProductSubCategoryStats {
  category: string;
  name: string;
  count: number;
  avgPrice: number;
}

export interface ProductPriceTierStats {
  tier: string;
  tierKey: string;
  count: number;
  avgPrice: number;
}

export interface ProductPlatformStats {
  name: string;
  count: number;
}

export interface CrossStoreClone {
  title: string;
  storeCount: number;
  productCount: number;
  domains: string[];
  sampleImage: string | null;
  category: string | null;
  minPrice: number;
  maxPrice: number;
}

export interface ProductsAnalyticsData {
  summary?: {
    totalProducts?: number;
    successfulScrapes?: number;
    withOffersCount?: number;
    favoritesCount?: number;
    newInWindow?: number;
    hasMetaPixel?: number;
    hasWhatsApp?: number;
    hasFreeDelivery?: number;
  };
  dataQuality?: {
    totalProducts?: number;
    classifiedCount?: number;
    classifiedRate?: number;
    parsedPriceCount?: number;
    priceParsedRate?: number;
  };
  categories?: ProductCategoryStats[];
  subCategories?: ProductSubCategoryStats[];
  priceTiers?: ProductPriceTierStats[];
  platforms?: ProductPlatformStats[];
  topProducts?: ScrapedProduct[];
  crossStoreClones?: CrossStoreClone[];
}

export interface LongevityCohort {
  key: string;
  label: string;
  order?: number;
  count: number;
  activeCount: number;
  survivalRate: number;
  avgDuplication: number;
}

export interface FormatEfficiency {
  mediaType: string;
  count: number;
  activeCount: number;
  avgDuplication: number;
  maxDuplication: number;
  sharePct: number;
}

export interface CTAStats {
  name: string;
  count: number;
  sharePct: number;
  avgDuplication?: number;
  avgDuplications?: number;
}

export interface BreakoutAd {
  id: string;
  adArchiveId: string;
  pageName: string | null;
  pageId: string;
  startedRunningOn: string | null;
  firstSeenAt: string;
  caption: string | null;
  title: string | null;
  ctaText: string | null;
  linkUrl: string | null;
  mediaType: "image" | "video" | "carousel" | "unknown" | null;
  thumbnailUrl: string | null;
  thumbnailStoragePath: string | null;
  duplicationCount: number;
  isActive: boolean | null;
  daysRunning?: number;
}

export interface TopAdvertiser {
  pageName: string;
  pageId: string;
  adCount: number;
  videoCount: number;
  videoRatio: number;
  avgDuplication: number;
  maxDuplication: number;
}

export interface AdsAnalyticsData {
  summary?: {
    totalAds?: number;
    activeAds?: number;
    videoAds?: number;
    imageAds?: number;
    carouselAds?: number;
    scaledAdsCount?: number;
    breakoutAdsCount?: number;
    avgDuplication?: number;
    maxDuplication?: number;
    videoSharePct?: number;
  };
  longevityCohorts?: LongevityCohort[];
  formatEfficiency?: FormatEfficiency[];
  ctaPsychology?: {
    allCtas?: CTAStats[];
    scaledCtas?: CTAStats[];
  };
  copyIntelligence?: {
    lengths?: Array<{
      tier: string;
      key: string;
      count: number;
      sharePct: number;
      avgDuplication: number;
    }>;
    triggers?: {
      discountRate?: number;
      urgencyRate?: number;
      hasArabicRate?: number;
      hasFrenchRate?: number;
    };
  };
  duplicationTiers?: Array<{
    tier: string;
    key: string;
    count: number;
    sharePct: number;
  }>;
  breakoutAds?: BreakoutAd[];
  topAdvertisers?: TopAdvertiser[];
}

export interface BrandAnalyticsCalculations {
  scalingPages: TrackedPage[];
  descalingPages: TrackedPage[];
  withResults: TrackedPage[];
  zeroAds: TrackedPage[];
  failed: TrackedPage[];
  unclear: TrackedPage[];
  totalAdsScaled: number;
  totalAdsDescaled: number;
  netAdsDelta: number;
  avgScalingDelta: string;
  avgDescalingDelta: string;
  aggressiveScaling: TrackedPage[];
  rapidScaling: TrackedPage[];
  moderateScaling: TrackedPage[];
  heavyDescaling: TrackedPage[];
  moderateDescaling: TrackedPage[];
  lightDescaling: TrackedPage[];
  megaVolume: TrackedPage[];
  highVolume: TrackedPage[];
  midVolume: TrackedPage[];
  lowVolume: TrackedPage[];
  watchlistedPages: TrackedPage[];
  watchlistedScaling: TrackedPage[];
  watchlistedDescaling: TrackedPage[];
  totalAds: number;
  maxResults: number;
}
