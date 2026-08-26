import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  json,
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
    discoveredPagesCount: integer("discovered_pages_count").default(0),
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

// 4b. Scraped Products Table (Landing page extracted products)
export const scrapedProducts = pgTable(
  "scraped_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    url: text("url").notNull().unique(), // Normalized destination URL (stripped of UTM/shims)
    domain: text("domain"),
    pageId: text("page_id"), // Associated brand page ID if known
    title: text("title"),
    currentPrice: text("current_price"),
    originalPrice: text("original_price"),
    currency: text("currency"),
    discountOrOffer: text("discount_or_offer"),
    mainImageUrl: text("main_image_url"),
    galleryImages: text("gallery_images").array(),
    allOffers: json("all_offers"),
    rawExtract: json("raw_extract"),
    phoneNumbers: text("phone_numbers").array(),
    whatsappNumbers: text("whatsapp_numbers").array(),
    metaPixelIds: text("meta_pixel_ids").array(),
    storePlatform: text("store_platform"),
    deliveryCost: text("delivery_cost"),
    category: text("category"), // e.g. Electronics & Tech, Beauty, Health & Care
    subCategory: text("sub_category"), // e.g. Smartwatches, Hair Care
    targetAudience: text("target_audience"), // unisex | men | women | kids
    isFavorite: boolean("is_favorite").default(false),
    scrapeStatus: text("scrape_status").default("pending").notNull(), // pending | scraping | success | failed
    failureReason: text("failure_reason"),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_scraped_products_url").on(table.url),
    index("idx_scraped_products_domain").on(table.domain),
    index("idx_scraped_products_page_id").on(table.pageId),
    index("idx_scraped_products_category").on(table.category),
    index("idx_scraped_products_is_favorite").on(table.isFavorite),
    index("idx_scraped_products_status").on(table.scrapeStatus),
    index("idx_scraped_products_store_platform").on(table.storePlatform),
    index("idx_scraped_products_created_at").on(table.createdAt.desc()),
    index("idx_scraped_products_status_created_at").on(
      table.scrapeStatus,
      table.createdAt.desc()
    ),
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
    productId: uuid("product_id").references(() => scrapedProducts.id, { onDelete: "set null" }),
    mediaType: text("media_type"), // 'image' | 'video' | 'carousel' | 'unknown'
    mediaUrls: text("media_urls").array(),
    thumbnailUrl: text("thumbnail_url"),
    thumbnailStoragePath: text("thumbnail_storage_path"),
    storyboardUrls: text("storyboard_urls").array(), // 5-shot timestamp hover preview frames
    mediaHash: text("media_hash"), // SHA-256 binary hash (exact content-addressable key)
    perceptualHash: text("perceptual_hash"), // 64-bit Hex dHash (visual structure fingerprint)
    creativeClusterId: uuid("creative_cluster_id"), // Linked creative cluster identifier
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
    index("idx_ads_product_id").on(table.productId),
    index("idx_ads_product_id_archived").on(table.productId, table.isArchived),
    index("idx_ads_media_hash").on(table.mediaHash),
    index("idx_ads_perceptual_hash").on(table.perceptualHash),
    index("idx_ads_creative_cluster_id").on(table.creativeClusterId),
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

// 11. Activity Notifications Table (Unified In-App Notification Center)
export const activityNotifications = pgTable(
  "activity_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(), // count_scan | ad_spy | page_merged | multi_page_detected | system_alert
    title: text("title").notNull(),
    message: text("message").notNull(),
    severity: text("severity").default("info").notNull(), // info | success | warning | error
    trackedPageId: uuid("tracked_page_id").references(() => trackedPages.id, { onDelete: "cascade" }),
    adArchiveId: text("ad_archive_id"),
    actionUrl: text("action_url"),
    metadata: json("metadata"),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_notifications_created_at").on(table.createdAt.desc()),
    index("idx_notifications_is_read").on(table.isRead),
    index("idx_notifications_type").on(table.type),
    index("idx_notifications_tracked_page_id").on(table.trackedPageId),
  ]
);

// 12. Application Settings Table (Dynamic Configuration)
export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("default"),
  defaultCountry: text("default_country").default("TN").notNull(),
  autoMerge: boolean("auto_merge").default(true).notNull(),
  staleHours: integer("stale_hours").default(12).notNull(),
  autoSpyThreshold: integer("auto_spy_threshold").default(1).notNull(),
  discoveryWindowDays: integer("discovery_window_days").default(7).notNull(),
  autoB2Backup: boolean("auto_b2_backup").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
