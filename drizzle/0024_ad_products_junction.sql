CREATE TABLE IF NOT EXISTS "ad_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ad_id" uuid NOT NULL REFERENCES "ads"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "scraped_products"("id") ON DELETE CASCADE,
  "is_primary" boolean DEFAULT false NOT NULL,
  "card_index" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_ad_products_ad_product" UNIQUE("ad_id", "product_id")
);

CREATE INDEX IF NOT EXISTS "idx_ad_products_ad_id" ON "ad_products"("ad_id");
CREATE INDEX IF NOT EXISTS "idx_ad_products_product_id" ON "ad_products"("product_id");
CREATE INDEX IF NOT EXISTS "idx_ad_products_product_primary" ON "ad_products"("product_id", "is_primary");

ALTER TABLE "public"."ad_products" ENABLE ROW LEVEL SECURITY;
