-- Migration: 0023_secure_storage_maintenance.sql
-- Description: Secures run_storage_maintenance with explicit search_path and restricts execution to service_role and postgres

DROP FUNCTION IF EXISTS public.run_storage_maintenance();

CREATE OR REPLACE FUNCTION public.run_storage_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- STEP 1: Queue cleanup
  DELETE FROM public.queue
  WHERE status = 'completed'
    AND finished_at < NOW() - INTERVAL '1 day';

  DELETE FROM public.queue
  WHERE status = 'failed'
    AND finished_at < NOW() - INTERVAL '7 days';

  -- STEP 2: Scan history rolling window (30 days)
  DELETE FROM public.scan_history
  WHERE checked_at < NOW() - INTERVAL '30 days';

  -- STEP 3: Ad observations for archived ads ONLY
  DELETE FROM public.ad_observations
  WHERE ad_id IN (
    SELECT id FROM public.ads
    WHERE is_archived = true
      AND COALESCE(archived_at, updated_at, created_at) < NOW() - INTERVAL '14 days'
  );

  -- STEP 4: Old in-app activity notifications (> 30 days)
  DELETE FROM public.activity_notifications
  WHERE created_at < NOW() - INTERVAL '30 days';

  -- STEP 5: Strip raw_extract JSON blobs from processed products
  UPDATE public.scraped_products
  SET raw_extract = NULL
  WHERE raw_extract IS NOT NULL
    AND (
      scrape_status IN ('deleted', 'ignored', 'failed')
      OR created_at < NOW() - INTERVAL '2 days'
    );

  -- STEP 6: Strip storyboard_urls from old archived ads (> 30 days)
  UPDATE public.ads
  SET storyboard_urls = NULL
  WHERE is_archived = true
    AND COALESCE(archived_at, updated_at, created_at) < NOW() - INTERVAL '30 days'
    AND storyboard_urls IS NOT NULL;

  -- STEP 7: Prune un-imported discovery preview columns older than 7 days
  UPDATE public.discovered_pages
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

-- Restrict permissions
REVOKE ALL ON FUNCTION public.run_storage_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_storage_maintenance() TO service_role, postgres;
