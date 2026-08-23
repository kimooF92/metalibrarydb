import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncMediaHashSchema() {
  console.log("Synchronizing media_hash, perceptual_hash, and creative_cluster_id in PostgreSQL...");

  try {
    // 1. Add media_hash to ads table if missing
    await client`
      ALTER TABLE ads ADD COLUMN IF NOT EXISTS media_hash TEXT;
    `;
    console.log("✓ Added media_hash to ads");

    // 2. Add perceptual_hash to ads table if missing
    await client`
      ALTER TABLE ads ADD COLUMN IF NOT EXISTS perceptual_hash TEXT;
    `;
    console.log("✓ Added perceptual_hash to ads");

    // 3. Add creative_cluster_id to ads table if missing
    await client`
      ALTER TABLE ads ADD COLUMN IF NOT EXISTS creative_cluster_id UUID;
    `;
    console.log("✓ Added creative_cluster_id to ads");

    // 4. Create indexes
    await client`CREATE INDEX IF NOT EXISTS idx_ads_media_hash ON ads (media_hash);`;
    await client`CREATE INDEX IF NOT EXISTS idx_ads_perceptual_hash ON ads (perceptual_hash);`;
    await client`CREATE INDEX IF NOT EXISTS idx_ads_creative_cluster_id ON ads (creative_cluster_id);`;
    console.log("✓ Created indexes for media_hash, perceptual_hash, and creative_cluster_id");

    console.log("Successfully synchronized media hashing schema in PostgreSQL!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to sync media hash schema:", err);
    process.exit(1);
  }
}

syncMediaHashSchema();
