import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncQueueSchema() {
  console.log("Synchronizing Queue table schema in PostgreSQL database...");

  try {
    // 1. Drop NOT NULL constraint on tracked_page_id
    await client`
      ALTER TABLE queue ALTER COLUMN tracked_page_id DROP NOT NULL;
    `;
    console.log("✓ Dropped NOT NULL on tracked_page_id");

    // 2. Add discovered_page_id column
    await client`
      ALTER TABLE queue ADD COLUMN IF NOT EXISTS discovered_page_id UUID REFERENCES discovered_pages(id) ON DELETE CASCADE;
    `;
    console.log("✓ Added discovered_page_id column");

    // 3. Add priority column
    await client`
      ALTER TABLE queue ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1 NOT NULL;
    `;
    console.log("✓ Added priority column");

    // 4. Create indexes
    await client`CREATE INDEX IF NOT EXISTS idx_queue_priority_created_at ON queue (priority DESC, created_at);`;
    await client`CREATE INDEX IF NOT EXISTS idx_queue_discovered_page_id ON queue (discovered_page_id);`;
    console.log("✓ Created queue priority and discovered_page_id indexes");

    console.log("Successfully synchronized queue table schema!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to sync queue schema:", err);
    process.exit(1);
  }
}

syncQueueSchema();
