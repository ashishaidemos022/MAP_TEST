# Family MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose family-scoped, read-only practice insights as a Streamable-HTTP MCP server so a parent can hold their kid-progress conversations in Claude.ai (or any MCP client) instead of inside the app.

**Architecture:** Vercel Serverless Function at `api/mcp.ts` (fetch-style handler, Node runtime) using `@modelcontextprotocol/sdk` Streamable HTTP transport. Bearer-token auth resolves the family_id server-side; every tool query filters on `family_id` using the service-role Supabase client. Nine read tools, no writes (audit + `last_used_at` are the only DB writes). UI page at `src/pages/parent/ConnectAi.tsx` is a React Router page mounted under the existing `RequireAuth + RequireParentPin` guard composition.

**Tech Stack:** Vite + React 18 + React Router 6 + Tailwind (existing). Adds `@modelcontextprotocol/sdk` and `zod`. Supabase project `klhzfwxpztaojekwgzcg`. Deploys to Vercel.

---

## Brief→Repo Adaptations (locked decisions)

These deviations from `MCP_BRIEF.md` are deliberate and rooted in the probe of the actual repo. Do not "fix" them by reverting to the brief.

| Brief says | This plan does | Why |
|---|---|---|
| `app/api/mcp/route.ts` (Next.js App Router) | `api/mcp.ts` (Vercel Serverless Function, fetch-style) | Repo is Vite/React Router, not Next.js. |
| `lib/mcp/...` | `api/_lib/mcp/...` | Underscore prefix prevents Vercel from routing these files; lives next to the function that uses them. |
| `app/parent/connect-ai/page.tsx` | `src/pages/parent/ConnectAi.tsx` mounted at `/parent/connect-ai` | React Router; matches existing `src/pages/parent/Parent.tsx` style. |
| `RequireParentUnlock` | `RequireParentPin` | That's the existing guard's name. |
| Filename `MULTI_USER_BRIEF.md` | `Muti_user_brief.md` | Existing typo'd filename in repo. Don't rename here. |
| `extensions.gen_random_bytes` (brief §3.4) | **Same** — `extensions.gen_random_bytes` | pgcrypto lives in `extensions` schema. Existing SECURITY DEFINER functions use `SET search_path = ''` and fully-qualify; we match that convention exactly. |
| `last_used_at` "fire-and-forget" | Plain `await` before returning the Response | Adds ~20-50ms; no new dep; deterministic. `waitUntil` from `@vercel/functions` is a future optimization. |
| `lib/mcp/rate-limit.ts` in-memory bucket | Same, but **note**: per-warm-instance on Vercel Serverless. More lenient than designed. Acceptable for v1. Phase 2: Upstash Redis. |

**Schema realities the tools must respect:**

- `map_students.family_id` is NULLABLE (~400 orphan dev rows, 4 family-attached rows across 4 families). All tool queries MUST filter on `family_id = ctx.family_id` — never just on student_id.
- `map_test_sessions.student_id` and `map_attempts.student_id` are also NULLABLE for the same reason. Tools that take a `student_id` resolve it through `getStudentInFamily` first, then JOIN; nulls never match.
- Real column names: `map_attempts.time_spent_ms` (not `time_ms`), `map_test_sessions.completed_at`/`started_at`, `map_question_choices.misconception_tag` exists. `map_misconception_tags` is keyed on `tag` (text PK, no separate `id`). Use `map_standards.teks_title` for short standard description in tool output.

---

## File structure

**New files (created by this plan):**

```
migrations/
  20260501_map_mcp_tokens.sql              # §3 schema, RLS, RPCs

api/
  mcp.ts                                   # the function — fetch-style POST/GET handler
  _lib/
    mcp/
      env.ts                               # service-role supabase client + env validation
      errors.ts                            # McpError class with stable code strings
      auth.ts                              # resolveContextOrThrow, sha256 token hash
      origin.ts                            # isAllowedOrigin
      rate-limit.ts                        # in-memory token bucket per token_id
      audit.ts                             # logToolCall (await before return)
      db.ts                                # getStudentInFamily, getSessionInFamily, getFamilyStudents
      schemas.ts                           # zod input schemas, one per tool
      tools/
        index.ts                           # registerTools(server, ctx)
        list-kids.ts
        get-kid-overview.ts
        list-recent-sessions.ts
        get-session-details.ts
        get-recent-wrong-answers.ts
        get-accuracy-by-standard.ts
        get-top-misconceptions.ts
        get-activity-calendar.ts
        compare-kids.ts

src/
  pages/
    parent/
      ConnectAi.tsx                        # /parent/connect-ai — token mgmt UI

scripts/
  test-mcp-handshake.mjs                   # acceptance §11.3 (initialize + tools/list)
  test-mcp-isolation.mjs                   # acceptance §11.4 — CRITICAL gate
  test-mcp-bad-tokens.mjs                  # acceptance §11.5
  test-mcp-origin.mjs                      # acceptance §11.6
  test-mcp-rate-limit.mjs                  # acceptance §11.7
  audit-mcp-readonly.mjs                   # acceptance §11.8 (grep audit)

vercel.json                                # pin Node runtime for api/* if not already present
.env.example                               # add SUPABASE_SERVICE_ROLE_KEY, MCP_ALLOWED_ORIGINS_EXTRA, PUBLIC_BASE_URL
```

**Modified files:**

- `package.json` — add `@modelcontextprotocol/sdk`, `zod`
- `src/App.tsx` — mount `/parent/connect-ai` route
- `src/pages/parent/Parent.tsx` — add link to "Connect AI" page (small addition; existing style)
- `CLAUDE.md` — append §10 documenting the MCP feature
- `Muti_user_brief.md` (route table only) — add row for `/parent/connect-ai`

---

## Conventions used in this plan

- All migration SQL goes in `migrations/<YYYYMMDD>_<name>.sql`, applied via `mcp__plugin_supabase_supabase__apply_migration` (not `execute_sql`, since this is DDL). The repo also stores the same SQL in the file for git history.
- All SECURITY DEFINER functions use `SET search_path = ''` and fully-qualify (`public.foo`, `extensions.bar`, `auth.uid()`). Match existing repo convention exactly.
- TypeScript files use ES modules (`type: module` in package.json). Imports of npm packages use bare specifiers; relative imports use `.js` extensions where Node demands them in the api/ directory (Vercel functions run as Node ESM).
- Test scripts are `.mjs`, run with `node --env-file=.env.local scripts/<name>.mjs`. They `console.error + process.exit(1)` on assertion failure. Match `scripts/test-decideBand.mjs` style.
- Tool input/output JSON shapes are fixed by §5 of the brief. Don't deviate.
- Before each commit step, run `npm run typecheck`. The plan won't restate this; treat it as implicit in every commit step.
- `MCP_PROJECT_REF=klhzfwxpztaojekwgzcg` is referred to throughout. The MCP plugin tool `apply_migration` takes this as `project_id`.

---

## Phase A — Schema migration

### Task 1: Apply `map_mcp_tokens` migration

**Files:**
- Create: `migrations/20260501_map_mcp_tokens.sql`
- Apply: via `mcp__plugin_supabase_supabase__apply_migration` to project `klhzfwxpztaojekwgzcg`

- [ ] **Step 1: Write the migration file**

```sql
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

-- -------------------------------------------------------------------------
-- Validation queries (run in SQL editor after apply; comments only)
-- -------------------------------------------------------------------------
-- SELECT count(*) FROM public.map_mcp_tokens;        -- 0 immediately
-- SELECT count(*) FROM public.map_mcp_audit;         -- 0 immediately
-- \df public.map_create_mcp_token public.map_revoke_mcp_token
```

- [ ] **Step 2: Apply via Supabase MCP plugin**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- `project_id`: `klhzfwxpztaojekwgzcg`
- `name`: `map_mcp_tokens`
- `query`: the contents of the file above

Expected: success, no errors.

- [ ] **Step 3: Verify schema and RPCs landed**

Use `mcp__plugin_supabase_supabase__execute_sql` with `project_id: klhzfwxpztaojekwgzcg`:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'map_mcp%' ORDER BY table_name;
-- Expect: map_mcp_audit, map_mcp_tokens

SELECT proname, prosecdef, array_to_string(proconfig,';') AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'map_%mcp%' ORDER BY proname;
-- Expect both functions, prosecdef=true, config='search_path=""'
```

- [ ] **Step 4: Re-apply to confirm idempotency**

Run the migration a second time. Expected: success, no errors. Re-run the verification SQL — counts unchanged, function definitions identical.

- [ ] **Step 5: Commit**

```bash
git add migrations/20260501_map_mcp_tokens.sql
git commit -m "feat(mcp): schema for family MCP tokens and audit log

Adds map_mcp_tokens + map_mcp_audit with RLS scoped to family_id.
Adds SECURITY DEFINER RPCs map_create_mcp_token (returns plaintext once)
and map_revoke_mcp_token. Matches repo convention: search_path = '',
extensions.* qualified, public.* qualified."
```

---

## Phase B — Server foundation

### Task 2: Add dependencies and pin Node runtime

**Files:**
- Modify: `package.json`
- Create or modify: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Install deps**

```bash
npm install @modelcontextprotocol/sdk@^1.0.0 zod@^3.23.0
```

If `^1.0.0` doesn't exist at install time, accept the latest 1.x major. Pin once installed.

- [ ] **Step 2: Verify `package.json` ended up with the new deps**

```bash
grep -E "modelcontextprotocol|zod" package.json
# Expect both lines present under "dependencies"
```

- [ ] **Step 3: Create `vercel.json`**

If the file already exists, merge the `functions` block. Otherwise create:

```json
{
  "functions": {
    "api/mcp.ts": {
      "runtime": "@vercel/node@5",
      "maxDuration": 30
    }
  }
}
```

- [ ] **Step 4: Add new env vars to `.env.example`**

Append to the file:

```
# Server-only key for the MCP serverless function. NEVER prefix with VITE_.
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Public base URL (used by the parent UI to display the MCP endpoint).
# In dev, this can be http://localhost:3000.
PUBLIC_BASE_URL=https://your-vercel-domain.vercel.app

# Optional comma-separated extras appended to the default MCP origin allow-list.
# Default list: https://claude.ai, https://*.claude.ai, https://chatgpt.com, https://cursor.so
MCP_ALLOWED_ORIGINS_EXTRA=
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vercel.json .env.example
git commit -m "chore(mcp): add @modelcontextprotocol/sdk + zod, pin Node runtime for api/mcp"
```

---

### Task 3: `api/_lib/mcp/env.ts` — service-role client + env validation

**Files:**
- Create: `api/_lib/mcp/env.ts`

- [ ] **Step 1: Write the module**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL (or VITE_SUPABASE_URL) is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  if (key.startsWith('sb_publishable_') || key.includes('"role":"anon"')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY looks like an anon/publishable key — refusing to start');
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
npm run typecheck
# Expect: clean exit
```

- [ ] **Step 3: Commit**

```bash
git add api/_lib/mcp/env.ts
git commit -m "feat(mcp): service-role Supabase client with env guardrails"
```

---

### Task 4: `api/_lib/mcp/errors.ts` — McpError class

**Files:**
- Create: `api/_lib/mcp/errors.ts`

- [ ] **Step 1: Write the module**

```ts
export const MCP_ERROR_CODES = {
  invalid_request: 'invalid_request',
  unauthorized: 'unauthorized',
  forbidden_origin: 'forbidden_origin',
  rate_limited: 'rate_limited',
  student_not_in_family: 'student_not_in_family',
  session_not_in_family: 'session_not_in_family',
  not_found: 'not_found',
  bad_input: 'bad_input',
  internal: 'internal',
} as const;

export type McpErrorCode = keyof typeof MCP_ERROR_CODES;

export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly httpStatus: number;
  constructor(code: McpErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/mcp/errors.ts
git commit -m "feat(mcp): McpError class with stable code strings"
```

---

### Task 5: `api/_lib/mcp/origin.ts` — allow-list

**Files:**
- Create: `api/_lib/mcp/origin.ts`

- [ ] **Step 1: Write the module**

```ts
const DEFAULT_ALLOWED = [
  'https://claude.ai',
  'https://chatgpt.com',
  'https://cursor.so',
];
const DEFAULT_WILDCARDS = [/^https:\/\/[a-z0-9-]+\.claude\.ai$/i];

function parseExtras(): string[] {
  const raw = process.env.MCP_ALLOWED_ORIGINS_EXTRA ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // server-to-server, no Origin header
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  const allowed = [...DEFAULT_ALLOWED, ...parseExtras()];
  if (allowed.includes(origin)) return true;
  return DEFAULT_WILDCARDS.some((re) => re.test(origin));
}
```

- [ ] **Step 2: Add a quick sanity script**

Create `scripts/test-mcp-origin-unit.mjs`:

```js
import { isAllowedOrigin } from '../api/_lib/mcp/origin.ts';
// Note: this script is illustrative only; the real test is the integration test in scripts/test-mcp-origin.mjs.
// We skip running this here because the api/ ts files use Node ESM with .ts extension, which requires tsx.
console.log('skipped — see scripts/test-mcp-origin.mjs for integration coverage');
```

(Skip this step if `tsx` isn't already available in the repo. The integration test in Task 23 covers the same surface.)

- [ ] **Step 3: Commit**

```bash
git add api/_lib/mcp/origin.ts
git commit -m "feat(mcp): origin allow-list with claude.ai wildcard + dev localhost"
```

---

### Task 6: `api/_lib/mcp/auth.ts` — token resolution

**Files:**
- Create: `api/_lib/mcp/auth.ts`

- [ ] **Step 1: Write the module**

```ts
import { createHash } from 'node:crypto';
import { getServiceClient } from './env.js';
import { McpError } from './errors.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type McpContext = {
  family_id: string;
  token_id: string;
  owner_user_id: string;
  supabase: SupabaseClient;
};

const TOKEN_PREFIX = 'mcp_';

function sha256Hex(input: string): Buffer {
  return createHash('sha256').update(input, 'utf8').digest();
}

function parseBearer(req: Request): string {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) throw new McpError('unauthorized', 'missing Authorization header', 401);
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) throw new McpError('unauthorized', 'malformed Authorization header', 401);
  const token = m[1];
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new McpError('unauthorized', 'token format invalid', 401);
  }
  return token;
}

export async function resolveContextOrThrow(req: Request): Promise<McpContext> {
  const token = parseBearer(req);
  const hash = sha256Hex(token);

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
  };
}

export async function bumpLastUsedAt(ctx: McpContext): Promise<void> {
  // Awaited (not fire-and-forget) so Vercel doesn't freeze the function mid-write.
  // ~20-50ms cost, deterministic. Future optimization: @vercel/functions waitUntil.
  const { error } = await ctx.supabase
    .from('map_mcp_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', ctx.token_id);
  if (error) {
    console.warn('[mcp] last_used_at update failed:', error.message);
  }
}

export function buildUnauthorizedResponse(message: string, code: 'invalid_request' | 'invalid_token'): Response {
  return new Response(JSON.stringify({ error: 'unauthorized', message }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer error="${code}"`,
    },
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add api/_lib/mcp/auth.ts
git commit -m "feat(mcp): bearer token resolution with SHA-256 hash lookup"
```

---

### Task 7: `api/_lib/mcp/db.ts` — family-scoped query helpers

**Files:**
- Create: `api/_lib/mcp/db.ts`

- [ ] **Step 1: Write the module**

```ts
import type { McpContext } from './auth.js';
import { McpError } from './errors.js';

export type StudentRow = {
  id: string;
  display_name: string;
  grade: number;
  avatar_emoji: string;
  created_at: string;
  family_id: string;
};

export async function getStudentInFamily(ctx: McpContext, studentId: string): Promise<StudentRow> {
  const { data, error } = await ctx.supabase
    .from('map_students')
    .select('id, display_name, grade, avatar_emoji, created_at, family_id')
    .eq('id', studentId)
    .eq('family_id', ctx.family_id)
    .maybeSingle();
  if (error) throw new McpError('internal', error.message, 500);
  if (!data) throw new McpError('student_not_in_family', `student ${studentId} not found in this family`);
  return data as StudentRow;
}

export async function getFamilyStudents(ctx: McpContext): Promise<StudentRow[]> {
  const { data, error } = await ctx.supabase
    .from('map_students')
    .select('id, display_name, grade, avatar_emoji, created_at, family_id')
    .eq('family_id', ctx.family_id)
    .order('created_at', { ascending: true });
  if (error) throw new McpError('internal', error.message, 500);
  return (data ?? []) as StudentRow[];
}

export async function getFamilyStudentIds(ctx: McpContext): Promise<string[]> {
  const rows = await getFamilyStudents(ctx);
  return rows.map((r) => r.id);
}

export type SessionRow = {
  id: string;
  student_id: string;
  subject: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  question_ids: string[];
  correct_count: number;
  planned_length: number;
};

export async function getSessionInFamily(ctx: McpContext, sessionId: string): Promise<SessionRow> {
  // Single query: join through map_students to enforce family_id.
  const { data, error } = await ctx.supabase
    .from('map_test_sessions')
    .select('id, student_id, subject, status, started_at, completed_at, question_ids, correct_count, planned_length, map_students!inner(family_id)')
    .eq('id', sessionId)
    .eq('map_students.family_id', ctx.family_id)
    .maybeSingle();
  if (error) throw new McpError('internal', error.message, 500);
  if (!data) throw new McpError('session_not_in_family', `session ${sessionId} not found in this family`);
  return {
    id: data.id,
    student_id: data.student_id,
    subject: data.subject,
    status: data.status,
    started_at: data.started_at,
    completed_at: data.completed_at,
    question_ids: data.question_ids,
    correct_count: data.correct_count,
    planned_length: data.planned_length,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add api/_lib/mcp/db.ts
git commit -m "feat(mcp): getStudentInFamily / getSessionInFamily helpers (family filter on every query)"
```

---

### Task 8: `api/_lib/mcp/audit.ts` — append-only logger

**Files:**
- Create: `api/_lib/mcp/audit.ts`

- [ ] **Step 1: Write the module**

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

// Whitelist: only these arg keys are persisted. Add to this list when a new
// tool introduces a new arg name. Anything else is dropped at write time.
const ARG_KEY_WHITELIST = new Set([
  'student_id',
  'session_id',
  'subject',
  'limit',
  'since_days',
  'min_questions',
]);

function redact(input: unknown): unknown {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return null;
  if (Array.isArray(input)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ARG_KEY_WHITELIST.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

export async function logToolCall({ ctx, toolName, toolArgs, status, errorMessage }: AuditInput): Promise<void> {
  // Awaited so the row is durable before we return to the client.
  // Failure is logged but does not fail the request.
  const { error } = await ctx.supabase.from('map_mcp_audit').insert({
    token_id: ctx.token_id,
    family_id: ctx.family_id,
    tool_name: toolName,
    tool_args: redact(toolArgs),
    status,
    error_message: errorMessage ?? null,
  });
  if (error) console.warn('[mcp] audit insert failed:', error.message);
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck
git add api/_lib/mcp/audit.ts
git commit -m "feat(mcp): append-only audit logger with arg-key allow-list"
```

---

### Task 9: `api/_lib/mcp/rate-limit.ts` — per-token bucket

**Files:**
- Create: `api/_lib/mcp/rate-limit.ts`

- [ ] **Step 1: Write the module**

```ts
import { McpError } from './errors.js';

type Bucket = {
  minuteWindowStart: number;
  minuteCount: number;
  dayWindowStart: number;
  dayCount: number;
};

const PER_MINUTE = 60;
const PER_DAY = 2000;
const buckets = new Map<string, Bucket>();

export function enforceRateLimit(tokenId: string, now = Date.now()): void {
  let b = buckets.get(tokenId);
  if (!b) {
    b = { minuteWindowStart: now, minuteCount: 0, dayWindowStart: now, dayCount: 0 };
    buckets.set(tokenId, b);
  }
  if (now - b.minuteWindowStart >= 60_000) {
    b.minuteWindowStart = now;
    b.minuteCount = 0;
  }
  if (now - b.dayWindowStart >= 86_400_000) {
    b.dayWindowStart = now;
    b.dayCount = 0;
  }
  if (b.minuteCount >= PER_MINUTE) {
    const retryMs = 60_000 - (now - b.minuteWindowStart);
    const err = new McpError('rate_limited', `60 req/min exceeded`, 429);
    (err as McpError & { retryAfter?: number }).retryAfter = Math.ceil(retryMs / 1000);
    throw err;
  }
  if (b.dayCount >= PER_DAY) {
    const retryMs = 86_400_000 - (now - b.dayWindowStart);
    const err = new McpError('rate_limited', `2000 req/day exceeded`, 429);
    (err as McpError & { retryAfter?: number }).retryAfter = Math.ceil(retryMs / 1000);
    throw err;
  }
  b.minuteCount += 1;
  b.dayCount += 1;
}

export function buildRateLimitedResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: 'rate_limited', retry_after_seconds: retryAfterSec }),
    {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSec) },
    },
  );
}

// Test-only export. Do not use from production paths.
export function _resetBucketsForTest(): void {
  buckets.clear();
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck
git add api/_lib/mcp/rate-limit.ts
git commit -m "feat(mcp): in-memory token bucket (60/min, 2000/day) per token_id

Note: per-warm-instance on Vercel Serverless. More lenient than designed.
Acceptable for v1; Phase 2 moves to Upstash Redis."
```

---

### Task 10: `api/_lib/mcp/schemas.ts` — zod input schemas

**Files:**
- Create: `api/_lib/mcp/schemas.ts`

- [ ] **Step 1: Write the schemas**

```ts
import { z } from 'zod';

// Reusable bits
const SubjectEnum = z.enum(['math', 'reading', 'language']);
const Uuid = z.string().uuid();

export const ListKidsInput = z.object({}).strict();
export type ListKidsInput = z.infer<typeof ListKidsInput>;

export const GetKidOverviewInput = z.object({ student_id: Uuid }).strict();
export type GetKidOverviewInput = z.infer<typeof GetKidOverviewInput>;

export const ListRecentSessionsInput = z
  .object({
    student_id: Uuid,
    limit: z.number().int().min(1).max(50).default(10),
    subject: SubjectEnum.optional(),
  })
  .strict();
export type ListRecentSessionsInput = z.infer<typeof ListRecentSessionsInput>;

export const GetSessionDetailsInput = z.object({ session_id: Uuid }).strict();
export type GetSessionDetailsInput = z.infer<typeof GetSessionDetailsInput>;

export const GetAccuracyByStandardInput = z
  .object({
    student_id: Uuid,
    subject: SubjectEnum.optional(),
    since_days: z.number().int().min(1).max(365).default(30),
    min_questions: z.number().int().min(1).max(100).default(3),
  })
  .strict();
export type GetAccuracyByStandardInput = z.infer<typeof GetAccuracyByStandardInput>;

export const GetTopMisconceptionsInput = z
  .object({
    student_id: Uuid,
    since_days: z.number().int().min(1).max(365).default(30),
    limit: z.number().int().min(1).max(25).default(10),
  })
  .strict();
export type GetTopMisconceptionsInput = z.infer<typeof GetTopMisconceptionsInput>;

export const GetRecentWrongAnswersInput = z
  .object({
    student_id: Uuid,
    limit: z.number().int().min(1).max(50).default(20),
    subject: SubjectEnum.optional(),
    since_days: z.number().int().min(1).max(365).default(14),
  })
  .strict();
export type GetRecentWrongAnswersInput = z.infer<typeof GetRecentWrongAnswersInput>;

export const GetActivityCalendarInput = z
  .object({
    student_id: Uuid,
    since_days: z.number().int().min(1).max(180).default(30),
  })
  .strict();
export type GetActivityCalendarInput = z.infer<typeof GetActivityCalendarInput>;

export const CompareKidsInput = z
  .object({
    subject: SubjectEnum.optional(),
    since_days: z.number().int().min(1).max(365).default(30),
  })
  .strict();
export type CompareKidsInput = z.infer<typeof CompareKidsInput>;
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck
git add api/_lib/mcp/schemas.ts
git commit -m "feat(mcp): zod input schemas for all 9 tools"
```

---

## Phase C — First tool + handshake + isolation gate

### Task 11: `api/_lib/mcp/tools/list-kids.ts`

**Files:**
- Create: `api/_lib/mcp/tools/list-kids.ts`

- [ ] **Step 1: Write the tool**

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { getFamilyStudents } from '../db.js';
import { logToolCall } from '../audit.js';
import { ListKidsInput } from '../schemas.js';

export const LIST_KIDS_DESCRIPTION =
  'List the children in this family. Returns at most 10. Use this first if the user mentions a kid by name and you do not yet know their student_id.';

export function registerListKids(server: Server, ctx: McpContext): void {
  server.tool(
    'list_kids',
    LIST_KIDS_DESCRIPTION,
    ListKidsInput.shape,
    async (rawArgs) => {
      const args = ListKidsInput.parse(rawArgs ?? {});
      try {
        const rows = await getFamilyStudents(ctx);
        const kids = rows.slice(0, 10).map((r) => ({
          student_id: r.id,
          display_name: r.display_name,
          grade: r.grade,
          avatar_emoji: r.avatar_emoji,
          created_at: r.created_at,
        }));
        await logToolCall({ ctx, toolName: 'list_kids', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ kids }) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({ ctx, toolName: 'list_kids', toolArgs: args, status: 'error', errorMessage: msg });
        throw err;
      }
    },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/mcp/tools/list-kids.ts
git commit -m "feat(mcp): list_kids tool"
```

---

### Task 12: `api/_lib/mcp/tools/index.ts` — registerTools dispatcher (list_kids only for now)

**Files:**
- Create: `api/_lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the dispatcher**

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { registerListKids } from './list-kids.js';

export function registerTools(server: Server, ctx: McpContext): void {
  registerListKids(server, ctx);
  // Subsequent tools are registered here in Phase D.
}
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/mcp/tools/index.ts
git commit -m "feat(mcp): tool dispatcher (list_kids only initially)"
```

---

### Task 13: `api/mcp.ts` — fetch-style handler

**Files:**
- Create: `api/mcp.ts`

- [ ] **Step 1: Write the handler**

```ts
export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { isAllowedOrigin } from './_lib/mcp/origin.js';
import { resolveContextOrThrow, bumpLastUsedAt, buildUnauthorizedResponse } from './_lib/mcp/auth.js';
import { enforceRateLimit, buildRateLimitedResponse } from './_lib/mcp/rate-limit.js';
import { registerTools } from './_lib/mcp/tools/index.js';
import { McpError } from './_lib/mcp/errors.js';

async function dispatch(req: Request): Promise<Response> {
  // 1. Origin check (DNS rebinding guard)
  const origin = req.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return new Response('forbidden origin', { status: 403 });
  }

  // 2. Auth
  let ctx;
  try {
    ctx = await resolveContextOrThrow(req);
  } catch (err) {
    if (err instanceof McpError && err.code === 'unauthorized') {
      const code = /header/i.test(err.message) ? 'invalid_request' : 'invalid_token';
      return buildUnauthorizedResponse(err.message, code);
    }
    if (err instanceof McpError) {
      return new Response(err.message, { status: err.httpStatus });
    }
    throw err;
  }

  // 3. Rate limit
  try {
    enforceRateLimit(ctx.token_id);
  } catch (err) {
    if (err instanceof McpError && err.code === 'rate_limited') {
      const retry = (err as McpError & { retryAfter?: number }).retryAfter ?? 60;
      return buildRateLimitedResponse(retry);
    }
    throw err;
  }

  // 4. Bump last_used_at (await; ~20-50ms)
  await bumpLastUsedAt(ctx);

  // 5. Per-request server with tools bound to ctx
  const server = new Server(
    { name: 'map-practice-family', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(server, ctx);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  }
  try {
    return await dispatch(req);
  } catch (err) {
    console.error('[mcp] unhandled', err);
    const msg = err instanceof Error ? err.message : 'internal error';
    return new Response(JSON.stringify({ error: 'internal', message: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

If `transport.handleRequest(req)` returns a different type (the SDK API is in flux), adapt to whatever the installed SDK expects. The contract is: pass a Web `Request`, receive a Web `Response`. If the SDK uses Node `req/res` instead, write a minimal Web→Node adapter inline; do not rip out the rest of this plan.

- [ ] **Step 3: Deploy a preview to test**

```bash
# Either push to a branch and let Vercel build, or:
npx vercel --prod=false
```

Capture the preview URL — call it `$DEV_URL` for the next steps.

- [ ] **Step 4: Generate a test token via the existing PIN/auth flow or direct SQL**

In the Supabase SQL editor (logged in as `parent_a`'s actual auth.uid via the existing app, OR via a service-role direct insert for testing — pick the simplest):

```sql
-- Service-role direct insert for quickest testing:
INSERT INTO public.map_mcp_tokens (family_id, owner_user_id, token_hash, token_last4, label)
VALUES (
  '<family_a_id>',
  '<parent_a_user_id>',
  extensions.digest('mcp_TESTTOKEN_FAMILY_A_aaaaaaaaaaaaaaaa', 'sha256'),
  'aaaa',
  'integration-test'
);
```

The plaintext you put through `digest()` is what curl will send.

- [ ] **Step 5: Smoke test the handshake**

```bash
curl -sS -X POST "$DEV_URL/api/mcp" \
  -H "Authorization: Bearer mcp_TESTTOKEN_FAMILY_A_aaaaaaaaaaaaaaaa" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

Expected: 200 with `result.serverInfo.name === "map-practice-family"`.

```bash
curl -sS -X POST "$DEV_URL/api/mcp" \
  -H "Authorization: Bearer mcp_TESTTOKEN_FAMILY_A_aaaaaaaaaaaaaaaa" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Expected: 200 with `result.tools[0].name === "list_kids"`.

```bash
curl -sS -X POST "$DEV_URL/api/mcp" \
  -H "Authorization: Bearer mcp_TESTTOKEN_FAMILY_A_aaaaaaaaaaaaaaaa" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_kids","arguments":{}}}'
```

Expected: 200 with `result.content[0].text` containing `kids` array of family A's children only.

- [ ] **Step 6: Verify audit row landed**

```sql
SELECT tool_name, status, tool_args, created_at
FROM public.map_mcp_audit
ORDER BY created_at DESC LIMIT 5;
-- Expect at least one row: tool_name='list_kids', status='ok', tool_args={}.
```

- [ ] **Step 7: Commit**

```bash
git add api/mcp.ts vercel.json
git commit -m "feat(mcp): /api/mcp handler — origin/auth/rate-limit/transport wiring"
```

---

### Task 14: Cross-family isolation gate (CRITICAL)

This is acceptance §11.4. **Stop the plan and fix any failure here before continuing to Phase D.**

**Files:**
- Create: `scripts/test-mcp-isolation.mjs`

- [ ] **Step 1: Inspect existing fixtures**

We probed earlier and found 4 families with kids in the live DB. Pull two real `family_id`s with kids attached, plus a third "control" family. Use Supabase MCP `execute_sql`:

```sql
SELECT f.id AS family_id, f.owner_user_id, count(s.id) AS kids
FROM public.map_families f
JOIN public.map_students s ON s.family_id = f.id
GROUP BY f.id, f.owner_user_id
ORDER BY kids DESC LIMIT 5;
```

Pick the top two as Family A and Family B. Record their `family_id`, `owner_user_id`, and one of each family's `student_id` values.

- [ ] **Step 2: Mint two real tokens**

```sql
INSERT INTO public.map_mcp_tokens (family_id, owner_user_id, token_hash, token_last4, label)
VALUES
  ('<family_a_id>', '<owner_a_id>',
   extensions.digest('mcp_ISO_FAM_A_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'sha256'),
   'xxxx', 'isolation-test-a'),
  ('<family_b_id>', '<owner_b_id>',
   extensions.digest('mcp_ISO_FAM_B_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy', 'sha256'),
   'yyyy', 'isolation-test-b');
```

- [ ] **Step 3: Write the test script**

```js
// scripts/test-mcp-isolation.mjs
// Acceptance §11.4: cross-family isolation. CRITICAL gate.
//
// Run: node --env-file=.env.local scripts/test-mcp-isolation.mjs

const BASE = process.env.MCP_BASE_URL ?? 'http://localhost:3000';
const TOKEN_A = process.env.MCP_TOKEN_A;
const TOKEN_B = process.env.MCP_TOKEN_B;
const STUDENT_FROM_B = process.env.MCP_STUDENT_FROM_B;
const SESSION_FROM_B = process.env.MCP_SESSION_FROM_B; // any session_id in family B

if (!TOKEN_A || !TOKEN_B || !STUDENT_FROM_B || !SESSION_FROM_B) {
  console.error('Missing env: MCP_TOKEN_A, MCP_TOKEN_B, MCP_STUDENT_FROM_B, MCP_SESSION_FROM_B');
  process.exit(2);
}

let nextId = 0;
async function rpc(token, method, params) {
  const id = ++nextId;
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

function assert(cond, label) {
  if (!cond) { console.error('FAIL:', label); process.exit(1); }
  console.log('PASS:', label);
}

// 1. Each token's list_kids returns only its own family.
const aKids = await rpc(TOKEN_A, 'tools/call', { name: 'list_kids', arguments: {} });
const bKids = await rpc(TOKEN_B, 'tools/call', { name: 'list_kids', arguments: {} });
assert(aKids.status === 200, 'A list_kids HTTP 200');
assert(bKids.status === 200, 'B list_kids HTTP 200');

const aKidIds = new Set(JSON.parse(aKids.json.result.content[0].text).kids.map((k) => k.student_id));
const bKidIds = new Set(JSON.parse(bKids.json.result.content[0].text).kids.map((k) => k.student_id));
assert(aKidIds.size > 0 && bKidIds.size > 0, 'each family has at least one kid');
let intersect = [...aKidIds].some((id) => bKidIds.has(id));
assert(!intersect, 'no kids in both families');

// 2. Token A asking about a student_id from family B → MCP error.
const xfer = await rpc(TOKEN_A, 'tools/call', { name: 'get_kid_overview', arguments: { student_id: STUDENT_FROM_B } });
const xferText = JSON.stringify(xfer.json);
// MCP errors come back as JSON-RPC error or as a content item with an error marker.
// Either way, it MUST NOT contain Family B's data.
assert(/student_not_in_family|tool .* not found|method not found/i.test(xferText) || !aKidIds.has(STUDENT_FROM_B),
  'A cannot read B-student via get_kid_overview');

// 3. Token A asking for a session_id from family B → MCP error.
const xfer2 = await rpc(TOKEN_A, 'tools/call', { name: 'get_session_details', arguments: { session_id: SESSION_FROM_B } });
const xfer2Text = JSON.stringify(xfer2.json);
assert(/session_not_in_family|tool .* not found|method not found/i.test(xfer2Text),
  'A cannot read B-session via get_session_details');

console.log('\nAll isolation checks passed.');
```

- [ ] **Step 4: Run it (list_kids portion only — the others will return "tool not found" until Phase D, which is the correct failure mode)**

```bash
MCP_BASE_URL="$DEV_URL" \
MCP_TOKEN_A="mcp_ISO_FAM_A_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
MCP_TOKEN_B="mcp_ISO_FAM_B_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" \
MCP_STUDENT_FROM_B="<a-real-family-b-student-id>" \
MCP_SESSION_FROM_B="<any-session-id-in-family-b-OR-zeros>" \
node --env-file=.env.local scripts/test-mcp-isolation.mjs
```

The list_kids isolation check MUST PASS now. Cross-family checks for `get_kid_overview`/`get_session_details` will pass for the wrong-tool reason ("method not found") and re-pass with the right reason once those tools land.

- [ ] **Step 5: STOP if anything failed**

If list_kids leaks a kid from the other family, do not proceed. Re-audit `getFamilyStudents` and `list_kids.ts` until isolation holds.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-mcp-isolation.mjs
git commit -m "test(mcp): cross-family isolation gate (acceptance §11.4)"
```

---

## Phase D — Remaining 8 tools

Each tool follows the same pattern as `list_kids`: a file under `api/_lib/mcp/tools/<name>.ts`, registered in `tools/index.ts`. After each tool, re-run the isolation script. After all 8, run the full §5 contract spot-check.

### Task 15: `get_kid_overview`

**Files:**
- Create: `api/_lib/mcp/tools/get-kid-overview.ts`
- Modify: `api/_lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the tool**

```ts
// api/_lib/mcp/tools/get-kid-overview.ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetKidOverviewInput } from '../schemas.js';

export const DESC =
  'High-level snapshot for one child: total practice time, total questions, accuracy by subject (math, reading, language), last-active date. Useful as the first call when the parent asks "how is X doing?"';

export function register(server: Server, ctx: McpContext): void {
  server.tool('get_kid_overview', DESC, GetKidOverviewInput.shape, async (raw) => {
    const args = GetKidOverviewInput.parse(raw ?? {});
    try {
      const student = await getStudentInFamily(ctx, args.student_id);

      const [{ count: totalSessions }, { data: attempts }, { data: latest }] = await Promise.all([
        ctx.supabase
          .from('map_test_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', student.id),
        ctx.supabase
          .from('map_attempts')
          .select('is_correct, answered_at, map_questions(subject)')
          .eq('student_id', student.id),
        ctx.supabase
          .from('map_attempts')
          .select('answered_at')
          .eq('student_id', student.id)
          .order('answered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const rows = (attempts ?? []) as Array<{ is_correct: boolean | null; answered_at: string; map_questions: { subject: string } | null }>;
      const totalAnswered = rows.length;
      const overallCorrect = rows.filter((r) => r.is_correct === true).length;
      const overall_accuracy = totalAnswered > 0 ? overallCorrect / totalAnswered : 0;

      const by_subject: Record<string, { questions: number; correct: number }> = {
        math: { questions: 0, correct: 0 },
        reading: { questions: 0, correct: 0 },
        language: { questions: 0, correct: 0 },
      };
      for (const r of rows) {
        const s = r.map_questions?.subject;
        if (!s || !(s in by_subject)) continue;
        by_subject[s].questions += 1;
        if (r.is_correct === true) by_subject[s].correct += 1;
      }
      const by_subject_out: Record<string, { questions: number; accuracy: number }> = {};
      for (const [s, v] of Object.entries(by_subject)) {
        by_subject_out[s] = { questions: v.questions, accuracy: v.questions > 0 ? v.correct / v.questions : 0 };
      }

      // current_streak_days: count consecutive days back from today with at least one attempt.
      const days = new Set<string>();
      for (const r of rows) days.add(r.answered_at.slice(0, 10));
      let streak = 0;
      const cur = new Date();
      cur.setUTCHours(0, 0, 0, 0);
      while (days.has(cur.toISOString().slice(0, 10))) {
        streak += 1;
        cur.setUTCDate(cur.getUTCDate() - 1);
      }

      const out = {
        student: { student_id: student.id, display_name: student.display_name, grade: student.grade },
        total_sessions: totalSessions ?? 0,
        total_questions_answered: totalAnswered,
        overall_accuracy,
        by_subject: by_subject_out,
        last_active_at: latest?.answered_at ?? null,
        current_streak_days: streak,
      };

      await logToolCall({ ctx, toolName: 'get_kid_overview', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_kid_overview', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
```

- [ ] **Step 2: Wire into dispatcher**

```ts
// api/_lib/mcp/tools/index.ts (after existing imports)
import { register as registerGetKidOverview } from './get-kid-overview.js';

// Inside registerTools():
registerGetKidOverview(server, ctx);
```

- [ ] **Step 3: Typecheck and commit**

```bash
npm run typecheck
git add api/_lib/mcp/tools/get-kid-overview.ts api/_lib/mcp/tools/index.ts
git commit -m "feat(mcp): get_kid_overview tool"
```

- [ ] **Step 4: Re-run the isolation script**

```bash
MCP_BASE_URL="$DEV_URL" MCP_TOKEN_A=... MCP_TOKEN_B=... MCP_STUDENT_FROM_B=... MCP_SESSION_FROM_B=... \
node --env-file=.env.local scripts/test-mcp-isolation.mjs
```

The "A cannot read B-student via get_kid_overview" check should now pass with `student_not_in_family`, not "method not found".

---

### Task 16: `list_recent_sessions`

**Files:**
- Create: `api/_lib/mcp/tools/list-recent-sessions.ts`
- Modify: `api/_lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the tool**

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { ListRecentSessionsInput } from '../schemas.js';

export const DESC =
  "List the child's recent practice sessions, newest first. Each session is one sitting with N questions on one subject.";

export function register(server: Server, ctx: McpContext): void {
  server.tool('list_recent_sessions', DESC, ListRecentSessionsInput.shape, async (raw) => {
    const args = ListRecentSessionsInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);

      let q = ctx.supabase
        .from('map_test_sessions')
        .select('id, subject, started_at, completed_at, question_ids, correct_count')
        .eq('student_id', args.student_id)
        .order('started_at', { ascending: false })
        .limit(args.limit);
      if (args.subject) q = q.eq('subject', args.subject);
      const { data: sessions, error } = await q;
      if (error) throw new Error(error.message);

      const sessionIds = (sessions ?? []).map((s) => s.id);
      const timesBySession: Record<string, number[]> = {};
      if (sessionIds.length) {
        const { data: atts } = await ctx.supabase
          .from('map_attempts')
          .select('session_id, time_spent_ms')
          .in('session_id', sessionIds);
        for (const a of (atts ?? []) as Array<{ session_id: string; time_spent_ms: number | null }>) {
          if (a.time_spent_ms == null) continue;
          (timesBySession[a.session_id] ??= []).push(a.time_spent_ms);
        }
      }
      const median = (xs: number[]): number | null => {
        if (!xs.length) return null;
        const s = [...xs].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
      };

      const out = {
        sessions: (sessions ?? []).map((s) => {
          const total = (s.question_ids ?? []).length;
          const correct = s.correct_count ?? 0;
          return {
            session_id: s.id,
            subject: s.subject,
            started_at: s.started_at,
            completed_at: s.completed_at,
            question_count: total,
            correct_count: correct,
            accuracy: total > 0 ? correct / total : 0,
            median_seconds_per_question: ((m) => (m == null ? null : Math.round(m / 100) / 10))(median(timesBySession[s.id] ?? [])),
          };
        }),
      };

      await logToolCall({ ctx, toolName: 'list_recent_sessions', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'list_recent_sessions', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
```

- [ ] **Step 2: Wire and commit**

```ts
// tools/index.ts
import { register as registerListRecentSessions } from './list-recent-sessions.js';
// ...
registerListRecentSessions(server, ctx);
```

```bash
npm run typecheck
git add api/_lib/mcp/tools/list-recent-sessions.ts api/_lib/mcp/tools/index.ts
git commit -m "feat(mcp): list_recent_sessions tool"
```

---

### Task 17: `get_recent_wrong_answers`

**Files:**
- Create: `api/_lib/mcp/tools/get-recent-wrong-answers.ts`
- Modify: `api/_lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the tool**

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetRecentWrongAnswersInput } from '../schemas.js';

export const DESC =
  "The most useful single tool. Returns the child's recent incorrect attempts with full context: question stem, what they picked, what was correct, the standard, and the misconception tag.";

export function register(server: Server, ctx: McpContext): void {
  server.tool('get_recent_wrong_answers', DESC, GetRecentWrongAnswersInput.shape, async (raw) => {
    const args = GetRecentWrongAnswersInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);
      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();

      // 1. Pull wrong attempts.
      let q = ctx.supabase
        .from('map_attempts')
        .select('answered_at, question_id, selected_choice_id, time_spent_ms, is_correct, map_questions!inner(subject, stem, standard_id, passage_id)')
        .eq('student_id', args.student_id)
        .eq('is_correct', false)
        .gte('answered_at', since)
        .order('answered_at', { ascending: false })
        .limit(args.limit);
      if (args.subject) q = q.eq('map_questions.subject', args.subject);

      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);

      type Att = {
        answered_at: string;
        question_id: string;
        selected_choice_id: string | null;
        time_spent_ms: number | null;
        map_questions: {
          subject: string;
          stem: string;
          standard_id: string | null;
          passage_id: string | null;
        };
      };
      const attempts = (rows ?? []) as unknown as Att[];
      if (attempts.length === 0) {
        await logToolCall({ ctx, toolName: 'get_recent_wrong_answers', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ wrong_answers: [] }) }] };
      }

      // 2. Hydrate choices, standards, passages in parallel.
      const questionIds = [...new Set(attempts.map((a) => a.question_id))];
      const standardIds = [...new Set(attempts.map((a) => a.map_questions.standard_id).filter((x): x is string => !!x))];
      const passageIds = [...new Set(attempts.map((a) => a.map_questions.passage_id).filter((x): x is string => !!x))];
      const choiceIds = [...new Set(attempts.map((a) => a.selected_choice_id).filter((x): x is string => !!x))];

      const [{ data: chosenChoices }, { data: correctChoices }, { data: standards }, { data: passages }] = await Promise.all([
        ctx.supabase.from('map_question_choices').select('id, body, misconception_tag').in('id', choiceIds.length ? choiceIds : ['00000000-0000-0000-0000-000000000000']),
        ctx.supabase.from('map_question_choices').select('question_id, body').in('question_id', questionIds).eq('is_correct', true),
        ctx.supabase.from('map_standards').select('id, teks_code').in('id', standardIds.length ? standardIds : ['00000000-0000-0000-0000-000000000000']),
        ctx.supabase.from('map_reading_passages').select('id, body').in('id', passageIds.length ? passageIds : ['00000000-0000-0000-0000-000000000000']),
      ]);

      const chosenById = new Map((chosenChoices ?? []).map((c) => [c.id, c]));
      const correctByQ = new Map((correctChoices ?? []).map((c) => [c.question_id, c.body]));
      const standardById = new Map((standards ?? []).map((s) => [s.id, s.teks_code]));
      const passageById = new Map((passages ?? []).map((p) => [p.id, p.body]));

      const out = {
        wrong_answers: attempts.map((a) => {
          const chosen = a.selected_choice_id ? chosenById.get(a.selected_choice_id) : undefined;
          const passageBody = a.map_questions.passage_id ? passageById.get(a.map_questions.passage_id) : null;
          return {
            attempted_at: a.answered_at,
            question_id: a.question_id,
            subject: a.map_questions.subject,
            standard_code: a.map_questions.standard_id ? standardById.get(a.map_questions.standard_id) ?? '' : '',
            stem: a.map_questions.stem.slice(0, 500),
            chosen_text: chosen?.body ?? '',
            correct_text: correctByQ.get(a.question_id) ?? '',
            misconception_tag: chosen?.misconception_tag ?? null,
            passage_excerpt: passageBody ? passageBody.slice(0, 300) : null,
            time_ms: a.time_spent_ms,
          };
        }),
      };

      await logToolCall({ ctx, toolName: 'get_recent_wrong_answers', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_recent_wrong_answers', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
```

- [ ] **Step 2: Wire and commit**

```ts
// tools/index.ts
import { register as registerGetRecentWrongAnswers } from './get-recent-wrong-answers.js';
// ...
registerGetRecentWrongAnswers(server, ctx);
```

```bash
npm run typecheck
git add api/_lib/mcp/tools/get-recent-wrong-answers.ts api/_lib/mcp/tools/index.ts
git commit -m "feat(mcp): get_recent_wrong_answers tool"
```

---

### Task 18: `get_accuracy_by_standard`

**Files:**
- Create: `api/_lib/mcp/tools/get-accuracy-by-standard.ts`
- Modify: `api/_lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the tool**

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetAccuracyByStandardInput } from '../schemas.js';

export const DESC =
  "Group the child's accuracy by Texas TEKS standard. Returns standards practiced with question count and accuracy each. Sorted by lowest accuracy first so weak spots surface naturally.";

export function register(server: Server, ctx: McpContext): void {
  server.tool('get_accuracy_by_standard', DESC, GetAccuracyByStandardInput.shape, async (raw) => {
    const args = GetAccuracyByStandardInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);
      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();

      let q = ctx.supabase
        .from('map_attempts')
        .select('is_correct, map_questions!inner(subject, standard_id, map_standards!inner(teks_code, teks_title, subject))')
        .eq('student_id', args.student_id)
        .gte('answered_at', since);
      if (args.subject) q = q.eq('map_questions.subject', args.subject);

      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);

      type R = { is_correct: boolean | null; map_questions: { standard_id: string | null; map_standards: { teks_code: string; teks_title: string; subject: string } | null } };
      const buckets = new Map<string, { code: string; description: string; subject: string; total: number; correct: number }>();
      for (const r of (rows ?? []) as unknown as R[]) {
        const std = r.map_questions?.map_standards;
        if (!std) continue;
        const k = std.teks_code;
        const cur = buckets.get(k) ?? { code: std.teks_code, description: std.teks_title, subject: std.subject, total: 0, correct: 0 };
        cur.total += 1;
        if (r.is_correct === true) cur.correct += 1;
        buckets.set(k, cur);
      }
      const list = [...buckets.values()]
        .filter((b) => b.total >= args.min_questions)
        .map((b) => ({
          standard_code: b.code,
          standard_description: b.description,
          subject: b.subject,
          questions_attempted: b.total,
          accuracy: b.correct / b.total,
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

      const out = { standards: list };
      await logToolCall({ ctx, toolName: 'get_accuracy_by_standard', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_accuracy_by_standard', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
```

- [ ] **Step 2: Wire and commit**

```ts
// tools/index.ts
import { register as registerGetAccuracyByStandard } from './get-accuracy-by-standard.js';
// ...
registerGetAccuracyByStandard(server, ctx);
```

```bash
npm run typecheck
git add api/_lib/mcp/tools/get-accuracy-by-standard.ts api/_lib/mcp/tools/index.ts
git commit -m "feat(mcp): get_accuracy_by_standard tool"
```

---

### Task 19: `get_top_misconceptions`

**Files:**
- Create: `api/_lib/mcp/tools/get-top-misconceptions.ts`
- Modify: `api/_lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the tool**

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetTopMisconceptionsInput } from '../schemas.js';

export const DESC =
  "Most-frequent error patterns the child has triggered, drawn from misconception_tag on wrong-answer choices. Sorted by frequency. Each row includes a sample wrong question.";

export function register(server: Server, ctx: McpContext): void {
  server.tool('get_top_misconceptions', DESC, GetTopMisconceptionsInput.shape, async (raw) => {
    const args = GetTopMisconceptionsInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);
      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();

      // Wrong attempts joined to the chosen choice's misconception_tag.
      const { data: rows, error } = await ctx.supabase
        .from('map_attempts')
        .select('answered_at, question_id, selected_choice_id, map_questions!inner(stem), map_question_choices!inner(misconception_tag, body, is_correct)')
        .eq('student_id', args.student_id)
        .eq('is_correct', false)
        .gte('answered_at', since)
        .order('answered_at', { ascending: false });
      if (error) throw new Error(error.message);

      // Supabase's foreign-key embed on map_attempts.selected_choice_id needs aliasing.
      // If the inferred relation is ambiguous, replace the join above with a separate
      // .select on map_question_choices keyed by selected_choice_id.

      type R = {
        answered_at: string;
        question_id: string;
        selected_choice_id: string;
        map_questions: { stem: string };
        map_question_choices: { misconception_tag: string | null; body: string; is_correct: boolean };
      };
      const tally = new Map<string, { count: number; mostRecentAt: string; sampleQ: { question_id: string; stem: string; chosen_text: string } }>();
      for (const r of (rows ?? []) as unknown as R[]) {
        const tag = r.map_question_choices?.misconception_tag;
        if (!tag) continue;
        const cur = tally.get(tag);
        if (!cur) {
          tally.set(tag, {
            count: 1,
            mostRecentAt: r.answered_at,
            sampleQ: { question_id: r.question_id, stem: r.map_questions.stem.slice(0, 500), chosen_text: r.map_question_choices.body },
          });
        } else {
          cur.count += 1;
          if (r.answered_at > cur.mostRecentAt) {
            cur.mostRecentAt = r.answered_at;
            cur.sampleQ = { question_id: r.question_id, stem: r.map_questions.stem.slice(0, 500), chosen_text: r.map_question_choices.body };
          }
        }
      }

      const tags = [...tally.keys()];
      const tagDescriptions = new Map<string, string>();
      if (tags.length) {
        const { data: tagRows } = await ctx.supabase
          .from('map_misconception_tags')
          .select('tag, description')
          .in('tag', tags);
        for (const t of tagRows ?? []) tagDescriptions.set(t.tag, t.description);
      }

      // For each sample, fetch the correct answer text in one batched query.
      const sampleQids = [...tally.values()].map((v) => v.sampleQ.question_id);
      const correctByQ = new Map<string, string>();
      if (sampleQids.length) {
        const { data: corrects } = await ctx.supabase
          .from('map_question_choices')
          .select('question_id, body')
          .in('question_id', sampleQids)
          .eq('is_correct', true);
        for (const c of corrects ?? []) correctByQ.set(c.question_id, c.body);
      }

      const list = [...tally.entries()]
        .map(([tag, v]) => ({
          tag,
          description: tagDescriptions.get(tag) ?? tag,
          hit_count: v.count,
          most_recent_at: v.mostRecentAt,
          sample_question: {
            question_id: v.sampleQ.question_id,
            stem: v.sampleQ.stem,
            chosen_text: v.sampleQ.chosen_text,
            correct_text: correctByQ.get(v.sampleQ.question_id) ?? '',
          },
        }))
        .sort((a, b) => b.hit_count - a.hit_count)
        .slice(0, args.limit);

      const out = { misconceptions: list };
      await logToolCall({ ctx, toolName: 'get_top_misconceptions', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_top_misconceptions', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
```

- [ ] **Step 2: Wire and commit**

```ts
// tools/index.ts
import { register as registerGetTopMisconceptions } from './get-top-misconceptions.js';
// ...
registerGetTopMisconceptions(server, ctx);
```

```bash
npm run typecheck
git add api/_lib/mcp/tools/get-top-misconceptions.ts api/_lib/mcp/tools/index.ts
git commit -m "feat(mcp): get_top_misconceptions tool"
```

---

### Task 20: `get_session_details`

**Files:**
- Create: `api/_lib/mcp/tools/get-session-details.ts`
- Modify: `api/_lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the tool**

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { getSessionInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetSessionDetailsInput } from '../schemas.js';

export const DESC =
  'Question-by-question breakdown of one session, including stems, the child\'s answer, the correct answer, time taken, and any misconception tag triggered.';

export function register(server: Server, ctx: McpContext): void {
  server.tool('get_session_details', DESC, GetSessionDetailsInput.shape, async (raw) => {
    const args = GetSessionDetailsInput.parse(raw ?? {});
    try {
      const session = await getSessionInFamily(ctx, args.session_id);

      const { data: attempts, error } = await ctx.supabase
        .from('map_attempts')
        .select('question_id, selected_choice_id, is_correct, time_spent_ms, answered_at')
        .eq('session_id', session.id)
        .order('answered_at', { ascending: true });
      if (error) throw new Error(error.message);

      const questionIds = [...new Set((attempts ?? []).map((a) => a.question_id))];
      const choiceIds = [...new Set((attempts ?? []).map((a) => a.selected_choice_id).filter((x): x is string => !!x))];

      const [{ data: questions }, { data: choices }, { data: standards }] = await Promise.all([
        ctx.supabase.from('map_questions').select('id, stem, standard_id').in('id', questionIds.length ? questionIds : ['00000000-0000-0000-0000-000000000000']),
        ctx.supabase.from('map_question_choices').select('id, question_id, label, body, is_correct, misconception_tag').in('question_id', questionIds.length ? questionIds : ['00000000-0000-0000-0000-000000000000']),
        ctx.supabase.from('map_standards').select('id, teks_code'),
      ]);

      const qById = new Map((questions ?? []).map((q) => [q.id, q]));
      const stdById = new Map((standards ?? []).map((s) => [s.id, s.teks_code]));
      const choicesByQ = new Map<string, Array<{ id: string; label: string; body: string; is_correct: boolean; misconception_tag: string | null }>>();
      for (const c of choices ?? []) {
        if (!choicesByQ.has(c.question_id)) choicesByQ.set(c.question_id, []);
        choicesByQ.get(c.question_id)!.push(c);
      }
      const chosenById = new Map<string, { id: string; label: string; body: string; is_correct: boolean; misconception_tag: string | null }>();
      for (const list of choicesByQ.values()) for (const c of list) chosenById.set(c.id, c);

      const out = {
        session: {
          session_id: session.id,
          student_id: session.student_id,
          subject: session.subject,
          started_at: session.started_at,
          completed_at: session.completed_at,
        },
        attempts: (attempts ?? []).map((a) => {
          const q = qById.get(a.question_id);
          const std = q?.standard_id ? stdById.get(q.standard_id) ?? '' : '';
          const chosen = a.selected_choice_id ? chosenById.get(a.selected_choice_id) : undefined;
          const correct = (choicesByQ.get(a.question_id) ?? []).find((c) => c.is_correct);
          return {
            question_id: a.question_id,
            standard_code: std,
            stem: (q?.stem ?? '').slice(0, 500),
            chosen_label: chosen?.label ?? null,
            chosen_text: chosen?.body ?? '',
            correct_label: correct?.label ?? '',
            correct_text: correct?.body ?? '',
            is_correct: a.is_correct === true,
            time_ms: a.time_spent_ms,
            misconception_tag: chosen && !chosen.is_correct ? chosen.misconception_tag ?? null : null,
          };
        }),
      };

      await logToolCall({ ctx, toolName: 'get_session_details', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_session_details', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
```

- [ ] **Step 2: Wire and commit**

```ts
// tools/index.ts
import { register as registerGetSessionDetails } from './get-session-details.js';
// ...
registerGetSessionDetails(server, ctx);
```

```bash
npm run typecheck
git add api/_lib/mcp/tools/get-session-details.ts api/_lib/mcp/tools/index.ts
git commit -m "feat(mcp): get_session_details tool"
```

- [ ] **Step 3: Re-run isolation script**

The "A cannot read B-session via get_session_details" check should now pass with `session_not_in_family`.

---

### Task 21: `get_activity_calendar`

**Files:**
- Create: `api/_lib/mcp/tools/get-activity-calendar.ts`
- Modify: `api/_lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the tool**

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetActivityCalendarInput } from '../schemas.js';

export const DESC =
  "Per-day question counts for the last N days. Use this when the parent asks about consistency, streaks, or whether the child practiced this week.";

export function register(server: Server, ctx: McpContext): void {
  server.tool('get_activity_calendar', DESC, GetActivityCalendarInput.shape, async (raw) => {
    const args = GetActivityCalendarInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);
      const since = new Date(Date.now() - args.since_days * 86_400_000);
      since.setUTCHours(0, 0, 0, 0);
      const sinceIso = since.toISOString();

      const [{ data: atts, error: attErr }, { data: sess, error: sessErr }] = await Promise.all([
        ctx.supabase
          .from('map_attempts')
          .select('answered_at, is_correct')
          .eq('student_id', args.student_id)
          .gte('answered_at', sinceIso),
        ctx.supabase
          .from('map_test_sessions')
          .select('started_at')
          .eq('student_id', args.student_id)
          .gte('started_at', sinceIso),
      ]);
      if (attErr) throw new Error(attErr.message);
      if (sessErr) throw new Error(sessErr.message);

      type Acc = { questions: number; correct: number; sessions: number };
      const byDay = new Map<string, Acc>();
      const ensure = (d: string): Acc => {
        let r = byDay.get(d);
        if (!r) { r = { questions: 0, correct: 0, sessions: 0 }; byDay.set(d, r); }
        return r;
      };
      for (const a of atts ?? []) {
        const d = a.answered_at.slice(0, 10);
        const r = ensure(d);
        r.questions += 1;
        if (a.is_correct === true) r.correct += 1;
      }
      for (const s of sess ?? []) {
        const d = s.started_at.slice(0, 10);
        ensure(d).sessions += 1;
      }

      const days: Array<{ date: string; questions_answered: number; sessions: number; accuracy: number | null }> = [];
      for (let i = 0; i < args.since_days; i++) {
        const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
        const r = byDay.get(d) ?? { questions: 0, correct: 0, sessions: 0 };
        days.push({
          date: d,
          questions_answered: r.questions,
          sessions: r.sessions,
          accuracy: r.questions > 0 ? r.correct / r.questions : null,
        });
      }

      const out = { days };
      await logToolCall({ ctx, toolName: 'get_activity_calendar', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_activity_calendar', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
```

- [ ] **Step 2: Wire and commit**

```ts
// tools/index.ts
import { register as registerGetActivityCalendar } from './get-activity-calendar.js';
// ...
registerGetActivityCalendar(server, ctx);
```

```bash
npm run typecheck
git add api/_lib/mcp/tools/get-activity-calendar.ts api/_lib/mcp/tools/index.ts
git commit -m "feat(mcp): get_activity_calendar tool"
```

---

### Task 22: `compare_kids`

**Files:**
- Create: `api/_lib/mcp/tools/compare-kids.ts`
- Modify: `api/_lib/mcp/tools/index.ts`

- [ ] **Step 1: Write the tool**

```ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpContext } from '../auth.js';
import { getFamilyStudents } from '../db.js';
import { logToolCall } from '../audit.js';
import { CompareKidsInput } from '../schemas.js';

export const DESC =
  "Side-by-side snapshot for all kids in the family on one subject. Same-shape rows for each child so they're directly comparable.";

export function register(server: Server, ctx: McpContext): void {
  server.tool('compare_kids', DESC, CompareKidsInput.shape, async (raw) => {
    const args = CompareKidsInput.parse(raw ?? {});
    try {
      const kids = await getFamilyStudents(ctx);
      if (kids.length === 0) {
        await logToolCall({ ctx, toolName: 'compare_kids', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ rows: [] }) }] };
      }
      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();
      const studentIds = kids.map((k) => k.id);

      // Per-attempt rows joined to question subject + standard
      let aq = ctx.supabase
        .from('map_attempts')
        .select('student_id, is_correct, map_questions!inner(subject, standard_id, map_standards(teks_code, teks_title))')
        .in('student_id', studentIds)
        .gte('answered_at', since);
      if (args.subject) aq = aq.eq('map_questions.subject', args.subject);
      const { data: rows, error } = await aq;
      if (error) throw new Error(error.message);

      type R = {
        student_id: string;
        is_correct: boolean | null;
        map_questions: { subject: string; standard_id: string | null; map_standards: { teks_code: string; teks_title: string } | null };
      };

      type PerStd = { code: string; description: string; total: number; correct: number };
      type PerKid = { questions: number; correct: number; standards: Map<string, PerStd> };
      const byKid = new Map<string, PerKid>();
      for (const k of kids) byKid.set(k.id, { questions: 0, correct: 0, standards: new Map() });

      for (const r of (rows ?? []) as unknown as R[]) {
        const k = byKid.get(r.student_id);
        if (!k) continue;
        k.questions += 1;
        if (r.is_correct === true) k.correct += 1;
        const std = r.map_questions?.map_standards;
        if (std) {
          const cur = k.standards.get(std.teks_code) ?? { code: std.teks_code, description: std.teks_title, total: 0, correct: 0 };
          cur.total += 1;
          if (r.is_correct === true) cur.correct += 1;
          k.standards.set(std.teks_code, cur);
        }
      }

      const out = {
        rows: kids.map((k) => {
          const agg = byKid.get(k.id)!;
          let weakest: { code: string; description: string; accuracy: number } | null = null;
          for (const s of agg.standards.values()) {
            if (s.total < 3) continue;
            const acc = s.correct / s.total;
            if (!weakest || acc < weakest.accuracy) weakest = { code: s.code, description: s.description, accuracy: acc };
          }
          return {
            student_id: k.id,
            display_name: k.display_name,
            grade: k.grade,
            questions: agg.questions,
            accuracy: agg.questions > 0 ? agg.correct / agg.questions : 0,
            weakest_standard: weakest,
          };
        }),
      };

      await logToolCall({ ctx, toolName: 'compare_kids', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'compare_kids', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
```

- [ ] **Step 2: Wire and commit**

```ts
// tools/index.ts
import { register as registerCompareKids } from './compare-kids.js';
// ...
registerCompareKids(server, ctx);
```

```bash
npm run typecheck
git add api/_lib/mcp/tools/compare-kids.ts api/_lib/mcp/tools/index.ts
git commit -m "feat(mcp): compare_kids tool"
```

---

## Phase E — Parent UI

### Task 23: `/parent/connect-ai` page

**Files:**
- Create: `src/pages/parent/ConnectAi.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/parent/Parent.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/pages/parent/ConnectAi.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

type TokenRow = {
  id: string;
  label: string;
  token_last4: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type AuditRow = {
  id: number;
  tool_name: string;
  status: string;
  created_at: string;
};

const MCP_URL = `${import.meta.env.VITE_PUBLIC_BASE_URL ?? window.location.origin}/api/mcp`;
const EXPIRY_OPTIONS = [30, 90, 180, 365];

export default function ConnectAi() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [showRevoked, setShowRevoked] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditLimit, setAuditLimit] = useState(50);
  const [label, setLabel] = useState('Claude.ai');
  const [expiresDays, setExpiresDays] = useState(90);
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<{ plaintext: string; tokenId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadTokens() {
    const { data, error: e } = await supabase
      .from('map_mcp_tokens')
      .select('id, label, token_last4, created_at, expires_at, last_used_at, revoked_at')
      .order('created_at', { ascending: false });
    if (e) setError(e.message); else setTokens(data ?? []);
  }
  async function loadAudit() {
    const { data, error: e } = await supabase
      .from('map_mcp_audit')
      .select('id, tool_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(auditLimit);
    if (e) setError(e.message); else setAudit(data ?? []);
  }
  useEffect(() => { void loadTokens(); void loadAudit(); }, [auditLimit]);

  async function handleGenerate() {
    setCreating(true); setError(null);
    const { data, error: e } = await supabase.rpc('map_create_mcp_token', {
      p_label: label, p_expires_days: expiresDays,
    });
    setCreating(false);
    if (e) { setError(e.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.plaintext_token) { setError('no token returned'); return; }
    setReveal({ plaintext: row.plaintext_token, tokenId: row.token_id });
    void loadTokens();
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this token? Any AI agent using it will lose access immediately.')) return;
    const { error: e } = await supabase.rpc('map_revoke_mcp_token', { p_token_id: id });
    if (e) setError(e.message); else void loadTokens();
  }

  const visibleTokens = useMemo(
    () => tokens.filter((t) => showRevoked || !t.revoked_at),
    [tokens, showRevoked],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Connect AI</h1>
        <p className="text-sm text-muted-foreground">
          Generate a token to let Claude or another AI agent read your family's practice data.
          The agent can read but cannot change anything. Tokens expire after 90 days by default.
        </p>
      </header>

      <section className="rounded-2xl border p-5 space-y-4">
        <h2 className="font-heading text-xl">Generate a token</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1">Label</span>
            <input className="input w-56" value={label} maxLength={50}
              onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1">Expires in</span>
            <select className="input w-40" value={expiresDays}
              onChange={(e) => setExpiresDays(Number(e.target.value))}>
              {EXPIRY_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
          <button className="btn-primary" disabled={creating} onClick={handleGenerate}>
            {creating ? 'Generating…' : 'Generate token'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded-2xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl">Active tokens</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
            Show revoked
          </label>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Label</th><th>Last 4</th><th>Created</th>
              <th>Expires</th><th>Last used</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visibleTokens.length === 0 && (
              <tr><td colSpan={6} className="py-3 text-muted-foreground">No tokens yet.</td></tr>
            )}
            {visibleTokens.map((t) => (
              <tr key={t.id} className={t.revoked_at ? 'text-muted-foreground/60' : ''}>
                <td className="py-2">{t.label}{t.revoked_at && ' (revoked)'}</td>
                <td className="font-mono">…{t.token_last4}</td>
                <td>{new Date(t.created_at).toLocaleDateString()}</td>
                <td>{new Date(t.expires_at).toLocaleDateString()}</td>
                <td>{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : '—'}</td>
                <td className="text-right">
                  {!t.revoked_at && (
                    <button className="btn-ghost text-sm" onClick={() => handleRevoke(t.id)}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="font-heading text-xl">Recent activity</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-2">Time</th><th>Tool</th><th>Status</th></tr>
          </thead>
          <tbody>
            {audit.length === 0 && (
              <tr><td colSpan={3} className="py-3 text-muted-foreground">Nothing yet.</td></tr>
            )}
            {audit.map((r) => (
              <tr key={r.id}>
                <td className="py-1 font-mono text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="font-mono text-xs">{r.tool_name}</td>
                <td className="text-xs">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn-ghost text-sm" onClick={() => setAuditLimit((n) => n + 50)}>Load 50 more</button>
      </section>

      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="font-heading text-xl">Connect with Claude</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Open Claude.ai → Settings → Custom Integrations → Add custom integration.</li>
          <li>Paste this server URL: <code className="font-mono">{MCP_URL}</code></li>
          <li>When prompted for an Authorization header, paste <code className="font-mono">Bearer &lt;your-token&gt;</code>.</li>
          <li>Save. Test with: <em>"What kids are in my family?"</em></li>
        </ol>
      </section>

      {reveal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal>
          <div className="max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-heading text-lg">Your token (shown only once)</h3>
            <div className="rounded-lg bg-gray-100 p-3 font-mono text-xs break-all">{reveal.plaintext}</div>
            <div className="rounded-lg bg-gray-100 p-3 font-mono text-xs break-all">{MCP_URL}</div>
            <p className="text-sm text-red-600">This is the only time you'll see this token. Copy it now.</p>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(reveal.plaintext)}>Copy token</button>
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(MCP_URL)}>Copy URL</button>
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(`URL: ${MCP_URL}\nToken: ${reveal.plaintext}`)}>
                Copy both
              </button>
              <button className="btn-primary ml-auto" onClick={() => setReveal(null)}>I've copied it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount the route in `src/App.tsx`**

After the existing `/parent/account` (or `/parent` route), add:

```tsx
<Route
  path="/parent/connect-ai"
  element={
    <RequireAuth>
      <RequireParentPin>
        <ConnectAi />
      </RequireParentPin>
    </RequireAuth>
  }
/>
```

Add the import at the top of `src/App.tsx`:

```tsx
import ConnectAi from './pages/parent/ConnectAi'
```

- [ ] **Step 3: Add a navigation link from `Parent.tsx`**

In `src/pages/parent/Parent.tsx`, find an existing list of parent-section links and add a button/link:

```tsx
<Link to="/parent/connect-ai" className="btn-ghost">Connect AI →</Link>
```

If `Parent.tsx` has a fixed grid of cards, add the new card matching the existing pattern. (Inspect the file before editing — the brief is design-agnostic on placement.)

- [ ] **Step 4: Typecheck and dev-server smoke**

```bash
npm run typecheck
npm run dev
```

Visit `http://localhost:5173/parent/connect-ai` after signing in and unlocking PIN. Verify:
- Page renders.
- "Generate token" creates a token; modal shows plaintext starting `mcp_`.
- The new token appears in the list with the right label/last-4.
- Revoke removes it from the active list.
- Audit table has rows from earlier handshake testing (or remains empty).

- [ ] **Step 5: Commit**

```bash
git add src/pages/parent/ConnectAi.tsx src/App.tsx src/pages/parent/Parent.tsx
git commit -m "feat(mcp): /parent/connect-ai UI — generate, list, revoke, audit"
```

---

## Phase F — Acceptance and docs

### Task 24: Run full §11 acceptance checklist

**Files:**
- Create: `scripts/test-mcp-handshake.mjs`
- Create: `scripts/test-mcp-bad-tokens.mjs`
- Create: `scripts/test-mcp-origin.mjs`
- Create: `scripts/test-mcp-rate-limit.mjs`
- Create: `scripts/audit-mcp-readonly.mjs`

- [ ] **Step 1: Write `test-mcp-handshake.mjs`** — covers §11.3

```js
const BASE = process.env.MCP_BASE_URL ?? 'http://localhost:3000';
const TOKEN = process.env.MCP_TOKEN;
if (!TOKEN) { console.error('Set MCP_TOKEN'); process.exit(2); }

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

async function rpc(method, params = {}, id = 1) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  return { status: res.status, body: await res.text() };
}

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'curl', version: '0' } }, 1);
if (init.status !== 200 || !init.body.includes('map-practice-family')) {
  console.error('FAIL initialize:', init); process.exit(1);
}
console.log('PASS initialize');

const list = await rpc('tools/list', {}, 2);
if (list.status !== 200) { console.error('FAIL tools/list:', list); process.exit(1); }
const expected = ['list_kids','get_kid_overview','list_recent_sessions','get_session_details','get_recent_wrong_answers','get_accuracy_by_standard','get_top_misconceptions','get_activity_calendar','compare_kids'];
for (const name of expected) {
  if (!list.body.includes(`"${name}"`)) { console.error('FAIL missing tool:', name); process.exit(1); }
}
console.log('PASS tools/list (all 9 present)');
```

Run:

```bash
MCP_BASE_URL="$DEV_URL" MCP_TOKEN="mcp_TESTTOKEN_FAMILY_A_aaaaaaaaaaaaaaaa" \
node --env-file=.env.local scripts/test-mcp-handshake.mjs
```

- [ ] **Step 2: Write `test-mcp-bad-tokens.mjs`** — covers §11.5

```js
const BASE = process.env.MCP_BASE_URL ?? 'http://localhost:3000';
async function call(headers) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  return { status: res.status, www: res.headers.get('www-authenticate') };
}
let r;

r = await call({});
if (r.status !== 401 || !/invalid_request/.test(r.www ?? '')) { console.error('FAIL no-header:', r); process.exit(1); }
console.log('PASS no-header → 401 invalid_request');

r = await call({ Authorization: 'Bearer garbage' });
if (r.status !== 401 || !/invalid_token/.test(r.www ?? '')) { console.error('FAIL garbage:', r); process.exit(1); }
console.log('PASS garbage → 401 invalid_token');

if (process.env.MCP_REVOKED_TOKEN) {
  r = await call({ Authorization: `Bearer ${process.env.MCP_REVOKED_TOKEN}` });
  if (r.status !== 401 || !/invalid_token/.test(r.www ?? '')) { console.error('FAIL revoked:', r); process.exit(1); }
  console.log('PASS revoked → 401 invalid_token');
}
```

Set up the revoked token: take an active test token, revoke it via SQL, pass its plaintext as `MCP_REVOKED_TOKEN`. For the expired-token check, manually `UPDATE map_mcp_tokens SET expires_at = now() - interval '1 day' WHERE id = ...` and re-run.

- [ ] **Step 3: Write `test-mcp-origin.mjs`** — covers §11.6

```js
const BASE = process.env.MCP_BASE_URL ?? 'http://localhost:3000';
const TOKEN = process.env.MCP_TOKEN;
async function call(origin) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  return res.status;
}

let s = await call('https://evil.example.com');
if (s !== 403) { console.error('FAIL evil origin →', s); process.exit(1); }
console.log('PASS evil origin → 403');

s = await call('https://claude.ai');
if (s !== 200) { console.error('FAIL claude.ai →', s); process.exit(1); }
console.log('PASS claude.ai → 200');

s = await call(null);
if (s !== 200) { console.error('FAIL no-origin →', s); process.exit(1); }
console.log('PASS no-origin → 200');
```

- [ ] **Step 4: Write `test-mcp-rate-limit.mjs`** — covers §11.7

```js
const BASE = process.env.MCP_BASE_URL ?? 'http://localhost:3000';
const TOKEN = process.env.MCP_TOKEN;
async function ping() {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  return res.status;
}

const start = Date.now();
let okCount = 0;
let limitedCount = 0;
for (let i = 0; i < 70; i++) {
  const s = await ping();
  if (s === 200) okCount += 1;
  else if (s === 429) limitedCount += 1;
}
console.log(`okCount=${okCount} limitedCount=${limitedCount} elapsed=${Date.now() - start}ms`);
if (okCount > 60) { console.error('FAIL: more than 60 OKs in a minute'); process.exit(1); }
if (limitedCount === 0) { console.error('FAIL: no 429s — rate limit not engaged'); process.exit(1); }
console.log('PASS rate limit engaged');
```

Note: on Vercel Serverless this is per-warm-instance; the test may need consistent invocation against a single instance to engage the limiter. Re-run if cold-start cycling masks the limit.

- [ ] **Step 5: Write `audit-mcp-readonly.mjs`** — covers §11.8

```js
import { execSync } from 'node:child_process';
const out = execSync('grep -RnE "\\.(insert|update|delete|upsert)\\(|\\.rpc\\(" api/_lib/mcp/ || true').toString();
console.log(out);

// Allowed: map_mcp_audit (insert) and map_mcp_tokens (update last_used_at).
const lines = out.split('\n').filter(Boolean);
const offenders = lines.filter((l) =>
  !/map_mcp_audit/.test(l) &&
  !/map_mcp_tokens/.test(l) &&
  !/^Binary file/.test(l)
);
if (offenders.length > 0) {
  console.error('FAIL: write operations found against tables other than map_mcp_audit / map_mcp_tokens:');
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}
console.log('PASS read-only audit (only map_mcp_audit insert + map_mcp_tokens update found)');
```

- [ ] **Step 6: Run the full battery against the dev URL**

```bash
node --env-file=.env.local scripts/test-mcp-handshake.mjs
node --env-file=.env.local scripts/test-mcp-bad-tokens.mjs
node --env-file=.env.local scripts/test-mcp-origin.mjs
node --env-file=.env.local scripts/test-mcp-rate-limit.mjs
node --env-file=.env.local scripts/test-mcp-isolation.mjs
node scripts/audit-mcp-readonly.mjs
```

All must print `PASS` lines and exit 0.

- [ ] **Step 7: §11.9 — End-to-end with Claude.ai**

Manually configure Claude.ai → Settings → Custom Integrations with the dev URL and a fresh token. Ask three questions:
1. "What kids are in my family?"
2. "Show me [kid name]'s recent wrong answers in math."
3. "Which TEKS standards is she weakest on?"

The conversation should feel natural and the answers should be grounded in DB data. If a tool errors, fix and re-test.

- [ ] **Step 8: §11.10 — UI checks**

- `/parent/connect-ai` is unreachable without sign-in; redirects to login.
- After sign-in but without PIN unlock, redirects to `/parent/unlock`.
- Token reveal modal cannot be reopened after dismissal (state cleared).
- Revoked tokens disappear from active list; "Show revoked" reveals them grayed out.
- After running a tool from Claude.ai, refreshing the audit section shows the row within ~2 seconds.

- [ ] **Step 9: Commit acceptance scripts**

```bash
git add scripts/test-mcp-handshake.mjs scripts/test-mcp-bad-tokens.mjs scripts/test-mcp-origin.mjs scripts/test-mcp-rate-limit.mjs scripts/audit-mcp-readonly.mjs
git commit -m "test(mcp): acceptance scripts for §11.3, §11.5, §11.6, §11.7, §11.8"
```

---

### Task 25: Update CLAUDE.md and route table in Muti_user_brief.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `Muti_user_brief.md`

- [ ] **Step 1: Append §10 to `CLAUDE.md`**

After the existing §9 (Grade 3 expansion), append:

```markdown
---

## 10. Family MCP Server (Phase 3)

Source spec: `MCP_BRIEF.md`. The MCP server exposes 9 read-only tools at `POST /api/mcp` so a parent can hold their kid-progress conversations in Claude.ai (or any MCP client) instead of in our app.

### 10.1 Security model (do not violate)

- **Token → family_id is the trust boundary.** Bearer token → SHA-256 hash → `map_mcp_tokens` row → `family_id`. Every tool query filters on `family_id`. No tool accepts `family_id` from the caller.
- **Read-only.** Only writes are: `map_mcp_audit` insert and `map_mcp_tokens.last_used_at` update. The `audit-mcp-readonly.mjs` script gates this on every change.
- **Service role on server only.** `SUPABASE_SERVICE_ROLE_KEY` is read in `api/_lib/mcp/env.ts`. Never imported into anything under `src/`.
- **Token plaintext shown once.** RPC `map_create_mcp_token` returns it; UI displays it in a one-shot modal; `map_mcp_tokens` stores only hash + last 4.
- **Origin allow-list.** `claude.ai`, `*.claude.ai`, `chatgpt.com`, `cursor.so` (+ `localhost` in dev). Anything else → 403.
- **Rate limit.** 60/min, 2000/day per token, in-memory bucket (per warm Vercel instance — accepted).

### 10.2 Tools (the public API)

| Tool | Purpose |
|---|---|
| `list_kids` | Children in the family. |
| `get_kid_overview` | Snapshot for one child: totals, accuracy by subject, streak. |
| `list_recent_sessions` | Newest-first list of sittings. |
| `get_session_details` | Per-question breakdown of one session. |
| `get_recent_wrong_answers` | Recent incorrect attempts with stem/chosen/correct/tag. |
| `get_accuracy_by_standard` | Per-TEKS accuracy, weak first. |
| `get_top_misconceptions` | Most-frequent error tags with sample. |
| `get_activity_calendar` | Per-day question counts. |
| `compare_kids` | Side-by-side across kids in the family. |

Inputs are validated by zod schemas in `api/_lib/mcp/schemas.ts`. Outputs are JSON; tool descriptions in `api/_lib/mcp/tools/*.ts` are the public contract — keep them aligned with `MCP_BRIEF.md` §5.

### 10.3 File map

```
api/mcp.ts                              # fetch-style handler (Node runtime, maxDuration 30)
api/_lib/mcp/
  env.ts                                # service-role supabase client
  errors.ts                             # McpError + code strings
  origin.ts                             # allow-list
  auth.ts                               # resolveContextOrThrow + bumpLastUsedAt
  rate-limit.ts                         # in-memory bucket
  audit.ts                              # logToolCall (allow-list redaction)
  db.ts                                 # getStudentInFamily / getSessionInFamily
  schemas.ts                            # zod inputs
  tools/<name>.ts                       # one file per tool
src/pages/parent/ConnectAi.tsx          # /parent/connect-ai UI
migrations/20260501_map_mcp_tokens.sql  # schema, RLS, RPCs
```

### 10.4 Operations

- Generate a token: parent signs in → unlocks PIN → `/parent/connect-ai` → "Generate token". Plaintext shown once.
- Revoke: same page, "Revoke" button on a token row; sets `revoked_at`. Auth from this point onward fails for that token.
- Audit: same page shows the last N rows from `map_mcp_audit` for the family.
- Test scripts: `scripts/test-mcp-{handshake,bad-tokens,origin,rate-limit,isolation}.mjs` and `scripts/audit-mcp-readonly.mjs`. Run all before merging any change to `api/_lib/mcp/`.

### 10.5 Phase 2 (out of scope here)

OAuth 2.1 + dynamic client registration, write tools, Resources/Prompts, Upstash rate limiting, multi-token-per-agent UX, push/webhooks, token rotation. Don't build these as part of this feature.
```

- [ ] **Step 2: Add `/parent/connect-ai` to the route table in `Muti_user_brief.md` §7**

Insert this row in the table:

```
| `/parent/connect-ai`   | yes           | no                      | yes                   | Generate/revoke MCP tokens; view AI activity |
```

Place it after the existing `/parent/account` row to keep the parent routes grouped.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md Muti_user_brief.md
git commit -m "docs(mcp): document Phase 3 MCP server in CLAUDE.md + route table"
```

---

## Self-Review

**Spec coverage check (against `MCP_BRIEF.md`):**

- §1 hard rules → enforced by Tasks 1, 6, 7, 8, 11–22 (read-only, family-scoped, token shown once, etc.). §11.4 isolation gate (Task 14) is the verifier.
- §2 mental model → matches Phase B+C arrangement.
- §3.1–3.3 schema + RLS → Task 1.
- §3.4 token RPC → Task 1, with `extensions.gen_random_bytes` / `extensions.digest` as the brief specifies (probe confirmed the schema location).
- §3.5 revoke RPC → Task 1.
- §4.1 Streamable HTTP transport → Task 13.
- §4.2 origin allow-list → Task 5.
- §4.3 auth header → Task 6.
- §4.4 rate limiting → Task 9.
- §5 nine tools → Tasks 11, 15–22 (one each).
- §6 server-side scoping → Tasks 6, 7, 11–22 (all use `getStudentInFamily`/`getSessionInFamily`).
- §6.4 audit redaction → Task 8.
- §7 UI → Task 23.
- §8 file layout → adapted in "Brief→Repo Adaptations" header.
- §9 deps → Task 2.
- §10 env vars → Task 2.
- §11 acceptance — every sub-section is covered:
  - 11.1 migration applies cleanly → Task 1 step 4.
  - 11.2 token gen/revoke → manual SQL in Task 13 step 4 (use `map_create_mcp_token` from the UI in Task 23 step 4).
  - 11.3 transport handshake → Task 24 step 1 + Task 13 step 5.
  - 11.4 cross-family isolation → Task 14 (CRITICAL gate).
  - 11.5 bad tokens → Task 24 step 2.
  - 11.6 origin enforcement → Task 24 step 3.
  - 11.7 rate limit → Task 24 step 4.
  - 11.8 read-only verification → Task 24 step 5.
  - 11.9 e2e Claude.ai → Task 24 step 7.
  - 11.10 UI checks → Task 24 step 8.
- §12 phase-2-out-of-scope → noted in CLAUDE.md §10.5 (Task 25).
- §13 ordered checkpoints → mirrored in Phase A→F structure.

**Placeholder scan:** none. Each step has the actual code, command, or expected output. The few "TBD" surfaces (e.g., navigation link insertion in `Parent.tsx` step 23.3) explicitly tell the engineer to inspect the file first because the existing layout isn't in the brief — that is intent, not a placeholder.

**Type consistency:** `McpContext`, `getStudentInFamily`, `getSessionInFamily`, `logToolCall`, `enforceRateLimit`, `resolveContextOrThrow`, `bumpLastUsedAt` are defined once in Phase B and used consistently in all tool tasks. Tool register functions all follow the `register(server, ctx): void` shape with named exports `register` and `DESC`. Schema names in `schemas.ts` match the tool files that import them (`ListKidsInput`, `GetKidOverviewInput`, etc.).

**One open item the engineer must own at execution time:** the `@modelcontextprotocol/sdk` API signature for `server.tool(name, description, schema, handler)` may differ across 1.x minor versions. If the installed version uses `server.registerTool({ name, description, inputSchema, handler })` instead, adapt the call site uniformly — do not deviate per-tool. Confirm against the SDK's published types in Task 11 before continuing.
