import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// 1. Tracked Pages Table
export const trackedPages = pgTable(
  "tracked_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    url: text("url").notNull().unique(),
    displayName: text("display_name"),
    searchType: text("search_type"),
    pageId: text("page_id"),
    currentResults: integer("current_results"),
    lastChecked: timestamp("last_checked", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    status: text("status").default("pending"), // pending | scanning | success | failed | unclear
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),

    // Future-proof fields (nullable, reserved for future expansion — PRD §23)
    country: text("country"),
    landingPage: text("landing_page"),
    adCount: integer("ad_count"),
    videoCount: integer("video_count"),
    imageCount: integer("image_count"),
    notes: text("notes"),
    tags: text("tags").array(),
    aiSummary: text("ai_summary"),
    lastCreativeScan: timestamp("last_creative_scan", { withTimezone: true }),
    creativeHash: text("creative_hash"),
    isWatchlisted: boolean("is_watchlisted").default(false),
  },
  (table) => [
    index("idx_tracked_pages_status").on(table.status),
    index("idx_tracked_pages_page_id").on(table.pageId),
    index("idx_tracked_pages_watchlist").on(table.isWatchlisted),
  ]
);

// 2. Scan History Table
export const scanHistory = pgTable(
  "scan_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trackedPageId: uuid("tracked_page_id")
      .notNull()
      .references(() => trackedPages.id, { onDelete: "cascade" }),
    results: integer("results"),
    difference: integer("difference"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow(),
    status: text("status"), // success | failed | unclear
    failureReason: text("failure_reason"), // timeout | navigation_error | element_missing | pattern_not_found | captcha | rate_limited
  },
  (table) => [
    index("idx_scan_history_tracked_page_id").on(table.trackedPageId),
    index("idx_scan_history_checked_at").on(table.checkedAt),
    index("idx_scan_history_page_checked_at").on(
      table.trackedPageId,
      table.checkedAt.desc()
    ),
  ]
);

// 3. Import Jobs Table
export const importJobs = pgTable("import_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: text("filename").notNull(),
  filePath: text("file_path"), // Supabase Storage path
  totalRows: integer("total_rows").default(0),
  successful: integer("successful").default(0),
  failed: integer("failed").default(0),
  duplicates: integer("duplicates").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 4. Creative Scans Table
export const creativeScans = pgTable(
  "creative_scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trackedPageId: uuid("tracked_page_id")
      .notNull()
      .references(() => trackedPages.id, { onDelete: "cascade" }),
    status: text("status").default("pending").notNull(), // pending | running | completed | partial | failed
    configSnapshot: text("config_snapshot"), // JSON snapshot of scan settings
    outcomeDetails: text("outcome_details"), // Summary / notes
    extractedCount: integer("extracted_count").default(0).notNull(),
    failureReason: text("failure_reason"), // captcha | rate_limited | payload_not_found | parse_error | timeout
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_creative_scans_tracked_page_id").on(table.trackedPageId),
    index("idx_creative_scans_status").on(table.status),
    index("idx_creative_scans_created_at").on(table.createdAt),
  ]
);

// 5. Canonical Ads Table
export const ads = pgTable(
  "ads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adArchiveId: text("ad_archive_id").notNull().unique(), // Meta's unique Ad Archive ID
    pageId: text("page_id").notNull(),
    pageName: text("page_name"),
    startedRunningOn: timestamp("started_running_on", { withTimezone: true }),
    caption: text("caption"),
    title: text("title"),
    ctaText: text("cta_text"),
    linkUrl: text("link_url"),
    mediaType: text("media_type"), // 'image' | 'video' | 'carousel' | 'unknown'
    mediaUrls: text("media_urls").array(),
    thumbnailUrl: text("thumbnail_url"),
    thumbnailStoragePath: text("thumbnail_storage_path"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    isArchived: boolean("is_archived").default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ads_ad_archive_id").on(table.adArchiveId),
    index("idx_ads_page_id").on(table.pageId),
    index("idx_ads_started_running").on(table.startedRunningOn),
    index("idx_ads_media_type").on(table.mediaType),
    index("idx_ads_is_archived").on(table.isArchived),
  ]
);

// 6. Ad Observations Table (Links ad to creative_scan and tracked_page)
export const adObservations = pgTable(
  "ad_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creativeScanId: uuid("creative_scan_id")
      .notNull()
      .references(() => creativeScans.id, { onDelete: "cascade" }),
    adId: uuid("ad_id")
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    trackedPageId: uuid("tracked_page_id")
      .notNull()
      .references(() => trackedPages.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").default(true),
    duplicationCount: integer("duplication_count").default(1).notNull(),
    collationId: text("collation_id"),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ad_obs_creative_scan_id").on(table.creativeScanId),
    index("idx_ad_obs_ad_id").on(table.adId),
    index("idx_ad_obs_tracked_page_id").on(table.trackedPageId),
    index("idx_ad_obs_duplication").on(table.duplicationCount),
    index("idx_ad_obs_scan_ad").on(table.creativeScanId, table.adId),
    index("idx_ad_obs_ad_observed").on(table.adId, table.observedAt.desc()),
    index("idx_ad_obs_page_observed").on(table.trackedPageId, table.observedAt.desc()),
  ]
);

// 7. Queue Table
export const queue = pgTable(
  "queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trackedPageId: uuid("tracked_page_id").references(() => trackedPages.id, { onDelete: "cascade" }),
    discoveredPageId: uuid("discovered_page_id").references(() => discoveredPages.id, { onDelete: "cascade" }),
    jobType: text("job_type").default("count").notNull(), // count | creative | discovery_count
    priority: integer("priority").default(1).notNull(), // 1 (routine background refresh) | 10 (user-initiated high priority)
    creativeScanId: uuid("creative_scan_id").references(() => creativeScans.id, { onDelete: "set null" }),
    status: text("status").default("pending"), // pending | running | completed | failed
    attempts: integer("attempts").default(0),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_queue_status").on(table.status),
    index("idx_queue_job_type_status").on(table.jobType, table.status),
    index("idx_queue_priority_created_at").on(table.priority.desc(), table.createdAt),
    index("idx_queue_created_at").on(table.createdAt),
    index("idx_queue_page_created_at").on(
      table.trackedPageId,
      table.createdAt.desc()
    ),
    index("idx_queue_discovered_page_id").on(table.discoveredPageId),
  ]
);

// 8. Worker State Table (Single-row table for global worker state & controls)
export const workerState = pgTable("worker_state", {
  id: integer("id").default(1).primaryKey(),
  isPaused: boolean("is_paused").default(false),
  consecutiveFailures: integer("consecutive_failures").default(0),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  backoffUntil: timestamp("backoff_until", { withTimezone: true }),
  scansThisHour: integer("scans_this_hour").default(0),
  hourWindowStart: timestamp("hour_window_start", { withTimezone: true }),
  scansToday: integer("scans_today").default(0),
  dayWindowStart: timestamp("day_window_start", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 9. Discovery Runs Table
export const discoveryRuns = pgTable(
  "discovery_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    country: text("country").notNull().default("TN"),
    searchUrl: text("search_url").notNull(),
    query: text("query"),
    startDateMin: timestamp("start_date_min", { withTimezone: true }),
    startDateMax: timestamp("start_date_max", { withTimezone: true }),
    status: text("status").default("pending").notNull(), // pending | running | completed | partial | failed
    totalAdsScanned: integer("total_ads_scanned").default(0).notNull(),
    totalPagesDiscovered: integer("total_pages_discovered").default(0).notNull(),
    failureReason: text("failure_reason"),
    outcomeDetails: text("outcome_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_discovery_runs_status").on(table.status),
    index("idx_discovery_runs_created_at").on(table.createdAt),
  ]
);

// 10. Discovered Pages Table
export const discoveredPages = pgTable(
  "discovered_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => discoveryRuns.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull(),
    displayName: text("display_name"),
    country: text("country").default("TN"),
    matchingAdCount: integer("matching_ad_count").default(0).notNull(),
    verifiedAdCount: integer("verified_ad_count"),
    sampleAdArchiveIds: text("sample_ad_archive_ids").array(),
    sampleCtas: text("sample_ctas").array(),
    sampleUrls: text("sample_urls").array(),
    status: text("status").default("discovered").notNull(), // discovered | verifying | imported | ignored
    trackedPageId: uuid("tracked_page_id").references(() => trackedPages.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_discovered_pages_run_id").on(table.runId),
    index("idx_discovered_pages_page_id").on(table.pageId),
    index("idx_discovered_pages_status").on(table.status),
    index("idx_discovered_pages_run_page").on(table.runId, table.pageId),
  ]
);


