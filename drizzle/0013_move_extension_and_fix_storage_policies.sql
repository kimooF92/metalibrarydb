CREATE SCHEMA IF NOT EXISTS extensions;--> statement-breakpoint
ALTER EXTENSION pg_trgm SET SCHEMA extensions;--> statement-breakpoint
DROP POLICY IF EXISTS "Ad Media All Access" ON storage.objects;--> statement-breakpoint
CREATE POLICY "Ad Media Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ad-media');--> statement-breakpoint
CREATE POLICY "Ad Media Update" ON storage.objects FOR UPDATE USING (bucket_id = 'ad-media');--> statement-breakpoint
CREATE POLICY "Ad Media Delete" ON storage.objects FOR DELETE USING (bucket_id = 'ad-media');
