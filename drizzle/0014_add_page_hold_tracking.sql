ALTER TABLE tracked_pages
  ADD COLUMN IF NOT EXISTS hold_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_known_valid_results integer,
  ADD COLUMN IF NOT EXISTS hold_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_zero_scans integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tracked_pages_hold_status ON tracked_pages (hold_status);
