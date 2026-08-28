import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncAiReportsSchema() {
  console.log("Synchronizing saved_opportunity_report & saved_market_forecast columns in PostgreSQL...");

  try {
    // 1. Add columns to app_settings if not exist
    await client`
      ALTER TABLE app_settings
      ADD COLUMN IF NOT EXISTS saved_opportunity_report JSONB,
      ADD COLUMN IF NOT EXISTS saved_market_forecast JSONB;
    `;
    console.log("✓ Verified/added saved_opportunity_report and saved_market_forecast columns in app_settings table");

    process.exit(0);
  } catch (err) {
    console.error("Failed to sync AI reports schema:", err);
    process.exit(1);
  }
}

syncAiReportsSchema();
