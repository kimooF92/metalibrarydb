import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function addCompositePerformanceIndexes() {
  console.log("Applying high-performance composite indexes for Products & Ads...");

  try {
    // 1. Composite index for ads (product_id, is_archived) - speeds up active/inactive product queries and metrics lookups
    console.log("Creating idx_ads_product_id_archived on ads(product_id, is_archived)...");
    await client`
      CREATE INDEX IF NOT EXISTS idx_ads_product_id_archived 
      ON ads (product_id, is_archived);
    `;
    console.log("✓ idx_ads_product_id_archived created.");

    // 2. Composite index on scraped_products (scrape_status, created_at DESC) - speeds up default product queries and pagination
    console.log("Creating idx_scraped_products_status_created_at on scraped_products(scrape_status, created_at DESC)...");
    await client`
      CREATE INDEX IF NOT EXISTS idx_scraped_products_status_created_at 
      ON scraped_products (scrape_status, created_at DESC);
    `;
    console.log("✓ idx_scraped_products_status_created_at created.");

    // 3. Partial index on ads with non-null product_id for fast DISTINCT and EXISTS lookups
    console.log("Creating idx_ads_product_id_active_partial on ads(product_id) WHERE product_id IS NOT NULL AND (is_archived = false OR is_archived IS NULL)...");
    await client`
      CREATE INDEX IF NOT EXISTS idx_ads_product_id_active_partial 
      ON ads (product_id) 
      WHERE product_id IS NOT NULL AND (is_archived = false OR is_archived IS NULL);
    `;
    console.log("✓ idx_ads_product_id_active_partial created.");

    console.log("\n🚀 All database performance indexes successfully verified & applied!");
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Failed to apply performance indexes:", err);
    process.exit(1);
  }
}

addCompositePerformanceIndexes();
