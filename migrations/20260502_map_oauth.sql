-- =========================================================================
-- Migration: map_oauth
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-02-mcp-oauth-multitenant-design.md §5
-- =========================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. map_oauth_clients (DCR registrations) -------------------------------
CREATE TABLE IF NOT EXISTS public.map_oauth_clients (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   text NOT NULL UNIQUE,
  client_secret_hash          bytea,
  client_name                 text NOT NULL,
  redirect_uris               text[] NOT NULL,
  grant_types                 text[] NOT NULL DEFAULT ARRAY['authorization_code','refresh_token'],
  token_endpoint_auth_method  text NOT NULL DEFAULT 'client_secret_post',
  created_via                 text NOT NULL DEFAULT 'dcr',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_oauth_clients_name_len  CHECK (char_length(client_name) BETWEEN 1 AND 100),
  CONSTRAINT map_oauth_clients_via_check CHECK (created_via IN ('dcr','admin'))
);
ALTER TABLE public.map_oauth_clients ENABLE ROW LEVEL SECURITY;
-- No policies = service role only.

-- 2. map_oauth_grants (parent's consent) ----------------------------------
CREATE TABLE IF NOT EXISTS public.map_oauth_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     text NOT NULL REFERENCES public.map_oauth_clients(client_id) ON DELETE CASCADE,
  scope         text NOT NULL DEFAULT 'mcp:read',
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_grant
  ON public.map_oauth_grants (family_id, client_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_map_oauth_grants_family
  ON public.map_oauth_grants (family_id) WHERE revoked_at IS NULL;

ALTER TABLE public.map_oauth_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS map_oauth_grants_select ON public.map_oauth_grants;
CREATE POLICY map_oauth_grants_select
  ON public.map_oauth_grants FOR SELECT
  USING (family_id = public.map_current_family_id());

-- 3. map_oauth_authorization_codes ----------------------------------------
CREATE TABLE IF NOT EXISTS public.map_oauth_authorization_codes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash              bytea NOT NULL UNIQUE,
  grant_id               uuid NOT NULL REFERENCES public.map_oauth_grants(id) ON DELETE CASCADE,
  code_challenge         text NOT NULL,
  code_challenge_method  text NOT NULL CHECK (code_challenge_method = 'S256'),
  redirect_uri           text NOT NULL,
  scope                  text NOT NULL,
  expires_at             timestamptz NOT NULL,
  used_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_oauth_codes_expires
  ON public.map_oauth_authorization_codes (expires_at);
ALTER TABLE public.map_oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

-- 4. map_oauth_access_tokens ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.map_oauth_access_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   bytea NOT NULL UNIQUE,
  token_last4  text NOT NULL,
  grant_id     uuid NOT NULL REFERENCES public.map_oauth_grants(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  scope        text NOT NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_oauth_at_grant ON public.map_oauth_access_tokens (grant_id);
CREATE INDEX IF NOT EXISTS idx_map_oauth_at_expires ON public.map_oauth_access_tokens (expires_at);
ALTER TABLE public.map_oauth_access_tokens ENABLE ROW LEVEL SECURITY;

-- 5. map_oauth_refresh_tokens ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.map_oauth_refresh_tokens (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash               bytea NOT NULL UNIQUE,
  token_last4              text NOT NULL,
  grant_id                 uuid NOT NULL REFERENCES public.map_oauth_grants(id) ON DELETE CASCADE,
  family_id                uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  parent_refresh_token_id  uuid REFERENCES public.map_oauth_refresh_tokens(id) ON DELETE SET NULL,
  expires_at               timestamptz NOT NULL,
  used_at                  timestamptz,
  revoked_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_oauth_rt_grant   ON public.map_oauth_refresh_tokens (grant_id);
CREATE INDEX IF NOT EXISTS idx_map_oauth_rt_expires ON public.map_oauth_refresh_tokens (expires_at);
ALTER TABLE public.map_oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- 6. map_mcp_audit ALTER --------------------------------------------------
ALTER TABLE public.map_mcp_audit
  ADD COLUMN IF NOT EXISTS auth_kind text NOT NULL DEFAULT 'pat'
    CHECK (auth_kind IN ('pat','oauth_access')),
  ADD COLUMN IF NOT EXISTS grant_id uuid
    REFERENCES public.map_oauth_grants(id) ON DELETE SET NULL;

-- Drop FK so token_id can polymorphically reference either tokens table.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'map_mcp_audit'
      AND constraint_name = 'map_mcp_audit_token_id_fkey'
  ) THEN
    ALTER TABLE public.map_mcp_audit DROP CONSTRAINT map_mcp_audit_token_id_fkey;
  END IF;
END $mig$;

CREATE INDEX IF NOT EXISTS idx_map_mcp_audit_grant
  ON public.map_mcp_audit (grant_id, created_at DESC) WHERE grant_id IS NOT NULL;

-- 7. map_revoke_oauth_grant RPC -------------------------------------------
CREATE OR REPLACE FUNCTION public.map_revoke_oauth_grant(p_grant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $rpc$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  UPDATE public.map_oauth_grants
     SET revoked_at = now()
   WHERE id = p_grant_id
     AND family_id = v_family
     AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant not found, not yours, or already revoked';
  END IF;
  UPDATE public.map_oauth_access_tokens
     SET revoked_at = now()
   WHERE grant_id = p_grant_id AND revoked_at IS NULL;
  UPDATE public.map_oauth_refresh_tokens
     SET revoked_at = now()
   WHERE grant_id = p_grant_id AND revoked_at IS NULL;
END
$rpc$;
REVOKE EXECUTE ON FUNCTION public.map_revoke_oauth_grant(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.map_revoke_oauth_grant(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.map_revoke_oauth_grant(uuid) TO authenticated;

-- 8. map_list_oauth_grants RPC --------------------------------------------
CREATE OR REPLACE FUNCTION public.map_list_oauth_grants()
RETURNS TABLE (
  grant_id     uuid,
  client_id    text,
  client_name  text,
  scope        text,
  created_at   timestamptz,
  last_used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $rpc$
  SELECT g.id, g.client_id, c.client_name, g.scope, g.created_at, g.last_used_at
    FROM public.map_oauth_grants g
    JOIN public.map_oauth_clients c ON c.client_id = g.client_id
   WHERE g.family_id = public.map_current_family_id()
     AND g.revoked_at IS NULL
   ORDER BY g.created_at DESC
$rpc$;
REVOKE EXECUTE ON FUNCTION public.map_list_oauth_grants() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.map_list_oauth_grants() FROM anon;
GRANT  EXECUTE ON FUNCTION public.map_list_oauth_grants() TO authenticated;

COMMIT;
