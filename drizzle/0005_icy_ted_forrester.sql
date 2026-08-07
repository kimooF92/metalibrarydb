CREATE TABLE "discovered_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"display_name" text,
	"country" text DEFAULT 'TN',
	"matching_ad_count" integer DEFAULT 0 NOT NULL,
	"verified_ad_count" integer,
	"sample_ad_archive_ids" text[],
	"sample_ctas" text[],
	"sample_urls" text[],
	"status" text DEFAULT 'discovered' NOT NULL,
	"tracked_page_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text DEFAULT 'TN' NOT NULL,
	"search_url" text NOT NULL,
	"query" text,
	"start_date_min" timestamp with time zone,
	"start_date_max" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_ads_scanned" integer DEFAULT 0 NOT NULL,
	"total_pages_discovered" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"outcome_details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "queue" ALTER COLUMN "tracked_page_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "is_archived" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "queue" ADD COLUMN "discovered_page_id" uuid;--> statement-breakpoint
ALTER TABLE "queue" ADD COLUMN "priority" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD CONSTRAINT "discovered_pages_run_id_discovery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."discovery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD CONSTRAINT "discovered_pages_tracked_page_id_tracked_pages_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_discovered_pages_run_id" ON "discovered_pages" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_discovered_pages_page_id" ON "discovered_pages" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "idx_discovered_pages_status" ON "discovered_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discovered_pages_run_page" ON "discovered_pages" USING btree ("run_id","page_id");--> statement-breakpoint
CREATE INDEX "idx_discovery_runs_status" ON "discovery_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discovery_runs_created_at" ON "discovery_runs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "queue" ADD CONSTRAINT "queue_discovered_page_id_discovered_pages_id_fk" FOREIGN KEY ("discovered_page_id") REFERENCES "public"."discovered_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ad_obs_ad_observed" ON "ad_observations" USING btree ("ad_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ad_obs_page_observed" ON "ad_observations" USING btree ("tracked_page_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ads_is_archived" ON "ads" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX "idx_queue_priority_created_at" ON "queue" USING btree ("priority" DESC NULLS LAST,"created_at");--> statement-breakpoint
CREATE INDEX "idx_queue_discovered_page_id" ON "queue" USING btree ("discovered_page_id");