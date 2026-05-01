-- =========================================================================
-- Migration: map_mcp_tokens
-- Project:   klhzfwxpztaojekwgzcg
-- Brief:     MCP_BRIEF.md §3
--
-- Adds Family MCP Server foundation:
--   * map_mcp_tokens — bearer tokens, hashed at rest, family-scoped
--   * map_mcp_audit  — append-only call log for the parent UI
--   * map_create_mcp_token / map_revoke_mcp_token RPCs
--   * RLS so parents see only their own tokens and audit rows
--
-- Properties:
--   * Idempotent. Safe to re-run.
--   * Single transaction.
--   * Matches existing convention: SECURITY DEFINER + SET search_path = ''
--     + fully-qualified references (public.*, extensions.*, auth.*).
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- map_mcp_tokens
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.map_mcp_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash      bytea NOT NULL UNIQUE,
  token_last4     text NOT NULL,
  label           text NOT NULL DEFAULT 'Claude.ai',
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  CONSTRAINT map_mcp_tokens_label_len CHECK (char_length(label) BETWEEN 1 AND 50)
);
COMMENT ON TABLE public.map_mcp_tokens IS
  'Bearer tokens for the Family MCP Server. Plaintext is shown to the parent once at creation; only the SHA-256 hash and last-4 chars are persisted.';

CREATE INDEX IF NOT EXISTS map_mcp_tokens_family_idx
  ON public.map_mcp_tokens (family_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS map_mcp_tokens_hash_idx
  ON public.map_mcp_tokens (token_hash) WHERE revoked_at IS NULL;

-- -------------------------------------------------------------------------
-- map_mcp_audit
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.map_mcp_audit (
  id            bigserial PRIMARY KEY,
  token_id      uuid REFERENCES public.map_mcp_tokens(id) ON DELETE SET NULL,
  family_id     uuid,
  tool_name     text NOT NULL,
  tool_args     jsonb,
  status        text NOT NULL,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.map_mcp_audit IS
  'Append-only log of MCP tool calls. Args are redacted at write time; result payloads are never logged.';

CREATE INDEX IF NOT EXISTS map_mcp_audit_family_idx
  ON public.map_mcp_audit (family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS map_mcp_audit_token_idx
  ON public.map_mcp_audit (token_id, created_at DESC);

-- -------------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------------
ALTER TABLE public.map_mcp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_mcp_audit  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS map_mcp_tokens_select ON public.map_mcp_tokens;
CREATE POLICY map_mcp_tokens_select
  ON public.map_mcp_tokens FOR SELECT
  USING (family_id = public.map_current_family_id());

DROP POLICY IF EXISTS map_mcp_tokens_insert ON public.map_mcp_tokens;
CREATE POLICY map_mcp_tokens_insert
  ON public.map_mcp_tokens FOR INSERT
  WITH CHECK (
    family_id = public.map_current_family_id()
    AND owner_user_id = auth.uid()
  );

DROP POLICY IF EXISTS map_mcp_tokens_update ON public.map_mcp_tokens;
CREATE POLICY map_mcp_tokens_update
  ON public.map_mcp_tokens FOR UPDATE
  USING (family_id = public.map_current_family_id())
  WITH CHECK (family_id = public.map_current_family_id());

DROP POLICY IF EXISTS map_mcp_audit_select ON public.map_mcp_audit;
CREATE POLICY map_mcp_audit_select
  ON public.map_mcp_audit FOR SELECT
  USING (family_id = public.map_current_family_id());

-- -------------------------------------------------------------------------
-- map_create_mcp_token
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_create_mcp_token(
  p_label text DEFAULT 'Claude.ai',
  p_expires_days int DEFAULT 90
)
RETURNS TABLE (token_id uuid, plaintext_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_family_id uuid;
  v_user_id   uuid;
  v_plain     text;
  v_hash      bytea;
  v_id        uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT public.map_current_family_id() INTO v_family_id;
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;

  IF p_expires_days < 1 OR p_expires_days > 365 THEN
    RAISE EXCEPTION 'expires_days must be between 1 and 365';
  END IF;

  IF char_length(coalesce(p_label, '')) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'label must be 1-50 chars';
  END IF;

  v_plain := 'mcp_' ||
    rtrim(
      replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'),
      '='
    );

  v_hash := extensions.digest(v_plain, 'sha256');

  INSERT INTO public.map_mcp_tokens
    (family_id, owner_user_id, token_hash, token_last4, label, expires_at)
  VALUES
    (v_family_id, v_user_id, v_hash, right(v_plain, 4), p_label,
     now() + (p_expires_days || ' days')::interval)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_plain;
END
$$;

REVOKE EXECUTE ON FUNCTION public.map_create_mcp_token(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_create_mcp_token(text, int) TO authenticated;

-- -------------------------------------------------------------------------
-- map_revoke_mcp_token
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_revoke_mcp_token(p_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.map_mcp_tokens
     SET revoked_at = now()
   WHERE id = p_token_id
     AND family_id = public.map_current_family_id()
     AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token not found, not yours, or already revoked';
  END IF;
END
$$;

REVOKE EXECUTE ON FUNCTION public.map_revoke_mcp_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_revoke_mcp_token(uuid) TO authenticated;

COMMIT;
