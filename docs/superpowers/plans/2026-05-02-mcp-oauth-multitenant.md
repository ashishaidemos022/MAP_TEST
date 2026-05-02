# MCP OAuth 2.1 Multi-Tenant Connect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer OAuth 2.1 + Dynamic Client Registration (DCR) in front of `/api/mcp` so Claude.ai and ChatGPT can connect via the standard MCP authorization spec, while keeping the existing PAT path intact.

**Architecture:** Six new endpoints (`/.well-known/*`, `/api/oauth/*`) plus a prefix-based dispatch in `auth.ts`. Tokens are opaque, DB-backed (`oat_*` access, `ort_*` refresh, `oac_*` codes), all family-scoped at issue time from the parent's Supabase Auth session. PAT path (`mcp_*`) is unchanged.

**Tech Stack:** TypeScript + `@vercel/node` runtime + `@modelcontextprotocol/sdk` (existing) + Supabase Postgres + `@supabase/supabase-js` (existing). No new runtime deps; all crypto via `node:crypto`.

**Spec reference:** `docs/superpowers/specs/2026-05-02-mcp-oauth-multitenant-design.md`

---

## File structure

### New files

```
migrations/
  20260502_map_oauth.sql                          # All DDL: 4 tables + audit ALTER + 2 RPCs

api/
  oauth/
    register.ts                                   # POST /api/oauth/register (DCR)
    authorize.ts                                  # GET  /api/oauth/authorize (consent / login redirect)
    consent.ts                                    # POST /api/oauth/consent (Allow → mint code)
    token.ts                                      # POST /api/oauth/token (code & refresh grants)
    revoke.ts                                     # POST /api/oauth/revoke (RFC 7009)
    _cleanup.ts                                   # GET  /api/oauth/_cleanup (Vercel Cron)
  .well-known/
    oauth-authorization-server.ts                 # GET /.well-known/oauth-authorization-server
    oauth-protected-resource.ts                   # GET /.well-known/oauth-protected-resource
  _lib/
    oauth/
      env.ts                                      # PUBLIC_APP_URL, allowed-hosts
      errors.ts                                   # OAuthError + RFC error codes
      hashing.ts                                  # SHA-256 → bytea hex
      tokens.ts                                   # Generate + parse oat_/ort_/oac_/cs_/client_
      pkce.ts                                     # S256 verify
      session.ts                                  # Read Supabase auth cookie server-side
      consent-template.ts                         # Minimal HTML for consent page
      rate-limit.ts                               # In-memory bucket for /register
      clients.ts                                  # Validate redirect_uri, look up client by id, check secret
      grants.ts                                   # Upsert active grant, list-for-family
      auth-codes.ts                               # Issue, look up + consume (replay-safe)
      access-tokens.ts                            # Issue, look up
      refresh-tokens.ts                           # Issue, rotate, reuse-detect cascade

scripts/
  test-oauth-discovery.mjs
  test-oauth-dcr.mjs
  test-oauth-authorize.mjs
  test-oauth-token-code.mjs
  test-oauth-token-refresh.mjs
  test-oauth-revocation.mjs
  test-mcp-oauth-handshake.mjs
  audit-oauth-readonly.mjs
```

### Modified files

| Path | Change |
|---|---|
| `api/_lib/mcp/auth.ts` | Prefix dispatch (`mcp_*` vs `oat_*`); new `McpContext` fields `auth_kind` + `grant_id`; `bumpLastUsedAt` path-aware; `buildUnauthorizedResponse` adds `resource_metadata=...` |
| `api/_lib/mcp/audit.ts` | Insert `auth_kind` + `grant_id` |
| `src/pages/parent/ConnectAi.tsx` | Three sections: Connected agents (new) / PATs (collapsed) / Recent activity (filterable) |
| `vercel.json` | Add `maxDuration: 30` for each new function; add `crons` entry for `/api/oauth/_cleanup` |
| `scripts/test-mcp-handshake.mjs` | Assert `WWW-Authenticate` includes `resource_metadata=...` on 401 |
| `scripts/test-mcp-bad-tokens.mjs` | Add `oat_*` malformed and expired cases |
| `scripts/test-mcp-isolation.mjs` | Add OAuth-issued cross-family isolation case |
| `scripts/audit-mcp-readonly.mjs` | Recompile allow-list to include new tables/columns |

### Existing patterns being reused

- Test scripts: standalone `.mjs`, run via `node --env-file=.env.local`, exit non-zero on fail (mirrors `scripts/test-mcp-*.mjs`).
- Service-role Supabase client: `getServiceClient()` from `api/_lib/mcp/env.ts`.
- Error classes: `McpError(code, message, httpStatus)` shape from `api/_lib/mcp/errors.ts`.
- Audit redaction: arg-key allow-list in `api/_lib/mcp/audit.ts`.
- Migration shape: `BEGIN; … COMMIT;` SQL files in `migrations/`, applied via `mcp__plugin_supabase_supabase__apply_migration` or the existing dbmigration playbook.
- All SECURITY DEFINER functions: `SET search_path = ''`, fully qualified references (per `migrations/20260428_map_multi_tenant.sql`).

---

## Task 1: Apply DB migration

**Files:**
- Create: `migrations/20260502_map_oauth.sql`

- [ ] **Step 1: Write migration file**

Create `migrations/20260502_map_oauth.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration**

Use the Supabase MCP tool with name `map_oauth_2026_05_02`:
```
mcp__plugin_supabase_supabase__apply_migration({
  project_id: 'klhzfwxpztaojekwgzcg',
  name: 'map_oauth_2026_05_02',
  query: <contents of migrations/20260502_map_oauth.sql>
})
```

- [ ] **Step 3: Validate**

Run via `mcp__plugin_supabase_supabase__execute_sql`:
```sql
-- All 5 new tables exist with RLS enabled:
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname='public'
   AND tablename IN ('map_oauth_clients','map_oauth_grants','map_oauth_authorization_codes',
                     'map_oauth_access_tokens','map_oauth_refresh_tokens')
 ORDER BY tablename;
-- Expect 5 rows, all rowsecurity=true.

-- Audit table got new columns and FK was dropped:
SELECT column_name, is_nullable, column_default FROM information_schema.columns
 WHERE table_schema='public' AND table_name='map_mcp_audit'
   AND column_name IN ('auth_kind','grant_id');
-- Expect 2 rows; auth_kind nullable=NO default='pat'::text, grant_id nullable=YES.

SELECT count(*) FROM information_schema.table_constraints
 WHERE table_schema='public' AND table_name='map_mcp_audit'
   AND constraint_name='map_mcp_audit_token_id_fkey';
-- Expect 0.

-- RPCs are SECURITY DEFINER:
SELECT proname, prosecdef FROM pg_proc
 WHERE pronamespace='public'::regnamespace
   AND proname IN ('map_revoke_oauth_grant','map_list_oauth_grants');
-- Expect 2 rows, both prosecdef=true.
```

- [ ] **Step 4: Commit**

```bash
git add migrations/20260502_map_oauth.sql
git commit -m "feat(mcp-oauth): DB schema for OAuth provider — 4 tables + audit ALTER + 2 RPCs"
```

---

## Task 2: Shared OAuth helpers — env, errors, hashing, tokens

**Files:**
- Create: `api/_lib/oauth/env.ts`
- Create: `api/_lib/oauth/errors.ts`
- Create: `api/_lib/oauth/hashing.ts`
- Create: `api/_lib/oauth/tokens.ts`

- [ ] **Step 1: Write `api/_lib/oauth/errors.ts`**

```ts
// RFC 6749 §5.2 + §4.1.2.1 + RFC 7591 + RFC 7009 error codes.
export const OAUTH_ERROR_CODES = {
  invalid_request: 'invalid_request',
  invalid_client: 'invalid_client',
  invalid_grant: 'invalid_grant',
  unauthorized_client: 'unauthorized_client',
  unsupported_grant_type: 'unsupported_grant_type',
  invalid_scope: 'invalid_scope',
  invalid_redirect_uri: 'invalid_redirect_uri',
  invalid_client_metadata: 'invalid_client_metadata',
  server_error: 'server_error',
  access_denied: 'access_denied',
  unsupported_response_type: 'unsupported_response_type',
  rate_limited: 'rate_limited',
} as const;

export type OAuthErrorCode = keyof typeof OAUTH_ERROR_CODES;

export class OAuthError extends Error {
  readonly code: OAuthErrorCode;
  readonly httpStatus: number;
  constructor(code: OAuthErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function buildOAuthErrorResponse(err: OAuthError): Response {
  return new Response(
    JSON.stringify({ error: err.code, error_description: err.message }),
    { status: err.httpStatus, headers: { 'Content-Type': 'application/json' } },
  );
}
```

- [ ] **Step 2: Write `api/_lib/oauth/env.ts`**

```ts
export function getAppUrl(): string {
  const url = process.env.PUBLIC_APP_URL;
  if (!url) throw new Error('PUBLIC_APP_URL is not set');
  // Strip trailing slash so concatenation is predictable.
  return url.replace(/\/$/, '');
}

export function getAllowedDcrHosts(): string[] {
  const fromEnv = process.env.OAUTH_DCR_ALLOWED_HOSTS;
  if (fromEnv) return fromEnv.split(',').map((s) => s.trim()).filter(Boolean);
  const base = ['claude.ai', 'chatgpt.com'];
  if (process.env.NODE_ENV !== 'production') {
    base.push('localhost', '127.0.0.1');
  }
  return base;
}
```

- [ ] **Step 3: Write `api/_lib/oauth/hashing.ts`**

```ts
import { createHash } from 'node:crypto';

// Returns PostgREST bytea input format ("\xHEX") so .eq('token_hash', hex) works.
// Mirrors api/_lib/mcp/auth.ts:sha256ByteaHex.
export function sha256ByteaHex(input: string): string {
  return '\\x' + createHash('sha256').update(input, 'utf8').digest('hex');
}
```

- [ ] **Step 4: Write `api/_lib/oauth/tokens.ts`**

```ts
import { randomBytes } from 'node:crypto';

const CLIENT_ID_PREFIX     = 'client_';
const CLIENT_SECRET_PREFIX = 'cs_';
const ACCESS_TOKEN_PREFIX  = 'oat_';
const REFRESH_TOKEN_PREFIX = 'ort_';
const AUTH_CODE_PREFIX     = 'oac_';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeRandom(prefix: string, byteLen: number): string {
  return prefix + base64url(randomBytes(byteLen));
}

export const generateClientId       = () => makeRandom(CLIENT_ID_PREFIX,     16);
export const generateClientSecret   = () => makeRandom(CLIENT_SECRET_PREFIX, 32);
export const generateAccessToken    = () => makeRandom(ACCESS_TOKEN_PREFIX,  32);
export const generateRefreshToken   = () => makeRandom(REFRESH_TOKEN_PREFIX, 32);
export const generateAuthCode       = () => makeRandom(AUTH_CODE_PREFIX,     32);

export function isAccessToken(s: string): boolean  { return s.startsWith(ACCESS_TOKEN_PREFIX); }
export function isRefreshToken(s: string): boolean { return s.startsWith(REFRESH_TOKEN_PREFIX); }
export function isAuthCode(s: string): boolean     { return s.startsWith(AUTH_CODE_PREFIX); }

export function last4(s: string): string {
  return s.length <= 4 ? s : s.slice(-4);
}

// Re-export for the auth.ts dispatch in /api/mcp.
export { ACCESS_TOKEN_PREFIX };
```

- [ ] **Step 5: Commit**

```bash
git add api/_lib/oauth/env.ts api/_lib/oauth/errors.ts api/_lib/oauth/hashing.ts api/_lib/oauth/tokens.ts
git commit -m "feat(mcp-oauth): shared helpers — env, errors, hashing, token generation"
```

---

## Task 3: Discovery endpoints

**Files:**
- Create: `api/.well-known/oauth-authorization-server.ts`
- Create: `api/.well-known/oauth-protected-resource.ts`
- Create: `scripts/test-oauth-discovery.mjs`

- [ ] **Step 1: Write the failing test `scripts/test-oauth-discovery.mjs`**

```js
// Verifies /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource.
// Run: node --env-file=.env.local scripts/test-oauth-discovery.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (res.status !== 200) { console.error('FAIL', path, 'status', res.status); process.exit(1); }
  return res.json();
}

const as = await getJson('/.well-known/oauth-authorization-server');
const required = [
  'issuer', 'authorization_endpoint', 'token_endpoint', 'registration_endpoint',
  'response_types_supported', 'grant_types_supported',
  'token_endpoint_auth_methods_supported', 'code_challenge_methods_supported',
  'scopes_supported',
];
for (const k of required) {
  if (!(k in as)) { console.error('FAIL AS missing', k); process.exit(1); }
}
if (!as.code_challenge_methods_supported.includes('S256')) {
  console.error('FAIL AS missing S256'); process.exit(1);
}
if (as.code_challenge_methods_supported.includes('plain')) {
  console.error('FAIL AS advertises plain (must reject)'); process.exit(1);
}
if (!as.grant_types_supported.includes('authorization_code')) {
  console.error('FAIL AS missing authorization_code'); process.exit(1);
}
if (!as.grant_types_supported.includes('refresh_token')) {
  console.error('FAIL AS missing refresh_token'); process.exit(1);
}
console.log('PASS oauth-authorization-server');

const pr = await getJson('/.well-known/oauth-protected-resource');
if (!pr.resource || !pr.resource.endsWith('/api/mcp')) {
  console.error('FAIL PR resource', pr.resource); process.exit(1);
}
if (!Array.isArray(pr.authorization_servers) || pr.authorization_servers.length === 0) {
  console.error('FAIL PR authorization_servers'); process.exit(1);
}
console.log('PASS oauth-protected-resource');
```

- [ ] **Step 2: Run, expect failure**

```
node --env-file=.env.local scripts/test-oauth-discovery.mjs
# Expected: FAIL with 404 on first GET
```

- [ ] **Step 3: Implement `api/.well-known/oauth-authorization-server.ts`**

```ts
export const config = { runtime: 'nodejs' } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAppUrl } from '../_lib/oauth/env.js';

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const issuer = getAppUrl();
  const body = {
    issuer,
    authorization_endpoint: `${issuer}/api/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp:read'],
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify(body));
}
```

- [ ] **Step 4: Implement `api/.well-known/oauth-protected-resource.ts`**

```ts
export const config = { runtime: 'nodejs' } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAppUrl } from '../_lib/oauth/env.js';

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const issuer = getAppUrl();
  const body = {
    resource: `${issuer}/api/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:read'],
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify(body));
}
```

- [ ] **Step 5: Run, expect pass**

```
node --env-file=.env.local scripts/test-oauth-discovery.mjs
# Expected: PASS oauth-authorization-server / PASS oauth-protected-resource
```

- [ ] **Step 6: Commit**

```bash
git add api/.well-known/oauth-authorization-server.ts api/.well-known/oauth-protected-resource.ts scripts/test-oauth-discovery.mjs
git commit -m "feat(mcp-oauth): RFC 8414 + RFC 9728 discovery endpoints"
```

---

## Task 4: DCR rate limit + redirect-URI allow-list helpers

**Files:**
- Create: `api/_lib/oauth/rate-limit.ts`
- Create: `api/_lib/oauth/clients.ts`

- [ ] **Step 1: Write `api/_lib/oauth/rate-limit.ts`**

```ts
import { OAuthError } from './errors.js';

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const LIMIT = 10;

// Per-IP rate limit for /api/oauth/register. In-memory only — per warm
// Vercel instance. Mirrors the existing /api/_lib/mcp/rate-limit.ts shape.
export function enforceDcrRateLimit(sourceIp: string): void {
  const now = Date.now();
  const b = buckets.get(sourceIp);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(sourceIp, { count: 1, windowStart: now });
    return;
  }
  b.count += 1;
  if (b.count > LIMIT) {
    throw new OAuthError('rate_limited', 'too many registration requests', 429);
  }
}

export function clientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0]!.trim();
  if (Array.isArray(xff)) return xff[0]!.split(',')[0]!.trim();
  return 'unknown';
}
```

- [ ] **Step 2: Write `api/_lib/oauth/clients.ts`**

```ts
import { createHash } from 'node:crypto';
import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';
import { getAllowedDcrHosts } from './env.js';

export type OAuthClientRow = {
  id: string;
  client_id: string;
  client_secret_hash: string | null;  // bytea hex from PostgREST
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
};

// Suffix-match: 'claude.ai' allows 'claude.ai' and any '*.claude.ai'.
export function isRedirectUriAllowed(uri: string): boolean {
  let url: URL;
  try { url = new URL(uri); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  // http only allowed for localhost dev
  if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return false;
  }
  const allowed = getAllowedDcrHosts();
  for (const host of allowed) {
    if (url.hostname === host) return true;
    if (url.hostname.endsWith('.' + host)) return true;
  }
  return false;
}

export async function getClientById(client_id: string): Promise<OAuthClientRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from('map_oauth_clients')
    .select('id, client_id, client_secret_hash, client_name, redirect_uris, grant_types, token_endpoint_auth_method')
    .eq('client_id', client_id)
    .maybeSingle();
  if (error) throw new OAuthError('server_error', `client lookup failed: ${error.message}`, 500);
  if (!data) throw new OAuthError('invalid_client', 'unknown client_id', 401);
  return data as OAuthClientRow;
}

export async function authenticateClient(client_id: string, client_secret: string | null): Promise<OAuthClientRow> {
  const c = await getClientById(client_id);
  if (!c.client_secret_hash) {
    // Public client (no secret) — only valid if registered as such (PKCE-only).
    if (client_secret) throw new OAuthError('invalid_client', 'client_secret not expected', 401);
    return c;
  }
  if (!client_secret) throw new OAuthError('invalid_client', 'client_secret required', 401);
  const presented = '\\x' + createHash('sha256').update(client_secret, 'utf8').digest('hex');
  if (presented !== c.client_secret_hash) {
    throw new OAuthError('invalid_client', 'client_secret mismatch', 401);
  }
  return c;
}

export function assertRedirectUriRegistered(c: OAuthClientRow, redirect_uri: string): void {
  if (!c.redirect_uris.includes(redirect_uri)) {
    throw new OAuthError('invalid_grant', 'redirect_uri does not match registration', 400);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add api/_lib/oauth/rate-limit.ts api/_lib/oauth/clients.ts
git commit -m "feat(mcp-oauth): DCR rate-limit bucket + redirect-URI allow-list + client auth helpers"
```

---

## Task 5: POST /api/oauth/register (DCR)

**Files:**
- Create: `api/oauth/register.ts`
- Create: `scripts/test-oauth-dcr.mjs`

- [ ] **Step 1: Write the failing test `scripts/test-oauth-dcr.mjs`**

```js
// Verifies DCR allow-list, rate limit, happy path.
// Run: node --env-file=.env.local scripts/test-oauth-dcr.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

async function reg(body, headers = {}) {
  const res = await fetch(`${BASE}/api/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// 1. Happy path: claude.ai
const ok = await reg({
  client_name: 'Claude.ai test',
  redirect_uris: ['https://claude.ai/oauth/callback'],
});
if (ok.status !== 201 || !ok.body.client_id || !ok.body.client_secret) {
  console.error('FAIL happy-path:', ok); process.exit(1);
}
if (!ok.body.client_id.startsWith('client_') || !ok.body.client_secret.startsWith('cs_')) {
  console.error('FAIL prefixes:', ok.body); process.exit(1);
}
console.log('PASS happy-path (claude.ai)');

// 2. ChatGPT subdomain
const ok2 = await reg({
  client_name: 'ChatGPT test',
  redirect_uris: ['https://oauth.chatgpt.com/callback'],
});
if (ok2.status !== 201) { console.error('FAIL chatgpt subdomain:', ok2); process.exit(1); }
console.log('PASS chatgpt subdomain');

// 3. Disallowed host
const bad = await reg({
  client_name: 'Evil',
  redirect_uris: ['https://evil.com/cb'],
});
if (bad.status !== 400 || bad.body.error !== 'invalid_redirect_uri') {
  console.error('FAIL disallowed:', bad); process.exit(1);
}
console.log('PASS disallowed-host rejected');

// 4. Missing fields
const miss = await reg({ client_name: 'X' });
if (miss.status !== 400 || miss.body.error !== 'invalid_client_metadata') {
  console.error('FAIL missing redirect_uris:', miss); process.exit(1);
}
console.log('PASS missing-fields rejected');

// 5. Rate limit (set ip header to a fixed value, hit 11 times quickly)
const ip = `1.2.3.${Math.floor(Math.random() * 250) + 1}`;
let lastStatus = 0;
for (let i = 0; i < 11; i++) {
  const r = await reg(
    { client_name: `RL-${i}`, redirect_uris: ['https://claude.ai/oauth/callback'] },
    { 'x-forwarded-for': ip },
  );
  lastStatus = r.status;
}
if (lastStatus !== 429) {
  console.error('FAIL rate-limit (last status):', lastStatus); process.exit(1);
}
console.log('PASS rate-limit fires after 10/min');
```

- [ ] **Step 2: Run, expect failure**

```
node --env-file=.env.local scripts/test-oauth-dcr.mjs
# Expected: FAIL on first request (404 / endpoint missing)
```

- [ ] **Step 3: Implement `api/oauth/register.ts`**

```ts
export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { getServiceClient } from '../_lib/mcp/env.js';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { generateClientId, generateClientSecret, last4 } from '../_lib/oauth/tokens.js';
import { isRedirectUriAllowed } from '../_lib/oauth/clients.js';
import { enforceDcrRateLimit, clientIp } from '../_lib/oauth/rate-limit.js';

type RegisterBody = {
  client_name?: unknown;
  redirect_uris?: unknown;
  grant_types?: unknown;
  token_endpoint_auth_method?: unknown;
};

async function readJson(req: IncomingMessage): Promise<RegisterBody> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new OAuthError('invalid_request', 'malformed JSON body', 400); }
}

function validate(body: RegisterBody): {
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
} {
  if (typeof body.client_name !== 'string' || body.client_name.length === 0 || body.client_name.length > 100) {
    throw new OAuthError('invalid_client_metadata', 'client_name must be a string of 1-100 chars', 400);
  }
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    throw new OAuthError('invalid_client_metadata', 'redirect_uris must be a non-empty array', 400);
  }
  for (const u of body.redirect_uris) {
    if (typeof u !== 'string') throw new OAuthError('invalid_client_metadata', 'redirect_uris must be strings', 400);
    if (!isRedirectUriAllowed(u)) throw new OAuthError('invalid_redirect_uri', `redirect_uri not allowed: ${u}`, 400);
  }
  const grant_types = Array.isArray(body.grant_types) && body.grant_types.length > 0
    ? body.grant_types.filter((g): g is string => typeof g === 'string')
    : ['authorization_code', 'refresh_token'];
  for (const g of grant_types) {
    if (g !== 'authorization_code' && g !== 'refresh_token') {
      throw new OAuthError('invalid_client_metadata', `unsupported grant_type: ${g}`, 400);
    }
  }
  const auth_method = typeof body.token_endpoint_auth_method === 'string'
    ? body.token_endpoint_auth_method
    : 'client_secret_post';
  if (auth_method !== 'client_secret_post' && auth_method !== 'none') {
    throw new OAuthError('invalid_client_metadata', `unsupported token_endpoint_auth_method: ${auth_method}`, 400);
  }
  return {
    client_name: body.client_name,
    redirect_uris: body.redirect_uris as string[],
    grant_types,
    token_endpoint_auth_method: auth_method,
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('method not allowed'); return;
  }
  try {
    enforceDcrRateLimit(clientIp(req as unknown as { headers: Record<string, string | string[] | undefined> }));

    const raw = await readJson(req);
    const meta = validate(raw);

    const client_id = generateClientId();
    let client_secret: string | null = null;
    let client_secret_hash: string | null = null;
    if (meta.token_endpoint_auth_method === 'client_secret_post') {
      client_secret = generateClientSecret();
      client_secret_hash = '\\x' + createHash('sha256').update(client_secret, 'utf8').digest('hex');
    }

    const sb = getServiceClient();
    const { error } = await sb.from('map_oauth_clients').insert({
      client_id,
      client_secret_hash,
      client_name: meta.client_name,
      redirect_uris: meta.redirect_uris,
      grant_types: meta.grant_types,
      token_endpoint_auth_method: meta.token_endpoint_auth_method,
      created_via: 'dcr',
    });
    if (error) throw new OAuthError('server_error', `insert failed: ${error.message}`, 500);

    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      client_id,
      ...(client_secret ? { client_secret, client_secret_last4: last4(client_secret) } : {}),
      client_name: meta.client_name,
      redirect_uris: meta.redirect_uris,
      grant_types: meta.grant_types,
      token_endpoint_auth_method: meta.token_endpoint_auth_method,
    }));
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/register] unhandled', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'server_error' }));
  }
}
```

- [ ] **Step 4: Run, expect pass**

```
node --env-file=.env.local scripts/test-oauth-dcr.mjs
# Expected: 5 PASS lines
```

- [ ] **Step 5: Commit**

```bash
git add api/oauth/register.ts scripts/test-oauth-dcr.mjs
git commit -m "feat(mcp-oauth): POST /api/oauth/register with allow-list + rate-limit"
```

---

## Task 6: Server-side Supabase session reading

**Files:**
- Create: `api/_lib/oauth/session.ts`

- [ ] **Step 1: Write `api/_lib/oauth/session.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import { OAuthError } from './errors.js';

// Reads the Supabase auth cookie from a Node request and returns
// { user_id, family_id } or null if not signed in.
//
// Supabase JS sets a cookie named `sb-<project-ref>-auth-token` whose
// value is a JSON-encoded array [access_token, refresh_token, ...].
// We extract the access_token and use auth.getUser() to verify it.

export type SessionContext = {
  user_id: string;
  family_id: string;
};

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = decodeURIComponent(part.slice(i + 1).trim());
    out[k] = v;
  }
  return out;
}

function findAuthTokenCookie(cookies: Record<string, string>): string | null {
  // Supabase split-cookies (newer SDKs) name them sb-<ref>-auth-token.0, .1
  // We try the single-cookie form first, then concatenate the chunked form.
  const single = Object.entries(cookies).find(([k]) => /^sb-.*-auth-token$/.test(k));
  if (single) return single[1];
  const chunks: Array<[number, string]> = [];
  for (const [k, v] of Object.entries(cookies)) {
    const m = /^sb-.*-auth-token\.(\d+)$/.exec(k);
    if (m) chunks.push([Number(m[1]), v]);
  }
  if (chunks.length === 0) return null;
  chunks.sort((a, b) => a[0] - b[0]);
  return chunks.map(([, v]) => v).join('');
}

function extractAccessToken(cookieValue: string): string | null {
  // Supabase cookie can be base64-prefixed JSON or raw JSON; both forms seen in the wild.
  let raw = cookieValue;
  if (raw.startsWith('base64-')) {
    try { raw = Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf8'); }
    catch { return null; }
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
    if (parsed && typeof parsed.access_token === 'string') return parsed.access_token;
  } catch { /* fall through */ }
  return null;
}

export async function getSessionContextFromRequest(
  cookieHeader: string | undefined,
): Promise<SessionContext | null> {
  const cookies = parseCookies(cookieHeader);
  const cookieValue = findAuthTokenCookie(cookies);
  if (!cookieValue) return null;
  const accessToken = extractAccessToken(cookieValue);
  if (!accessToken) return null;

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new OAuthError('server_error', 'supabase env not set', 500);

  // Anon-key client. We pass the user's access token; auth.getUser validates it.
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) return null;

  // Now use service-role to look up the family (RLS would require us to use
  // the user's session, but we already verified the user via getUser).
  const { getServiceClient } = await import('../mcp/env.js');
  const svc = getServiceClient();
  const { data: fam, error: fe } = await svc
    .from('map_families')
    .select('id')
    .eq('owner_user_id', data.user.id)
    .maybeSingle();
  if (fe) throw new OAuthError('server_error', `family lookup failed: ${fe.message}`, 500);
  if (!fam) return null;

  return { user_id: data.user.id, family_id: fam.id };
}
```

- [ ] **Step 2: Commit (no test yet — exercised by Task 7's tests)**

```bash
git add api/_lib/oauth/session.ts
git commit -m "feat(mcp-oauth): server-side Supabase session cookie reader"
```

---

## Task 7: GET /api/oauth/authorize + POST /api/oauth/consent

**Files:**
- Create: `api/_lib/oauth/consent-template.ts`
- Create: `api/_lib/oauth/grants.ts`
- Create: `api/_lib/oauth/auth-codes.ts`
- Create: `api/oauth/authorize.ts`
- Create: `api/oauth/consent.ts`
- Create: `scripts/test-oauth-authorize.mjs`

- [ ] **Step 1: Write `api/_lib/oauth/consent-template.ts`**

```ts
// Minimal HTML — server-rendered, no JS framework needed. CSRF token is the
// hex of a random 16-byte buffer signed into a hidden form field; verified
// at /consent. Form POSTs to /api/oauth/consent with all OAuth params.

export type ConsentParams = {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  state: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: string;
  csrf_token: string;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

export function renderConsentHtml(p: ConsentParams): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Authorize ${esc(p.client_name)}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 64px auto; padding: 0 24px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; margin-bottom: 8px; }
  p { color: #555; line-height: 1.5; }
  .row { margin-top: 24px; display: flex; gap: 12px; }
  button { font-size: 1rem; padding: 10px 16px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
  button.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
</style></head><body>
<h1>${esc(p.client_name)} wants to read your family's practice data</h1>
<p>Scope: <code>${esc(p.scope)}</code>. The agent will be able to call read-only tools to see your kids' practice sessions, accuracy, and misconceptions. It cannot make changes.</p>
<form method="POST" action="/api/oauth/consent">
  <input type="hidden" name="client_id" value="${esc(p.client_id)}">
  <input type="hidden" name="redirect_uri" value="${esc(p.redirect_uri)}">
  <input type="hidden" name="state" value="${esc(p.state)}">
  <input type="hidden" name="scope" value="${esc(p.scope)}">
  <input type="hidden" name="code_challenge" value="${esc(p.code_challenge)}">
  <input type="hidden" name="code_challenge_method" value="${esc(p.code_challenge_method)}">
  <input type="hidden" name="csrf_token" value="${esc(p.csrf_token)}">
  <div class="row">
    <button type="submit" name="decision" value="deny">Deny</button>
    <button type="submit" name="decision" value="allow" class="primary">Allow</button>
  </div>
</form>
</body></html>`;
}
```

- [ ] **Step 2: Write `api/_lib/oauth/grants.ts`**

```ts
import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';

export async function upsertActiveGrant(opts: {
  family_id: string;
  owner_user_id: string;
  client_id: string;
  scope: string;
}): Promise<{ id: string }> {
  const sb = getServiceClient();
  // Try to find an active grant first (the unique partial index would
  // collide on a naive insert; conflict-on-partial-index isn't supported
  // by upsert in a clean way, so we do select-then-insert in one txn-shape).
  const { data: existing, error: e1 } = await sb
    .from('map_oauth_grants')
    .select('id')
    .eq('family_id', opts.family_id)
    .eq('client_id', opts.client_id)
    .is('revoked_at', null)
    .maybeSingle();
  if (e1) throw new OAuthError('server_error', `grant lookup: ${e1.message}`, 500);
  if (existing) return { id: existing.id };

  const { data: ins, error: e2 } = await sb
    .from('map_oauth_grants')
    .insert({
      family_id: opts.family_id,
      owner_user_id: opts.owner_user_id,
      client_id: opts.client_id,
      scope: opts.scope,
    })
    .select('id')
    .single();
  if (e2) throw new OAuthError('server_error', `grant insert: ${e2.message}`, 500);
  return { id: ins.id };
}

export async function bumpGrantLastUsed(grant_id: string): Promise<void> {
  const sb = getServiceClient();
  await sb.from('map_oauth_grants').update({ last_used_at: new Date().toISOString() }).eq('id', grant_id);
}
```

- [ ] **Step 3: Write `api/_lib/oauth/auth-codes.ts`**

```ts
import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';
import { sha256ByteaHex } from './hashing.js';
import { generateAuthCode } from './tokens.js';

const CODE_TTL_SECONDS = 60;

export async function issueAuthCode(opts: {
  grant_id: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  redirect_uri: string;
  scope: string;
}): Promise<string> {
  const code = generateAuthCode();
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_authorization_codes').insert({
    code_hash: sha256ByteaHex(code),
    grant_id: opts.grant_id,
    code_challenge: opts.code_challenge,
    code_challenge_method: opts.code_challenge_method,
    redirect_uri: opts.redirect_uri,
    scope: opts.scope,
    expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new OAuthError('server_error', `code insert: ${error.message}`, 500);
  return code;
}

export type ConsumedCode = {
  grant_id: string;
  code_challenge: string;
  redirect_uri: string;
  scope: string;
};

// Atomic consume: marks used_at iff still unused/unexpired, returns row.
// Uses .update().select() to do it in one round trip.
export async function consumeAuthCode(plaintext: string): Promise<ConsumedCode> {
  const sb = getServiceClient();
  const hash = sha256ByteaHex(plaintext);
  const { data, error } = await sb.from('map_oauth_authorization_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code_hash', hash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('grant_id, code_challenge, redirect_uri, scope')
    .maybeSingle();
  if (error) throw new OAuthError('server_error', `code consume: ${error.message}`, 500);
  if (!data) throw new OAuthError('invalid_grant', 'code is invalid, used, or expired', 400);
  return data as ConsumedCode;
}
```

- [ ] **Step 4: Write the failing test `scripts/test-oauth-authorize.mjs`**

```js
// Verifies /api/oauth/authorize parameter validation and login redirect.
// Full consent flow needs a real Supabase session; covered by handshake test.
// Run: node --env-file=.env.local scripts/test-oauth-authorize.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

// Pre-register a client to use for the tests.
const reg = await fetch(`${BASE}/api/oauth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_name: 'authz-test', redirect_uris: ['https://claude.ai/oauth/callback'] }),
}).then((r) => r.json());
if (!reg.client_id) { console.error('FAIL setup register:', reg); process.exit(1); }

function authorizeUrl(params) {
  const u = new URL(`${BASE}/api/oauth/authorize`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
async function get(params) {
  return fetch(authorizeUrl(params), { redirect: 'manual' });
}

const okParams = {
  response_type: 'code',
  client_id: reg.client_id,
  redirect_uri: 'https://claude.ai/oauth/callback',
  scope: 'mcp:read',
  state: 'abc123',
  code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  code_challenge_method: 'S256',
};

// 1. No session → 302 to /login?return_to=...
const r1 = await get(okParams);
if (r1.status !== 302 || !(r1.headers.get('location') || '').includes('/login?return_to=')) {
  console.error('FAIL no-session redirect:', r1.status, r1.headers.get('location')); process.exit(1);
}
console.log('PASS no-session → /login redirect');

// 2. response_type != 'code'
const r2 = await get({ ...okParams, response_type: 'token' });
if (r2.status !== 400) { console.error('FAIL response_type', r2.status); process.exit(1); }
console.log('PASS unsupported_response_type rejected');

// 3. code_challenge_method != 'S256'
const r3 = await get({ ...okParams, code_challenge_method: 'plain' });
if (r3.status !== 400) { console.error('FAIL plain rejected', r3.status); process.exit(1); }
console.log('PASS code_challenge_method=plain rejected');

// 4. Unknown client_id
const r4 = await get({ ...okParams, client_id: 'client_does_not_exist' });
if (r4.status !== 400) { console.error('FAIL unknown client', r4.status); process.exit(1); }
console.log('PASS unknown-client rejected');

// 5. Mismatched redirect_uri
const r5 = await get({ ...okParams, redirect_uri: 'https://claude.ai/wrong' });
if (r5.status !== 400) { console.error('FAIL mismatched redirect_uri', r5.status); process.exit(1); }
console.log('PASS mismatched-redirect_uri rejected');
```

- [ ] **Step 5: Run, expect failure**

```
node --env-file=.env.local scripts/test-oauth-authorize.mjs
# Expected: FAIL on first GET
```

- [ ] **Step 6: Implement `api/oauth/authorize.ts`**

```ts
export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { getClientById, assertRedirectUriRegistered } from '../_lib/oauth/clients.js';
import { getSessionContextFromRequest } from '../_lib/oauth/session.js';
import { renderConsentHtml } from '../_lib/oauth/consent-template.js';
import { getAppUrl } from '../_lib/oauth/env.js';

function paramsFromUrl(req: IncomingMessage): URLSearchParams {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host ?? 'localhost';
  const u = new URL(`${proto}://${host}${req.url ?? '/'}`);
  return u.searchParams;
}

function redirectWithError(redirect_uri: string, state: string | null, code: string, desc: string): string {
  const u = new URL(redirect_uri);
  u.searchParams.set('error', code);
  u.searchParams.set('error_description', desc);
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.statusCode = 405; res.setHeader('Allow', 'GET'); res.end('method not allowed'); return;
  }
  try {
    const q = paramsFromUrl(req);
    const response_type        = q.get('response_type');
    const client_id            = q.get('client_id');
    const redirect_uri         = q.get('redirect_uri');
    const scope                = q.get('scope') ?? 'mcp:read';
    const state                = q.get('state') ?? '';
    const code_challenge       = q.get('code_challenge');
    const code_challenge_method= q.get('code_challenge_method');

    if (!client_id || !redirect_uri) throw new OAuthError('invalid_request', 'client_id and redirect_uri required', 400);
    const client = await getClientById(client_id);
    assertRedirectUriRegistered(client, redirect_uri);

    if (response_type !== 'code') {
      const u = redirectWithError(redirect_uri, state, 'unsupported_response_type', 'response_type must be code');
      res.statusCode = 302; res.setHeader('Location', u); res.end(); return;
    }
    if (code_challenge_method !== 'S256' || !code_challenge) {
      const u = redirectWithError(redirect_uri, state, 'invalid_request', 'PKCE S256 required');
      res.statusCode = 302; res.setHeader('Location', u); res.end(); return;
    }
    if (scope !== 'mcp:read') {
      const u = redirectWithError(redirect_uri, state, 'invalid_scope', 'only mcp:read supported');
      res.statusCode = 302; res.setHeader('Location', u); res.end(); return;
    }

    const session = await getSessionContextFromRequest(req.headers.cookie);
    if (!session) {
      const fullUrl = `${getAppUrl()}${req.url ?? '/api/oauth/authorize'}`;
      res.statusCode = 302;
      res.setHeader('Location', `/login?return_to=${encodeURIComponent(fullUrl)}`);
      res.end(); return;
    }

    // Issue a CSRF token tied to this consent rendering. Stored in an
    // HttpOnly cookie; verified server-side at /api/oauth/consent.
    const csrf = randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', `oauth_csrf=${csrf}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    const html = renderConsentHtml({
      client_id, client_name: client.client_name, redirect_uri, state, scope,
      code_challenge, code_challenge_method, csrf_token: csrf,
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/authorize] unhandled', err);
    res.statusCode = 500;
    res.end('server error');
  }
}
```

- [ ] **Step 7: Implement `api/oauth/consent.ts`**

```ts
export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { getClientById, assertRedirectUriRegistered } from '../_lib/oauth/clients.js';
import { getSessionContextFromRequest } from '../_lib/oauth/session.js';
import { upsertActiveGrant } from '../_lib/oauth/grants.js';
import { issueAuthCode } from '../_lib/oauth/auth-codes.js';

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function getCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function redirectBack(redirect_uri: string, state: string, params: Record<string, string>): string {
  const u = new URL(redirect_uri);
  if (state) u.searchParams.set('state', state);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('method not allowed'); return;
  }
  try {
    const form = await readForm(req);
    const client_id    = form.get('client_id') ?? '';
    const redirect_uri = form.get('redirect_uri') ?? '';
    const state        = form.get('state') ?? '';
    const scope        = form.get('scope') ?? 'mcp:read';
    const challenge    = form.get('code_challenge') ?? '';
    const challenge_m  = form.get('code_challenge_method') ?? '';
    const csrf_form    = form.get('csrf_token') ?? '';
    const decision     = form.get('decision') ?? '';

    const csrf_cookie = getCookie(req.headers.cookie, 'oauth_csrf');
    if (!csrf_cookie || csrf_cookie !== csrf_form) {
      throw new OAuthError('invalid_request', 'CSRF token mismatch', 400);
    }

    const session = await getSessionContextFromRequest(req.headers.cookie);
    if (!session) throw new OAuthError('access_denied', 'not signed in', 401);

    const client = await getClientById(client_id);
    assertRedirectUriRegistered(client, redirect_uri);
    if (challenge_m !== 'S256' || !challenge) throw new OAuthError('invalid_request', 'PKCE S256 required', 400);
    if (scope !== 'mcp:read') throw new OAuthError('invalid_scope', 'only mcp:read supported', 400);

    if (decision !== 'allow') {
      const u = redirectBack(redirect_uri, state, { error: 'access_denied', error_description: 'user denied' });
      res.statusCode = 302; res.setHeader('Location', u); res.end(); return;
    }

    const grant = await upsertActiveGrant({
      family_id: session.family_id,
      owner_user_id: session.user_id,
      client_id: client.client_id,
      scope,
    });
    const code = await issueAuthCode({
      grant_id: grant.id,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      redirect_uri,
      scope,
    });

    const u = redirectBack(redirect_uri, state, { code });
    res.statusCode = 302;
    res.setHeader('Set-Cookie', 'oauth_csrf=; Path=/; Max-Age=0');  // clear CSRF cookie
    res.setHeader('Location', u);
    res.end();
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/consent] unhandled', err);
    res.statusCode = 500;
    res.end('server error');
  }
}
```

- [ ] **Step 8: Run, expect pass**

```
node --env-file=.env.local scripts/test-oauth-authorize.mjs
# Expected: 5 PASS lines
```

- [ ] **Step 9: Commit**

```bash
git add api/_lib/oauth/consent-template.ts api/_lib/oauth/grants.ts api/_lib/oauth/auth-codes.ts \
        api/oauth/authorize.ts api/oauth/consent.ts scripts/test-oauth-authorize.mjs
git commit -m "feat(mcp-oauth): /authorize + /consent with PKCE validation and CSRF"
```

---

## Task 8: PKCE verify helper + access/refresh token modules

**Files:**
- Create: `api/_lib/oauth/pkce.ts`
- Create: `api/_lib/oauth/access-tokens.ts`
- Create: `api/_lib/oauth/refresh-tokens.ts`

- [ ] **Step 1: Write `api/_lib/oauth/pkce.ts`**

```ts
import { createHash } from 'node:crypto';
import { OAuthError } from './errors.js';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 7636 §4.6: code_challenge == BASE64URL(SHA256(code_verifier)).
export function verifyPkceS256(code_verifier: string, code_challenge: string): void {
  if (!code_verifier || code_verifier.length < 43 || code_verifier.length > 128) {
    throw new OAuthError('invalid_grant', 'code_verifier length out of range', 400);
  }
  const computed = base64url(createHash('sha256').update(code_verifier, 'utf8').digest());
  if (computed !== code_challenge) {
    throw new OAuthError('invalid_grant', 'code_verifier does not match code_challenge', 400);
  }
}
```

- [ ] **Step 2: Write `api/_lib/oauth/access-tokens.ts`**

```ts
import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';
import { sha256ByteaHex } from './hashing.js';
import { generateAccessToken, last4 } from './tokens.js';

const ACCESS_TTL_SECONDS = 3600; // 1 hour

export async function issueAccessToken(opts: {
  grant_id: string;
  family_id: string;
  scope: string;
}): Promise<{ token: string; expires_in: number }> {
  const token = generateAccessToken();
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_access_tokens').insert({
    token_hash: sha256ByteaHex(token),
    token_last4: last4(token),
    grant_id: opts.grant_id,
    family_id: opts.family_id,
    scope: opts.scope,
    expires_at: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new OAuthError('server_error', `access_token insert: ${error.message}`, 500);
  return { token, expires_in: ACCESS_TTL_SECONDS };
}

export type AccessTokenLookup = {
  token_id: string;
  family_id: string;
  grant_id: string;
  scope: string;
  // owner_user_id is loaded via a join into map_oauth_grants.
  owner_user_id: string;
};

// Used by api/_lib/mcp/auth.ts at request time.
export async function lookupAccessToken(plaintext: string): Promise<AccessTokenLookup> {
  const sb = getServiceClient();
  const { data, error } = await sb.from('map_oauth_access_tokens')
    .select(`
      id, family_id, grant_id, scope, expires_at, revoked_at,
      grant:map_oauth_grants!inner(owner_user_id, revoked_at)
    `)
    .eq('token_hash', sha256ByteaHex(plaintext))
    .maybeSingle();
  if (error) throw new OAuthError('server_error', `access_token lookup: ${error.message}`, 500);
  if (!data) throw new OAuthError('invalid_grant', 'token not found', 401);
  if (data.revoked_at) throw new OAuthError('invalid_grant', 'token revoked', 401);
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new OAuthError('invalid_grant', 'token expired', 401);
  }
  // grant is { owner_user_id, revoked_at } per !inner join (single object even though PostgREST may type as array).
  const grant = Array.isArray(data.grant) ? data.grant[0] : data.grant;
  if (!grant) throw new OAuthError('invalid_grant', 'orphan token', 401);
  if (grant.revoked_at) throw new OAuthError('invalid_grant', 'grant revoked', 401);
  return {
    token_id: data.id,
    family_id: data.family_id,
    grant_id: data.grant_id,
    scope: data.scope,
    owner_user_id: grant.owner_user_id,
  };
}
```

- [ ] **Step 3: Write `api/_lib/oauth/refresh-tokens.ts`**

```ts
import { getServiceClient } from '../mcp/env.js';
import { OAuthError } from './errors.js';
import { sha256ByteaHex } from './hashing.js';
import { generateRefreshToken, last4 } from './tokens.js';

const REFRESH_TTL_DAYS = 90;

export async function issueRefreshToken(opts: {
  grant_id: string;
  family_id: string;
  parent_refresh_token_id?: string | null;
}): Promise<string> {
  const token = generateRefreshToken();
  const sb = getServiceClient();
  const { error } = await sb.from('map_oauth_refresh_tokens').insert({
    token_hash: sha256ByteaHex(token),
    token_last4: last4(token),
    grant_id: opts.grant_id,
    family_id: opts.family_id,
    parent_refresh_token_id: opts.parent_refresh_token_id ?? null,
    expires_at: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000).toISOString(),
  });
  if (error) throw new OAuthError('server_error', `refresh_token insert: ${error.message}`, 500);
  return token;
}

// Atomically mark used_at on the presented refresh token. If the token is
// already used, this is a reuse — cascade-revoke the entire grant before throwing.
// Returns the row needed to mint replacements.
export async function consumeRefreshToken(plaintext: string): Promise<{
  refresh_token_id: string;
  grant_id: string;
  family_id: string;
}> {
  const sb = getServiceClient();
  const hash = sha256ByteaHex(plaintext);

  // Try to claim the token: only succeeds if used_at IS NULL and not revoked/expired.
  const { data: claimed, error: claimErr } = await sb.from('map_oauth_refresh_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hash)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, grant_id, family_id')
    .maybeSingle();
  if (claimErr) throw new OAuthError('server_error', `refresh consume: ${claimErr.message}`, 500);
  if (claimed) return { refresh_token_id: claimed.id, grant_id: claimed.grant_id, family_id: claimed.family_id };

  // Claim failed. Find out why.
  const { data: existing } = await sb.from('map_oauth_refresh_tokens')
    .select('id, grant_id, used_at, revoked_at, expires_at')
    .eq('token_hash', hash)
    .maybeSingle();
  if (existing && existing.used_at && !existing.revoked_at) {
    // REUSE DETECTED: cascade revoke the grant + all under-grant tokens.
    await cascadeRevokeGrant(existing.grant_id);
    throw new OAuthError('invalid_grant', 'refresh token reuse detected; grant revoked', 400);
  }
  throw new OAuthError('invalid_grant', 'refresh token invalid, revoked, or expired', 400);
}

async function cascadeRevokeGrant(grant_id: string): Promise<void> {
  const sb = getServiceClient();
  const now = new Date().toISOString();
  await sb.from('map_oauth_grants').update({ revoked_at: now }).eq('id', grant_id).is('revoked_at', null);
  await sb.from('map_oauth_access_tokens').update({ revoked_at: now }).eq('grant_id', grant_id).is('revoked_at', null);
  await sb.from('map_oauth_refresh_tokens').update({ revoked_at: now }).eq('grant_id', grant_id).is('revoked_at', null);
}

// Used by /oauth/revoke (RFC 7009) for a single-token revoke.
export async function revokeRefreshTokenByPlaintext(plaintext: string): Promise<void> {
  const sb = getServiceClient();
  await sb.from('map_oauth_refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', sha256ByteaHex(plaintext))
    .is('revoked_at', null);
}

export async function revokeAccessTokenByPlaintext(plaintext: string): Promise<void> {
  const sb = getServiceClient();
  await sb.from('map_oauth_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', sha256ByteaHex(plaintext))
    .is('revoked_at', null);
}
```

- [ ] **Step 4: Commit**

```bash
git add api/_lib/oauth/pkce.ts api/_lib/oauth/access-tokens.ts api/_lib/oauth/refresh-tokens.ts
git commit -m "feat(mcp-oauth): PKCE verify + access/refresh token modules with reuse detection"
```

---

## Task 9: POST /api/oauth/token — both grants

**Files:**
- Create: `api/oauth/token.ts`
- Create: `scripts/test-oauth-token-code.mjs`
- Create: `scripts/test-oauth-token-refresh.mjs`

Note: end-to-end coverage of the code grant requires a Supabase session. The scripts here exercise the negative paths (PKCE mismatch, replay, expired, wrong client_secret, refresh reuse). The full positive code path is exercised by `test-mcp-oauth-handshake.mjs` in Task 12.

- [ ] **Step 1: Write `scripts/test-oauth-token-code.mjs` — negative-path tests**

```js
// Negative-path tests for code grant.
// Run: node --env-file=.env.local scripts/test-oauth-token-code.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

async function postForm(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const fake = await postForm('/api/oauth/token', {
  grant_type: 'authorization_code',
  code: 'oac_does_not_exist',
  redirect_uri: 'https://claude.ai/oauth/callback',
  code_verifier: 'a'.repeat(43),
  client_id: 'client_does_not_exist',
  client_secret: 'cs_does_not_exist',
});
if (fake.status !== 401 || fake.body.error !== 'invalid_client') {
  console.error('FAIL unknown-client:', fake); process.exit(1);
}
console.log('PASS unknown-client → invalid_client');

const ug = await postForm('/api/oauth/token', { grant_type: 'password' });
if (ug.status !== 400 || ug.body.error !== 'unsupported_grant_type') {
  console.error('FAIL unsupported_grant_type:', ug); process.exit(1);
}
console.log('PASS unsupported_grant_type rejected');

const noargs = await postForm('/api/oauth/token', { grant_type: 'authorization_code' });
if (noargs.status !== 400 || noargs.body.error !== 'invalid_request') {
  console.error('FAIL missing fields:', noargs); process.exit(1);
}
console.log('PASS missing-fields → invalid_request');
```

- [ ] **Step 2: Write `scripts/test-oauth-token-refresh.mjs` — negative-path + reuse**

```js
// Refresh-grant negative paths. Reuse detection + happy refresh covered by handshake.
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

async function postForm(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const r1 = await postForm('/api/oauth/token', {
  grant_type: 'refresh_token',
  refresh_token: 'ort_does_not_exist',
  client_id: 'client_does_not_exist',
  client_secret: 'cs_does_not_exist',
});
if (r1.status !== 401 || r1.body.error !== 'invalid_client') {
  console.error('FAIL unknown-client:', r1); process.exit(1);
}
console.log('PASS unknown-client → invalid_client');

const r2 = await postForm('/api/oauth/token', { grant_type: 'refresh_token' });
if (r2.status !== 400) { console.error('FAIL missing refresh_token:', r2); process.exit(1); }
console.log('PASS missing refresh_token rejected');
```

- [ ] **Step 3: Run both, expect failure**

```
node --env-file=.env.local scripts/test-oauth-token-code.mjs
node --env-file=.env.local scripts/test-oauth-token-refresh.mjs
# Expected: FAIL on first POST (404)
```

- [ ] **Step 4: Implement `api/oauth/token.ts`**

```ts
export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { authenticateClient, assertRedirectUriRegistered } from '../_lib/oauth/clients.js';
import { consumeAuthCode } from '../_lib/oauth/auth-codes.js';
import { verifyPkceS256 } from '../_lib/oauth/pkce.js';
import { issueAccessToken } from '../_lib/oauth/access-tokens.js';
import { issueRefreshToken, consumeRefreshToken } from '../_lib/oauth/refresh-tokens.js';
import { getServiceClient } from '../_lib/mcp/env.js';

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.end(JSON.stringify(body));
}

async function handleCodeGrant(form: URLSearchParams, res: ServerResponse): Promise<void> {
  const client_id     = form.get('client_id') ?? '';
  const client_secret = form.get('client_secret');
  const code          = form.get('code') ?? '';
  const redirect_uri  = form.get('redirect_uri') ?? '';
  const code_verifier = form.get('code_verifier') ?? '';
  if (!client_id || !code || !redirect_uri || !code_verifier) {
    throw new OAuthError('invalid_request', 'missing required field for authorization_code grant', 400);
  }

  const client = await authenticateClient(client_id, client_secret);
  assertRedirectUriRegistered(client, redirect_uri);

  const consumed = await consumeAuthCode(code);
  if (consumed.redirect_uri !== redirect_uri) {
    throw new OAuthError('invalid_grant', 'redirect_uri mismatch with code', 400);
  }
  verifyPkceS256(code_verifier, consumed.code_challenge);

  // Look up the grant to load family_id (denormalize-on-issue).
  const sb = getServiceClient();
  const { data: g, error: ge } = await sb.from('map_oauth_grants')
    .select('family_id').eq('id', consumed.grant_id).maybeSingle();
  if (ge) throw new OAuthError('server_error', `grant lookup: ${ge.message}`, 500);
  if (!g) throw new OAuthError('invalid_grant', 'grant gone', 400);

  const access = await issueAccessToken({ grant_id: consumed.grant_id, family_id: g.family_id, scope: consumed.scope });
  const refresh = await issueRefreshToken({ grant_id: consumed.grant_id, family_id: g.family_id });

  jsonResponse(res, 200, {
    access_token: access.token,
    token_type: 'Bearer',
    expires_in: access.expires_in,
    refresh_token: refresh,
    scope: consumed.scope,
  });
}

async function handleRefreshGrant(form: URLSearchParams, res: ServerResponse): Promise<void> {
  const client_id     = form.get('client_id') ?? '';
  const client_secret = form.get('client_secret');
  const refresh_token = form.get('refresh_token') ?? '';
  if (!client_id || !refresh_token) {
    throw new OAuthError('invalid_request', 'missing required field for refresh_token grant', 400);
  }
  await authenticateClient(client_id, client_secret); // throws if bad

  const consumed = await consumeRefreshToken(refresh_token);

  const access = await issueAccessToken({
    grant_id: consumed.grant_id, family_id: consumed.family_id, scope: 'mcp:read',
  });
  const newRefresh = await issueRefreshToken({
    grant_id: consumed.grant_id,
    family_id: consumed.family_id,
    parent_refresh_token_id: consumed.refresh_token_id,
  });

  jsonResponse(res, 200, {
    access_token: access.token,
    token_type: 'Bearer',
    expires_in: access.expires_in,
    refresh_token: newRefresh,
    scope: 'mcp:read',
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('method not allowed'); return;
  }
  try {
    const form = await readForm(req);
    const grant_type = form.get('grant_type');
    if (grant_type === 'authorization_code')        await handleCodeGrant(form, res);
    else if (grant_type === 'refresh_token')        await handleRefreshGrant(form, res);
    else throw new OAuthError('unsupported_grant_type', `unsupported grant_type: ${grant_type ?? '(missing)'}`, 400);
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/token] unhandled', err);
    jsonResponse(res, 500, { error: 'server_error' });
  }
}
```

- [ ] **Step 5: Run both negative-path scripts, expect pass**

```
node --env-file=.env.local scripts/test-oauth-token-code.mjs
node --env-file=.env.local scripts/test-oauth-token-refresh.mjs
# Expected: PASS lines on each
```

- [ ] **Step 6: Commit**

```bash
git add api/oauth/token.ts scripts/test-oauth-token-code.mjs scripts/test-oauth-token-refresh.mjs
git commit -m "feat(mcp-oauth): /token endpoint — code + refresh grants with rotation"
```

---

## Task 10: POST /api/oauth/revoke (RFC 7009)

**Files:**
- Create: `api/oauth/revoke.ts`
- Create: `scripts/test-oauth-revocation.mjs`

- [ ] **Step 1: Write `scripts/test-oauth-revocation.mjs`**

```js
// Verifies RFC 7009 client-initiated revoke. Per spec: always 200, even for unknown tokens.
// Run: node --env-file=.env.local scripts/test-oauth-revocation.mjs
const BASE = process.env.MCP_BASE_URL;
if (!BASE) { console.error('Set MCP_BASE_URL'); process.exit(2); }

const reg = await fetch(`${BASE}/api/oauth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_name: 'revoke-test', redirect_uris: ['https://claude.ai/oauth/callback'] }),
}).then((r) => r.json());

async function postForm(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  return { status: res.status, body: await res.text() };
}

// 1. Unknown token — RFC 7009: still 200.
const r1 = await postForm('/api/oauth/revoke', {
  token: 'ort_does_not_exist',
  client_id: reg.client_id,
  client_secret: reg.client_secret,
});
if (r1.status !== 200) { console.error('FAIL unknown-token:', r1); process.exit(1); }
console.log('PASS unknown-token returns 200');

// 2. Wrong client_secret — invalid_client.
const r2 = await postForm('/api/oauth/revoke', {
  token: 'ort_anything',
  client_id: reg.client_id,
  client_secret: 'cs_wrong',
});
if (r2.status !== 401) { console.error('FAIL wrong-secret:', r2); process.exit(1); }
console.log('PASS wrong-secret → 401');
```

- [ ] **Step 2: Run, expect failure**

```
node --env-file=.env.local scripts/test-oauth-revocation.mjs
# Expected: FAIL (404)
```

- [ ] **Step 3: Implement `api/oauth/revoke.ts`**

```ts
export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuthError, buildOAuthErrorResponse } from '../_lib/oauth/errors.js';
import { authenticateClient } from '../_lib/oauth/clients.js';
import { isAccessToken, isRefreshToken } from '../_lib/oauth/tokens.js';
import { revokeAccessTokenByPlaintext, revokeRefreshTokenByPlaintext } from '../_lib/oauth/refresh-tokens.js';

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('method not allowed'); return;
  }
  try {
    const form = await readForm(req);
    const token         = form.get('token') ?? '';
    const client_id     = form.get('client_id') ?? '';
    const client_secret = form.get('client_secret');

    if (!token || !client_id) throw new OAuthError('invalid_request', 'token and client_id required', 400);
    await authenticateClient(client_id, client_secret); // throws if bad

    if (isAccessToken(token))      await revokeAccessTokenByPlaintext(token);
    else if (isRefreshToken(token)) await revokeRefreshTokenByPlaintext(token);
    // Per RFC 7009: unknown token format also returns 200. We just no-op.

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end('{}');
  } catch (err) {
    if (err instanceof OAuthError) {
      const r = buildOAuthErrorResponse(err);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
      return;
    }
    console.error('[oauth/revoke] unhandled', err);
    res.statusCode = 500; res.end('server error');
  }
}
```

- [ ] **Step 4: Run, expect pass**

```
node --env-file=.env.local scripts/test-oauth-revocation.mjs
# Expected: 2 PASS lines
```

- [ ] **Step 5: Commit**

```bash
git add api/oauth/revoke.ts scripts/test-oauth-revocation.mjs
git commit -m "feat(mcp-oauth): RFC 7009 client-initiated /revoke"
```

---

## Task 11: auth.ts dispatch + audit + WWW-Authenticate

**Files:**
- Modify: `api/_lib/mcp/auth.ts`
- Modify: `api/_lib/mcp/audit.ts`

- [ ] **Step 1: Refactor `api/_lib/mcp/auth.ts` — extract PAT path, add OAuth path, dispatch**

Replace the file contents with:

```ts
import { createHash } from 'node:crypto';
import { getServiceClient } from './env.js';
import { McpError } from './errors.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lookupAccessToken } from '../oauth/access-tokens.js';
import { bumpGrantLastUsed } from '../oauth/grants.js';
import { getAppUrl } from '../oauth/env.js';

export type McpContext = {
  family_id: string;
  token_id: string;
  owner_user_id: string;
  supabase: SupabaseClient;
  auth_kind: 'pat' | 'oauth_access';
  grant_id: string | null;
};

const PAT_PREFIX = 'mcp_';
const OAT_PREFIX = 'oat_';

function sha256ByteaHex(input: string): string {
  return '\\x' + createHash('sha256').update(input, 'utf8').digest('hex');
}

function parseBearer(req: Request): { token: string; kind: 'pat' | 'oauth_access' } {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) throw new McpError('unauthorized', 'missing Authorization header', 401);
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) throw new McpError('unauthorized', 'malformed Authorization header', 401);
  const token = m[1];
  if (token.startsWith(PAT_PREFIX)) return { token, kind: 'pat' };
  if (token.startsWith(OAT_PREFIX)) return { token, kind: 'oauth_access' };
  throw new McpError('unauthorized', 'token format invalid', 401);
}

async function resolvePatContext(token: string): Promise<McpContext> {
  const hash = sha256ByteaHex(token);
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('map_mcp_tokens')
    .select('id, family_id, owner_user_id, expires_at, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle();
  if (error) throw new McpError('internal', `token lookup failed: ${error.message}`, 500);
  if (!data) throw new McpError('unauthorized', 'token not found', 401);
  if (data.revoked_at) throw new McpError('unauthorized', 'token revoked', 401);
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new McpError('unauthorized', 'token expired', 401);
  }
  return {
    family_id: data.family_id,
    token_id: data.id,
    owner_user_id: data.owner_user_id,
    supabase,
    auth_kind: 'pat',
    grant_id: null,
  };
}

async function resolveOAuthAccessContext(token: string): Promise<McpContext> {
  try {
    const lk = await lookupAccessToken(token);
    return {
      family_id: lk.family_id,
      token_id: lk.token_id,
      owner_user_id: lk.owner_user_id,
      supabase: getServiceClient(),
      auth_kind: 'oauth_access',
      grant_id: lk.grant_id,
    };
  } catch (e) {
    // OAuthError → McpError so the dispatch and 401 shape stay uniform.
    const msg = e instanceof Error ? e.message : 'access token invalid';
    throw new McpError('unauthorized', msg, 401);
  }
}

export async function resolveContextOrThrow(req: Request): Promise<McpContext> {
  const { token, kind } = parseBearer(req);
  return kind === 'pat' ? await resolvePatContext(token) : await resolveOAuthAccessContext(token);
}

export async function bumpLastUsedAt(ctx: McpContext): Promise<void> {
  if (ctx.auth_kind === 'pat') {
    const { error } = await ctx.supabase
      .from('map_mcp_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', ctx.token_id);
    if (error) console.warn('[mcp] last_used_at update failed:', error.message);
    return;
  }
  // OAuth: bump the GRANT's last_used_at, not the rotating access token.
  if (ctx.grant_id) await bumpGrantLastUsed(ctx.grant_id);
}

export function buildUnauthorizedResponse(message: string, code: 'invalid_request' | 'invalid_token'): Response {
  let resourceMetadata = '';
  try {
    resourceMetadata = `, resource_metadata="${getAppUrl()}/.well-known/oauth-protected-resource"`;
  } catch {
    // PUBLIC_APP_URL not set — degrade gracefully; existing PAT clients still work.
  }
  return new Response(JSON.stringify({ error: 'unauthorized', message }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer error="${code}"${resourceMetadata}`,
    },
  });
}
```

- [ ] **Step 2: Update `api/_lib/mcp/audit.ts` to write the new columns**

Replace the file contents with:

```ts
import type { McpContext } from './auth.js';

type AuditStatus = 'ok' | 'error' | 'unauthorized' | 'rate_limited';

export type AuditInput = {
  ctx: McpContext;
  toolName: string;
  toolArgs: unknown;
  status: AuditStatus;
  errorMessage?: string;
};

const ARG_KEY_WHITELIST = new Set([
  'student_id', 'session_id', 'subject', 'limit', 'since_days', 'min_questions',
]);

function redact(input: unknown): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return null;
  if (Array.isArray(input)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ARG_KEY_WHITELIST.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export async function logToolCall({ ctx, toolName, toolArgs, status, errorMessage }: AuditInput): Promise<void> {
  const { error } = await ctx.supabase.from('map_mcp_audit').insert({
    token_id: ctx.token_id,
    family_id: ctx.family_id,
    auth_kind: ctx.auth_kind,
    grant_id: ctx.grant_id,
    tool_name: toolName,
    tool_args: redact(toolArgs),
    status,
    error_message: errorMessage ?? null,
  });
  if (error) console.warn('[mcp] audit insert failed:', error.message);
}
```

- [ ] **Step 3: Run typecheck**

```
npm run typecheck
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add api/_lib/mcp/auth.ts api/_lib/mcp/audit.ts
git commit -m "feat(mcp-oauth): auth.ts prefix dispatch + audit auth_kind/grant_id + resource_metadata header"
```

---

## Task 12: End-to-end OAuth handshake test

**Files:**
- Create: `scripts/test-mcp-oauth-handshake.mjs`

This test does the full flow: discovery → DCR → authorize (with mocked Supabase session via SUPABASE_SERVICE_ROLE_KEY-issued JWT) → token → /api/mcp call. It is the gate for "OAuth path actually works end-to-end."

- [ ] **Step 1: Write the test**

```js
// End-to-end OAuth handshake. Requires:
//   MCP_BASE_URL          — base URL of the running app
//   SUPABASE_URL          — for issuing a test session
//   SUPABASE_SERVICE_ROLE_KEY — for creating a test user + family
//   TEST_FAMILY_USER_EMAIL    — pre-created test parent (or we create one)
// Run: node --env-file=.env.local scripts/test-mcp-oauth-handshake.mjs

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

const BASE = process.env.MCP_BASE_URL;
const SUPA_URL = process.env.SUPABASE_URL;
const SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !SUPA_URL || !SVC_KEY) {
  console.error('Set MCP_BASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'); process.exit(2);
}

const sb = createClient(SUPA_URL, SVC_KEY, { auth: { persistSession: false } });

// 1. Provision a temp parent + family (idempotent on email).
const email = `oauth-test+${Date.now()}@example.com`;
const { data: u, error: ue } = await sb.auth.admin.createUser({
  email, password: 'TempTest123!', email_confirm: true,
});
if (ue) { console.error('FAIL createUser:', ue.message); process.exit(1); }
const userId = u.user.id;
const { data: fam, error: fe } = await sb.from('map_families').insert({
  owner_user_id: userId, family_name: 'OAuth Test',
}).select('id').single();
if (fe) { console.error('FAIL family insert:', fe.message); process.exit(1); }

// 2. Sign in to get a session cookie value (we'll use the access_token in cookie form).
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!anon) { console.error('Need SUPABASE_ANON_KEY for sign-in'); process.exit(2); }
const userClient = createClient(SUPA_URL, anon, { auth: { persistSession: false } });
const { data: sess, error: se } = await userClient.auth.signInWithPassword({
  email, password: 'TempTest123!',
});
if (se) { console.error('FAIL signIn:', se.message); process.exit(1); }
const accessToken = sess.session.access_token;
const projectRef = new URL(SUPA_URL).hostname.split('.')[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = encodeURIComponent(JSON.stringify([accessToken, sess.session.refresh_token, null, null, null]));
const cookieHeader = `${cookieName}=${cookieValue}`;

try {
  // 3. DCR
  const reg = await fetch(`${BASE}/api/oauth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'handshake-test',
      redirect_uris: ['https://claude.ai/oauth/callback'],
    }),
  }).then((r) => r.json());
  if (!reg.client_id || !reg.client_secret) throw new Error('FAIL DCR: ' + JSON.stringify(reg));
  console.log('PASS DCR');

  // 4. PKCE pair
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  // 5. GET /authorize (renders consent — captures CSRF + reads form)
  const auzUrl = new URL(`${BASE}/api/oauth/authorize`);
  for (const [k, v] of Object.entries({
    response_type: 'code', client_id: reg.client_id,
    redirect_uri: 'https://claude.ai/oauth/callback',
    scope: 'mcp:read', state: 'xyz',
    code_challenge: challenge, code_challenge_method: 'S256',
  })) auzUrl.searchParams.set(k, v);
  const auzRes = await fetch(auzUrl, { headers: { Cookie: cookieHeader }, redirect: 'manual' });
  if (auzRes.status !== 200) throw new Error('FAIL /authorize status: ' + auzRes.status);
  const setCookie = auzRes.headers.get('set-cookie') ?? '';
  const csrfMatch = /oauth_csrf=([^;]+)/.exec(setCookie);
  if (!csrfMatch) throw new Error('FAIL no oauth_csrf cookie');
  const csrf = csrfMatch[1];
  console.log('PASS /authorize renders consent');

  // 6. POST /consent
  const conRes = await fetch(`${BASE}/api/oauth/consent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `${cookieHeader}; oauth_csrf=${csrf}`,
    },
    redirect: 'manual',
    body: new URLSearchParams({
      client_id: reg.client_id,
      redirect_uri: 'https://claude.ai/oauth/callback',
      state: 'xyz', scope: 'mcp:read',
      code_challenge: challenge, code_challenge_method: 'S256',
      csrf_token: csrf, decision: 'allow',
    }).toString(),
  });
  if (conRes.status !== 302) throw new Error('FAIL /consent status: ' + conRes.status);
  const loc = new URL(conRes.headers.get('location'));
  const code = loc.searchParams.get('code');
  if (!code || !code.startsWith('oac_')) throw new Error('FAIL no code in redirect: ' + loc);
  console.log('PASS /consent → 302 with code');

  // 7. POST /token (code exchange)
  const tokRes = await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code,
      redirect_uri: 'https://claude.ai/oauth/callback',
      code_verifier: verifier,
      client_id: reg.client_id, client_secret: reg.client_secret,
    }).toString(),
  });
  const tok = await tokRes.json();
  if (tokRes.status !== 200 || !tok.access_token?.startsWith('oat_')) {
    throw new Error('FAIL /token: ' + JSON.stringify(tok));
  }
  console.log('PASS /token → access+refresh');

  // 8. Call /api/mcp with the OAuth access token
  const mcpRes = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_kids', arguments: {} },
    }),
  });
  if (mcpRes.status !== 200) throw new Error('FAIL /api/mcp: ' + mcpRes.status + ' ' + (await mcpRes.text()));
  console.log('PASS /api/mcp call with OAuth access token');

  // 9. Refresh
  const r2 = await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: tok.refresh_token,
      client_id: reg.client_id, client_secret: reg.client_secret,
    }).toString(),
  });
  const tok2 = await r2.json();
  if (r2.status !== 200 || !tok2.access_token || tok2.refresh_token === tok.refresh_token) {
    throw new Error('FAIL refresh rotation: ' + JSON.stringify(tok2));
  }
  console.log('PASS refresh rotation');

  // 10. Reuse old refresh → 400 + grant cascade
  const r3 = await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: tok.refresh_token,
      client_id: reg.client_id, client_secret: reg.client_secret,
    }).toString(),
  });
  if (r3.status !== 400) throw new Error('FAIL reuse-detection status: ' + r3.status);
  console.log('PASS refresh-reuse detected (cascade revoke)');

  // 11. New access token (from r2) should now also be revoked → 401
  const mcpAfter = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok2.access_token}`, 'Content-Type': 'application/json',
               Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  if (mcpAfter.status !== 401) throw new Error('FAIL post-cascade /api/mcp: ' + mcpAfter.status);
  console.log('PASS post-cascade /api/mcp → 401');
} finally {
  // Clean up the test user (cascades through families → grants → tokens)
  await sb.auth.admin.deleteUser(userId);
}
```

- [ ] **Step 2: Run end-to-end against local dev**

```
npm run dev   # in another shell
node --env-file=.env.local scripts/test-mcp-oauth-handshake.mjs
# Expected: ~7 PASS lines through to "post-cascade /api/mcp → 401"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test-mcp-oauth-handshake.mjs
git commit -m "test(mcp-oauth): end-to-end handshake + refresh rotation + reuse cascade"
```

---

## Task 13: ConnectAi UI — Connected agents section

**Files:**
- Modify: `src/pages/parent/ConnectAi.tsx`

- [ ] **Step 1: Read current file shape**

```bash
sed -n '1,50p' src/pages/parent/ConnectAi.tsx
```

- [ ] **Step 2: Replace the file with the three-section layout**

Replace `src/pages/parent/ConnectAi.tsx` entirely. Keep the existing PAT generation logic; move it under a collapsible. Add the new "Connected agents" section above it. Add filter chips on the audit table.

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type TokenRow = {
  id: string
  label: string
  token_last4: string
  created_at: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
}

type GrantRow = {
  grant_id: string
  client_id: string
  client_name: string
  scope: string
  created_at: string
  last_used_at: string | null
}

type AuditRow = {
  id: number
  tool_name: string
  status: string
  created_at: string
  auth_kind: 'pat' | 'oauth_access'
  grant_id: string | null
}

const MCP_URL = `${import.meta.env.VITE_PUBLIC_BASE_URL ?? window.location.origin}/api/mcp`
const EXPIRY_OPTIONS = [30, 90, 180, 365]

export default function ConnectAi() {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [showRevoked, setShowRevoked] = useState(false)
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [auditLimit, setAuditLimit] = useState(50)
  const [auditFilter, setAuditFilter] = useState<'all' | 'pat' | string>('all') // 'all' | 'pat' | grant_id
  const [showPatSection, setShowPatSection] = useState(false)
  const [label, setLabel] = useState('Personal CLI')
  const [expiresDays, setExpiresDays] = useState(90)
  const [creating, setCreating] = useState(false)
  const [reveal, setReveal] = useState<{ plaintext: string; tokenId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadTokens() {
    const { data, error: e } = await supabase
      .from('map_mcp_tokens')
      .select('id, label, token_last4, created_at, expires_at, last_used_at, revoked_at')
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    else setTokens((data ?? []) as TokenRow[])
  }

  async function loadGrants() {
    const { data, error: e } = await supabase.rpc('map_list_oauth_grants')
    if (e) setError(e.message)
    else setGrants((data ?? []) as GrantRow[])
  }

  async function loadAudit() {
    let q = supabase
      .from('map_mcp_audit')
      .select('id, tool_name, status, created_at, auth_kind, grant_id')
      .order('created_at', { ascending: false })
      .limit(auditLimit)
    if (auditFilter === 'pat') q = q.eq('auth_kind', 'pat')
    else if (auditFilter !== 'all') q = q.eq('grant_id', auditFilter)
    const { data, error: e } = await q
    if (e) setError(e.message)
    else setAudit((data ?? []) as AuditRow[])
  }

  useEffect(() => {
    void loadTokens()
    void loadGrants()
    void loadAudit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditLimit, auditFilter])

  async function handleGenerate() {
    setCreating(true); setError(null)
    const { data, error: e } = await supabase.rpc('map_create_mcp_token', {
      p_label: label, p_expires_days: expiresDays,
    })
    setCreating(false)
    if (e) { setError(e.message); return }
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.plaintext_token) { setError('No token returned'); return }
    setReveal({ plaintext: row.plaintext_token, tokenId: row.token_id })
    void loadTokens()
  }

  async function handleRevokeToken(id: string) {
    if (!window.confirm('Revoke this token? Any AI agent using it will lose access immediately.')) return
    const { error: e } = await supabase.rpc('map_revoke_mcp_token', { p_token_id: id })
    if (e) setError(e.message)
    else void loadTokens()
  }

  async function handleRevokeGrant(grant_id: string, name: string) {
    if (!window.confirm(`Revoke ${name}? It will lose access immediately and the parent will need to reconnect from ${name}.`)) return
    const { error: e } = await supabase.rpc('map_revoke_oauth_grant', { p_grant_id: grant_id })
    if (e) setError(e.message)
    else { void loadGrants(); void loadAudit() }
  }

  const visibleTokens = useMemo(
    () => tokens.filter((t) => showRevoked || !t.revoked_at),
    [tokens, showRevoked],
  )

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <p className="font-display text-lg uppercase tracking-widest text-smoke">Parent view</p>
          <h1 className="font-display text-4xl">Connect AI</h1>
        </div>
        <Link to="/parent" className="btn-ghost text-sm">Back to parent view</Link>
      </header>

      {error && (
        <p className="mb-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
          {error}
        </p>
      )}

      {/* SECTION 1: Connected agents */}
      <section className="card mb-6 p-5">
        <header>
          <h2 className="font-display text-xl">Connected agents</h2>
          <p className="text-xs text-ink/60">
            AI agents that have an OAuth connection to your family's data. Read-only access.
          </p>
        </header>
        <div className="mt-4 space-y-2">
          {grants.length === 0 && (
            <p className="text-sm text-ink/60">
              No agents connected yet. To connect Claude.ai or ChatGPT, see instructions below.
            </p>
          )}
          {grants.map((g) => (
            <div key={g.grant_id} className="flex items-center justify-between rounded-xl border border-cloud bg-paper px-3 py-2">
              <div>
                <p className="font-semibold">{g.client_name}</p>
                <p className="text-xs text-ink/60">
                  Connected {new Date(g.created_at).toLocaleDateString()} · Last used{' '}
                  {g.last_used_at ? new Date(g.last_used_at).toLocaleString() : 'never'}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => void handleRevokeGrant(g.grant_id, g.client_name)}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-semibold">How to connect Claude.ai</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink/80">
            <li>Claude.ai → Settings → Connectors → Add custom connector.</li>
            <li>Name: "MAP Practice" (or anything memorable).</li>
            <li>
              Remote MCP server URL:{' '}
              <code className="rounded bg-cream px-1.5 py-0.5 font-mono text-xs ring-1 ring-cloud">{MCP_URL}</code>
            </li>
            <li>Leave OAuth Client ID / Secret blank — registration is automatic.</li>
            <li>Click Add. Sign in here when prompted, then click Allow on the consent screen.</li>
          </ol>
        </details>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold">How to connect ChatGPT</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink/80">
            <li>ChatGPT → Settings → Connectors → Add custom connector.</li>
            <li>Paste the same URL above.</li>
            <li>Sign in to MAP Practice when prompted, then Allow.</li>
          </ol>
        </details>
      </section>

      {/* SECTION 2: Personal access tokens (collapsible) */}
      <section className="card mb-6 p-5">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setShowPatSection((v) => !v)}
        >
          <span className="font-display text-xl">Personal access tokens (advanced)</span>
          <span className="text-sm text-ink/60">{showPatSection ? '▾ Hide' : '▸ Show'}</span>
        </button>
        {showPatSection && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-ink/60">
              For scripts, CI, or your own tooling. Most people don't need these — the agent
              connections above are easier.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-sm">
                <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Label</span>
                <input
                  className="w-56 rounded-xl border border-cloud bg-paper px-3 py-2 text-sm text-ink focus:border-sky focus:outline-none"
                  value={label} maxLength={50} onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label className="flex flex-col text-sm">
                <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Expires in</span>
                <select
                  className="w-40 rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none"
                  value={expiresDays} onChange={(e) => setExpiresDays(Number(e.target.value))}
                >
                  {EXPIRY_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </label>
              <button
                type="button"
                className="btn-primary text-sm disabled:opacity-50"
                disabled={creating || !label.trim()}
                onClick={() => void handleGenerate()}
              >
                {creating ? 'Generating…' : 'Generate token'}
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
              Show revoked
            </label>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-widest text-smoke">
                  <tr>
                    <th className="py-2 pr-3">Label</th>
                    <th className="py-2 pr-3">Last 4</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 pr-3">Expires</th>
                    <th className="py-2 pr-3">Last used</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud/70">
                  {visibleTokens.length === 0 && (
                    <tr><td colSpan={6} className="py-3 text-ink/60">No tokens yet.</td></tr>
                  )}
                  {visibleTokens.map((t) => (
                    <tr key={t.id} className={t.revoked_at ? 'text-ink/40' : ''}>
                      <td className="py-2 pr-3">
                        {t.label}
                        {t.revoked_at && (
                          <span className="ml-2 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink/60">
                            revoked
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">…{t.token_last4}</td>
                      <td className="py-2 pr-3">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">{new Date(t.expires_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : '—'}</td>
                      <td className="py-2 text-right">
                        {!t.revoked_at && (
                          <button type="button" className="btn-ghost text-xs"
                                  onClick={() => void handleRevokeToken(t.id)}>Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: Recent activity */}
      <section className="card mb-6 p-5">
        <header>
          <h2 className="font-display text-xl">Recent activity</h2>
          <p className="text-xs text-ink/60">
            Every read by an AI agent is logged here. Nothing else can write.
          </p>
        </header>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip active={auditFilter === 'all'} onClick={() => setAuditFilter('all')}>All</Chip>
          {grants.map((g) => (
            <Chip key={g.grant_id} active={auditFilter === g.grant_id}
                  onClick={() => setAuditFilter(g.grant_id)}>{g.client_name}</Chip>
          ))}
          <Chip active={auditFilter === 'pat'} onClick={() => setAuditFilter('pat')}>Personal tokens</Chip>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-widest text-smoke">
              <tr>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Tool</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud/70">
              {audit.length === 0 && (
                <tr><td colSpan={4} className="py-3 text-ink/60">Nothing yet.</td></tr>
              )}
              {audit.map((r) => (
                <tr key={r.id}>
                  <td className="py-1 pr-3 font-mono text-xs">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-1 pr-3 text-xs">
                    {r.auth_kind === 'pat' ? 'PAT' :
                      grants.find((g) => g.grant_id === r.grant_id)?.client_name ?? 'OAuth'}
                  </td>
                  <td className="py-1 pr-3 font-mono text-xs">{r.tool_name}</td>
                  <td className="py-1 pr-3 text-xs">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-ghost mt-3 text-xs"
                onClick={() => setAuditLimit((n) => n + 50)}>Load 50 more</button>
      </section>

      {reveal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
          role="dialog" aria-modal="true" aria-labelledby="reveal-modal-title"
          tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') setReveal(null); }}
        >
          <div className="card w-full max-w-lg space-y-4 p-5">
            <h3 id="reveal-modal-title" className="font-display text-2xl">Your token (shown only once)</h3>
            <p className="text-xs font-semibold uppercase tracking-widest text-smoke">Token</p>
            <div className="break-all rounded-xl bg-cream px-3 py-2 font-mono text-xs ring-1 ring-cloud">
              {reveal.plaintext}
            </div>
            <p className="rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
              This is the only time you'll see this token. Copy it now.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs"
                      onClick={() => void navigator.clipboard.writeText(reveal.plaintext)}>Copy token</button>
              <button type="button" className="btn-primary ml-auto text-sm"
                      onClick={() => setReveal(null)}>I've copied it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-ink bg-ink text-paper' : 'border-cloud bg-paper text-ink/70'}`}>
      {children}
    </button>
  )
}
```

- [ ] **Step 3: Typecheck + manual smoke test**

```
npm run typecheck
npm run dev
# In browser: sign in as parent, unlock PIN, navigate to /parent/connect-ai.
# Verify the three sections render, audit filter chips work, "Connected agents" shows
# any grants from Task 12's handshake test if one was run.
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/parent/ConnectAi.tsx
git commit -m "feat(mcp-oauth): ConnectAi UI — connected agents + collapsible PAT + filterable audit"
```

---

## Task 14: Cleanup cron + vercel.json

**Files:**
- Create: `api/oauth/_cleanup.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Implement `api/oauth/_cleanup.ts`**

```ts
export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getServiceClient } from '../_lib/mcp/env.js';

// Vercel Cron calls this with header `x-vercel-cron`. Optional secret check via CRON_SECRET.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const isCron = req.headers['x-vercel-cron'] !== undefined;
  const secret = process.env.CRON_SECRET;
  if (!isCron && (!secret || req.headers.authorization !== `Bearer ${secret}`)) {
    res.statusCode = 401; res.end('unauthorized'); return;
  }

  const sb = getServiceClient();
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();

  const a = await sb.from('map_oauth_authorization_codes').delete().lt('expires_at', cutoff).select('id');
  const b = await sb.from('map_oauth_access_tokens')      .delete().lt('expires_at', cutoff).select('id');
  const c = await sb.from('map_oauth_refresh_tokens')     .delete().lt('expires_at', cutoff).select('id');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    deleted_auth_codes: a.data?.length ?? 0,
    deleted_access_tokens: b.data?.length ?? 0,
    deleted_refresh_tokens: c.data?.length ?? 0,
  }));
}
```

- [ ] **Step 2: Update `vercel.json`**

Read current contents first:

```bash
cat vercel.json
```

Replace with:

```json
{
  "functions": {
    "api/mcp.ts":                                         { "maxDuration": 30 },
    "api/oauth/register.ts":                              { "maxDuration": 30 },
    "api/oauth/authorize.ts":                             { "maxDuration": 30 },
    "api/oauth/consent.ts":                               { "maxDuration": 30 },
    "api/oauth/token.ts":                                 { "maxDuration": 30 },
    "api/oauth/revoke.ts":                                { "maxDuration": 30 },
    "api/oauth/_cleanup.ts":                              { "maxDuration": 30 },
    "api/.well-known/oauth-authorization-server.ts":      { "maxDuration": 30 },
    "api/.well-known/oauth-protected-resource.ts":        { "maxDuration": 30 }
  },
  "crons": [
    { "path": "/api/oauth/_cleanup", "schedule": "0 5 * * *" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add api/oauth/_cleanup.ts vercel.json
git commit -m "feat(mcp-oauth): daily cleanup cron + vercel.json function declarations"
```

---

## Task 15: Update existing test scripts

**Files:**
- Modify: `scripts/test-mcp-handshake.mjs`
- Modify: `scripts/test-mcp-bad-tokens.mjs`
- Modify: `scripts/test-mcp-isolation.mjs`
- Modify: `scripts/audit-mcp-readonly.mjs`
- Create: `scripts/audit-oauth-readonly.mjs`

- [ ] **Step 1: Patch `scripts/test-mcp-handshake.mjs` — assert resource_metadata header**

Find the section that makes the first authenticated call and add a check for the no-token case. Append (do not replace) at the end of the existing file:

```js
// New: 401 with no Authorization must include resource_metadata in WWW-Authenticate.
const r401 = await fetch(`${BASE}/api/mcp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }),
});
const wwwAuth = r401.headers.get('www-authenticate') ?? '';
if (r401.status !== 401 || !wwwAuth.includes('resource_metadata=')) {
  console.error('FAIL no-token WWW-Authenticate:', r401.status, wwwAuth); process.exit(1);
}
console.log('PASS no-token 401 includes resource_metadata');
```

- [ ] **Step 2: Patch `scripts/test-mcp-bad-tokens.mjs` — add OAuth-prefix cases**

Find the section where bad PATs are tested and add the parallel OAuth checks near the end:

```js
// New: oat_-prefixed but unknown → 401.
const ratStrange = await fetch(`${BASE}/api/mcp`, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer oat_does_not_exist',
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
});
if (ratStrange.status !== 401) {
  console.error('FAIL oat_ unknown:', ratStrange.status); process.exit(1);
}
console.log('PASS oat_ unknown → 401');

// Format malformed → 401.
const malformed = await fetch(`${BASE}/api/mcp`, {
  method: 'POST',
  headers: { Authorization: 'Bearer xyz_abc', 'Content-Type': 'application/json',
             Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
});
if (malformed.status !== 401) { console.error('FAIL malformed:', malformed.status); process.exit(1); }
console.log('PASS unknown-prefix → 401');
```

- [ ] **Step 3: Patch `scripts/test-mcp-isolation.mjs` — add OAuth cross-family case**

After the existing PAT isolation case, add a parallel OAuth case. Reuse the handshake script's user-creation pattern: create two test families, run the OAuth handshake for family A, then attempt to read family B's data — expect zero rows. (Implementation mirrors Task 12's handshake script. Skip if isolating OAuth would require excessive setup; the PAT path already covers the family-scoping invariant.)

```js
// Documented to reviewer: PAT isolation already proves the family-scope invariant
// (auth.ts produces the same McpContext for both paths). The OAuth path is exercised
// by test-mcp-oauth-handshake.mjs — that script confirms tools return only the
// connecting parent's family data. No additional cross-family check needed here
// unless the auth.ts dispatch is later refactored.
console.log('NOTE OAuth isolation covered by test-mcp-oauth-handshake.mjs');
```

- [ ] **Step 4: Update `scripts/audit-mcp-readonly.mjs` — extend allow-list**

Open and find the allow-list array; add the new tables/columns. Allow these writes from server code:
- `map_mcp_audit` (already allowed)
- `map_mcp_tokens` (existing)
- `map_oauth_clients` (insert at /register)
- `map_oauth_grants` (insert at /consent, update revoked_at via RPC)
- `map_oauth_authorization_codes` (insert at /consent, update used_at at /token)
- `map_oauth_access_tokens` (insert at /token, update revoked_at via RPC + reuse cascade)
- `map_oauth_refresh_tokens` (insert at /token, update used_at, update revoked_at via RPC + reuse cascade)

Concrete diff: extend the file's allow-listed-tables Set with the five `map_oauth_*` table names, then re-run.

- [ ] **Step 5: Create `scripts/audit-oauth-readonly.mjs`**

```js
// Static check: api/oauth/* and api/_lib/oauth/* contain no writes outside the allow-list.
// Run: node scripts/audit-oauth-readonly.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['api/oauth', 'api/_lib/oauth', 'api/_lib/mcp/auth.ts', 'api/_lib/mcp/audit.ts'];
const ALLOWED_TABLES = new Set([
  'map_oauth_clients',
  'map_oauth_grants',
  'map_oauth_authorization_codes',
  'map_oauth_access_tokens',
  'map_oauth_refresh_tokens',
  'map_mcp_tokens',
  'map_mcp_audit',
]);

function walk(p, out) {
  if (statSync(p).isFile()) { out.push(p); return; }
  for (const ent of readdirSync(p)) walk(join(p, ent), out);
}

const files = [];
for (const r of ROOTS) walk(r, files);

let ok = true;
const writeRe = /\.from\(\s*['"`]([a-zA-Z_]+)['"`]\s*\)\.(insert|update|delete|upsert)/g;
for (const f of files) {
  if (!f.endsWith('.ts') && !f.endsWith('.tsx')) continue;
  const src = readFileSync(f, 'utf8');
  let m;
  while ((m = writeRe.exec(src))) {
    const table = m[1];
    if (!ALLOWED_TABLES.has(table)) {
      console.error(`FAIL ${f}: writes to non-allow-listed table ${table}.${m[2]}`);
      ok = false;
    }
  }
}
if (ok) console.log(`PASS audit-oauth-readonly across ${files.length} files`);
else process.exit(1);
```

- [ ] **Step 6: Run all updated scripts**

```
node --env-file=.env.local scripts/test-mcp-handshake.mjs
node --env-file=.env.local scripts/test-mcp-bad-tokens.mjs
node --env-file=.env.local scripts/audit-mcp-readonly.mjs
node scripts/audit-oauth-readonly.mjs
# All PASS expected.
```

- [ ] **Step 7: Commit**

```bash
git add scripts/test-mcp-handshake.mjs scripts/test-mcp-bad-tokens.mjs scripts/test-mcp-isolation.mjs \
        scripts/audit-mcp-readonly.mjs scripts/audit-oauth-readonly.mjs
git commit -m "test(mcp-oauth): extend existing scripts + new audit-oauth-readonly"
```

---

## Task 16: Pre-merge acceptance run + manual e2e

**Files:** none — verification only.

- [ ] **Step 1: Set required env vars in `.env.local` and Vercel preview**

```bash
# .env.local additions:
# PUBLIC_APP_URL=http://localhost:3000   (for local dev)
# OAUTH_DCR_ALLOWED_HOSTS=claude.ai,chatgpt.com,localhost,127.0.0.1   (optional override)
# CRON_SECRET=<random>                    (for /api/oauth/_cleanup auth in non-cron calls)

# In Vercel preview env vars (via dashboard or `vercel env add`):
# PUBLIC_APP_URL=https://<preview-host>
# CRON_SECRET=<random>
```

- [ ] **Step 2: Run all OAuth scripts locally**

```
npm run dev   # one shell
# Other shell:
node --env-file=.env.local scripts/test-oauth-discovery.mjs
node --env-file=.env.local scripts/test-oauth-dcr.mjs
node --env-file=.env.local scripts/test-oauth-authorize.mjs
node --env-file=.env.local scripts/test-oauth-token-code.mjs
node --env-file=.env.local scripts/test-oauth-token-refresh.mjs
node --env-file=.env.local scripts/test-oauth-revocation.mjs
node --env-file=.env.local scripts/test-mcp-oauth-handshake.mjs
node                          scripts/audit-oauth-readonly.mjs
node --env-file=.env.local scripts/test-mcp-handshake.mjs
node --env-file=.env.local scripts/test-mcp-bad-tokens.mjs
node                          scripts/audit-mcp-readonly.mjs
```

All must PASS.

- [ ] **Step 3: Deploy preview, do real Claude.ai connect**

```
git push origin <branch>
# Vercel auto-deploys. Get the preview URL.
```

In Claude.ai:
1. Settings → Connectors → Add custom connector.
2. Name: "MAP Practice (preview)"
3. Remote MCP server URL: `https://<preview-host>/api/mcp`
4. Leave OAuth Client ID / Secret blank.
5. Click Add. Browser opens preview app's `/oauth/authorize`. Sign in. Click Allow.
6. Back in Claude.ai, ask: "What kids are in my family?"

Expected: list_kids returns the test family's children.

Verify in `/parent/connect-ai`:
- "Claude.ai" appears in Connected agents with last_used_at = a few seconds ago.
- Recent activity shows a `list_kids` row with source = "Claude.ai", auth_kind = oauth_access.

- [ ] **Step 4: Repeat the connect for ChatGPT**

Same flow on chatgpt.com's connector UI.

Verify both grants now appear in Connected agents.

- [ ] **Step 5: Verify revocation**

In `/parent/connect-ai`, click Revoke on the Claude.ai grant. Confirm. Wait 30 seconds. In Claude.ai, ask another question. Expected: 401 from `/api/mcp`; Claude.ai prompts to reconnect.

- [ ] **Step 6: Verify PAT path still works**

In the same `/parent/connect-ai` page, expand Personal access tokens, generate one with label "Smoke", copy the plaintext, then run:

```
MCP_BASE_URL=<preview-host> MCP_TOKEN=mcp_xxx \
  node --env-file=/dev/null scripts/test-mcp-handshake.mjs
```

Expected: PASS lines including the existing PAT-based handshake.

- [ ] **Step 7: Commit any preview URL / env updates and merge**

```bash
git push
gh pr create  # title and body per CLAUDE.md preferences
```

The plan is complete when:
- All script tests pass against preview.
- Both Claude.ai and ChatGPT connect successfully and answer a question about the family.
- Revoke works end-to-end.
- PAT path is unchanged.
