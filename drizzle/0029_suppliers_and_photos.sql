CREATE TABLE IF NOT EXISTS "suppliers" (
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
	"last_album_url" text,
	"last_album_title" text,
	"last_album_photo_count" integer DEFAULT 0,
	"has_unseen_drop" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_workspace_id" ON "suppliers" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_status" ON "suppliers" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_has_unseen_drop" ON "suppliers" USING btree ("has_unseen_drop");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_suppliers_workspace_facebook_url" ON "suppliers" USING btree ("workspace_id", "facebook_url");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_photos" (
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
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_photos_supplier_id_suppliers_id_fk'
  ) THEN
    ALTER TABLE "supplier_photos"
      ADD CONSTRAINT "supplier_photos_supplier_id_suppliers_id_fk"
      FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_photos_promoted_product_id_scraped_products_id_fk'
  ) THEN
    ALTER TABLE "supplier_photos"
      ADD CONSTRAINT "supplier_photos_promoted_product_id_scraped_products_id_fk"
      FOREIGN KEY ("promoted_product_id") REFERENCES "public"."scraped_products"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_photos_supplier_id" ON "supplier_photos" USING btree ("supplier_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_photos_posted_at" ON "supplier_photos" USING btree ("posted_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_photos_album_url" ON "supplier_photos" USING btree ("album_url");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_supplier_photos_unique" ON "supplier_photos" USING btree ("supplier_id", "photo_url");
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "supplier_photos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'suppliers_service_role_all'
  ) THEN
    CREATE POLICY "suppliers_service_role_all" ON "suppliers" FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'supplier_photos' AND policyname = 'supplier_photos_service_role_all'
  ) THEN
    CREATE POLICY "supplier_photos_service_role_all" ON "supplier_photos" FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

