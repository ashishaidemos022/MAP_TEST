# Parent Area Redesign — Foundation Slice (Phase 5, Cycle 1)

**Date:** 2026-05-17
**Status:** Approved design, pre-plan
**Source brief:** Parent Area Redesign — Classroom + Library + Tests + AI Studio (Phase 5) — V1
**Scope decision:** Foundation-first. This cycle delivers only the data layer + lib wrappers, ending at the brief's §9.6 cross-family isolation gate. All UI surfaces (Classroom, Kid detail, Library, Tests, builder, kid-home panel) are a separate later cycle and are explicitly out of scope here.

---

## 1. Why this slice exists

The source brief restructures the parent area into four surfaces and introduces a load-bearing data model (test definitions + assignments). The brief's own §11 orders the work data-layer-first, and §9.6 (cross-family assignment isolation) is a hard "do not ship if it fails" gate that must pass before any UI is built.

This spec covers exactly that foundation: schema, RLS, views, RPCs, a run-once backfill, the `parent_v2` flag column, the `src/lib/parent` read/write layer, and the verification scripts — culminating in the §9.6 isolation gate. Nothing renders to a screen in this cycle.

## 2. Stack reality (the brief assumes a different stack)

The brief is written for Next.js App Router with `supabase/migrations/` auto-apply. This repo is **Vite + React Router v6 SPA**; migrations live in `migrations/` and are applied via the Supabase MCP `apply_migration` tool per `CLAUDE.md` §6. This slice has no UI, so the only stack adaptation that matters here is:

- Migration file: `migrations/20260517_map_parent_area_redesign.sql`, applied via `apply_migration` with migration name `map_parent_area_redesign`. Single transaction, idempotent, re-runnable.
- Lib layer: `src/lib/parent/{types,queries,mutations}.ts`, following existing conventions in `src/lib/customTest.ts` and `src/lib/customQuestionLoader.ts` (anon supabase client from `src/lib/supabase.ts`).
- Verification: standalone `.mjs` scripts in `scripts/`, run with `node --env-file=.env.local scripts/<name>.mjs`, modeled on `scripts/test-mcp-isolation.mjs`.

Supabase project ref: `klhzfwxpztaojekwgzcg` (current local/dev; cut over from `mnrseaapxpofdznnqrsv` 2026-04-28).

## 3. Schema reconciliation (live DB vs. brief §3)

Verified against the live DB on 2026-05-17. The brief's SQL diverges from reality in these confirmed ways; the migration must use the live shapes:

| Brief assumes | Live reality | Resolution |
|---|---|---|
| `map_test_sessions.is_custom` | column is `kind text`, values `'test' \| 'custom'` (CHECK allows `'boost'` too) | Backfill keys off `kind = 'custom'` |
| `map_test_sessions.score / questions_correct / questions_attempted` | only `correct_count smallint`, `question_ids uuid[]`, `estimated_rit smallint` | View computes `questions_correct = correct_count`, `questions_attempted = array_length(question_ids,1)`, `score = round(100.0*correct_count/nullif(array_length(question_ids,1),0))` |
| `map_test_sessions.family_id` | absent | All family scoping on sessions flows through `map_students.family_id` |
| `map_students.soft_deleted_at` | absent | Drop the `WHERE s.soft_deleted_at IS NULL` filter in `map_v_classroom_roster`; students have no soft delete in this schema |
| `map_students.current_band_override` | absent | Source band via `LEFT JOIN map_v_student_current_band` |
| `owner_user_id REFERENCES auth.users` | `map_custom_questions.owner_user_id` is the proven sibling pattern | Mirror that table's `owner_user_id` column definition (nullable uuid, same FK target + `ON DELETE SET NULL`) exactly for both `owner_user_id` and `assigned_by_user_id` |
| backfill `JOIN ... ON ts.created_at = td.created_at` | fragile timestamp-equality join | Replace with a single CTE keyed by **session id** |

Confirmed present and usable as-is: `map_families`, `map_students` (`id, display_name, grade, family_id, school_grade, default_test_length, avatar_emoji`), `map_test_sessions` (cols above plus `subject, status, started_at, completed_at, kind, planned_length, grade, custom_config jsonb`), `map_custom_questions` (`family_id, owner_user_id, current_version_id, source, status, soft_deleted_at`), `map_custom_passages`, `map_custom_question_versions`, `map_custom_passage_versions`, `map_misconception_signals`, views `map_v_mastery_by_standard` and `map_v_student_current_band`, function `map_current_family_id()`. Existing custom sessions: 5 rows, `kind='custom'`, each with a `custom_config` jsonb containing `standard_ids` (uuid[]), `requested_count`, `actual_count`, `shortfall_reason`. Existing custom-question sources observed: `parent_ai_generated` only (the library view's source split still works generally).

**Verification-block prerequisite:** the migration's leading validation block must confirm the exact column names of `map_custom_question_versions` / `map_custom_passage_versions` (expected `subject`, `grade`, `standard_code`) and the value domain of `map_v_mastery_by_standard.status` (expected `mastered`/`developing`/`growth`) and `map_misconception_signals` (expected `active boolean`, `occurrence_count int`) before the dependent views/roster subqueries are created. If any differ, the migration aborts with a clear `RAISE EXCEPTION` rather than creating a view that errors at query time.

## 4. Migration contents — `map_parent_area_redesign`

Single transaction. Order:

1. **Pre-flight validation block** (`DO $$ ... $$`): assert the dependency columns/enums from §3 exist with expected names; `RAISE EXCEPTION` on mismatch.
2. **`CREATE TYPE map_assignment_status`** — `assigned | in_progress | completed | expired | revoked` (idempotent via `DO $$ ... EXCEPTION WHEN duplicate_object`).
3. **`map_test_definitions`** — brief §3.1 columns and CHECK constraints verbatim, except `owner_user_id` mirrors `map_custom_questions.owner_user_id`. Indexes per brief.
4. **`map_test_assignments`** — brief §3.2 columns, the status-coherence CHECK verbatim, `assigned_by_user_id` mirrors the sibling pattern, `session_id REFERENCES map_test_sessions(id) ON DELETE SET NULL`. Indexes per brief.
5. **RLS** — `ENABLE ROW LEVEL SECURITY` on both; SELECT/INSERT/UPDATE policies scoped by `family_id = public.map_current_family_id()`, definitions also filtered `soft_deleted_at IS NULL` on SELECT. No DELETE policy (soft-delete only). Pattern copied from the live `map_custom_questions` policies.
6. **Three views** (§5).
7. **Four RPCs** (§6).
8. **`ALTER TABLE map_families ADD COLUMN parent_v2 boolean NOT NULL DEFAULT false`** (idempotent: `ADD COLUMN IF NOT EXISTS`).
9. **Backfill** (§7).
10. **Trailing validation comments** — `SELECT` counts that confirm 5 custom sessions → 5 definition+assignment pairs (run as part of the post-apply verification script, documented as SQL comments in the migration).

Idempotency: all `CREATE` use `IF NOT EXISTS` / `OR REPLACE`; the enum and policies use guarded `DO` blocks; the backfill skips sessions that already have an assignment.

## 5. Views

**`map_v_classroom_roster`** — one row per kid (no soft-delete filter; students aren't soft-deleted in this schema). Same metric columns as brief §3.4 (`questions_this_week`, `active_days_this_week`, `standards_mastered/developing/growth`, `active_misconceptions`, `pending_assignments`, `last_session`) with these reconciliations:
- `current_band` comes from `LEFT JOIN public.map_v_student_current_band b ON b.student_id = s.id` (replaces `s.current_band_override`).
- `last_session` JSON is built from `ts.id, ts.subject, ts.completed_at, ts.correct_count, array_length(ts.question_ids,1) AS attempted` and a computed `score`; no `ts.score` reference.
- `active_misconceptions` uses `map_misconception_signals` with the column names confirmed by the §3 pre-flight (`active = true AND occurrence_count >= 3`).

**`map_v_assignment_overview`** — denormalized `assignment ⋈ definition ⋈ student ⋈ (optional) session`. Session result columns are computed: `ts.correct_count AS questions_correct`, `array_length(ts.question_ids,1) AS questions_attempted`, `round(100.0*ts.correct_count/nullif(array_length(ts.question_ids,1),0)) AS score`, `ts.estimated_rit`. Joins `map_students` for name/grade (also the family-scoping path, since sessions carry no `family_id`). Keeps `td.soft_deleted_at IS NULL`; no `s.soft_deleted_at` filter.

**`map_v_library_content`** — brief §3.4 verbatim in structure: vetted (`map_questions ⋈ map_standards`, `family_id NULL`) `UNION ALL` custom questions (split `parent_ai_generated → ai_studio` else `my_questions`) `UNION ALL` custom passages (same split). Column names on the version tables are the ones confirmed by the §3 pre-flight. RLS on the underlying custom tables provides family isolation; vetted rows are universally visible.

## 6. RPCs

All `SECURITY DEFINER`, `SET search_path = ''`, fully schema-qualified, `GRANT EXECUTE ... TO authenticated`. Signatures exactly per brief §3.5.

- **`map_create_test_definition(...)` → uuid** — inserts a definition with `family_id = public.map_current_family_id()`; returns the new id. Rejects (`RAISE EXCEPTION`) if `map_current_family_id()` is null.
- **`map_assign_test_definition(p_definition_id, p_student_ids, p_due_by, p_parent_note) → uuid[]`** — verifies the definition belongs to the caller's family AND every `p_student_ids` element is a `map_students` row in that same family; on any mismatch raises `not your kid` and creates **zero** rows (validate-all-before-insert). Returns the array of created assignment ids, all `status='assigned'`.
- **`map_revoke_assignment(p_assignment_id) → void`** — only when the assignment is in the caller's family AND `status='assigned'`; otherwise raises `not found, not yours, or not revocable`. Sets `status='revoked'`.
- **`map_start_assignment(p_assignment_id, p_session_id) → void`** — flips an `assigned` assignment to `in_progress`, sets `session_id`, `started_at=now()`. Family-checked. (Wiring this into the kid-side session-creation path is a UI-cycle task; the RPC ships now so the contract is testable.)

## 7. Backfill (faithful, per approved decision)

Run-once, inside the migration, idempotent. For each `map_test_sessions ts` where `ts.kind='custom'` and no `map_test_assignments` row already references `ts.id`:

1. Resolve the family: `family_id` of `map_students` where `id = ts.student_id`.
2. Create one `map_test_definitions` row:
   - `name = 'Backfilled · ' || to_char(ts.started_at, 'Mon DD, YYYY')`
   - `subject = ts.subject`, `grade = ts.grade` (fallback to the student's `grade` if `ts.grade` null)
   - `planned_length = coalesce(ts.planned_length, array_length(ts.question_ids,1), 25)`
   - `source_mix = 'vetted_only'` (accurate: the legacy `customTest.ts` path only ever drew from `map_questions`, never custom content), `custom_pct = NULL`
   - `standard_codes` = the TEKS codes resolved from `ts.custom_config->'standard_ids'` (cast jsonb array → uuid[], join `map_standards` on id → `teks_code`); empty array if `custom_config` or `standard_ids` absent
   - `is_template = false`, `owner_user_id = NULL`, timestamps from `ts.started_at`
3. Create one `map_test_assignments` row linking that definition to `ts.student_id` and `ts.id`, `assigned_by_user_id = NULL`, `assigned_at = ts.started_at`, status derived: `completed` if `ts.completed_at IS NOT NULL`, else `in_progress` if `ts.started_at IS NOT NULL`, else `assigned`; `started_at`/`completed_at` copied from the session (and nulled where the coherence CHECK requires — note: a backfilled `completed` row must satisfy the CHECK, so `session_id`/`started_at`/`completed_at` are all set together).

The linkage is keyed by `ts.id` throughout (one CTE per session), never by `created_at`.

Post-apply assertion (in the verification script): `count(map_test_sessions WHERE kind='custom')` equals the number of assignments whose `definition_id` points at a definition with `owner_user_id IS NULL AND name LIKE 'Backfilled · %'`, and per-`(student_id, standard)` `map_v_mastery_by_standard` rows are unchanged before/after (mastery is derived from `map_attempts`, which the backfill never touches — the assertion is a guardrail, not an expected risk).

## 8. Lib layer — `src/lib/parent/`

- **`types.ts`** — TS interfaces mirroring the three views' columns and the `map_assignment_status` union; mirrors the typing style of `src/lib/types.ts`.
- **`queries.ts`** — typed `select` helpers over `map_v_classroom_roster`, `map_v_assignment_overview`, `map_v_library_content`, plus `getParentV2(familyId): Promise<boolean>` reading `map_families.parent_v2`. Uses the anon client from `src/lib/supabase.ts`, matching `customQuestionLoader.ts`.
- **`mutations.ts`** — thin `supabase.rpc(...)` wrappers for the four RPCs, typed inputs/outputs, error surfaced verbatim. No business logic beyond argument shaping.

No React, no routing, no components in this slice.

## 9. Verification gate

Scripts in `scripts/`, modeled on `scripts/test-mcp-isolation.mjs`:

- **`scripts/test-parent-redesign-isolation.mjs`** (the §9.6 gate, show-stopper): two families A and B, two kids each. Asserts (a) family A can create+assign to A's kids (2 rows); (b) family A assigning with a family-B `student_id` raises `not your kid` and creates zero rows in either family; (c) family B `SELECT` over `map_test_assignments` returns only B's rows; (d) family B revoking an A-owned assignment raises and mutates nothing. Any success-where-failure-expected → script exits non-zero.
- **`scripts/test-parent-redesign-foundation.mjs`**: §9.1 (apply migration twice, both COMMIT clean, constraints present), §9.2 (RPC round-trip incl. the in_progress→revoke rejection), §9.3 (each view returns expected shape and never cross-family rows), §9.9 (5 custom sessions → 5 definition+assignment pairs; per-student `map_v_mastery_by_standard` unchanged).

**Exit condition for this cycle:** `test-parent-redesign-isolation.mjs` exits 0 and `test-parent-redesign-foundation.mjs` exits 0. The UI cycle's spec is not started until both pass.

## 10. Explicitly out of scope (deferred to the UI cycle)

Classroom, Kid detail, Library tabs, Tests tabs, the 4-step builder, `KidPicker` and all `components/parent/*`, the `/parent` route-shape switch behind `parent_v2`, the kid-home "Assigned tests" panel, wiring `map_start_assignment` into the live session-creation flow, route redirects/301s, the `CLAUDE.md` §-append (lands with the UI cycle so it documents the shipped surfaces). The `parent_v2` column and `getParentV2()` ship now but gate nothing yet.

## 11. Risks / open assumptions

- **Auth context for RLS.** RPCs/RLS depend on `map_current_family_id()` resolving to the caller's family. Mitigation: mirror the live `map_custom_questions` policies/RPC auth exactly — it has identical family-scoping needs and is already in production, so whatever auth context it relies on is the context we inherit. The isolation script exercises this end-to-end.
- **`map_custom_question_versions` column names** are assumed (`subject`, `grade`, `standard_code`); the migration's pre-flight block fails loudly if wrong rather than shipping a broken view.
- **Backfilled `completed` rows and the coherence CHECK.** The CHECK requires `completed ⇒ session_id+started_at+completed_at all set`. Legacy custom sessions that are completed always have all three, but the backfill explicitly sets them together and the foundation script asserts zero CHECK violations post-apply.
