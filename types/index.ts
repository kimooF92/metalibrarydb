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
  mediaType: "image" | "video" | "carousel" | "unknown" | null;
  mediaUrls: string[] | null;
  thumbnailUrl: string | null;
  thumbnailStoragePath: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;

  // Joined observation fields for feed display
  duplicationCount?: number;
  isActive?: boolean;
  trackedPageId?: string;
  signedThumbnailUrl?: string | null;
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

export interface AdFilterParams {
  trackedPageId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  minDaysRunning?: number;
  minDuplications?: number;
  mediaType?: "all" | "image" | "video" | "carousel";
  status?: "all" | "active" | "inactive" | "unknown";
  sortBy?: "started_running_on" | "duplication_count" | "first_seen_at";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  enabled?: boolean;
}

