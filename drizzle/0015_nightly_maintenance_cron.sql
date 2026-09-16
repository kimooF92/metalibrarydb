-- ============================================================
-- Migration: 0015_nightly_maintenance_cron
-- Purpose:   Automated nightly database maintenance to prevent
--            Supabase free-tier 500 MB disk limit from being hit.
--
-- Safety Summary:
--   ✅ Preserves ALL ad longevity (first_seen_at, last_seen_at, started_running_on)
--   ✅ Preserves ALL product history and product → ad links
--   ✅ Preserves ALL active ad observations (reconciler unaffected)
--   ✅ Only removes dead operational data and archived ad bloat
-- ============================================================

-- 1. Enable pg_cron extension (available on Supabase free tier)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create the maintenance stored procedure / function
-- Wrapping the maintenance queries in a function allows:
--   - Instant manual testing: SELECT run_storage_maintenance();
--   - Clean error reporting and transaction boundaries
--   - Safe execution from pg_cron
CREATE OR REPLACE FUNCTION public.run_storage_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- -------------------------------------------------------
  -- STEP 1: Queue cleanup
  -- Completed jobs (>1 day) and failed jobs (>7 days)
  -- -------------------------------------------------------
  DELETE FROM queue
  WHERE status = 'completed'
    AND finished_at < NOW() - INTERVAL '1 day';

  DELETE FROM queue
  WHERE status = 'failed'
    AND finished_at < NOW() - INTERVAL '7 days';

  -- -------------------------------------------------------
  -- STEP 2: Scan history rolling window (30 days)
  -- Sparklines only need recent scans. Longevity lives in ads.
  -- -------------------------------------------------------
  DELETE FROM scan_history
  WHERE checked_at < NOW() - INTERVAL '30 days';

  -- -------------------------------------------------------
  -- STEP 3: Ad observations for archived ads ONLY
  -- Active ad observations are kept intact for reconciler.
  -- COALESCE handles cases where archived_at is null.
  -- -------------------------------------------------------
  DELETE FROM ad_observations
  WHERE ad_id IN (
    SELECT id FROM ads
    WHERE is_archived = true
      AND COALESCE(archived_at, updated_at, created_at) < NOW() - INTERVAL '14 days'
  );

  -- -------------------------------------------------------
  -- STEP 4: Old in-app activity notifications (> 30 days)
  -- -------------------------------------------------------
  DELETE FROM activity_notifications
  WHERE created_at < NOW() - INTERVAL '30 days';

  -- -------------------------------------------------------
  -- STEP 5: Strip raw_extract JSON blobs from processed products
  -- Only for successful scrapes older than 3 days.
  -- -------------------------------------------------------
  UPDATE scraped_products
  SET raw_extract = NULL
  WHERE raw_extract IS NOT NULL
    AND scrape_status = 'success'
    AND created_at < NOW() - INTERVAL '3 days';

  -- -------------------------------------------------------
  -- STEP 6: Strip storyboard_urls from old archived ads (> 30 days)
  -- -------------------------------------------------------
  UPDATE ads
  SET storyboard_urls = NULL
  WHERE is_archived = true
    AND COALESCE(archived_at, updated_at, created_at) < NOW() - INTERVAL '30 days'
    AND storyboard_urls IS NOT NULL;

END;
$$;

-- 3. Remove the job if it already exists (makes this migration idempotent)
SELECT cron.unschedule('nightly-storage-maintenance')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'nightly-storage-maintenance'
);

-- 4. Schedule the nightly cleanup job at 3:00 AM UTC
SELECT cron.schedule(
  'nightly-storage-maintenance',
  '0 3 * * *',
  'SELECT public.run_storage_maintenance();'
);
