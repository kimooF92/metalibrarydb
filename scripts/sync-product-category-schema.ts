import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncProductCategorySchema() {
  console.log("Synchronizing product category schema in PostgreSQL...");

  try {
    // 1. Add category, sub_category, target_audience to scraped_products table
    await client`
      ALTER TABLE scraped_products ADD COLUMN IF NOT EXISTS category TEXT;
    `;
    console.log("✓ Added category column to scraped_products");

    await client`
      ALTER TABLE scraped_products ADD COLUMN IF NOT EXISTS sub_category TEXT;
    `;
    console.log("✓ Added sub_category column to scraped_products");

    await client`
      ALTER TABLE scraped_products ADD COLUMN IF NOT EXISTS target_audience TEXT;
    `;
    console.log("✓ Added target_audience column to scraped_products");

    // 2. Create index on category
    await client`
      CREATE INDEX IF NOT EXISTS idx_scraped_products_category ON scraped_products (category);
    `;
    console.log("✓ Created index on category column");

    console.log("Successfully synchronized product category schema in PostgreSQL!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to sync product category schema:", err);
    process.exit(1);
  }
}

syncProductCategorySchema();
