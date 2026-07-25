CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"file_path" text,
	"total_rows" integer DEFAULT 0,
	"successful" integer DEFAULT 0,
	"failed" integer DEFAULT 0,
	"duplicates" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_page_id" uuid NOT NULL,
	"status" text DEFAULT 'pending',
	"attempts" integer DEFAULT 0,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scan_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_page_id" uuid NOT NULL,
	"results" integer,
	"difference" integer,
	"checked_at" timestamp with time zone DEFAULT now(),
	"status" text,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "tracked_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"display_name" text,
	"search_type" text,
	"page_id" text,
	"current_results" integer,
	"last_checked" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"status" text DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"country" text,
	"landing_page" text,
	"ad_count" integer,
	"video_count" integer,
	"image_count" integer,
	"notes" text,
	"tags" text[],
	"ai_summary" text,
	"last_creative_scan" timestamp with time zone,
	"creative_hash" text,
	CONSTRAINT "tracked_pages_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "worker_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"is_paused" boolean DEFAULT false,
	"consecutive_failures" integer DEFAULT 0,
	"last_failure_at" timestamp with time zone,
	"backoff_until" timestamp with time zone,
	"scans_this_hour" integer DEFAULT 0,
	"hour_window_start" timestamp with time zone,
	"scans_today" integer DEFAULT 0,
	"day_window_start" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "queue" ADD CONSTRAINT "queue_tracked_page_id_tracked_pages_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_history" ADD CONSTRAINT "scan_history_tracked_page_id_tracked_pages_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_queue_status" ON "queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_queue_created_at" ON "queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_scan_history_tracked_page_id" ON "scan_history" USING btree ("tracked_page_id");--> statement-breakpoint
CREATE INDEX "idx_scan_history_checked_at" ON "scan_history" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "idx_tracked_pages_status" ON "tracked_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tracked_pages_page_id" ON "tracked_pages" USING btree ("page_id");