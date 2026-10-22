-- Performance & Quota Optimization
-- 1. Remove high-volume write table (ads) from supabase_realtime publication to stop Realtime CDC WAL decoding churn
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'ads'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE ads;
  END IF;
END $$;

-- 2. Add covering and expression indexes for fast URL reconciliation
CREATE INDEX IF NOT EXISTS "idx_ads_link_url" ON "ads" USING btree ("link_url");
CREATE INDEX IF NOT EXISTS "idx_ads_link_url_lower_trimmed" ON "ads" (LOWER(TRIM(TRAILING '/' FROM "link_url")));
