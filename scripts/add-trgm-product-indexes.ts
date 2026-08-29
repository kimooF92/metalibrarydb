import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function addTrgmProductIndexes() {
  console.log("Applying pg_trgm extension and GIN indexes for fast product search...");

  try {
    // 1. Enable pg_trgm extension if not already enabled (in extensions schema)
    await client`CREATE SCHEMA IF NOT EXISTS extensions;`;
    await client`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;`;
    console.log("✓ pg_trgm extension enabled in extensions schema");

    // 2. Create GIN index on title
    await client`
      CREATE INDEX IF NOT EXISTS idx_scraped_products_title_trgm 
      ON scraped_products USING gin (title gin_trgm_ops);
    `;
    console.log("✓ GIN trigram index on scraped_products(title) created");

    // 3. Create GIN index on domain
    await client`
      CREATE INDEX IF NOT EXISTS idx_scraped_products_domain_trgm 
      ON scraped_products USING gin (domain gin_trgm_ops);
    `;
    console.log("✓ GIN trigram index on scraped_products(domain) created");

    // 4. Create GIN index on url
    await client`
      CREATE INDEX IF NOT EXISTS idx_scraped_products_url_trgm 
      ON scraped_products USING gin (url gin_trgm_ops);
    `;
    console.log("✓ GIN trigram index on scraped_products(url) created");

    // 5. Create index on store_platform for fast platform filtering
    await client`
      CREATE INDEX IF NOT EXISTS idx_scraped_products_store_platform 
      ON scraped_products (store_platform);
    `;
    console.log("✓ Index on scraped_products(store_platform) created");

    console.log("\n🚀 All high-speed database indexes successfully created!");
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Failed to create trigram indexes:", err);
    process.exit(1);
  }
}

addTrgmProductIndexes();
