-- 0019_brand_domains.sql: Multi-Page Brand Domain Portfolios Migration

-- 1. Create brand_domains table
CREATE TABLE IF NOT EXISTS "brand_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"display_name" text NOT NULL,
	"category" text,
	"store_platform" text,
	"notes" text,
	"is_watchlisted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint

-- 2. Add domain linking columns to tracked_pages
ALTER TABLE "tracked_pages" ADD COLUMN IF NOT EXISTS "brand_domain_id" uuid;
--> statement-breakpoint
ALTER TABLE "tracked_pages" ADD COLUMN IF NOT EXISTS "page_role" text DEFAULT 'primary';
--> statement-breakpoint
ALTER TABLE "tracked_pages" ADD COLUMN IF NOT EXISTS "canonical_domain" text;
--> statement-breakpoint

-- 3. Add brand_domain_id to scraped_products
ALTER TABLE "scraped_products" ADD COLUMN IF NOT EXISTS "brand_domain_id" uuid;
--> statement-breakpoint

-- 4. Add auto_domain_link to app_settings
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "auto_domain_link" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

-- 5. Foreign Key Constraints
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tracked_pages_brand_domain_id_brand_domains_id_fk'
  ) THEN
    ALTER TABLE "tracked_pages"
      ADD CONSTRAINT "tracked_pages_brand_domain_id_brand_domains_id_fk"
      FOREIGN KEY ("brand_domain_id") REFERENCES "public"."brand_domains"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scraped_products_brand_domain_id_brand_domains_id_fk'
  ) THEN
    ALTER TABLE "scraped_products"
      ADD CONSTRAINT "scraped_products_brand_domain_id_brand_domains_id_fk"
      FOREIGN KEY ("brand_domain_id") REFERENCES "public"."brand_domains"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- 6. Indexes
CREATE INDEX IF NOT EXISTS "idx_brand_domains_domain" ON "brand_domains" USING btree ("domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_brand_domains_watchlist" ON "brand_domains" USING btree ("is_watchlisted");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracked_pages_brand_domain_id" ON "tracked_pages" USING btree ("brand_domain_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracked_pages_canonical_domain" ON "tracked_pages" USING btree ("canonical_domain");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tracked_pages_unique_primary" ON "tracked_pages" USING btree ("brand_domain_id") WHERE page_role = 'primary';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scraped_products_brand_domain_id" ON "scraped_products" USING btree ("brand_domain_id");
--> statement-breakpoint

-- 7. Row Level Security for brand_domains
ALTER TABLE "brand_domains" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brand_domains' AND policyname = 'Allow all operations for service role'
  ) THEN
    CREATE POLICY "Allow all operations for service role" ON "brand_domains" FOR ALL USING (true);
  END IF;
END $$;