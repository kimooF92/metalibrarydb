import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncNotificationsSchema() {
  console.log("Synchronizing activity_notifications schema in PostgreSQL database...");

  try {
    // 1. Add discovered_pages_count to tracked_pages if missing
    await client`
      ALTER TABLE tracked_pages ADD COLUMN IF NOT EXISTS discovered_pages_count INTEGER DEFAULT 0;
    `;
    console.log("✓ Added discovered_pages_count to tracked_pages");

    // 2. Create activity_notifications table if not exists
    await client`
      CREATE TABLE IF NOT EXISTS activity_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT DEFAULT 'info' NOT NULL,
        tracked_page_id UUID REFERENCES tracked_pages(id) ON DELETE CASCADE,
        ad_archive_id TEXT,
        action_url TEXT,
        metadata JSONB,
        is_read BOOLEAN DEFAULT FALSE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;
    console.log("✓ Created activity_notifications table");

    // 3. Create indexes
    await client`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON activity_notifications (created_at DESC);`;
    await client`CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON activity_notifications (is_read);`;
    await client`CREATE INDEX IF NOT EXISTS idx_notifications_type ON activity_notifications (type);`;
    await client`CREATE INDEX IF NOT EXISTS idx_notifications_tracked_page_id ON activity_notifications (tracked_page_id);`;
    console.log("✓ Created indexes for activity_notifications");

    console.log("Successfully synchronized activity_notifications table schema!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to sync notifications schema:", err);
    process.exit(1);
  }
}

syncNotificationsSchema();
