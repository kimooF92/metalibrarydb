import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function syncDiscoveryPreviewSchema() {
  console.log("Applying Ephemeral Discovery Product Preview Schema & Partial Index...");

  try {
    // 1. Add ephemeral staging columns to discovered_pages
    await client`
      ALTER TABLE discovered_pages 
        ADD COLUMN IF NOT EXISTS preview_product_url TEXT,
        ADD COLUMN IF NOT EXISTS preview_product_title TEXT,
        ADD COLUMN IF NOT EXISTS preview_product_image TEXT,
        ADD COLUMN IF NOT EXISTS preview_product_price TEXT,
        ADD COLUMN IF NOT EXISTS preview_product_currency TEXT DEFAULT 'TND',
        ADD COLUMN IF NOT EXISTS preview_source TEXT DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS preview_scrape_status TEXT NOT NULL DEFAULT 'idle',
        ADD COLUMN IF NOT EXISTS preview_scrape_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS preview_scraped_at TIMESTAMP WITH TIME ZONE;
    `;
    console.log("✓ Added preview columns to discovered_pages");

    // 2. Create partial index for pending preview scrapes
    await client`
      CREATE INDEX IF NOT EXISTS idx_discovered_pages_pending_preview 
      ON discovered_pages(run_id) 
      WHERE preview_scrape_status = 'pending';
    `;
    console.log("✓ Created partial index idx_discovered_pages_pending_preview");

    // 3. Update public.run_storage_maintenance() function with Step 7 (Tier 5 Sweeper)
    await client`DROP FUNCTION IF EXISTS public.run_storage_maintenance();`;
    await client`
      CREATE OR REPLACE FUNCTION public.run_storage_maintenance()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        -- STEP 1: Queue cleanup
        DELETE FROM queue
        WHERE status = 'completed'
          AND finished_at < NOW() - INTERVAL '1 day';

        DELETE FROM queue
        WHERE status = 'failed'
          AND finished_at < NOW() - INTERVAL '7 days';

        -- STEP 2: Scan history rolling window (30 days)
        DELETE FROM scan_history
        WHERE checked_at < NOW() - INTERVAL '30 days';

        -- STEP 3: Ad observations for archived ads ONLY
        DELETE FROM ad_observations
        WHERE ad_id IN (
          SELECT id FROM ads
          WHERE is_archived = true
            AND COALESCE(archived_at, updated_at, created_at) < NOW() - INTERVAL '14 days'
        );

        -- STEP 4: Old in-app activity notifications (> 30 days)
        DELETE FROM activity_notifications
        WHERE created_at < NOW() - INTERVAL '30 days';

        -- STEP 5: Strip raw_extract JSON blobs from processed products
        UPDATE scraped_products
        SET raw_extract = NULL
        WHERE raw_extract IS NOT NULL
          AND (
            scrape_status IN ('deleted', 'ignored', 'failed')
            OR created_at < NOW() - INTERVAL '2 days'
          );

        -- STEP 6: Strip storyboard_urls from old archived ads (> 30 days)
        UPDATE ads
        SET storyboard_urls = NULL
        WHERE is_archived = true
          AND COALESCE(archived_at, updated_at, created_at) < NOW() - INTERVAL '30 days'
          AND storyboard_urls IS NOT NULL;

        -- STEP 7: Prune un-imported discovery preview columns older than 7 days
        UPDATE discovered_pages
        SET preview_product_title = NULL,
            preview_product_image = NULL,
            preview_product_price = NULL,
            preview_product_url = NULL,
            preview_product_currency = NULL,
            preview_source = 'none',
            preview_scrape_status = 'expired'
        WHERE status != 'imported'
          AND created_at < NOW() - INTERVAL '7 days'
          AND (
            preview_product_title IS NOT NULL OR 
            preview_product_image IS NOT NULL OR 
            preview_product_url IS NOT NULL
          );

      END;
      $$;
    `;
    console.log("✓ Updated public.run_storage_maintenance() with Tier 5 preview sweeper");

    console.log("Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

syncDiscoveryPreviewSchema();
