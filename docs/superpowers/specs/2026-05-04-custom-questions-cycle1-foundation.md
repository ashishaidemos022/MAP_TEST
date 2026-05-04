# Custom Question Bank — Cycle 1 (Foundation + AI Write Loop)

**Source brief:** `Custom_Questions_Brief.md` (1443 lines, 17 ordered checkpoints in §14).

**Cycle 1 covers checkpoints 1-10:** schema migration, RPCs, polymorphic attempt column, SVG sanitizer, validators, MCP write tools. Cycle 2 (kid-side test runner + renderer) and Cycle 3 (parent UI) ship separately.

**Status:** Approved 2026-05-04. The brief itself is the design spec; this doc captures only the brief→repo adaptations and the PR-level decomposition.

---

## Brief→Repo adaptations (locked decisions)

The brief was written against a hypothetical Next.js + Phase-1/2 multi-tenant setup. Our repo diverges in known ways. These are deliberate and not "fixes."

| Brief assumes | Actual repo | Notes |
|---|---|---|
| `map_test_attempts` | `map_attempts` | Probed 2026-05-04. Throughout migrations, RPCs, polymorphic column, the sanitizer, and the MCP tools, use `map_attempts`. |
| `app/api/mcp/route.ts` (Next.js App Router) | `api/mcp.ts` (Vite + serverless function, fetch-style) | Same pattern as Phase 3 MCP work. |
| `lib/mcp/...`, `lib/svg/...`, `lib/custom-questions/...` | `api/_lib/mcp/...`, `api/_lib/svg/...`, `api/_lib/custom/...` | Underscore prefix prevents Vercel from routing these as endpoints, matching existing MCP work. |
| `supabase/migrations/2026xxxx_*.sql` | `migrations/20260504_*.sql` | Existing repo convention. Each migration is a single transaction. |
| Auth context lives on the Supabase JS client; RLS uses `auth.uid()` directly | The MCP path uses service role + explicit `family_id` filter (Phase 3 pattern). The UI path (later cycles) uses an authed Supabase client where `auth.uid()` works. | Both paths funnel through the same RPCs, but the service-role path relies on the helpers `getCustomQuestionInFamily` etc. to enforce family scope before touching SQL — RLS does not protect us when service role is in use. |
| `map_current_family_id()` returns the calling user's family | Same — already exists, was probed 2026-05-04 (returns null under service role, as expected). | The brief's `SECURITY DEFINER` RPCs depend on this. They will work for UI calls; for MCP calls we cannot use them — the MCP path bypasses RPCs and writes directly via service role with explicit `family_id` resolved from the bearer token. |
| RPC names: `map_create_custom_passage` etc. | Same. | These are usable from authed UI callers. MCP tools do NOT call these — see next row. |

**Critical adaptation — RPCs vs MCP path:**

The brief says all five RPCs are `SECURITY DEFINER` with `auth.uid()` checks. That works for the UI path (Cycle 3). For the **MCP path** we must NOT use these RPCs because the MCP server runs under service role with no `auth.uid()`. Instead, the MCP tools call a parallel set of functions in `api/_lib/custom/db.ts` that take an explicit `family_id` argument resolved from the bearer token — same pattern as `getStudentInFamily` in the existing Phase 3 MCP code.

Both paths land in the same tables. The schema and the trigger constraints in §4.7 are the single source of truth for invariants — they fire regardless of who's writing.

---

## Out of scope for Cycle 1

These are real parts of the brief but ship in later cycles. Do not implement here.

- **§4.13 server capability advertisement** — depends on the `initialize` response of the MCP server. We'll wire the `instructions` field in PR-1C alongside the write tools, but the per-tool description text is composed at tool-registration time, which lives in PR-1C.
- **§7 routes and UI** — entire Cycle 3 scope. No `/parent/questions` or `/parent/passages` work.
- **§7.4 test builder change** — Cycle 2.
- **§7.6 kid-side renderer** — Cycle 2.
- **§8 read-tool integration** — Cycle 4. No `include_custom` flag on the existing 8 read tools yet.
- **AI helper buttons** (§7.2/7.3) — explicitly deferred.
- **Community submission flow** — schema accommodates it (`community_submitted_at` column); no flow.

---

## PR-level decomposition

### PR-1A — Migration + RPCs + sanitizer + tests

**Files:**
- `migrations/20260504_map_custom_questions_and_passages.sql` — single transaction, all of §4.1-§4.10.
- `migrations/20260504_map_attempts_polymorphic.sql` — §4.8 ALTER TABLE on `map_attempts`.
- `api/_lib/svg/sanitize.ts` — sanitizer module per §4.12. Uses `isomorphic-dompurify` + `@xmldom/xmldom`.
- `api/_lib/svg/sanitize.test.mjs` — exhaustive corpus from §12.10a + canonicalization test §12.10c.
- `package.json` — add `isomorphic-dompurify` and `@xmldom/xmldom`.

**Acceptance gates (must pass before commit):**
- §12.1 migration applies cleanly twice (idempotent re-apply).
- §12.2 subject-shape invariants enforced (six sub-cases).
- §12.3 choice-shape invariants enforced (six sub-cases).
- §12.4 RPC round-trips work (UI path — service-role tests insert auth context manually OR test via SQL with synthetic family).
- §12.10a sanitizer rejects each of the 12 listed malicious/malformed SVGs with the right reason. Accepts the valid one.
- §12.10c canonicalization is idempotent (sanitize twice = same bytes).

### PR-1B — Validators + MCP helpers

**Files:**
- `api/_lib/custom/validation.ts` — shared validators between MCP and (future) UI:
  - `validatePassageInput`, `validateQuestionInput`, `validateChoicesArray`
  - `validateAllOrNoneChoiceSvg` (the §12.10d cross-field rule)
  - `validateAltTextRequiredWithSvg`
- `api/_lib/mcp/schemas.ts` — extend with zod schemas importing from validation.ts:
  - `ListCustomQuestionsInput`, `GetCustomQuestionInput`
  - `ListCustomPassagesInput`, `GetCustomPassageInput`
  - `CreateCustomQuestionsInput`, `CreateCustomPassageAndQuestionsInput`
  - `UpdateCustomQuestionInput`, `UpdateCustomPassageInput`
  - `BulkUpgradePassageReferencesInput`
  - `PublishCustomQuestionInput`, `PublishCustomPassageInput`
- `api/_lib/custom/db.ts` — service-role helpers:
  - `getCustomQuestionInFamily(qid, family_id)` → throws `question_not_in_family` per Phase 3 pattern
  - `getCustomPassageInFamily(pid, family_id)`
  - `getCustomPassageVersionInFamily(pvid, family_id)`
  - `enforceWriteQuota(family_id, kind, count)` per Amendment B — in-memory bucket per Phase 3 quota implementation; quota windows from env vars.
- `api/_lib/svg/capability-blurb.ts` — short text composed into each write tool's `description` per §5.0.

**No tests beyond TypeScript compilation + the validation rules being exercised by PR-1C tests.** This is internal plumbing.

### PR-1C — 10 MCP write tools wired in

**Files (one per tool):**
- `api/_lib/mcp/tools/list-custom-questions.ts`
- `api/_lib/mcp/tools/get-custom-question.ts`
- `api/_lib/mcp/tools/list-custom-passages.ts`
- `api/_lib/mcp/tools/get-custom-passage.ts`
- `api/_lib/mcp/tools/create-custom-questions.ts`
- `api/_lib/mcp/tools/create-custom-passage-and-questions.ts`
- `api/_lib/mcp/tools/update-custom-question.ts`
- `api/_lib/mcp/tools/update-custom-passage.ts`
- `api/_lib/mcp/tools/bulk-upgrade-passage-references.ts`
- `api/_lib/mcp/tools/publish-custom-question.ts`
- `api/_lib/mcp/tools/publish-custom-passage.ts`

Plus wiring into `api/mcp.ts` `tools/list` registry, and the `serverInfo.instructions` text per §4.13.

**Each write tool calls `sanitizeSvg()` on every SVG field** before any DB write. Rejection from the sanitizer surfaces verbatim.

**Acceptance gates:**
- §12.5 cross-family write isolation — TWO families, the full attack surface (list, get, update, publish, bulk-upgrade, create with cross-family passage_id). Hard gate; do not ship if any step succeeds or mutates.
- §12.6 draft-by-default — both create tools always return `status='draft'`, source `parent_ai_generated`, created_via `mcp`. No override path.
- §12.10 read-only verification — grep `api/_lib/mcp/tools/` for any mutation outside the allowed table list.
- §12.10a end-to-end SVG rejection — each malicious SVG submitted via `create_custom_passage_and_questions` is rejected with the right reason.
- §12.10d mixed-choice rejection — 2 of 4 choices with SVG is rejected before any DB write; all 4 with SVG succeeds.
- §12.7 quotas — passage and question quotas enforced independently with env-var-driven low limits. Composite tool counts against both. `bulk_upgrade_passage_references` is atomic — if it would breach the question_update quota, no questions are upgraded.
- §12.8 versioning preserves attempt history — synthetic attempts pre-dating a revision still resolve to the old version (PR-1A schema enforces this; PR-1C just verifies).

---

## Schema decisions left ambiguous in the brief

**Q1: Soft-delete cascade on passages.** The brief in §4.9 says "A passage cannot be soft-deleted if any non-archived question references any of its versions." We'll enforce this with a BEFORE UPDATE trigger on `map_custom_passages`. Reject with `RAISE EXCEPTION 'passage in use by % non-archived question(s)'`.

**Q2: `map_custom_questions_resolved` view RLS.** Views inherit RLS from underlying tables. The view does not need its own policy — it filters via the WHERE clause on `q.soft_deleted_at IS NULL` and the underlying tables' policies handle family scoping.

**Q3: SVG storage encoding.** `bytea` column stores raw UTF-8 SVG bytes — not gzipped. Postgres TOAST handles compression transparently. The MCP tool decodes from base64 input and stores the canonicalized output bytes; the kid-renderer (Cycle 2) reads bytes and base64-encodes them into a data URL.

**Q4: `auth.users` FK on `owner_user_id`.** Brief says `REFERENCES auth.users(id)`. We have Supabase Auth — this works as-is. For MCP-created content, we may not have a logged-in user; the bearer token is the principal. Solution: derive `owner_user_id` from the family's primary parent user (a dedicated lookup helper in `db.ts`) when MCP creates content. If we can't resolve a user, leave it null — the column is nullable.

**Q5: Quota window timezone.** Brief says "midnight in the family's timezone (fall back to UTC)." We don't have a timezone column on `map_families` today. Cycle 1 uses UTC for all quotas; add timezone support in a later cycle. Document this in the spec.

---

## Dependencies the brief assumes exist

Confirmed present (probed 2026-05-04):
- `map_families` ✓ (6 rows)
- `map_students` ✓
- `map_current_family_id()` function ✓ (returns the caller's family_id, or null when no auth context)
- MCP server at `api/mcp.ts` ✓ (Phase 3)
- `map_mcp_tokens` token table ✓
- `map_mcp_audit` audit table ✓
- `map_misconception_tags` taxonomy table ✓ (115+ rows after recent seeding)
- `map_attempts` attempts table ✓ (the brief calls this `map_test_attempts` — locked adaptation above)

---

## Risk / open questions

- **Sanitizer correctness is load-bearing.** Every malicious-SVG attack relies on the sanitizer catching it. PR-1A is the time to be paranoid. Use `isomorphic-dompurify` for the heavy lifting and add our own post-pass for the constraints DOMPurify doesn't enforce (node count, depth, viewBox presence/range, font allowlist). All 12 §12.10a corpus items must reject before merging.
- **The brief's RPC signatures take `bytea` for SVG.** Calling RPCs from supabase-js with bytea works, but we have to send hex-prefixed `\x...` strings, not base64. The MCP path bypasses RPCs entirely, so this only matters for the (Cycle 3) UI path.
- **`map_attempts` column add will lock the table briefly.** The attempts table will be small in dev/single-user prod, so the lock is effectively zero-impact. Document this if it ever matters at scale.
- **Service role + explicit family_id is the trust boundary for all MCP writes.** Any mistake in resolving family_id from the token = catastrophic cross-family contamination. The Phase 3 isolation test (`test-mcp-isolation.mjs`) exists; PR-1C's §12.5 test extends the same pattern to writes.
