import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncAdProductsSchema() {
  console.log("Synchronizing ad_products junction table schema in PostgreSQL database...");

  try {
    // 1. Create ad_products table
    await client`
      CREATE TABLE IF NOT EXISTS "ad_products" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ad_id" uuid NOT NULL REFERENCES "ads"("id") ON DELETE CASCADE,
        "product_id" uuid NOT NULL REFERENCES "scraped_products"("id") ON DELETE CASCADE,
        "is_primary" boolean DEFAULT false NOT NULL,
        "card_index" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "uq_ad_products_ad_product" UNIQUE("ad_id", "product_id")
      );
    `;
    console.log("✓ Created ad_products table");

    // 2. Create covering indexes
    await client`CREATE INDEX IF NOT EXISTS "idx_ad_products_ad_id" ON "ad_products"("ad_id");`;
    await client`CREATE INDEX IF NOT EXISTS "idx_ad_products_product_id" ON "ad_products"("product_id");`;
    await client`CREATE INDEX IF NOT EXISTS "idx_ad_products_product_primary" ON "ad_products"("product_id", "is_primary");`;
    console.log("✓ Created indexes on ad_products");

    // 3. Enable RLS
    await client`ALTER TABLE "public"."ad_products" ENABLE ROW LEVEL SECURITY;`;
    console.log("✓ Enabled RLS on ad_products");

    // 4. Backfill existing primary 1:1 ad links into ad_products
    console.log("Backfilling existing primary ad links into ad_products...");
    const backfillResult = await client`
      INSERT INTO ad_products (ad_id, product_id, is_primary, card_index)
      SELECT id, product_id, true, 0
      FROM ads
      WHERE product_id IS NOT NULL
      ON CONFLICT ("ad_id", "product_id") DO NOTHING;
    `;
    console.log("✓ Primary ad links backfilled successfully");

    // 5. Backfill orphaned carousel products created recently:
    // Match unlinked products to carousel ads sharing the exact same page_id and domain, active at the same time
    console.log("Attempting heuristic backfill for recently extracted carousel products...");
    const carouselBackfill = await client`
      WITH unlinked AS (
        SELECT p.id as product_id, p.page_id, p.domain, p.created_at
        FROM scraped_products p
        LEFT JOIN ad_products ap ON ap.product_id = p.id
        LEFT JOIN ads a ON a.product_id = p.id
        WHERE ap.id IS NULL AND a.id IS NULL
          AND p.created_at >= NOW() - INTERVAL '24 hours'
          AND p.page_id IS NOT NULL
      ),
      recent_carousel_ads AS (
        SELECT DISTINCT ON (u.product_id)
          a.id as ad_id,
          u.product_id
        FROM unlinked u
        JOIN ads a ON a.page_id = u.page_id
        WHERE a.media_type = 'carousel'
          AND ABS(EXTRACT(EPOCH FROM (a.created_at - u.created_at))) < 1800
        ORDER BY u.product_id, a.created_at DESC
      )
      INSERT INTO ad_products (ad_id, product_id, is_primary, card_index)
      SELECT ad_id, product_id, false, 1
      FROM recent_carousel_ads
      ON CONFLICT ("ad_id", "product_id") DO NOTHING;
    `;
    console.log("✓ Linked recent carousel products to their parent carousel ads:", carouselBackfill.count || 0);

    console.log("Successfully synchronized ad_products junction table schema!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to sync ad_products schema:", err);
    process.exit(1);
  }
}

syncAdProductsSchema();
