# Custom-test detail in MCP read tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `get_session_details` and `get_recent_wrong_answers` return full question-level detail for custom (bank-assigned and ad-hoc) tests in a shape identical to vetted tests, and let an agent see which sessions are custom and from which bank.

**Architecture:** A single new family-scoped module (`custom-attempt-resolver.ts`) turns raw `map_attempts` rows into a uniform per-attempt shape, resolving each row from either the vetted tables (`question_id`) or the custom tables (`custom_question_version_id`). Both session tools call it. A batched `db.ts` helper resolves `kind`/`bank_name` for discoverability.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, supabase-js (service-role client), Node `.mjs` integration test scripts run against a deployed MCP endpoint.

**Reference spec:** `docs/superpowers/specs/2026-05-19-custom-test-mcp-detail-design.md`

**Codebase facts (verified, do not re-derive):**
- `map_attempts` columns: `id, session_id, student_id, question_id, selected_choice_id, is_correct, time_spent_ms, answered_at, custom_question_version_id`. Custom attempts have `question_id = NULL` and `custom_question_version_id` set.
- `map_custom_question_versions`: `id, question_id (parent), version_number, subject, grade, stem, standard_code, ...`.
- `map_custom_question_choices`: `id, version_id, ordinal, label, text, is_correct, misconception_tag, ...` (note column is `text`, not `body`).
- `map_custom_questions`: `id, family_id, status, soft_deleted_at` (parent; family boundary).
- `map_bank_assignments`: `id, family_id, bank_id, student_id, status, session_id`.
- `map_question_banks`: `id, family_id, name, soft_deleted_at`.
- `map_test_sessions` has a `kind` column (`'test' | 'custom'`).
- The MCP service-role client bypasses RLS — custom queries MUST filter `ctx.family_id` explicitly.
- Test harness: `scripts/test-mcp-*.mjs` POST JSON-RPC to `${MCP_BASE_URL}/api/mcp` with `Authorization: Bearer <token>`; env from `.env.local`. Run with `node --env-file=.env.local scripts/<name>.mjs`. There is no unit-test runner; `npm run typecheck` + `npm run build` is the fast gate.
- Live verification target: student "Kabir" `454af0ee-e695-4746-b8b6-c60025e6f9c3`, custom session `ab6da9ab-0536-425d-a89a-2664fa66a163` (10 custom math attempts).

---

### Task 1: Failing acceptance test script

**Files:**
- Create: `scripts/test-mcp-custom-detail.mjs`

- [ ] **Step 1: Write the acceptance test script**

```javascript
// Acceptance: custom-test detail in MCP read tools.
// Run: node --env-file=.env.local scripts/test-mcp-custom-detail.mjs
// Required env: MCP_BASE_URL, MCP_TOKEN (a family token whose family owns a
//   completed custom session), MCP_CUSTOM_SESSION (a kind='custom' session_id
//   in that family), MCP_CUSTOM_STUDENT (the student_id of that session).
// Optional: MCP_BYPASS (Vercel protection bypass header).

const BASE = process.env.MCP_BASE_URL;
const TOKEN = process.env.MCP_TOKEN;
const SESSION = process.env.MCP_CUSTOM_SESSION;
const STUDENT = process.env.MCP_CUSTOM_STUDENT;
const BYPASS = process.env.MCP_BYPASS;
if (!BASE || !TOKEN || !SESSION || !STUDENT) {
  console.error('Missing env: MCP_BASE_URL, MCP_TOKEN, MCP_CUSTOM_SESSION, MCP_CUSTOM_STUDENT');
  process.exit(2);
}

let nextId = 0;
async function rpc(method, params) {
  const id = ++nextId;
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}
function payload(r) { return JSON.parse(r.json?.result?.content?.[0]?.text ?? '{}'); }
function assert(cond, label) {
  if (!cond) { console.error('FAIL:', label); process.exit(1); }
  console.log('PASS:', label);
}

// 1. get_session_details on a custom session returns populated detail.
const sd = await rpc('tools/call', { name: 'get_session_details', arguments: { session_id: SESSION } });
assert(sd.status === 200, 'get_session_details HTTP 200');
const sdp = payload(sd);
assert(sdp.session?.kind === 'custom', 'session header kind === custom');
assert('bank_name' in (sdp.session ?? {}), 'session header has bank_name field');
assert(Array.isArray(sdp.attempts) && sdp.attempts.length > 0, 'attempts present');
const filled = sdp.attempts.filter((a) => a.stem && a.correct_text);
assert(filled.length === sdp.attempts.length, 'every custom attempt has stem + correct_text');
const anyChosen = sdp.attempts.some((a) => a.chosen_text);
assert(anyChosen, 'at least one attempt has chosen_text');

// 2. get_recent_wrong_answers includes the custom session's wrong answers.
const wa = await rpc('tools/call', {
  name: 'get_recent_wrong_answers',
  arguments: { student_id: STUDENT, since_days: 365, limit: 50 },
});
assert(wa.status === 200, 'get_recent_wrong_answers HTTP 200');
const wap = payload(wa);
const wrongInSession = (sdp.attempts ?? []).filter((a) => !a.is_correct).length;
assert(wrongInSession > 0, 'the custom session has >=1 wrong answer to find');
assert(
  (wap.wrong_answers ?? []).some((w) => w.stem && w.correct_text),
  'wrong_answers includes at least one fully-populated custom miss',
);

// 3. list_recent_sessions tags the custom session.
const ls = await rpc('tools/call', {
  name: 'list_recent_sessions',
  arguments: { student_id: STUDENT, limit: 50 },
});
assert(ls.status === 200, 'list_recent_sessions HTTP 200');
const row = (payload(ls).sessions ?? []).find((s) => s.session_id === SESSION);
assert(row, 'custom session appears in list_recent_sessions');
assert(row.kind === 'custom', 'list_recent_sessions row kind === custom');
assert('bank_name' in row, 'list_recent_sessions row has bank_name field');

console.log('ALL PASS');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --env-file=.env.local scripts/test-mcp-custom-detail.mjs`
Expected: `FAIL: session header kind === custom` (current code emits no `kind`), proving the gap.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-mcp-custom-detail.mjs
git commit -m "test(mcp): failing acceptance for custom-test detail"
```

---

### Task 2: Shared custom-attempt resolver module

**Files:**
- Create: `api/_lib/mcp/custom-attempt-resolver.ts`

- [ ] **Step 1: Write the resolver module**

```typescript
import type { McpContext } from './auth.js';

/** One raw map_attempts row plus the session subject fallback. */
export type RawAttemptRow = {
  /** stable key to align output with input order (use attempt id or array index as string) */
  key: string;
  question_id: string | null;
  custom_question_version_id: string | null;
  selected_choice_id: string | null;
  is_correct: boolean | null;
  time_spent_ms: number | null;
};

/** Uniform superset shape. Each tool projects the subset it emits. */
export type ResolvedAttempt = {
  key: string;
  question_id: string | null; // custom rows: the custom_question_version_id
  subject: string;
  standard_code: string;
  stem: string;
  passage_id: string | null; // vetted reading only; null for custom
  chosen_label: string | null;
  chosen_text: string;
  correct_label: string;
  correct_text: string;
  is_correct: boolean;
  time_ms: number | null;
  misconception_tag: string | null;
};

const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

function emptyResolved(r: RawAttemptRow): ResolvedAttempt {
  return {
    key: r.key,
    question_id: r.question_id ?? r.custom_question_version_id ?? null,
    subject: '',
    standard_code: '',
    stem: '',
    passage_id: null,
    chosen_label: null,
    chosen_text: '',
    correct_label: '',
    correct_text: '',
    is_correct: r.is_correct === true,
    time_ms: r.time_spent_ms,
    misconception_tag: null,
  };
}

/**
 * Resolve a batch of attempts from whichever question source each row uses.
 * Custom rows are family-scoped via map_custom_questions.family_id — the
 * service-role client bypasses RLS, so this filter is the security boundary.
 * Never throws for a single unresolved row; never emits cross-family content.
 */
export async function resolveAttempts(
  ctx: McpContext,
  rows: RawAttemptRow[],
): Promise<ResolvedAttempt[]> {
  const vetted = rows.filter((r) => r.question_id);
  const custom = rows.filter((r) => !r.question_id && r.custom_question_version_id);

  const byKey = new Map<string, ResolvedAttempt>();
  for (const r of rows) byKey.set(r.key, emptyResolved(r));

  // ---- Vetted branch ----
  if (vetted.length) {
    const qIds = [...new Set(vetted.map((r) => r.question_id as string))];
    const [{ data: questions }, { data: choices }, { data: standards }] = await Promise.all([
      ctx.supabase.from('map_questions').select('id, subject, stem, standard_id, passage_id').in('id', qIds),
      ctx.supabase.from('map_question_choices').select('id, question_id, label, body, is_correct, misconception_tag').in('question_id', qIds),
      ctx.supabase.from('map_standards').select('id, teks_code'),
    ]);
    const qById = new Map((questions ?? []).map((q) => [q.id, q]));
    const stdById = new Map((standards ?? []).map((s) => [s.id, s.teks_code]));
    type C = { id: string; question_id: string; label: string; body: string; is_correct: boolean; misconception_tag: string | null };
    const byQ = new Map<string, C[]>();
    for (const c of (choices ?? []) as C[]) {
      if (!byQ.has(c.question_id)) byQ.set(c.question_id, []);
      byQ.get(c.question_id)!.push(c);
    }
    const chosenById = new Map<string, C>();
    for (const list of byQ.values()) for (const c of list) chosenById.set(c.id, c);

    for (const r of vetted) {
      const q = qById.get(r.question_id as string);
      if (!q) continue; // leave empty row
      const chosen = r.selected_choice_id ? chosenById.get(r.selected_choice_id) : undefined;
      const correct = (byQ.get(r.question_id as string) ?? []).find((c) => c.is_correct);
      byKey.set(r.key, {
        key: r.key,
        question_id: r.question_id,
        subject: q.subject ?? '',
        standard_code: q.standard_id ? stdById.get(q.standard_id) ?? '' : '',
        stem: (q.stem ?? '').slice(0, 500),
        passage_id: q.passage_id ?? null,
        chosen_label: chosen?.label ?? null,
        chosen_text: chosen?.body ?? '',
        correct_label: correct?.label ?? '',
        correct_text: correct?.body ?? '',
        is_correct: r.is_correct === true,
        time_ms: r.time_spent_ms,
        misconception_tag: chosen && !chosen.is_correct ? chosen.misconception_tag ?? null : null,
      });
    }
  }

  // ---- Custom branch (family-scoped) ----
  if (custom.length) {
    const vIds = [...new Set(custom.map((r) => r.custom_question_version_id as string))];
    // Versions joined to parent map_custom_questions for the family filter.
    const { data: versions } = await ctx.supabase
      .from('map_custom_question_versions')
      .select('id, subject, stem, standard_code, map_custom_questions!inner(family_id, soft_deleted_at)')
      .in('id', vIds)
      .eq('map_custom_questions.family_id', ctx.family_id);
    type V = {
      id: string; subject: string | null; stem: string | null; standard_code: string | null;
      map_custom_questions: { family_id: string; soft_deleted_at: string | null } | { family_id: string; soft_deleted_at: string | null }[];
    };
    const okVersions = (versions ?? []).filter((v) => {
      const j = (v as V).map_custom_questions;
      const p = Array.isArray(j) ? j[0] : j;
      return p && p.family_id === ctx.family_id && p.soft_deleted_at === null;
    }) as V[];
    const inFamilyVIds = new Set(okVersions.map((v) => v.id));
    const vById = new Map(okVersions.map((v) => [v.id, v]));

    const { data: cChoices } = await ctx.supabase
      .from('map_custom_question_choices')
      .select('id, version_id, label, text, is_correct, misconception_tag')
      .in('version_id', inFamilyVIds.size ? [...inFamilyVIds] : [PLACEHOLDER]);
    type CC = { id: string; version_id: string; label: string; text: string; is_correct: boolean; misconception_tag: string | null };
    const ccByV = new Map<string, CC[]>();
    for (const c of (cChoices ?? []) as CC[]) {
      if (!ccByV.has(c.version_id)) ccByV.set(c.version_id, []);
      ccByV.get(c.version_id)!.push(c);
    }
    const ccById = new Map<string, CC>();
    for (const list of ccByV.values()) for (const c of list) ccById.set(c.id, c);

    for (const r of custom) {
      const vId = r.custom_question_version_id as string;
      const v = vById.get(vId);
      if (!v || !inFamilyVIds.has(vId)) continue; // not in family / deleted → leave empty row
      const chosen = r.selected_choice_id ? ccById.get(r.selected_choice_id) : undefined;
      const correct = (ccByV.get(vId) ?? []).find((c) => c.is_correct);
      byKey.set(r.key, {
        key: r.key,
        question_id: vId,
        subject: v.subject ?? '',
        standard_code: v.standard_code ?? '',
        stem: (v.stem ?? '').slice(0, 500),
        passage_id: null,
        chosen_label: chosen?.label ?? null,
        chosen_text: chosen?.text ?? '',
        correct_label: correct?.label ?? '',
        correct_text: correct?.text ?? '',
        is_correct: r.is_correct === true,
        time_ms: r.time_spent_ms,
        misconception_tag: chosen && !chosen.is_correct ? chosen.misconception_tag ?? null : null,
      });
    }
  }

  return rows.map((r) => byKey.get(r.key)!);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add api/_lib/mcp/custom-attempt-resolver.ts
git commit -m "feat(mcp): family-scoped vetted/custom attempt resolver"
```

---

### Task 3: Add `kind` + `bank_name` helper to db.ts

**Files:**
- Modify: `api/_lib/mcp/db.ts` (add `kind` to `SessionRow` + its select; add `getSessionBankNames`)

- [ ] **Step 1: Add `kind` to `SessionRow` and `getSessionInFamily`**

In `api/_lib/mcp/db.ts`, add `kind: string;` to the `SessionRow` type (after `subject: string;`). In `getSessionInFamily`, add `kind` to the `.select(...)` string (after `subject,`) and add `kind: data.kind,` to the returned object.

- [ ] **Step 2: Add the batched bank-name helper**

Append to `api/_lib/mcp/db.ts`:

```typescript
/**
 * For a set of session ids, return session_id -> bank_name for those that are
 * a bank assignment in THIS family. Family-scoped (service-role bypasses RLS).
 * Sessions with no bank assignment are simply absent from the map.
 */
export async function getSessionBankNames(
  ctx: McpContext,
  sessionIds: string[],
): Promise<Map<string, string>> {
  assertFamilyIdPresent(ctx);
  const result = new Map<string, string>();
  if (!sessionIds.length) return result;
  const { data, error } = await ctx.supabase
    .from('map_bank_assignments')
    .select('session_id, family_id, map_question_banks!inner(name)')
    .in('session_id', sessionIds)
    .eq('family_id', ctx.family_id);
  if (error) throw new McpError('internal', error.message, 500);
  for (const row of (data ?? []) as Array<{
    session_id: string | null;
    map_question_banks: { name: string } | { name: string }[];
  }>) {
    if (!row.session_id) continue;
    const b = Array.isArray(row.map_question_banks) ? row.map_question_banks[0] : row.map_question_banks;
    if (b?.name) result.set(row.session_id, b.name);
  }
  return result;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/mcp/db.ts
git commit -m "feat(mcp): SessionRow.kind + getSessionBankNames helper"
```

---

### Task 4: Rewire `get_session_details`

**Files:**
- Modify: `api/_lib/mcp/tools/get-session-details.ts` (full body of the handler)

- [ ] **Step 1: Replace the handler body**

Replace lines 16–74 of `api/_lib/mcp/tools/get-session-details.ts` (everything from `const { data: attempts, error } = ...` through the `return { content: ... }` of the success path) with:

```typescript
      const { data: attempts, error } = await ctx.supabase
        .from('map_attempts')
        .select('id, question_id, custom_question_version_id, selected_choice_id, is_correct, time_spent_ms, answered_at')
        .eq('session_id', session.id)
        .order('answered_at', { ascending: true });
      if (error) throw new Error(error.message);

      const raw = (attempts ?? []).map((a) => ({
        key: a.id as string,
        question_id: a.question_id as string | null,
        custom_question_version_id: a.custom_question_version_id as string | null,
        selected_choice_id: a.selected_choice_id as string | null,
        is_correct: a.is_correct as boolean | null,
        time_spent_ms: a.time_spent_ms as number | null,
      }));
      const resolved = await resolveAttempts(ctx, raw);
      const bankNames = await getSessionBankNames(ctx, [session.id]);

      const out = {
        session: {
          session_id: session.id,
          student_id: session.student_id,
          subject: session.subject,
          kind: session.kind,
          bank_name: bankNames.get(session.id) ?? null,
          started_at: session.started_at,
          completed_at: session.completed_at,
        },
        attempts: resolved.map((a) => ({
          question_id: a.question_id,
          standard_code: a.standard_code,
          stem: a.stem,
          chosen_label: a.chosen_label,
          chosen_text: a.chosen_text,
          correct_label: a.correct_label,
          correct_text: a.correct_text,
          is_correct: a.is_correct,
          time_ms: a.time_ms,
          misconception_tag: a.misconception_tag,
        })),
      };

      await logToolCall({ ctx, toolName: 'get_session_details', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
```

- [ ] **Step 2: Fix imports**

At the top of the file, replace the unused-after-rewrite imports. The final import block must be:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getSessionInFamily, getSessionBankNames } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetSessionDetailsInput } from '../schemas.js';
import { resolveAttempts } from '../custom-attempt-resolver.js';
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS (the pre-existing chunk-size warning is unrelated).

- [ ] **Step 4: Commit**

```bash
git add api/_lib/mcp/tools/get-session-details.ts
git commit -m "feat(mcp): get_session_details resolves custom attempts + kind/bank_name"
```

---

### Task 5: Rewire `get_recent_wrong_answers` (drop the inner join)

**Files:**
- Modify: `api/_lib/mcp/tools/get-recent-wrong-answers.ts` (full handler body)

- [ ] **Step 1: Replace the handler body**

Replace lines 15–86 of `api/_lib/mcp/tools/get-recent-wrong-answers.ts` (from `const since = ...` through the success-path `return`) with:

```typescript
      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();

      const { data: rows, error } = await ctx.supabase
        .from('map_attempts')
        .select('id, answered_at, question_id, custom_question_version_id, selected_choice_id, time_spent_ms, is_correct')
        .eq('student_id', args.student_id)
        .eq('is_correct', false)
        .gte('answered_at', since)
        .order('answered_at', { ascending: false })
        .limit(args.limit);
      if (error) throw new Error(error.message);

      const attempts = (rows ?? []) as Array<{
        id: string;
        answered_at: string;
        question_id: string | null;
        custom_question_version_id: string | null;
        selected_choice_id: string | null;
        time_spent_ms: number | null;
        is_correct: boolean | null;
      }>;
      if (attempts.length === 0) {
        await logToolCall({ ctx, toolName: 'get_recent_wrong_answers', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ wrong_answers: [] }) }] };
      }

      const answeredAtByKey = new Map(attempts.map((a) => [a.id, a.answered_at]));
      const resolved = await resolveAttempts(
        ctx,
        attempts.map((a) => ({
          key: a.id,
          question_id: a.question_id,
          custom_question_version_id: a.custom_question_version_id,
          selected_choice_id: a.selected_choice_id,
          is_correct: a.is_correct,
          time_spent_ms: a.time_spent_ms,
        })),
      );

      // subject filter moved from the (removed) SQL inner join to here.
      const filtered = args.subject
        ? resolved.filter((r) => r.subject === args.subject)
        : resolved;

      // Passage excerpts: vetted reading rows only.
      const passageIds = [...new Set(filtered.map((r) => r.passage_id).filter((x): x is string => !!x))];
      const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
      const { data: passages } = await ctx.supabase
        .from('map_reading_passages')
        .select('id, body')
        .in('id', passageIds.length ? passageIds : [PLACEHOLDER]);
      const passageById = new Map((passages ?? []).map((p) => [p.id, p.body as string]));

      const out = {
        wrong_answers: filtered.map((r) => ({
          attempted_at: answeredAtByKey.get(r.key) ?? '',
          question_id: r.question_id,
          subject: r.subject,
          standard_code: r.standard_code,
          stem: r.stem,
          chosen_text: r.chosen_text,
          correct_text: r.correct_text,
          misconception_tag: r.misconception_tag,
          passage_excerpt: r.passage_id ? (passageById.get(r.passage_id) ?? '').slice(0, 300) || null : null,
          time_ms: r.time_ms,
        })),
      };

      await logToolCall({ ctx, toolName: 'get_recent_wrong_answers', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
```

- [ ] **Step 2: Fix imports**

The final import block must be:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetRecentWrongAnswersInput } from '../schemas.js';
import { resolveAttempts } from '../custom-attempt-resolver.js';
```

Keep the existing `await getStudentInFamily(ctx, args.student_id);` line as the first statement in the `try` block (it is the family boundary for this tool — do not remove it).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/mcp/tools/get-recent-wrong-answers.ts
git commit -m "feat(mcp): get_recent_wrong_answers includes custom misses (drop inner join)"
```

---

### Task 6: Add `kind` + `bank_name` to `list_recent_sessions`

**Files:**
- Modify: `api/_lib/mcp/tools/list-recent-sessions.ts`

- [ ] **Step 1: Select `kind` and resolve bank names**

In `api/_lib/mcp/tools/list-recent-sessions.ts`:

1. Change the `.select(...)` on line 18 to include `kind`:

```typescript
        .select('id, subject, kind, started_at, completed_at, question_ids, correct_count')
```

2. Add the import at the top:

```typescript
import { getStudentInFamily, getSessionBankNames } from '../db.js';
```

(replacing the existing `import { getStudentInFamily } from '../db.js';`)

3. After the `median` function definition and before `const out = {`, add:

```typescript
      const bankNames = await getSessionBankNames(ctx, sessionIds);
```

4. In the per-session map, add `kind` and `bank_name` to the returned object (after `subject: s.subject,`):

```typescript
            kind: s.kind,
            bank_name: bankNames.get(s.id) ?? null,
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/mcp/tools/list-recent-sessions.ts
git commit -m "feat(mcp): list_recent_sessions exposes kind + bank_name"
```

---

### Task 7: Extend cross-family isolation test for custom content

**Files:**
- Modify: `scripts/test-mcp-isolation.mjs` (append a custom-content isolation assertion)

- [ ] **Step 1: Append the custom-isolation assertion**

At the end of `scripts/test-mcp-isolation.mjs` (before any final summary log if present, else at EOF), append:

```javascript
// N. Token A asking get_session_details for B's session must NOT leak custom
//    content — it must fail with session_not_in_family (never return attempts).
const bSess = await rpc(TOKEN_A, 'tools/call', {
  name: 'get_session_details',
  arguments: { session_id: SESSION_FROM_B },
});
const bSessText = bSess.json?.result?.content?.[0]?.text ?? bSess.json?.error?.message ?? '';
assert(
  /not found in this family|session_not_in_family/i.test(JSON.stringify(bSess.json)) ||
    !/"attempts":\[\{/.test(bSessText),
  'A cannot read B session detail (no custom/vetted attempts leaked)',
);
```

- [ ] **Step 2: Run the isolation test**

Run: `node --env-file=.env.local scripts/test-mcp-isolation.mjs`
Expected: all lines `PASS`, including `A cannot read B session detail (no custom/vetted attempts leaked)`.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-mcp-isolation.mjs
git commit -m "test(mcp): isolation covers custom session detail leakage"
```

---

### Task 8: Full acceptance + regression gate

**Files:** none (verification only)

- [ ] **Step 1: Run the new acceptance test — must now pass**

Run: `node --env-file=.env.local scripts/test-mcp-custom-detail.mjs`
Expected: `ALL PASS` (every assertion from Task 1 now green).

- [ ] **Step 2: Run the read-only audit**

Run: `node --env-file=.env.local scripts/audit-mcp-readonly.mjs`
Expected: PASS — no new write paths introduced (the change is read-only).

- [ ] **Step 3: Run the rest of the MCP test suite**

Run each and expect all `PASS`:
```bash
node --env-file=.env.local scripts/test-mcp-handshake.mjs
node --env-file=.env.local scripts/test-mcp-bad-tokens.mjs
node --env-file=.env.local scripts/test-mcp-origin.mjs
node --env-file=.env.local scripts/test-mcp-rate-limit.mjs
node --env-file=.env.local scripts/test-mcp-isolation.mjs
```

- [ ] **Step 4: Live manual verification (Kabir)**

Using the MCP connection, call `get_session_details` for session `ab6da9ab-0536-425d-a89a-2664fa66a163`.
Expected: 10 attempts, each with non-empty `stem`, `correct_text`, populated `chosen_text`, `standard_code`, and `misconception_tag` on wrong answers; `session.kind === 'custom'`. Then call `get_recent_wrong_answers` for student `454af0ee-e695-4746-b8b6-c60025e6f9c3` with `since_days: 365` and confirm Kabir's 2026-05-19 custom misses now appear with full text.

- [ ] **Step 5: Final commit (only if Steps 1–4 surfaced fixes)**

If any step required a code fix, commit it with a message describing the fix. Otherwise no commit — the feature is complete and verified.

---

## Self-Review

**Spec coverage:**
- get_session_details custom resolution → Tasks 2, 4 ✅
- get_recent_wrong_answers inner-join fix → Tasks 2, 5 ✅
- list_recent_sessions / session-header kind+bank_name → Tasks 3, 4, 6 ✅
- Shared family-scoped resolver module → Task 2 ✅
- Security: explicit family filter on custom join → Task 2 (custom branch), Task 3 (bank helper) ✅
- Error tolerance (deleted/cross-family version → empty row, no throw) → Task 2 `emptyResolved` + `continue` ✅
- Vetted output shape unchanged → Task 4/5 project the same fields as before ✅
- Testing gate (all test-mcp + audit + isolation + live) → Tasks 1, 7, 8 ✅
- Out of scope (aggregates) → not touched ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output.

**Type consistency:** `RawAttemptRow`/`ResolvedAttempt` defined in Task 2 are consumed with matching field names in Tasks 4 and 5. `resolveAttempts` signature `(ctx, RawAttemptRow[]) => Promise<ResolvedAttempt[]>` used consistently. `getSessionBankNames(ctx, string[]) => Promise<Map<string,string>>` defined Task 3, consumed Tasks 4 and 6. `SessionRow.kind` added Task 3, consumed Task 4. `key` is the attempt `id` everywhere.
