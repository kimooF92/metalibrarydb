CREATE INDEX IF NOT EXISTS "idx_ads_product_id_archived" ON "ads" ("product_id", "is_archived");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scraped_products_status_created_at" ON "scraped_products" ("scrape_status", "created_at" DESC);
