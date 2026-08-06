import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncDiscoveryTables() {
  console.log("Synchronizing Discovery tables in PostgreSQL database...");

  try {
    // 1. Create discovery_runs table
    await client`
      CREATE TABLE IF NOT EXISTS discovery_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country TEXT NOT NULL DEFAULT 'TN',
        search_url TEXT NOT NULL,
        query TEXT,
        start_date_min TIMESTAMP WITH TIME ZONE,
        start_date_max TIMESTAMP WITH TIME ZONE,
        status TEXT NOT NULL DEFAULT 'pending',
        total_ads_scanned INTEGER NOT NULL DEFAULT 0,
        total_pages_discovered INTEGER NOT NULL DEFAULT 0,
        failure_reason TEXT,
        outcome_details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE,
        finished_at TIMESTAMP WITH TIME ZONE
      );
    `;

    // 2. Create discovered_pages table
    await client`
      CREATE TABLE IF NOT EXISTS discovered_pages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
        page_id TEXT NOT NULL,
        display_name TEXT,
        country TEXT DEFAULT 'TN',
        matching_ad_count INTEGER NOT NULL DEFAULT 0,
        verified_ad_count INTEGER,
        sample_ad_archive_ids TEXT[],
        sample_ctas TEXT[],
        sample_urls TEXT[],
        status TEXT NOT NULL DEFAULT 'discovered',
        tracked_page_id UUID REFERENCES tracked_pages(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        CONSTRAINT unique_run_page UNIQUE (run_id, page_id)
      );
    `;

    // 3. Create indexes
    await client`CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON discovery_runs(status);`;
    await client`CREATE INDEX IF NOT EXISTS idx_discovery_runs_created_at ON discovery_runs(created_at);`;
    await client`CREATE INDEX IF NOT EXISTS idx_discovered_pages_run_id ON discovered_pages(run_id);`;
    await client`CREATE INDEX IF NOT EXISTS idx_discovered_pages_page_id ON discovered_pages(page_id);`;
    await client`CREATE INDEX IF NOT EXISTS idx_discovered_pages_status ON discovered_pages(status);`;

    console.log("Successfully created discovery_runs and discovered_pages tables and indexes!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to sync discovery tables:", err);
    process.exit(1);
  }
}

syncDiscoveryTables();
