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

// 4. Queue Table
export const queue = pgTable(
  "queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trackedPageId: uuid("tracked_page_id")
      .notNull()
      .references(() => trackedPages.id, { onDelete: "cascade" }),
    status: text("status").default("pending"), // pending | running | completed | failed
    attempts: integer("attempts").default(0),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_queue_status").on(table.status),
    index("idx_queue_created_at").on(table.createdAt),
    index("idx_queue_page_created_at").on(
      table.trackedPageId,
      table.createdAt.desc()
    ),
  ]
);

// 5. Worker State Table (Single-row table for global worker state & controls)
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
