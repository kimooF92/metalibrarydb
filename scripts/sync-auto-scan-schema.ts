import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncAutoScanSchema() {
  console.log("Synchronizing auto_creative_scan column in tracked_pages table...");

  try {
    // 1. Add column if not exists
    await client`
      ALTER TABLE tracked_pages 
      ADD COLUMN IF NOT EXISTS auto_creative_scan BOOLEAN DEFAULT TRUE NOT NULL;
    `;
    console.log("✓ Added or verified auto_creative_scan column on tracked_pages (default TRUE)");

    // 2. Add index for fast worker/cron filtering
    await client`
      CREATE INDEX IF NOT EXISTS idx_tracked_pages_auto_creative_scan 
      ON tracked_pages(auto_creative_scan);
    `;
    console.log("✓ Created or verified index idx_tracked_pages_auto_creative_scan");

    console.log("Successfully synchronized auto_creative_scan schema!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to sync auto_creative_scan schema:", err);
    process.exit(1);
  }
}

syncAutoScanSchema();
