ALTER TABLE "discovery_runs" ADD COLUMN IF NOT EXISTS "target_max_ads" integer DEFAULT 2500;
ALTER TABLE "discovery_runs" ADD COLUMN IF NOT EXISTS "max_scrolls" integer DEFAULT 150;
