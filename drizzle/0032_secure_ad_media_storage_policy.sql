-- Migration: 0032_secure_ad_media_storage_policy.sql
-- Description: Restrict INSERT, UPDATE, DELETE on storage.objects for ad-media bucket strictly to service_role

DROP POLICY IF EXISTS "Ad Media Upload" ON storage.objects;--> statement-breakpoint
DROP POLICY IF EXISTS "Ad Media Update" ON storage.objects;--> statement-breakpoint
DROP POLICY IF EXISTS "Ad Media Delete" ON storage.objects;--> statement-breakpoint

CREATE POLICY "Ad Media Upload" ON storage.objects FOR INSERT TO service_role WITH CHECK (bucket_id = 'ad-media');--> statement-breakpoint
CREATE POLICY "Ad Media Update" ON storage.objects FOR UPDATE TO service_role USING (bucket_id = 'ad-media');--> statement-breakpoint
CREATE POLICY "Ad Media Delete" ON storage.objects FOR DELETE TO service_role USING (bucket_id = 'ad-media');
