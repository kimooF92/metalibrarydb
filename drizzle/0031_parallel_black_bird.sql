CREATE TABLE "ad_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"media_hash" text NOT NULL,
	"model_version" varchar(50) DEFAULT 'faster-whisper-turbo-int8-v1' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"language" varchar(10),
	"language_confidence" numeric(3, 2),
	"full_text" text,
	"hook_text" text,
	"words" jsonb,
	"segments" jsonb,
	"duration_seconds" numeric(6, 2),
	"is_truncated" boolean DEFAULT false,
	"error_code" varchar(50),
	"error_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_json" json NOT NULL,
	"schema_version" text NOT NULL,
	"generation_mode" text NOT NULL,
	"requested_model" text NOT NULL,
	"returned_model" text,
	"generated_at" timestamp with time zone NOT NULL,
	"telemetry_start" timestamp with time zone NOT NULL,
	"telemetry_end" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_reports_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"album_url" text,
	"album_title" text,
	"photo_url" text NOT NULL,
	"raw_meta_url" text,
	"media_hash" text,
	"caption" text,
	"posted_at" timestamp with time zone,
	"is_promoted_to_product" boolean DEFAULT false NOT NULL,
	"promoted_product_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"name" text NOT NULL,
	"facebook_url" text NOT NULL,
	"facebook_page_id" text,
	"avatar_url" text,
	"phone" text,
	"whatsapp" text,
	"category" text DEFAULT 'general',
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_scrape_status" text DEFAULT 'idle' NOT NULL,
	"last_scrape_error" text,
	"last_checked_at" timestamp with time zone,
	"last_post_date" timestamp with time zone,
	"last_post_url" text,
	"last_post_text" text,
	"last_album_url" text,
	"last_album_title" text,
	"last_album_photo_count" integer DEFAULT 0,
	"has_unseen_drop" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country_code" text DEFAULT 'TN' NOT NULL,
	"currency" text DEFAULT 'TND' NOT NULL,
	"currency_symbol" text DEFAULT 'DT' NOT NULL,
	"flag" text DEFAULT '🇹🇳' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "activity_notifications" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "app_password_hash" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "app_password_salt" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "app_password_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brand_domains" ADD COLUMN "profile_pic_url" text;--> statement-breakpoint
ALTER TABLE "brand_domains" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD COLUMN "preview_product_url" text;--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD COLUMN "preview_product_title" text;--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD COLUMN "preview_product_image" text;--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD COLUMN "preview_product_price" text;--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD COLUMN "preview_product_currency" text DEFAULT 'TND';--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD COLUMN "preview_source" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD COLUMN "preview_scrape_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD COLUMN "preview_scrape_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_pages" ADD COLUMN "preview_scraped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD COLUMN "target_max_ads" integer DEFAULT 2500;--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD COLUMN "max_scrolls" integer DEFAULT 150;--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "queue" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "scan_history" ADD COLUMN "creative_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scraped_products" ADD COLUMN "is_favorite_staff" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "scraped_products" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "tracked_pages" ADD COLUMN "profile_pic_url" text;--> statement-breakpoint
ALTER TABLE "tracked_pages" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "ad_transcripts" ADD CONSTRAINT "ad_transcripts_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_reports" ADD CONSTRAINT "opportunity_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_photos" ADD CONSTRAINT "supplier_photos_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_photos" ADD CONSTRAINT "supplier_photos_promoted_product_id_scraped_products_id_fk" FOREIGN KEY ("promoted_product_id") REFERENCES "public"."scraped_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ad_transcripts_ad_media_model" ON "ad_transcripts" USING btree ("ad_id","media_hash","model_version");--> statement-breakpoint
CREATE INDEX "idx_ad_transcripts_ad_id" ON "ad_transcripts" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "idx_ad_transcripts_status" ON "ad_transcripts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ad_transcripts_language" ON "ad_transcripts" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_opportunity_reports_workspace_id" ON "opportunity_reports" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_opportunity_reports_status" ON "opportunity_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_opportunity_reports_generated_at" ON "opportunity_reports" USING btree ("generated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_supplier_photos_supplier_id" ON "supplier_photos" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_photos_posted_at" ON "supplier_photos" USING btree ("posted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_supplier_photos_album_url" ON "supplier_photos" USING btree ("album_url");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_supplier_photos_unique" ON "supplier_photos" USING btree ("supplier_id","photo_url");--> statement-breakpoint
CREATE INDEX "idx_suppliers_workspace_id" ON "suppliers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_status" ON "suppliers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_suppliers_has_unseen_drop" ON "suppliers" USING btree ("has_unseen_drop");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_suppliers_workspace_facebook_url" ON "suppliers" USING btree ("workspace_id","facebook_url");--> statement-breakpoint
CREATE INDEX "idx_workspaces_slug" ON "workspaces" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_workspaces_country_code" ON "workspaces" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "idx_workspaces_is_default" ON "workspaces" USING btree ("is_default");--> statement-breakpoint
ALTER TABLE "activity_notifications" ADD CONSTRAINT "activity_notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_domains" ADD CONSTRAINT "brand_domains_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue" ADD CONSTRAINT "queue_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_products" ADD CONSTRAINT "scraped_products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_pages" ADD CONSTRAINT "tracked_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notifications_workspace_id" ON "activity_notifications" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_ads_link_url" ON "ads" USING btree ("link_url");--> statement-breakpoint
CREATE INDEX "idx_ads_link_url_lower_trimmed" ON "ads" USING btree (LOWER(TRIM(TRAILING '/' FROM "link_url")));--> statement-breakpoint
CREATE INDEX "idx_ads_page_name_trgm" ON "ads" USING gin ("page_name" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_brand_domains_workspace_id" ON "brand_domains" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_discovered_pages_pending_preview" ON "discovered_pages" USING btree ("run_id") WHERE "discovered_pages"."preview_scrape_status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_discovery_runs_workspace_id" ON "discovery_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_workspace_id" ON "import_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_queue_workspace_id" ON "queue" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_scan_history_creative_scanned_at" ON "scan_history" USING btree ("creative_scanned_at");--> statement-breakpoint
CREATE INDEX "idx_scraped_products_workspace_id" ON "scraped_products" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_scraped_products_is_favorite_staff" ON "scraped_products" USING btree ("is_favorite_staff");--> statement-breakpoint
CREATE INDEX "idx_scraped_products_title_trgm" ON "scraped_products" USING gin ("title" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_scraped_products_domain_trgm" ON "scraped_products" USING gin ("domain" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_tracked_pages_workspace_id" ON "tracked_pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_tracked_pages_display_name_trgm" ON "tracked_pages" USING gin ("display_name" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_tracked_pages_canonical_domain_trgm" ON "tracked_pages" USING gin ("canonical_domain" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_tracked_pages_landing_page_trgm" ON "tracked_pages" USING gin ("landing_page" extensions.gin_trgm_ops);