ALTER TABLE worker_state
  ADD COLUMN IF NOT EXISTS circuit_breaker_tripped boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS circuit_breaker_reason text,
  ADD COLUMN IF NOT EXISTS circuit_breaker_until timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_zero_pages integer DEFAULT 0;
