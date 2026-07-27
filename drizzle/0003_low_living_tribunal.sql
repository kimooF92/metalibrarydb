CREATE TABLE "ad_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creative_scan_id" uuid NOT NULL,
	"ad_id" uuid NOT NULL,
	"tracked_page_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true,
	"duplication_count" integer DEFAULT 1 NOT NULL,
	"collation_id" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_archive_id" text NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text,
	"started_running_on" timestamp with time zone,
	"caption" text,
	"title" text,
	"cta_text" text,
	"link_url" text,
	"media_type" text,
	"media_urls" text[],
	"thumbnail_url" text,
	"thumbnail_storage_path" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ads_ad_archive_id_unique" UNIQUE("ad_archive_id")
);
--> statement-breakpoint
CREATE TABLE "creative_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_page_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"config_snapshot" text,
	"outcome_details" text,
	"extracted_count" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "queue" ADD COLUMN "job_type" text DEFAULT 'count' NOT NULL;--> statement-breakpoint
ALTER TABLE "queue" ADD COLUMN "creative_scan_id" uuid;--> statement-breakpoint
ALTER TABLE "ad_observations" ADD CONSTRAINT "ad_observations_creative_scan_id_creative_scans_id_fk" FOREIGN KEY ("creative_scan_id") REFERENCES "public"."creative_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_observations" ADD CONSTRAINT "ad_observations_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_observations" ADD CONSTRAINT "ad_observations_tracked_page_id_tracked_pages_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_scans" ADD CONSTRAINT "creative_scans_tracked_page_id_tracked_pages_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ad_obs_creative_scan_id" ON "ad_observations" USING btree ("creative_scan_id");--> statement-breakpoint
CREATE INDEX "idx_ad_obs_ad_id" ON "ad_observations" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "idx_ad_obs_tracked_page_id" ON "ad_observations" USING btree ("tracked_page_id");--> statement-breakpoint
CREATE INDEX "idx_ad_obs_duplication" ON "ad_observations" USING btree ("duplication_count");--> statement-breakpoint
CREATE INDEX "idx_ad_obs_scan_ad" ON "ad_observations" USING btree ("creative_scan_id","ad_id");--> statement-breakpoint
CREATE INDEX "idx_ads_ad_archive_id" ON "ads" USING btree ("ad_archive_id");--> statement-breakpoint
CREATE INDEX "idx_ads_page_id" ON "ads" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "idx_ads_started_running" ON "ads" USING btree ("started_running_on");--> statement-breakpoint
CREATE INDEX "idx_ads_media_type" ON "ads" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "idx_creative_scans_tracked_page_id" ON "creative_scans" USING btree ("tracked_page_id");--> statement-breakpoint
CREATE INDEX "idx_creative_scans_status" ON "creative_scans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_creative_scans_created_at" ON "creative_scans" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "queue" ADD CONSTRAINT "queue_creative_scan_id_creative_scans_id_fk" FOREIGN KEY ("creative_scan_id") REFERENCES "public"."creative_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_queue_job_type_status" ON "queue" USING btree ("job_type","status");