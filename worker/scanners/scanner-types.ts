export interface ExtractedAdData {
  adArchiveId: string;
  pageId: string;
  pageName: string | null;
  startedRunningOn: Date | null;
  caption: string | null;
  title: string | null;
  ctaText: string | null;
  linkUrl: string | null;
  mediaType: "image" | "video" | "carousel" | "unknown";
  mediaUrls: string[];
  thumbnailUrl: string | null;
  profilePicUrl?: string | null;
  duplicationCount: number;
  collationId: string | null;
  isActive: boolean;
  secondaryProductUrls?: string[];
}

export interface SpyScanOutcome {
  status: "completed" | "partial" | "failed";
  extractedCount: number;
  newProductsCount?: number;
  extractedPageIds?: string[];
  failureReason?: "captcha" | "rate_limited" | "payload_not_found" | "parse_error" | "timeout";
  outcomeDetails?: string;
}

export interface DiscoveredPageData {
  pageId: string;
  displayName: string | null;
  matchingAdCount: number;
  sampleAdArchiveIds: Set<string>;
  sampleCtas: Set<string>;
  sampleUrls: Set<string>;
}

export interface DiscoveryScanOutcome {
  status: "completed" | "partial" | "failed";
  totalAdsScanned: number;
  totalPagesDiscovered: number;
  failureReason?: "captcha" | "rate_limited" | "payload_not_found" | "timeout";
  outcomeDetails?: string;
}

