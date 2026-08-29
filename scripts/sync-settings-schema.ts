import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncSettingsSchema() {
  console.log("Synchronizing app_settings schema in PostgreSQL database...");

  try {
    // 1. Create app_settings table if not exists
    await client`
      CREATE TABLE IF NOT EXISTS app_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        default_country TEXT NOT NULL DEFAULT 'TN',
        auto_merge BOOLEAN NOT NULL DEFAULT TRUE,
        stale_hours INTEGER NOT NULL DEFAULT 12,
        auto_spy_threshold INTEGER NOT NULL DEFAULT 1,
        discovery_window_days INTEGER NOT NULL DEFAULT 7,
        auto_b2_backup BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;
    console.log("✓ Created or verified app_settings table");

    // 2. Ensure initial default record exists
    await client`
      INSERT INTO app_settings (id, default_country, auto_merge, stale_hours, auto_spy_threshold, discovery_window_days, auto_b2_backup)
      VALUES ('default', 'TN', TRUE, 12, 1, 7, TRUE)
      ON CONFLICT (id) DO NOTHING;
    `;
    console.log("✓ Ensured default app_settings row exists");

    // 3. Enable Row Level Security
    await client`ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;`;
    console.log("✓ Enabled Row Level Security on app_settings");

    console.log("Successfully synchronized app_settings table schema!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to sync settings schema:", err);
    process.exit(1);
  }
}

syncSettingsSchema();
