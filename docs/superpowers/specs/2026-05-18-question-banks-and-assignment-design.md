# Question Banks & Assignment — Design Spec

**Date:** 2026-05-18
**Status:** Approved design, pre-plan
**Topic:** Parent/instructor builds an assignable "Bank" from vetted questions (recipe) or hand-authored custom questions (manual + AI), names it, and assigns it to one or more kids.
**Builds on:** `main` (NOT the shelved parent-area-redesign branches #3–#7).

---

## 1. Problem

A parent/instructor needs to:

1. **Vetted lane** — design a custom test from vetted questions (the original builder UX was fine) but (a) be able to **assign it to a kid**, and (b) **name it and save it as a reusable template** assignable later to other students.
2. **Custom lane** (complete overhaul) — create a **named question bank** (e.g. "fractions + coins"), populate it with **manually authored** and/or **AI-generated** questions, and **assign the bank** to a student. A bank holds **5–60** questions. AI questions must land as **draft** and be reviewed/published before they count; manually authored questions are ready immediately.

Today `main` has no definition/assignment model and no composer that builds a kid session from a curated list of custom questions — that is the core gap this spec closes.

## 2. Decisions (locked in brainstorming)

| # | Decision |
|---|---|
| Model | **One assignable "Bank"**, two authoring **lanes** (`vetted` recipe / `custom` curated set). Lanes never blend. |
| Custom lifecycle | **Manual ready immediately** (created published, no review queue). **AI draft → existing review screen → publish**. Bank assignable when **≥5 ready** items. |
| Vetted template | A saved bank is a **recipe** (standards + length + difficulty). Each assignee gets a **freshly composed** set from the recipe (matches the original builder's behavior; no sibling memorization). |
| Custom serving | The bank's ready questions are **frozen as a snapshot at assign time**. That kid takes exactly those, even if the bank changes later. No separate "length" concept. |
| UI home | Build/assign is **overhauled in place on the legacy `/parent` page** (no redesign shell). The **existing AI draft review screen is reused unchanged**; build vs. review stay separate jobs. |
| Architecture | **Approach 3** — re-land the validated Cycle-1 design knowledge, **trimmed**, as fresh migrations on `main`. Do **not** cherry-pick or revive the shelved branches. No `source_mix`/`mixed`/`custom_pct`/`difficulty_mix`. |
| Decomposition | **One spec**, **two phases / two PRs to `main`**: Phase 1 = substrate + vetted lane; Phase 2 = custom-bank lane. |

## 3. Stack & reuse context

Vite + React Router v6 SPA, Supabase Postgres with RLS (`map_current_family_id()` → family from `auth.uid()`), `SECURITY DEFINER SET search_path=''` RPCs. Repo convention: **no React test runner** — verification is a Node data-guard script + `npm run typecheck && npm run build` + a manual-QA checklist.

**Already on `main` (reused, not rebuilt):**
- Multi-tenant + RLS + auth, `map_students`, `map_test_sessions` (`migrations/20260428_map_multi_tenant.sql`)
- `map_custom_questions` + `map_custom_question_versions` + `map_custom_question_choices` (`migrations/20260504_*`), `status ∈ draft|published|archived`, `source ∈ parent_manual|parent_ai_assisted|parent_ai_generated`, `map_publish_custom_question`, `map_record_custom_attempt`, soft-delete RPCs
- `map_questions` (global vetted bank), `map_standards`
- Legacy `src/pages/parent/Parent.tsx` (the page the user is on, flag-off), `CustomTestBuilder.tsx`, `CustomTestList.tsx`, `CustomBank.tsx` (the AI draft review/publish screen — reused unchanged), `src/lib/customTest.ts` (`createCustomTest`, `CUSTOM_MIN_COUNT=5`, `CUSTOM_MAX_COUNT=50`)

**NOT on `main` (built fresh by this spec):** the bank model, the assignment model, the kid-side composer + affordance, the 60-question cap.

**Shelved branches #3–#7 are left untouched.** Normal main-based PRs; no stacked-PR chain; no `parent_v2` flag (this ships to everyone on `main` directly — it overhauls the legacy page in place rather than gating an alternate shell).

## 4. Data model (fresh migrations on `main`, prefix `map_`)

### 4.1 `map_question_banks` — the assignable unit

```
id                uuid pk
family_id         uuid not null → map_families(id)      -- RLS scope
owner_user_id     uuid → auth.users(id) on delete set null
name              text not null            -- 1..120 chars (CHECK)
subject           map_subject not null
grade             int not null             -- 0..12 (CHECK)
lane              text not null            -- CHECK lane IN ('vetted','custom')  ← only discriminator
standard_codes    text[] not null default '{}'   -- vetted lane only (empty for custom)
planned_length    int                      -- vetted lane only; CHECK NULL OR BETWEEN 5 AND 60
difficulty        text                     -- vetted lane only; CHECK NULL OR IN ('easy','medium','hard','any')
soft_deleted_at   timestamptz
created_at        timestamptz not null default now()
updated_at        timestamptz not null default now()
```

Lane-coherence CHECK: `lane='vetted'` ⇒ `planned_length IS NOT NULL`; `lane='custom'` ⇒ `standard_codes = '{}' AND planned_length IS NULL AND difficulty IS NULL`. Every non-soft-deleted bank is reusable — there is no separate `is_template` flag (trimmed; YAGNI).

### 4.2 `map_question_bank_items` — custom lane's curated set

```
id                  uuid pk
bank_id             uuid not null → map_question_banks(id) on delete cascade
custom_question_id  uuid not null → map_custom_questions(id)
sort_order          int not null default 0
created_at          timestamptz not null default now()
unique (bank_id, custom_question_id)
```

Only used when `bank.lane='custom'`. The **≤ 60 items per bank** limit is enforced at the RPC level (`map_create_bank` / `map_set_bank_items`) so the user gets a clear message, with a DB-level safety check as backstop. **"Ready" item** = its `map_custom_questions.status = 'published'` and `soft_deleted_at IS NULL`. Manual questions authored through the bank flow are created **published** (no review queue); AI questions are `draft` until published via the existing review screen, then added.

### 4.3 `map_bank_assignments` — bank × kid, status-tracked

```
id                   uuid pk
family_id            uuid not null → map_families(id)        -- RLS scope
bank_id              uuid not null → map_question_banks(id)
student_id           uuid not null → map_students(id)
assigned_by_user_id  uuid → auth.users(id)
assigned_at          timestamptz not null default now()
due_by               timestamptz                              -- soft signal, never blocks
parent_note          text
status               map_bank_assignment_status not null      -- ENUM assigned|in_progress|completed|revoked
session_id           uuid → map_test_sessions(id)
snapshot_question_ids uuid[]                                   -- custom lane only: frozen ready ids at assign
started_at           timestamptz
completed_at         timestamptz
created_at           timestamptz not null default now()
```

New enum `map_bank_assignment_status AS ENUM ('assigned','in_progress','completed','revoked')` (no `expired` — `due_by` never blocks; YAGNI).

Coherence CHECK (ported shape from validated Cycle-1 `map_ta_session_status_coherent`):
- `assigned`    ⇒ `session_id IS NULL AND started_at IS NULL AND completed_at IS NULL`
- `in_progress` ⇒ `session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NULL`
- `completed`   ⇒ `session_id IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NOT NULL`
- `revoked`     ⇒ `session_id IS NULL`

`snapshot_question_ids` is non-null only for custom-lane assignments (frozen at assign time); null for vetted (recipe re-composes fresh at kid Start).

### 4.4 `map_v_bank_assignment_overview` — read view

`security_invoker = true` view: assignment ⋈ bank ⋈ student ⋈ (optional) session, exposing `assignment_id, bank_id, bank_name, lane, subject, grade, student_id, student_name, status, due_by, parent_note, assigned_at, completed_at, session_id, questions_attempted, questions_correct, score`. Family-scoped (inherits RLS). Drives the parent "Assignments" list.

## 5. RPCs (all `SECURITY DEFINER SET search_path=''`, family-scoped via `map_current_family_id()`, fully-qualified refs)

- `map_create_bank(p_name, p_subject, p_grade, p_lane, p_standard_codes text[], p_planned_length int, p_difficulty text, p_custom_question_ids uuid[]) → uuid`
  - `vetted`: insert bank with recipe fields; `p_custom_question_ids` must be empty.
  - `custom`: insert bank (recipe fields null/empty), then insert `map_question_bank_items` for each `p_custom_question_ids` (≤60, must belong to the family).
- `map_set_bank_items(p_bank_id uuid, p_custom_question_ids uuid[]) → void` — custom lane: replace the bank's item set (≤60, family-owned questions only). Used by "Add manual question" / "Add from AI drafts".
- `map_assign_bank(p_bank_id uuid, p_student_ids uuid[], p_due_by timestamptz, p_parent_note text) → uuid[]`
  - Validates every student is in the bank's family (`raise` otherwise).
  - **custom**: compute ready items (`status='published' AND soft_deleted_at IS NULL`); **require ≥5** (else `raise` with count message); set each new assignment's `snapshot_question_ids` to those ready ids (frozen).
  - **vetted**: no snapshot; just create `assigned` rows.
  - Returns created assignment ids.
- `map_revoke_bank_assignment(p_assignment_id uuid) → void` — only when `status='assigned'`; reject `in_progress|completed` with a clear message; sets `revoked`.
- `map_start_bank_assignment(p_assignment_id uuid, p_session_id uuid) → void` — `assigned → in_progress`, set `session_id`, `started_at=now()`. Does not create the session (the kid composer does, then calls this).

Session completion already updates `map_test_sessions`; a small hook/RPC (`map_complete_bank_assignment` or reuse the session-finish path) flips the linked assignment to `completed` with `completed_at`. Exact wiring decided in the plan, but the contract is: when the linked session finishes, the assignment becomes `completed`.

## 6. Kid-side composition

New helper `src/lib/parent/startAssignedBank.ts` (mirrors the validated Cycle-1 `startAssignedTest` error policy):

- **vetted lane**: resolve `bank.standard_codes` → standard ids (`map_standards` by `teks_code` + `subject` + `grade`), then `createCustomTest({ studentId, subject, standardIds, requestedCount: bank.planned_length, difficulty: bank.difficulty })` → fresh session per assignee. Reuses existing proven path.
- **custom lane**: build a `map_test_sessions` row (`kind='custom'`) directly from `assignment.snapshot_question_ids` (the frozen custom-question ids). **This composer path is new** — see §9 risk.
- Then `map_start_bank_assignment(assignmentId, sessionId)`.
- Error policy (ported, explicit): compose-failure ⇒ do **not** link a session, assignment stays `assigned` (retryable, parent can fix). Link-failure *after* a session exists ⇒ log non-fatal, still return the playable `sessionId`. Snapshot item soft-deleted before Start ⇒ composer skips it; if the playable count drops below `CUSTOM_MIN_COUNT`, the kid sees a friendly "not ready yet" and the assignment self-heals (stays `assigned`). Bounded, documented residual.

`CUSTOM_MAX_COUNT` is lifted 50 → **60** in `src/lib/customTest.ts`; matching DB CHECKs use 5–60. `CUSTOM_MIN_COUNT` stays 5.

## 7. UI surfaces (decision: in place on legacy `/parent`; AI review reused unchanged)

- **`/parent` (legacy `Parent.tsx`, same chrome)** — the custom-test area becomes a **"Tests & Banks"** section: a list of saved banks (name, lane badge, recipe summary or ready-count, actions **Assign** / **Assignments** / soft-delete), plus **"+ New vetted test"** (the original `CustomTestBuilder` UX + a Name field + Save) and **"+ New question bank"** (Phase 2). The mastery dashboard and settings blocks are untouched.
- **Bank detail (custom, Phase 2)** — header (name, subject/grade), readiness meter ("N ready / need ≥5"), per-item ready/draft state, **"+ Add manual question"** (existing question form; created `published` and linked to the bank), **"+ Add from AI drafts"** (lists the family's *published* AI custom questions to link), **"Assign bank"** (≥5 gate).
- **Assign dialog (both lanes)** — multi-select the family's kids, optional `due_by`, optional `parent_note`. Vetted = create recipe assignments; custom = freeze the ready snapshot now.
- **Kid home** — one tiny **additive** "Assigned: <name> — Start" affordance, rebuilt fresh on `main` (NOT the shelved 2d component). Start → `startAssignedBank` → `/test/:sessionId` runner. Rest of kid home unchanged.
- **Reused unchanged:** the existing AI draft **review/publish** screen (today's `CustomBank.tsx`). "Add from AI drafts" only links its *published* output into a bank; the review job stays separate.

## 8. Phasing — one spec, two ships (each its own writing-plans → execution → PR to `main`)

**Phase 1 — Substrate + Vetted lane.** All three tables + enum + view + RPCs + RLS + 5–60 cap; the vetted builder→name→save→list→assign flow on the legacy page; the kid affordance + `startAssignedBank` vetted path; data-guard; manual QA; ships as a normal PR to `main`. Custom-lane columns exist in the schema but custom UI/composer are deferred to Phase 2.

**Phase 2 — Custom-bank lane.** First task is a **spike** confirming the test runner can serve a `map_test_sessions` composed purely of `map_custom_questions` (main already has `map_record_custom_attempt`, so attempts are recordable — the spike confirms composition + rendering end-to-end). Then: name-first authoring, manual-published path, "Add from AI drafts", `map_set_bank_items`, ≥5 gate, the frozen-snapshot custom composer, data-guard, manual QA; ships as a second normal PR to `main`.

## 9. Risks & open assumptions

- **Custom-question session composer (Phase 2 linchpin).** A session built purely from a fixed list of custom-question ids does not exist on `main`. Mitigation: Phase 2's first task is a runner spike before any custom UI is built; if the runner needs changes they are scoped there, not assumed away.
- **Manual-question auto-publish.** The bank's manual path creates questions `published` (no queue). Must not change behavior of the existing standalone manual-create path or the existing AI review screen (AI stays `draft`). The plan isolates the bank path explicitly.
- **Snapshot drift.** Frozen `snapshot_question_ids` can reference a question later soft-deleted; composer skips, self-heals (§6). Documented bounded residual, not silent.
- **No feature flag.** This overhauls the legacy page in place for all families on `main`. Acceptable because it replaces the existing (thin) custom-test area rather than gating an alternate shell; the change replaces content within a page users already use. (If a flag is later wanted, it is out of scope here.)
- **Cross-family isolation is a show-stopper.** Every RPC and the view is family-scoped via `map_current_family_id()`; the per-phase data-guard asserts family B can never see/assign/start family A's bank or assignment.
- **Validated-design reuse, not blind rederivation.** The assignment status machine, coherence CHECK shape, and composer error policy are ported from the reviewed Cycle-1 work; the data-guard re-validates them on `main`.

## 10. Out of scope (documented deferrals)

- Blended banks (vetted + custom in one bank) — lanes never blend by decision.
- `source_mix` / `custom_pct` / `difficulty_mix` weighting — trimmed from the Cycle-1 model.
- Sampling a fixed length from an over-authored custom bank (decision A chose whole-snapshot; the sampling variant can be added later).
- `expired` assignment state / due-date enforcement — `due_by` is a soft display signal only.
- Editing a published custom question in place (existing immutability stands); reviving/merging the shelved redesign branches; any `parent_v2` flag.
- Paired passages, Pattern-D language editing drafts, and other content-authoring shapes — unrelated to assignment.
