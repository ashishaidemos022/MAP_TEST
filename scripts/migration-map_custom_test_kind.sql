-- Migration: map_custom_test_kind
-- Apply via Supabase MCP `apply_migration` once auth is refreshed.
--
-- Adds 'custom' as a third session kind alongside 'test' and 'boost', plus a
-- jsonb config column that holds the parent's curated picks.

-- 1. Allow 'custom' as a session kind alongside 'test' and 'boost'.
ALTER TABLE map_test_sessions
  DROP CONSTRAINT IF EXISTS map_test_sessions_kind_check;

ALTER TABLE map_test_sessions
  ADD CONSTRAINT map_test_sessions_kind_check
  CHECK (kind = ANY (ARRAY['test'::text, 'boost'::text, 'custom'::text]));

-- 2. Persist the parent's picks so the session can be replayed or audited.
ALTER TABLE map_test_sessions
  ADD COLUMN custom_config jsonb;

COMMENT ON COLUMN map_test_sessions.custom_config IS
  'Only set when kind = ''custom''. Shape: { "standard_ids": uuid[], "requested_count": int, "actual_count": int, "shortfall_reason": text|null }. standard_ids is the exact list the parent picked; actual_count is how many questions ended up in question_ids (may be < requested_count if the bank was thin or — for reading — was rounded to a passage boundary).';

-- 3. Lightweight integrity guard — non-custom rows must leave config NULL,
-- custom rows must carry at least standard_ids and requested_count.
ALTER TABLE map_test_sessions
  ADD CONSTRAINT map_test_sessions_custom_config_shape CHECK (
    (kind <> 'custom' AND custom_config IS NULL)
    OR (kind = 'custom' AND custom_config ? 'standard_ids' AND custom_config ? 'requested_count')
  );

-- 4. Index for parent dashboard "past custom tests" list.
CREATE INDEX IF NOT EXISTS map_test_sessions_custom_idx
  ON map_test_sessions (student_id, started_at DESC)
  WHERE kind = 'custom';
