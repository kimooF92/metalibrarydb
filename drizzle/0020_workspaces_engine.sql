-- 0020_workspaces_engine.sql: Multi-Workspace Isolation & Management

-- 1. Create workspaces table
CREATE TABLE IF NOT EXISTS "workspaces" (
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

-- 2. Indexes for workspaces
CREATE INDEX IF NOT EXISTS "idx_workspaces_slug" ON "workspaces" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspaces_country_code" ON "workspaces" USING btree ("country_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspaces_is_default" ON "workspaces" USING btree ("is_default");
--> statement-breakpoint

-- 3. Seed Default Workspaces (Tunisia & Morocco)
INSERT INTO "workspaces" ("id", "name", "slug", "country_code", "currency", "currency_symbol", "flag", "is_default")
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Tunisia', 'tunisia', 'TN', 'TND', 'DT', '🇹🇳', true),
  ('00000000-0000-0000-0000-000000000002', 'Morocco', 'morocco', 'MA', 'MAD', 'DH', '🇲🇦', false)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "country_code" = EXCLUDED."country_code",
  "currency" = EXCLUDED."currency",
  "currency_symbol" = EXCLUDED."currency_symbol",
  "flag" = EXCLUDED."flag";
--> statement-breakpoint

-- 4. Add workspace_id columns to existing tables
ALTER TABLE "brand_domains" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "tracked_pages" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "scraped_products" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "queue" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "activity_notifications" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint

-- 5. Foreign Key Constraints
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brand_domains_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "brand_domains"
      ADD CONSTRAINT "brand_domains_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tracked_pages_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "tracked_pages"
      ADD CONSTRAINT "tracked_pages_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scraped_products_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "scraped_products"
      ADD CONSTRAINT "scraped_products_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'queue_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "queue"
      ADD CONSTRAINT "queue_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discovery_runs_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "discovery_runs"
      ADD CONSTRAINT "discovery_runs_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activity_notifications_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "activity_notifications"
      ADD CONSTRAINT "activity_notifications_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'import_jobs_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "import_jobs"
      ADD CONSTRAINT "import_jobs_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- 6. Indexes for workspace_id
CREATE INDEX IF NOT EXISTS "idx_brand_domains_workspace_id" ON "brand_domains" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracked_pages_workspace_id" ON "tracked_pages" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scraped_products_workspace_id" ON "scraped_products" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_queue_workspace_id" ON "queue" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discovery_runs_workspace_id" ON "discovery_runs" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_workspace_id" ON "activity_notifications" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_jobs_workspace_id" ON "import_jobs" USING btree ("workspace_id");
--> statement-breakpoint

-- 7. Backfill all existing records into default Tunisia workspace
UPDATE "brand_domains" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "tracked_pages" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "scraped_products" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "queue" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "discovery_runs" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "activity_notifications" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "import_jobs" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint

-- 8. Row Level Security for workspaces
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspaces' AND policyname = 'Allow all operations for service role'
  ) THEN
    CREATE POLICY "Allow all operations for service role" ON "workspaces" FOR ALL USING (true);
  END IF;
END $$;
