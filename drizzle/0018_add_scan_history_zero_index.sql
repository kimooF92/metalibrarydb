CREATE INDEX IF NOT EXISTS idx_scan_history_recent_zeros
  ON scan_history (checked_at)
  WHERE results = 0;
