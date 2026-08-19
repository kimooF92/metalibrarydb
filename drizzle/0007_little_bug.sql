CREATE TABLE "scraped_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"domain" text,
	"page_id" text,
	"title" text,
	"current_price" text,
	"original_price" text,
	"currency" text,
	"discount_or_offer" text,
	"main_image_url" text,
	"gallery_images" text[],
	"all_offers" json,
	"raw_extract" json,
	"scrape_status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"last_scraped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scraped_products_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "product_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_scraped_products_url" ON "scraped_products" USING btree ("url");--> statement-breakpoint
CREATE INDEX "idx_scraped_products_domain" ON "scraped_products" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_scraped_products_page_id" ON "scraped_products" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "idx_scraped_products_status" ON "scraped_products" USING btree ("scrape_status");--> statement-breakpoint
CREATE INDEX "idx_scraped_products_created_at" ON "scraped_products" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_product_id_scraped_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."scraped_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ads_product_id" ON "ads" USING btree ("product_id");