ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS creative_scanned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_scan_history_creative_scanned_at ON scan_history (creative_scanned_at);
