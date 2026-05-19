# Custom-test detail in MCP read tools — Design

**Date:** 2026-05-19
**Status:** Approved (design)

## Problem

When a child takes a custom test (parent/AI-authored bank questions — whether
bank-assigned or ad-hoc composed), each answer is stored in `map_attempts`
with `question_id = NULL` and `custom_question_version_id` set to a real
versioned custom question. The MCP read tools only join the vetted
`map_questions` / `map_question_choices` tables, so:

- **`get_session_details`** returns rows with empty `stem`, `chosen_text`,
  `correct_text`, `standard_code`, and `misconception_tag` — only
  `is_correct` and `time_ms` are populated. (Reproduced live for student
  "Kabir", session `ab6da9ab-0536-425d-a89a-2664fa66a163`, a 10-question
  custom math test — all 10 attempts came back empty except correctness/time.)
- **`get_recent_wrong_answers`** uses an INNER join (`map_questions!inner`),
  so custom wrong answers are silently dropped from the result entirely. This
  is the tool the MCP description calls "the most useful single tool."
- **`list_recent_sessions`** and the `get_session_details` session header
  expose no `kind` or bank name, so an agent cannot tell which sessions are
  custom or which bank they came from without opening each one.

No data is lost — the child's chosen choice, correctness, timing, the
question, and the misconception tag are all present in the custom tables.
The tools simply don't look there.

## Goal

`get_session_details` and `get_recent_wrong_answers` return full
question-level detail for custom tests, in a shape **byte-identical** to
vetted tests. The agent can also discover which sessions are custom and from
which bank via `list_recent_sessions` and the session header.

## Scope

**In scope:** `get_session_details`, `get_recent_wrong_answers`,
`list_recent_sessions`, `get_session_details` session header.

**Out of scope:** the aggregate tools `get_accuracy_by_standard` and
`get_top_misconceptions`. Custom questions key off a free-text
`standard_code`, not the TEKS `standard_id` those roll-ups use; folding them
in needs separate design care and is deferred to a follow-up.

## Architecture

### New module — `api/_lib/mcp/custom-attempt-resolver.ts`

Single responsibility: turn a list of raw `map_attempts` rows into the
uniform per-attempt output shape, transparently resolving each row from
either question source.

Exported function:

```ts
resolveAttempts(ctx: McpContext, attempts: RawAttemptRow[]): Promise<ResolvedAttempt[]>
```

`RawAttemptRow` carries: `question_id | null`,
`custom_question_version_id | null`, `selected_choice_id | null`,
`is_correct`, `time_spent_ms`, and a stable key to align output with input
order. `subject` is **derived by the resolver** from the resolved question
(`map_questions.subject` for vetted, `map_custom_question_versions.subject`
for custom) — not passed in — so it is correct per-question even in
`get_recent_wrong_answers`, which spans multiple sessions.

`ResolvedAttempt` is exactly the shape both tools already emit:

```ts
{
  question_id: string | null,   // for custom rows: the custom_question_version_id
  standard_code: string,
  stem: string,                 // sliced to 500 chars, as today
  chosen_label: string | null,
  chosen_text: string,
  correct_label: string,
  correct_text: string,
  is_correct: boolean,
  time_ms: number,
  misconception_tag: string | null,
  subject: string,              // derived from the resolved question; used by get_recent_wrong_answers post-filter
}
```

No new per-attempt fields. The output shape is unchanged from today's vetted
output, satisfying "match vetted shape exactly." For custom rows
`question_id` carries the `custom_question_version_id` — a stable uuid
identifying the question the child saw. This was explicitly approved; the
caveat is that this id points at a custom-question version, not a
`map_questions` row.

### Internal flow

1. Partition rows: `vetted` (`question_id` non-null) vs `custom`
   (`custom_question_version_id` non-null).
2. **Vetted branch:** the existing batched lookups against `map_questions`,
   `map_question_choices`, `map_standards`. Logic moves into the module
   unchanged.
3. **Custom branch:**
   - Fetch `map_custom_question_versions` by id: `stem`, `standard_code`,
     `question_id` (parent custom-question id).
   - **Family scope (security):** filter to `ctx.family_id` by joining the
     parent `map_custom_questions.family_id`. Any version whose parent is in
     another family — or soft-deleted — is excluded.
   - Fetch `map_custom_question_choices` by `version_id`: `label`, `text`,
     `is_correct`, `misconception_tag`.
   - Chosen choice via `selected_choice_id`; correct choice via `is_correct`.
4. Emit `ResolvedAttempt` per row, aligned to input order.

### Security — family scoping (CLAUDE.md §10.1 / §10.4)

The MCP server uses the service-role client, which bypasses RLS. The resolver
**must** explicitly filter custom versions to `ctx.family_id` via the parent
`map_custom_questions.family_id`. This is the single security-critical path
and lives only in this module. `get_session_details` already verifies the
session is in-family via `getSessionInFamily`; the resolver adds
defense-in-depth and is the *primary* boundary for `get_recent_wrong_answers`,
which queries attempts across sessions. The change is strictly read-only —
`scripts/audit-mcp-readonly.mjs` must stay green.

### Discoverability

- `list_recent_sessions`: add `kind` (`'test' | 'custom'`) and `bank_name`
  (`string | null`) to each session object.
- `get_session_details` session header: add the same two fields.
- `bank_name` resolution: link `session.id` → its bank assignment → bank
  name. `null` when the session is an ad-hoc custom test with no bank;
  `kind` is still `'custom'` in that case. A shared helper
  (`getSessionBankName` in `api/_lib/mcp/db.ts`, batched for the list tool)
  owns this lookup, family-scoped.

### `get_recent_wrong_answers` restructure

Remove the `map_questions!inner(...)` embedded select. Select plain attempt
columns plus both question references, filter `is_correct = false`, then
resolve via `resolveAttempts`. The `subject` filter moves from an SQL join
predicate (`.eq('map_questions.subject', subject)`) to a post-resolution
filter on `ResolvedAttempt.subject` (the session carries subject, so this is
exact, not lossy). Passage body and correct-answer enrichment that the tool
adds today is preserved for vetted rows; custom rows have no passage.

### Error handling

A single attempt that cannot be resolved (custom version deleted, or —
defense-in-depth — parent question in another family) yields a
`ResolvedAttempt` with empty `stem`/text fields but `is_correct` and
`time_ms` preserved. The resolver never throws for one bad row and never
emits cross-family content.

## Testing (gate before merge — CLAUDE.md §10.5)

- All `scripts/test-mcp-*.mjs` and `scripts/audit-mcp-readonly.mjs` pass.
- New assertion: a custom-session fixture where `get_session_details`
  returns populated `stem`/`chosen_text`/`correct_text` for custom attempts,
  and `get_recent_wrong_answers` includes a custom wrong answer.
- `scripts/test-mcp-isolation.mjs` extended: a second family's token cannot
  read this family's custom question content through either tool.
- Live manual check: re-pull Kabir's session
  `ab6da9ab-0536-425d-a89a-2664fa66a163` → full per-question detail;
  confirm his 2026-05-19 custom misses now appear in
  `get_recent_wrong_answers`.

## Out of scope / follow-ups

- `get_accuracy_by_standard`, `get_top_misconceptions` for custom attempts
  (free-text `standard_code` roll-up design).
- Surfacing custom-only signal (author `explanation_wrong`/`question_focus`)
  — deliberately excluded to keep the output shape identical.
