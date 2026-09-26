CREATE INDEX IF NOT EXISTS idx_discovered_pages_tracked_page_id ON discovered_pages (tracked_page_id);
CREATE INDEX IF NOT EXISTS idx_queue_creative_scan_id ON queue (creative_scan_id);
