-- Migration: 0033_enable_ad_transcripts_rls.sql
-- Description: Enable Row Level Security (RLS) on ad_transcripts and grant full access to service_role

ALTER TABLE "public"."ad_transcripts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ad_transcripts' AND policyname = 'ad_transcripts_service_role_all'
  ) THEN
    CREATE POLICY "ad_transcripts_service_role_all" ON "public"."ad_transcripts"
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
