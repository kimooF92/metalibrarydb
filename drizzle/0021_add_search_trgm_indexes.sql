CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tracked_pages_display_name_trgm ON tracked_pages USING gin (display_name extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tracked_pages_canonical_domain_trgm ON tracked_pages USING gin (canonical_domain extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_tracked_pages_landing_page_trgm ON tracked_pages USING gin (landing_page extensions.gin_trgm_ops);
