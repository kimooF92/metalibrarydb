export type CadenceGranularity = "day" | "week" | "month";

export interface AdInjectionBucket {
  periodKey: string; // "2026-10-24" | "2026-W42" | "2026-10"
  label: string; // "Oct 24" | "W42 (Oct 13)" | "Oct 2026"
  dateStart: string; // ISO string of period start
  dateEnd: string; // ISO string of period end
  totalAds: number;
  totalCopies: number; // Duplication count sum (scaling/budget proxy)
  videoCount: number;
  imageCount: number;
  carouselCount: number;
  otherCount: number;
  newProductsLaunched: number;
  productIds: string[]; // Product IDs or URLs launched in this bucket
  adIds: string[]; // Ad IDs injected in this bucket
}

export interface ProductLaunchRecord {
  id: string;
  url: string;
  title: string;
  mainImageUrl: string | null;
  currentPrice: string | null;
  currency: string | null;
  launchedAt: string; // Earliest ad start timestamp
  daysSinceLaunch: number;
  totalAdsInjected: number;
  activeAdsCount: number;
  maxCopies: number;
  status: "killed" | "testing" | "scaling" | "winner";
  adIds: string[];
}

export interface DayOfWeekCadence {
  dayName: string; // "Sun", "Mon", ...
  dayIndex: number; // 0 = Sun, 1 = Mon ...
  adCount: number;
  percentage: number;
}

export interface BrandCadenceAnalytics {
  timeSeries: {
    days: AdInjectionBucket[]; // Last 30 days
    weeks: AdInjectionBucket[]; // Last 16 weeks
    months: AdInjectionBucket[]; // Last 12 months
  };
  productLifecycleFunnel: {
    totalProductsTested: number;
    quickKills: number; // Active < 7 days & now inactive
    activeTesting: number; // Active <= 21 days
    scalingWinners: number; // Active > 21 days or duplication >= 3
    winRate: number; // Percentage of scaling winners vs total tested
    productWinRate: number; // Exact product win rate %
    creativeWinRate: number; // Ad creative win rate %
    killRate: number; // Percentage of quickly killed products %
    totalWinnerAds: number; // Count of ads that scaled
    totalAdsAnalyzed: number; // Total ads analyzed
  };
  dayOfWeekPattern: DayOfWeekCadence[];
  recentProductLaunches: ProductLaunchRecord[];
}

