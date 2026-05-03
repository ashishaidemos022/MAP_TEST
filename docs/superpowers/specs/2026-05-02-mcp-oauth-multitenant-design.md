# MCP OAuth 2.1 + Multi-Tenant Connect — Design

**Date:** 2026-05-02
**Source brief:** none — design originated from in-session brainstorming after the existing MCP server (`docs/superpowers/plans/2026-05-01-family-mcp-server.md`) hit a real-world block: Claude.ai's "Add custom connector" UI only accepts URL + optional OAuth client credentials, with no field for the bearer token our PAT path requires. Same gap on ChatGPT's connector flow.
**Scope:** Add OAuth 2.1 + Dynamic Client Registration in front of the existing `/api/mcp` server so Claude.ai and ChatGPT can connect via the standard MCP authorization spec. Keep the PAT path intact for power-user / scripting use. No changes to MCP tools, RLS, or the multi-tenant data model below the auth layer.

---

## 1. State of the world (before this work)

| Layer | Status | Notes |
|---|---|---|
| Multi-tenant data model | ✅ live | `map_families`, `map_students`, RLS via `map_current_family_id()` (migration `20260428_map_multi_tenant.sql`) |
| Parent identity | ✅ live | Supabase Auth (email+password + Google OAuth); session cookie present in browser |
| Parent PIN gate | ✅ live | bcrypt-hashed PIN gates `/parent/*` via `sessionStorage.parent_unlocked` |
| MCP server `/api/mcp` | ✅ live | 9 read-only tools, family-scoped, audit-logged |
| Bearer-token (PAT) auth | ✅ live | `mcp_*` prefix, SHA-256 hashed, `map_mcp_tokens` table, ConnectAi UI generates plaintext once |
| OAuth-as-server endpoints | ❌ none | This design |
| DCR support | ❌ none | This design |
| `WWW-Authenticate: resource_metadata=...` discovery hint | ❌ missing | Required by MCP spec for client discovery; this design adds it |

The existing PAT path works end-to-end (proof: this very design session's MCP tool calls are PAT-backed). The block is strictly Claude.ai's / ChatGPT's connector UIs not having a bearer-token field.

## 2. Goals & non-goals

**Goals**
- Claude.ai and ChatGPT can connect via the spec-compliant OAuth flow (DCR → authorize → token → MCP).
- Existing PATs continue to work bit-for-bit.
- Trust boundary stays `family_id`; no tool gains a way to read across families.
- Parent UI shows "Claude.ai connected" + revoke, alongside the existing PAT controls.

**Non-goals**
- Identity federation, social sign-in for parents (already handled by Supabase Auth).
- Per-tool consent toggles, per-kid scoping (Q3 was minimal consent).
- PIN gate on OAuth consent (Q4 was signed-in only).
- Token introspection (RFC 7662), JWKS, JWT access tokens, multi-region replication.
- Email notification on new connection (worthwhile; out of this scope).

## 3. Decisions

Made during brainstorming, ratified by the user:

| # | Decision |
|---|---|
| Q1 | DCR with redirect-URI host allow-list. Allowed: `claude.ai`, `*.claude.ai`, `chatgpt.com`, `*.chatgpt.com`; plus `localhost`/`127.0.0.1` only when `NODE_ENV !== 'production'`. |
| Q2 | OAuth + PAT coexist. PAT repositioned in UI as "Personal Access Tokens (advanced)". |
| Q3 | Minimal consent: one-line "Allow / Deny". If parent not signed in, redirect to login then back. |
| Q4 | Signed-in only — no PIN gate on `/oauth/authorize`. |
| Approach | Approach 1 — opaque DB-backed access + refresh tokens. (No JWT.) |
| Audit FK | Drop the existing `map_mcp_audit.token_id` FK to `map_mcp_tokens` so the column can reference either table; correctness is enforced by `auth_kind`. |
| Refresh rotation | Rotate refresh token on every `/oauth/token` call. Reuse detection per OAuth 2.1 §6: presenting an already-used refresh token cascades — entire grant + all under-grant tokens revoked. |
| Refresh TTL | 90 days, matching the existing PAT default. |
| Access TTL | 1 hour. |
| Auth code TTL | 60 seconds, single-use, PKCE-bound. |
| PKCE | S256 only; `plain` rejected at AS metadata and at code creation. |

## 4. Architecture

Three layers, only the middle one is new.

```
Parent ──signs in──▶ Supabase Auth ──▶ map_families (family_id)
                                              │
   ┌──────────────────────────────────────────┘
   ▼
   /oauth/authorize ──consent──▶ /oauth/token
   (uses Supabase session)        (issues oat_/ort_ tokens
                                   bound to family_id)

MCP client (Claude.ai, ChatGPT)
   │  Authorization: Bearer <token>
   ▼
   /api/mcp ──auth.ts dispatch──┬─ mcp_*  → PAT path  (existing)
                                └─ oat_*  → OAuth path (new)
                                              │
                                              ▼
                                  same McpContext, same tools, same RLS
```

- **Identity (Supabase Auth):** unchanged. Parent has an `auth.users` row + Supabase session cookie + `map_families` row.
- **OAuth provider (new):** issues short-lived auth codes (60s, single-use, PKCE-bound), opaque access tokens (`oat_*`, 1h), opaque refresh tokens (`ort_*`, 90d, rotating). Every artifact is bound at issue time to a `family_id` snapshot taken from the parent's Supabase session at consent. The provider never accepts `family_id` from the caller.
- **MCP server (existing):** `auth.ts` dispatches by token prefix. `mcp_*` → existing PAT lookup. `oat_*` → new OAuth access-token lookup. Both produce the same `McpContext { family_id, token_id, owner_user_id, supabase, auth_kind, grant_id }`.

## 5. Data model

Four new tables, one ALTER on the existing audit table, no changes to `map_mcp_tokens`.

### 5.1 `map_oauth_clients` — DCR registrations

```sql
CREATE TABLE public.map_oauth_clients (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   text NOT NULL UNIQUE,
  client_secret_hash          bytea,                         -- SHA-256; NULL for public clients
  client_name                 text NOT NULL,
  redirect_uris               text[] NOT NULL,
  grant_types                 text[] NOT NULL DEFAULT ARRAY['authorization_code','refresh_token'],
  token_endpoint_auth_method  text NOT NULL DEFAULT 'client_secret_post',
  created_via                 text NOT NULL DEFAULT 'dcr',   -- 'dcr' | 'admin'
  created_at                  timestamptz NOT NULL DEFAULT now()
);
```
No RLS — service-role only. Clients are global (not per-family).

### 5.2 `map_oauth_grants` — parent's consent decision

```sql
CREATE TABLE public.map_oauth_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       text NOT NULL REFERENCES public.map_oauth_clients(client_id) ON DELETE CASCADE,
  scope           text NOT NULL DEFAULT 'mcp:read',
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);
CREATE UNIQUE INDEX uniq_active_grant
  ON public.map_oauth_grants (family_id, client_id) WHERE revoked_at IS NULL;
```
RLS: `SELECT` for `family_id = map_current_family_id()`. Mutations via service role only.

### 5.3 `map_oauth_authorization_codes` — short-lived, PKCE-bound, single-use

```sql
CREATE TABLE public.map_oauth_authorization_codes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash              bytea NOT NULL UNIQUE,           -- SHA-256
  grant_id               uuid NOT NULL REFERENCES public.map_oauth_grants(id) ON DELETE CASCADE,
  code_challenge         text NOT NULL,
  code_challenge_method  text NOT NULL CHECK (code_challenge_method = 'S256'),
  redirect_uri           text NOT NULL,
  scope                  text NOT NULL,
  expires_at             timestamptz NOT NULL,
  used_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);
```
No RLS — service role only.

### 5.4 `map_oauth_access_tokens` — opaque `oat_*`, 1h TTL

```sql
CREATE TABLE public.map_oauth_access_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      bytea NOT NULL UNIQUE,                  -- SHA-256
  token_last4     text NOT NULL,
  grant_id        uuid NOT NULL REFERENCES public.map_oauth_grants(id) ON DELETE CASCADE,
  family_id       uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  scope           text NOT NULL,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```
`family_id` is denormalized so `auth.ts` lookup is one SELECT, not a JOIN. No RLS — service role only.

### 5.5 `map_oauth_refresh_tokens` — opaque `ort_*`, 90d TTL, rotating

```sql
CREATE TABLE public.map_oauth_refresh_tokens (
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
```
Reuse detection: presenting a refresh token whose `used_at IS NOT NULL` cascades — grant + all access + all refresh tokens under it marked revoked. Single transaction.

### 5.6 ALTER on `map_mcp_audit`

```sql
ALTER TABLE public.map_mcp_audit
  ADD COLUMN auth_kind text NOT NULL DEFAULT 'pat'
    CHECK (auth_kind IN ('pat', 'oauth_access')),
  ADD COLUMN grant_id uuid REFERENCES public.map_oauth_grants(id) ON DELETE SET NULL;

ALTER TABLE public.map_mcp_audit
  DROP CONSTRAINT IF EXISTS map_mcp_audit_token_id_fkey;
```
- PAT calls: `auth_kind='pat'`, `token_id` → `map_mcp_tokens.id`, `grant_id=NULL`.
- OAuth calls: `auth_kind='oauth_access'`, `token_id` → `map_oauth_access_tokens.id`, `grant_id` set.
- The `token_id` FK is dropped so the column can polymorphically reference either table; correctness enforced by `auth_kind`.

### 5.7 New RPCs

```sql
-- SECURITY DEFINER. Verifies family ownership; cascades revoke through tokens.
CREATE FUNCTION public.map_revoke_oauth_grant(p_grant_id uuid) RETURNS void ...

-- SECURITY DEFINER. Returns parent's grants joined to client metadata for ConnectAi UI.
CREATE FUNCTION public.map_list_oauth_grants() RETURNS TABLE(
  grant_id uuid, client_name text, created_at timestamptz, last_used_at timestamptz
) ...
```
Both with `SET search_path = ''` and fully-qualified references, matching the existing convention (per `migrations/20260428_map_multi_tenant.sql`).

## 6. Endpoints

### 6.1 Endpoint table

| Method | Path | Purpose | Public? |
|---|---|---|---|
| GET | `/.well-known/oauth-protected-resource` | RFC 9728 — points clients at our AS | yes |
| GET | `/.well-known/oauth-authorization-server` | RFC 8414 — AS metadata | yes |
| POST | `/api/oauth/register` | RFC 7591 — DCR (allow-list gated) | yes |
| GET | `/api/oauth/authorize` | Renders consent (or login redirect) | yes (browser) |
| POST | `/api/oauth/consent` | "Allow" submit; mints code + redirects | session-gated |
| POST | `/api/oauth/token` | code→tokens, refresh→tokens | yes |
| POST | `/api/oauth/revoke` | RFC 7009 — client-initiated revoke | yes |
| POST | `/api/mcp` | **Existing, modified.** WWW-Authenticate now includes `resource_metadata` URL on 401 | yes |

### 6.2 First-time connect flow

```
1. Parent in Claude.ai: "Add custom connector" → URL: https://<app>/api/mcp

2. Claude.ai → POST /api/mcp (no token)
   ← 401, WWW-Authenticate: Bearer
       resource_metadata="https://<app>/.well-known/oauth-protected-resource"

3. Claude.ai → GET /.well-known/oauth-protected-resource
   ← { resource: "https://<app>/api/mcp",
       authorization_servers: ["https://<app>"] }

4. Claude.ai → GET /.well-known/oauth-authorization-server
   ← { issuer, authorization_endpoint, token_endpoint, registration_endpoint,
       code_challenge_methods_supported: ["S256"],
       grant_types_supported: ["authorization_code","refresh_token"],
       token_endpoint_auth_methods_supported: ["client_secret_post"],
       response_types_supported: ["code"],
       scopes_supported: ["mcp:read"] }

5. Claude.ai → POST /api/oauth/register
   { client_name, redirect_uris, grant_types, token_endpoint_auth_method }
   Server validates redirect_uri host ∈ allow-list. Reject otherwise (400 invalid_redirect_uri).
   Generates client_id = "client_" + base64url(rand(16))
             client_secret = "cs_" + base64url(rand(32))
   ← 201 { client_id, client_secret, ... }

6. Claude.ai → opens browser to:
   GET /api/oauth/authorize?
       response_type=code
      &client_id=client_xxx
      &redirect_uri=https://claude.ai/oauth/callback
      &scope=mcp:read
      &state=<opaque>
      &code_challenge=<S256-of-verifier>
      &code_challenge_method=S256

7. /api/oauth/authorize:
   - Validate client_id, redirect_uri exact-match, response_type, code_challenge_method
   - Read Supabase auth cookie:
       a) No session → 302 to /login?return_to=<original-authorize-url>
       b) Session → render minimal consent page (form POSTs to /api/oauth/consent)

8. Parent clicks Allow → POST /api/oauth/consent
   - Re-validate Supabase session, CSRF
   - UPSERT map_oauth_grants(family_id, client_id) — reuse non-revoked grant if exists
   - Generate code; INSERT map_oauth_authorization_codes (60s TTL, code_challenge, redirect_uri)
   - 302 to redirect_uri?code=oac_xxx&state=<opaque>

9. Claude.ai → POST /api/oauth/token
   grant_type=authorization_code, code, redirect_uri, code_verifier, client_id, client_secret
   - Auth client via client_id + secret
   - Lookup code by hash; verify not used, not expired, redirect_uri matches
   - Verify SHA256(code_verifier) == code_challenge
   - Mark code used_at=now()
   - INSERT access token (1h), refresh token (90d)
   ← 200 { access_token, token_type:"Bearer", expires_in:3600, refresh_token, scope }

10. Claude.ai → POST /api/mcp, Authorization: Bearer oat_xxx
    auth.ts: prefix=oat_ → lookup map_oauth_access_tokens → build McpContext → tools.
```

### 6.3 Refresh flow

```
Claude.ai → POST /api/oauth/token
  grant_type=refresh_token, refresh_token=ort_xxx, client_id, client_secret

Server:
  - Auth client
  - Lookup refresh by hash
  - REUSE DETECTION: used_at IS NOT NULL → revoke entire grant + all tokens, 401
  - Revoked or expired → 401
  - Mark this refresh used_at=now()
  - Issue new access + new refresh (parent_refresh_token_id = old.id)
  ← 200 { access_token, refresh_token, expires_in:3600 }
```

### 6.4 Revocation paths

- **Parent-initiated**: ConnectAi → "Revoke Claude.ai" → `map_revoke_oauth_grant(grant_id)` RPC. Atomic cascade to all under-grant tokens.
- **Client-initiated** (RFC 7009): `POST /api/oauth/revoke` with token + client auth. Marks `revoked_at`. Always returns 200 per spec.
- **Cascade on family delete**: `ON DELETE CASCADE` from `map_families` → grants → tokens.

### 6.5 Error response shapes

OAuth endpoints return RFC-shaped errors: `{ error, error_description }` with HTTP status per spec (400/401/403). Codes used: `invalid_request`, `invalid_client`, `invalid_grant`, `invalid_scope`, `unsupported_grant_type`, `invalid_redirect_uri`, `unauthorized_client`.

`/api/mcp` keeps its existing `{ error, message }` JSON shape; only the 401 `WWW-Authenticate` header gains `resource_metadata=<URL>`.

## 7. Auth dispatch in `/api/mcp`

Sole change to existing files: `api/_lib/mcp/auth.ts`.

```ts
const PAT_PREFIX = 'mcp_';
const OAT_PREFIX = 'oat_';

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

export async function resolveContextOrThrow(req: Request): Promise<McpContext> {
  const { token, kind } = parseBearer(req);
  const hash = sha256ByteaHex(token);
  return kind === 'pat'
    ? await resolvePatContext(hash)        // existing logic, factored out
    : await resolveOAuthAccessContext(hash); // new
}
```

`McpContext` gains two optional fields:
```ts
type McpContext = {
  family_id: string;
  token_id: string;          // PAT row id OR access token row id (interpreted via auth_kind)
  owner_user_id: string;
  supabase: SupabaseClient;
  auth_kind: 'pat' | 'oauth_access';   // NEW
  grant_id: string | null;              // NEW — set only for OAuth
};
```

`bumpLastUsedAt` becomes path-aware: PAT → `map_mcp_tokens.last_used_at`; OAuth → `map_oauth_grants.last_used_at` (the grant — what the parent sees, not the rotating access token).

`audit.ts` reads the new fields and writes `auth_kind` + `grant_id` columns.

`buildUnauthorizedResponse` adds the `resource_metadata` parameter:
```
WWW-Authenticate: Bearer error="invalid_token",
  resource_metadata="<PUBLIC_APP_URL>/.well-known/oauth-protected-resource"
```

Unchanged: `origin.ts`, `rate-limit.ts` (keys off the auth context's primary token id; same 60/min, 2000/day for both paths), `tools/*`, `db.ts`.

## 8. UI changes — `/parent/connect-ai`

Page becomes three-section:

### 8.1 Connected agents (NEW, primary)

Lists rows from `map_oauth_grants WHERE revoked_at IS NULL`, joined to `map_oauth_clients` for display name. Loaded via `map_list_oauth_grants()` RPC. Each row: client name, connected date, last-used relative time, Revoke button.

Revoke: `supabase.rpc('map_revoke_oauth_grant', { p_grant_id })` with confirmation dialog ("Revoke Claude.ai? It will lose access immediately and the parent will need to reconnect from Claude.ai.").

Empty state: "No agents connected yet. To connect Claude.ai, see instructions below."

Two collapsible "How to connect" accordions (Claude.ai and ChatGPT) replace the existing 4-step instruction block at lines 286-312.

### 8.2 Personal access tokens (REPOSITIONED)

Existing PAT generation form + active tokens table (lines 119-167, 170-239) move into a `▾ Show personal access tokens (advanced)` collapsible. Default collapsed. Header text changes from "Generate a token to let Claude…" to "For scripts, CI, or your own tooling. Most people don't need these — the OAuth connections above are easier."

The plaintext-reveal modal (lines 314-376) stays; it only fires for PAT generation, which lives here.

### 8.3 Recent activity

Existing audit list (lines 241-284), with new filter chips:
- All (default)
- Per-grant: one chip per active grant ("Claude.ai", "ChatGPT")
- "Personal tokens" (PAT calls)

Backed by the new `auth_kind` + `grant_id` columns on `map_mcp_audit`.

### 8.4 Files touched

Single file: `src/pages/parent/ConnectAi.tsx` (rework, ~400 → ~500 lines). No other UI touched.

## 9. Migration & rollout

### 9.1 Migration order (sequential, must apply DB before deploying server)

1. **`migrations/20260502_map_oauth.sql`** — single transaction:
   - Create the 4 new tables + indexes + check constraints
   - `ALTER TABLE map_mcp_audit` adds `auth_kind` (DEFAULT `'pat'`) + `grant_id` (nullable), drops `token_id` FK
   - RLS on `map_oauth_grants` (SELECT for `family_id = map_current_family_id()`)
   - `map_revoke_oauth_grant` and `map_list_oauth_grants` RPCs
2. **Server deploy** — new files under `api/oauth/*.ts` and `api/.well-known/*.ts` plus `auth.ts` rework. PAT path bit-for-bit unchanged. `vercel.json` gains `maxDuration: 30` entries for each new function (matching the existing `/api/mcp` config).
3. **UI deploy** — same Vercel deploy, no separate step.

Additive throughout. Rollback = revert deploy + drop new tables (existing PAT and audit rows untouched). The `auth_kind` DEFAULT means existing audit rows correctly read as `'pat'` without backfill.

### 9.2 Env vars

| Name | Where | Purpose |
|---|---|---|
| `PUBLIC_APP_URL` | server runtime | Issuer URL in OAuth metadata; base for `WWW-Authenticate: resource_metadata=...`. Required. |
| `OAUTH_DCR_ALLOWED_HOSTS` | server runtime, optional | Comma-separated host suffixes to allow in DCR `redirect_uris`. Suffix-match: `claude.ai` matches `claude.ai` and `*.claude.ai`; same for `chatgpt.com`. Defaults to `claude.ai,chatgpt.com` in prod, plus `localhost,127.0.0.1` if `NODE_ENV !== 'production'`. |
| `SUPABASE_SERVICE_ROLE_KEY` | server runtime | Already present. Reused. |

Client side `VITE_PUBLIC_BASE_URL` (already in `ConnectAi.tsx`) covers the browser. Server uses `PUBLIC_APP_URL`.

### 9.3 Operational hygiene

- **Daily cleanup cron** at `/api/oauth/_cleanup` (Vercel Cron):
  ```sql
  DELETE FROM map_oauth_authorization_codes WHERE expires_at < now() - interval '7 days';
  DELETE FROM map_oauth_access_tokens       WHERE expires_at < now() - interval '7 days';
  DELETE FROM map_oauth_refresh_tokens      WHERE expires_at < now() - interval '7 days';
  ```
- **DCR rate limit**: 10/min per source IP (`x-forwarded-for`), in-memory bucket — same shape as existing `rate-limit.ts`.
- **Logs hygiene**: token plaintext NEVER logs. Console output uses last-4 only. Same rule the PAT path follows today.

### 9.4 Risks & mitigations

| Risk | Mitigation |
|---|---|
| DCR allows phishing client (e.g. fake "Claude" with attacker redirect) | Redirect-URI host allow-list rejects at registration |
| Authorization code intercept | PKCE S256 mandatory; code TTL 60s; single-use; redirect_uri exact-match |
| Refresh token exfiltration | Rotation every use + reuse detection cascades grant revocation |
| Replay after revoke | Revocation cascade marks all under-grant tokens revoked atomically; auth.ts checks `revoked_at` per request |
| `PUBLIC_APP_URL` misconfigured → discovery breaks | Boot-time warning if `PUBLIC_APP_URL` doesn't match the request `Host` header |

## 10. Testing strategy

Mirrors existing pattern (`scripts/test-mcp-*.mjs`). Eight new acceptance scripts running against local dev.

### 10.1 New scripts

| Script | Covers |
|---|---|
| `test-oauth-discovery.mjs` | `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` return correct shape per RFC 8414 / RFC 9728 |
| `test-oauth-dcr.mjs` | Allow-list accepts `claude.ai`, `chatgpt.com`; rejects `evil.com` (`400 invalid_redirect_uri`); accepts `localhost` only when `NODE_ENV !== 'production'`; rate limit fires after 10/min |
| `test-oauth-authorize.mjs` | Unsigned-in → 302 to `/login?return_to=...`; signed-in → renders consent (HTML check); invalid `client_id` / mismatched `redirect_uri` / missing PKCE / `code_challenge_method=plain` → 400 with correct error code |
| `test-oauth-token-code.mjs` | Happy-path code → tokens; PKCE verifier mismatch → `invalid_grant`; code reuse → `invalid_grant`; expired code → `invalid_grant`; wrong client_secret → `invalid_client` |
| `test-oauth-token-refresh.mjs` | Refresh issues new pair, marks old `used_at`. Reuse detection: presenting already-used refresh cascades — grant + tokens revoked, all 401 |
| `test-oauth-revocation.mjs` | `map_revoke_oauth_grant` cascades atomically; immediate next `/api/mcp` call → 401. RFC 7009 `/oauth/revoke` returns 200 with valid token |
| `test-mcp-oauth-handshake.mjs` | End-to-end: discovery → DCR → authorize (mocked Supabase session) → token → `/api/mcp` returns family-scoped data |
| `audit-oauth-readonly.mjs` | Static check: `api/oauth/*.ts` and new `auth.ts` branches contain no INSERT/UPDATE/DELETE outside the explicit allow-list (OAuth tables, audit, `last_used_at` bumps) |

### 10.2 Existing scripts updated

| Script | Change |
|---|---|
| `test-mcp-handshake.mjs` | Smoke assert that `WWW-Authenticate` on no-token request includes `resource_metadata=...` |
| `test-mcp-bad-tokens.mjs` | Add cases for `oat_*` malformed and `oat_*` expired. PAT cases unchanged |
| `test-mcp-isolation.mjs` | Add OAuth-issued access token from family A; verify cannot read family B's data |
| `audit-mcp-readonly.mjs` | Recompile allow-list to include new tables/columns |

### 10.3 Manual end-to-end (pre-merge gate)

1. **Real Claude.ai connect** against a deployed preview URL — verifies discovery, DCR, consent rendering inside Claude.ai's frame, token exchange, and an actual MCP tool call returning family-scoped data.
2. **Real ChatGPT connect** against the same preview URL — same end-to-end.

### 10.4 Pre-merge checklist

- [ ] All 8 new scripts pass against local dev
- [ ] Updated existing scripts pass
- [ ] `audit-oauth-readonly.mjs` passes
- [ ] `audit-mcp-readonly.mjs` still passes (existing path untouched)
- [ ] Manual Claude.ai connect on preview deployment succeeds
- [ ] Manual ChatGPT connect on preview deployment succeeds
- [ ] Existing PAT-based MCP tools (the ones answering MCP queries today) still work after deploy

## 11. Out of scope (intentional)

- Implicit flow, password grant, device code flow — none in OAuth 2.1.
- PKCE `plain` method — rejected at AS metadata + at code creation.
- Token introspection (RFC 7662). Neither Claude.ai nor ChatGPT need it.
- JWKS endpoint — opaque tokens.
- `/oauth/userinfo` — we don't expose identity, only family-scoped data.
- Per-tool consent toggles, per-kid scoping — Q3 was minimal consent.
- PIN gate on consent — Q4 was signed-in only.
- Email notification on new connection — worthwhile, separate spec.
- Multi-region replication / OAuth state coordination across regions.
- Soft-launch flagging of OAuth path — ships on.
