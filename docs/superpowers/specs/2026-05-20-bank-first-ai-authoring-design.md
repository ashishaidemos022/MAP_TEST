# Bank-First AI Authoring — Design Spec

**Date:** 2026-05-20
**Status:** Approved design, pre-plan
**Topic:** AI write tools (and the manual New-question/New-passage forms) target a named custom **Bank** at creation time. The AI Studio review surface lists Banks, not a flat pool of items. Same flow for math, reading, and language.
**Builds on:** Question Banks Phase 1+2 already on `main` (`migrations/20260518_map_question_banks.sql`, `migrations/20260519_map_question_banks_custom.sql`) and the MCP write tools landed in the custom-questions cycle (`api/_lib/mcp/tools/create-custom-questions.ts`, `api/_lib/mcp/tools/create-custom-passage-and-questions.ts`).

---

## 1. Problem

Today the MCP write tools drop new questions and passages into a family-wide drafts pool. `/parent/ai-studio` (the `CustomBank.tsx` screen) renders every custom item the family has ever made — drafts, published, archived, attached to a Bank or not. Banks are a *second* step: the parent opens Tests & Banks, creates a Custom Bank, then walks back to the pool to assemble it. After a few authoring sessions the pool becomes unreadable; what's "new and waiting" is indistinguishable from "already filed into a Bank weeks ago."

The desired loop is shorter: AI lands items into a *named Bank* directly. The Bank itself is the review unit. Once everything inside is reviewed/published, the parent assigns the Bank to a kid. Manual authoring follows the same rule so there's one mental model.

## 2. Decisions (locked in brainstorming)

| # | Decision |
|---|---|
| Bank binding | AI tools accept either `bank_id` (resume known bank) or `bank_name` (create-or-find by name within the family, subject, grade). Exactly one is required. |
| Naming convention | AI is instructed (via tool description) to name new banks `{Topic} — {Subject} G{Grade}`. Examples: `Fractions on a number line — Math G3`, `Main idea — Reading G3`, `Commas in compound sentences — Language G3`. Topic uses the parent's phrasing; no kid name; title-case. |
| Collisions | If a same-name custom bank exists for that family but with a *different* subject or grade, the RPC appends `(2)`, `(3)`, … and returns the resolved name. Same-subject-and-grade matches are reused (this is the common case). |
| Manual scope | The parent UI's manual "New question" and "New passage" forms also require a Bank target — combobox of existing banks + "Create new…" option. Same data model as the AI path. |
| Legacy items | Existing orphaned items (custom questions/passages not in any Bank) are not migrated. They surface from a small "Legacy items (N)" link below the Banks list on AI Studio. |
| Review UI | AI Studio's default view becomes a list of Banks (name, subject·grade, item counts, draft/ready split, action button). Drilling into a Bank shows that Bank's items using today's card layout. Per-card Publish stays; "Publish all drafts" gets added at the top of the Bank Review screen. |
| Passages in banks | `map_question_bank_items` gains a nullable `custom_passage_id`. Exactly one of `(custom_question_id, custom_passage_id)` is set per row. Reading Banks hold both passages and the questions about them. |
| Vetted lane | Unchanged. This work is entirely on the custom lane. Vetted Banks remain recipes assigned via the Tests & Banks page. |
| Assignment gate | Unchanged. `map_assign_bank` still requires ≥5 published custom questions in the Bank. Passages don't count toward the threshold. |

## 3. Stack & reuse context

Vite + React Router v6 SPA, Supabase Postgres with RLS via `map_current_family_id()`, `SECURITY DEFINER SET search_path=''` RPCs. MCP server runs on Vercel Functions (Node runtime) via the fetch-bridged handler at `api/mcp.ts`. Repo convention: no React test runner; verification is a Node data-guard script + `npm run typecheck && npm run build` + `scripts/audit-mcp-readonly.mjs` style audit + manual-QA checklist.

**Already on `main` (reused, not rebuilt):**
- `map_question_banks`, `map_question_bank_items`, `map_bank_assignments`, the existing custom-lane RPCs `map_create_bank` / `map_set_bank_items` / `map_assign_bank` (from `migrations/20260518_*` and `20260519_*`).
- Custom-question substrate: `map_custom_questions` + versions + choices, the `status ∈ draft|published|archived` lifecycle, `map_create_custom_question`, `map_publish_custom_question`, soft-delete RPCs (`migrations/20260504_*`).
- MCP tool registration, auth, RLS plumbing, audit logging, SVG validation, write-quota enforcement (`api/_lib/mcp/`).
- Parent UI shell: `ParentArea.tsx` tab nav (Classroom / Tests & Banks / AI Studio), `AiStudio.tsx` router, `CustomBank.tsx` card layout, `NewCustomQuestion.tsx` / `NewCustomPassage.tsx` manual authoring forms, `BankDetail.tsx`.
- `src/lib/banks/mutations.ts` for the existing `createCustomBank` / `setBankItems` / `createManualBankQuestion` paths.

**NOT on `main` (built fresh by this spec):**
- A `create-or-find by (name, subject, grade)` RPC.
- An append-only "add items to bank" RPC (today's `map_set_bank_items` replaces wholesale).
- Bank coverage for passages (`map_question_bank_items.custom_passage_id`).
- `bank_id` / `bank_name` parameters on the two AI write tools and their server-side resolution.
- The Banks-as-default-view on AI Studio and the Bank-scoped Review screen.
- A required Bank target on the manual New-question/New-passage forms.

## 4. Data model (one fresh migration on `main`, prefix `map_`)

### 4.1 `map_question_bank_items` — extend to hold passages

```sql
ALTER TABLE public.map_question_bank_items
  ADD COLUMN custom_passage_id uuid REFERENCES public.map_custom_passages(id) ON DELETE CASCADE,
  ALTER COLUMN custom_question_id DROP NOT NULL,
  ADD CONSTRAINT map_qbi_xor_kind CHECK (
    (custom_question_id IS NOT NULL AND custom_passage_id IS NULL)
    OR
    (custom_question_id IS NULL AND custom_passage_id IS NOT NULL)
  ),
  ADD CONSTRAINT map_qbi_passage_unique UNIQUE (bank_id, custom_passage_id);
```

The existing `UNIQUE (bank_id, custom_question_id)` constraint stays. RLS policies on `map_question_bank_items` already gate by bank ownership; they need no change because the policy uses `bank_id IN (SELECT … FROM map_question_banks WHERE family_id = …)`.

### 4.2 RPC `map_create_or_find_custom_bank(p_name text, p_subject text, p_grade int) RETURNS TABLE(bank_id uuid, name text, was_created boolean)`

Atomic create-or-find for a custom-lane bank. Semantics:

1. Within the caller's `family_id`, look for a non-soft-deleted custom bank where `name = p_name AND subject = p_subject AND grade = p_grade`. If found, return `(id, name, false)`. This is the "reuse" path.
2. If a bank with the same `name` exists but a *different* `subject` or `grade`, find the smallest suffix `(N)` (N ≥ 2) such that `{name} (N)` doesn't collide and create with that name.
3. Otherwise create with `p_name` exactly.
4. The new row is `lane='custom'`, `standard_codes='{}'`, `planned_length=NULL`, `difficulty=NULL` (matches `map_qb_lane_coherent` for the custom branch).

`SECURITY DEFINER SET search_path=''`. Returns the resolved name so the caller knows whether suffixing happened.

### 4.3 RPC `map_add_items_to_bank(p_bank_id uuid, p_question_ids uuid[], p_passage_ids uuid[]) RETURNS void`

Append (idempotent on the `UNIQUE` constraints), not replace. Validates:

- Bank exists, is custom-lane, belongs to caller's family, not soft-deleted.
- Every question/passage id belongs to the same family and is not soft-deleted.
- Combined item count (existing + new) ≤ 60.
- Each id is inserted at `sort_order = (current_max + 1)`, preserving array order within `p_question_ids` then `p_passage_ids`.

Existing `ON CONFLICT … DO NOTHING` semantics on the unique indexes mean re-running with the same ids is a no-op.

### 4.4 RPC update: `map_assign_bank` custom-lane check stays "≥5 published questions"

Passages are skipped — the existing query already joins on `map_custom_questions`. `map_v_bank_items` view needs a small extension to also surface passage items (a `UNION ALL` of the question rows and the passage rows). That view is read-only and only used by the Bank Review screen; it is not in the assignment hot path.

### 4.5 RPC `map_rename_bank(p_bank_id uuid, p_name text) RETURNS void`

Family-scoped rename. Validates the bank belongs to the caller's family, is not soft-deleted, and `length(p_name) BETWEEN 1 AND 120`. If the new name collides with another custom bank in the same family at the same `(subject, grade)`, raise — the UI surfaces the message and the user picks a different name. Updates `updated_at`. `SECURITY DEFINER SET search_path=''`.

### 4.6 View `map_v_custom_bank_overview` — the AI Studio list source

```sql
CREATE VIEW public.map_v_custom_bank_overview
WITH (security_invoker = true) AS
SELECT
  b.id, b.family_id, b.name, b.subject, b.grade, b.created_at, b.updated_at,
  count(i.id) FILTER (WHERE cq.id IS NOT NULL)                  AS question_count,
  count(i.id) FILTER (WHERE cp.id IS NOT NULL)                  AS passage_count,
  count(*)    FILTER (WHERE cq.status = 'draft')                AS draft_question_count,
  count(*)    FILTER (WHERE cq.status = 'published')            AS ready_question_count
FROM public.map_question_banks b
LEFT JOIN public.map_question_bank_items i ON i.bank_id = b.id
LEFT JOIN public.map_custom_questions cq   ON cq.id = i.custom_question_id AND cq.soft_deleted_at IS NULL
LEFT JOIN public.map_custom_passages  cp   ON cp.id = i.custom_passage_id  AND cp.soft_deleted_at IS NULL
WHERE b.lane = 'custom' AND b.soft_deleted_at IS NULL
GROUP BY b.id;
```

`security_invoker = true` inherits caller RLS from `map_question_banks`.

### 4.7 View `map_v_custom_legacy_items` — the Legacy link source

```sql
CREATE VIEW public.map_v_custom_legacy_items
WITH (security_invoker = true) AS
SELECT 'question'::text AS kind, q.id, q.family_id, q.subject, q.grade, q.status, q.created_at
FROM public.map_custom_questions q
WHERE q.soft_deleted_at IS NULL
  AND q.id NOT IN (SELECT custom_question_id FROM public.map_question_bank_items
                    WHERE custom_question_id IS NOT NULL)
UNION ALL
SELECT 'passage'::text AS kind, p.id, p.family_id, p.subject, p.grade, p.status, p.created_at
FROM public.map_custom_passages p
WHERE p.soft_deleted_at IS NULL
  AND p.id NOT IN (SELECT custom_passage_id FROM public.map_question_bank_items
                    WHERE custom_passage_id IS NOT NULL);
```

### 4.8 No data migration

Items already in `map_custom_questions` and `map_custom_passages` without a `map_question_bank_items` row stay exactly where they are. The "Legacy items (N)" link queries `map_v_custom_legacy_items`.

## 5. MCP tool API changes

### 5.1 New input shape (additive; both fields optional, exactly one required)

```ts
// schemas.ts — added to both create_custom_questions and create_custom_passage_and_questions
const BankTarget = z.object({
  bank_id: z.string().uuid().optional(),
  bank_name: z.string().min(1).max(120).optional(),
}).refine(b => Boolean(b.bank_id) !== Boolean(b.bank_name), {
  message: 'Provide exactly one of bank_id or bank_name',
});
```

Merged into the existing inputs:

```ts
export const CreateCustomQuestionsInput = z.object({
  bank_id:   z.string().uuid().optional(),
  bank_name: z.string().min(1).max(120).optional(),
  questions: z.array(QuestionInputSchema).min(1).max(25),
}).strict().refine(/* exactly one of bank_id/bank_name */);

export const CreateCustomPassageAndQuestionsInput = z.object({
  bank_id:   z.string().uuid().optional(),
  bank_name: z.string().min(1).max(120).optional(),
  passage:   PassageInputSchema,
  questions: /* unchanged */,
}).strict().refine(/* exactly one of bank_id/bank_name */);
```

### 5.2 Server-side flow (both write tools)

1. **Subject + grade resolution.** Read from the first question/passage in the call. If a call mixes subjects, return `mixed_subjects_in_call` (caller-side mistake). Single-subject, single-grade per call is the contract.
2. **`bank_id` branch.** Verify the bank exists, is custom-lane, belongs to the caller's family, not soft-deleted, and matches the call's subject + grade. Mismatch → `bank_target_mismatch` with the specific reason.
3. **`bank_name` branch.** Call `map_create_or_find_custom_bank(p_name, p_subject, p_grade)`. Capture `(bank_id, resolved_name, was_created)`.
4. **Create the items** exactly as today (`createPassageInFamily`, `createQuestionInFamily`). Atomicity (refund quota + delete on failure) stays.
5. **Attach to bank** via `map_add_items_to_bank(bank_id, [question_ids], [passage_id?])`. If the bank ends up over 60 items, fail with `bank_capacity_exceeded` and roll back (delete the just-created items + refund quota). The pre-check happens before insert so this is a defensive backstop.
6. **Response payload** gains a `bank` block:

```json
{
  "bank": { "id": "uuid", "name": "Fractions on a number line — Math G3", "item_count": 8, "was_created": true },
  "passage": { /* unchanged shape, if applicable */ },
  "questions": [ /* unchanged */ ]
}
```

The AI is instructed (via tool description) to reuse `bank.id` on follow-up calls in the same conversation rather than re-passing `bank_name`, which sidesteps name-typo collisions.

### 5.3 Tool description deltas (the agent-facing instructions)

Appended to both `create_custom_questions` and `create_custom_passage_and_questions` descriptions, replacing the implicit "items go to a drafts pool" framing:

> Every item created by this tool must belong to a custom Bank. Pass either `bank_id` (to reuse a bank from a previous tool result in this conversation) or `bank_name` (to create-or-find a bank by name in the family).
>
> When the parent is starting a new authoring session, name the bank `{Topic} — {Subject} G{Grade}`. Examples: `Fractions on a number line — Math G3`, `Main idea — Reading G3`, `Commas in compound sentences — Language G3`. Use the topic phrasing the parent used in plain English; capitalize like a title; do not include the kid's name (banks are kid-agnostic and assignable to anyone).
>
> If the parent asks to add more to "the same set" or "more like that," reuse the `bank.id` returned by the previous tool result, not `bank_name` (this avoids name-typo collisions).
>
> The tool may return a slightly different `bank.name` than you requested — if a same-name bank already existed in a different subject or grade, the server appends `(2)`, `(3)`, … and returns the resolved name.

### 5.4 No quota change

`enforceWriteQuota` / `refundWriteQuota` still gate at the question and passage level. Bank create-or-find is *not* quota-counted (a typo-induced extra bank is cheap; suppressing the quota on this path keeps the failure mode benign).

### 5.5 Error codes (added to `errors.ts`)

- `bank_target_mismatch` — bank_id resolved but its subject/grade don't match the call.
- `bank_not_custom_lane` — bank_id resolves to a vetted-lane bank.
- `bank_capacity_exceeded` — appending would exceed 60.
- `mixed_subjects_in_call` — questions array spans multiple subjects.

## 6. UI changes

### 6.1 `AiStudio.tsx` — root becomes the Banks list

The current `tab === 'connect' ? <ConnectAi /> : <CustomBank />` router stays, but the default branch now mounts a new `<ReviewBanks />` component. `CustomBank.tsx` is repurposed as the **Bank Review** screen (drilled into via `?bank=<uuid>`).

`<ReviewBanks />` reads from `map_v_custom_bank_overview` (defined in §4.6).

Each row in the list shows: name, `subject · G{grade}`, total items, `{draft} draft · {ready} ready` chip, and a single primary action — `[Review →]` when there are drafts, `[Assign →]` when all items are published. Empty banks (no items yet) render with a muted state and a `[Add items →]` action that opens manual authoring scoped to the bank.

Below the list, a small link: `ℓ Legacy items (N not in any bank) →` opens a stripped-down legacy view backed by `map_v_custom_legacy_items` (today's flat CustomBank layout, read-only filter on orphans, with the same per-card Publish/Archive/Delete actions).

### 6.2 Bank Review screen (the repurposed `CustomBank.tsx`)

Same card layout as today, filtered to `bank_id = ?bank=…`. Additions:

- Bank header row at top: name, subject/grade, item counts, "Edit name" pencil (calls a new `map_rename_bank` RPC — trivial, family-scoped).
- New button: **Publish all drafts in this bank** (calls existing `map_publish_custom_question` over each draft id; uses the bulk-select infra that's already there for selected subsets).
- When `ready_question_count ≥ 5` and `draft_question_count = 0`, sprout an **Assign to kid →** CTA that opens the existing assignment flow with `bank_id` pre-filled. The flow itself (`map_assign_bank` + the assignment modal) is unchanged.
- The header's `[+ New question]` / `[+ New passage]` buttons stay but now navigate to `/parent/custom-bank/new-question?bank=<uuid>` and `/parent/custom-bank/new-passage?bank=<uuid>` so the bank target is pre-bound.

### 6.3 Manual authoring forms

`NewCustomQuestion.tsx` and `NewCustomPassage.tsx` gain a required Bank field at the top of the form (above the existing Subject + Grade selectors).

```
Bank: ┌─────────────────────────────────────┐
      │ Fractions on a number line — Math G3│ ▾
      └─────────────────────────────────────┘
        ─ Existing banks (filtered to current subject + grade) ─
        ─ + Create new bank…                                    ─
```

The dropdown is filtered by the form's current Subject + Grade selectors. Changing Subject or Grade re-filters the dropdown and clears the Bank selection (the user is prompted to re-pick). This avoids a question landing in a bank whose subject/grade no longer matches.

`+ Create new bank…` opens an inline dialog: name (text, 1–120) only. Subject and grade are inherited from the form's current selectors (read-only in the dialog so the relationship is visible). Submitting calls `map_create_or_find_custom_bank(name, subject, grade)` and pre-selects the result in the Bank dropdown. Save then routes the new question/passage through `map_add_items_to_bank` after item creation.

If the user lands on these pages from a Bank Review screen (`?bank=<uuid>` in the URL), the Bank field is pre-locked to that bank and the Subject + Grade selectors are locked to that bank's `(subject, grade)`. A "Change bank" affordance unlocks them.

### 6.4 Tests & Banks page — unchanged

Vetted Banks (recipes) keep their existing list, create, and assign flows. This spec does not touch `TestsAndBanks.tsx` other than potentially adding a tiny "X custom banks ready to assign" pill — and even that is YAGNI for now.

### 6.5 `src/lib/banks/mutations.ts` deltas

- New: `createOrFindCustomBank({ name, subject, grade })` wrapping `map_create_or_find_custom_bank`.
- New: `addItemsToBank({ bankId, questionIds, passageIds })` wrapping `map_add_items_to_bank`.
- Updated: `createManualBankQuestion` continues to exist but now goes through `addItemsToBank` (single-item append) instead of `setBankItems` so two parallel authors don't clobber each other's items.
- New: `renameBank({ bankId, name })` wrapping `map_rename_bank`.

## 7. Non-goals (YAGNI guardrails)

- **No moving items between banks.** Re-author or copy if you need that.
- **No bank tags, descriptions, or folders.** Name + subject + grade is the only metadata.
- **No bank-level review state separate from item state.** "All items published" is implicitly "Bank is ready to assign." No new column.
- **No auto-assign on bank completion.** Parent still picks the kid.
- **No legacy item migration.** Orphans stay orphans; surfaced via the Legacy link.
- **No vetted-lane changes.** Recipes still live on the Tests & Banks page.
- **No bulk publish across banks.** Publish-all is scoped to one bank.
- **No multi-subject banks.** The (subject, grade) tuple is part of bank identity.

## 8. Phasing

Single phase, single PR to `main`. Components are small enough to land together; splitting would create awkward intermediate states (e.g., MCP tools requiring a bank target while the UI still showed the flat list).

Within the PR, commits are sliced:
1. Migration (`map_question_bank_items.custom_passage_id`, the create-or-find RPC, the add-items RPC, the rename RPC, the overview view, the legacy view).
2. MCP schemas + server-side bank resolution + tool descriptions.
3. UI: `ReviewBanks` list, repurposed `CustomBank` as Bank Review, manual form Bank field.
4. Test scripts + audit.

## 9. Verification

- **Node data-guard script** (`scripts/check-bank-first-authoring.mjs`): on the dev project, exercise `map_create_or_find_custom_bank` for the "reuse vs suffix" branches, exercise `map_add_items_to_bank` for the cap and ownership branches, and assert the MCP write tools attach items via `map_question_bank_items` when given `bank_name` and `bank_id` respectively.
- **MCP read-only audit** (`scripts/audit-mcp-readonly.mjs`): re-run; the new tool paths only add writes through already-scoped RPCs, so the audit should remain green except for the explicitly write-marked tools.
- **`npm run typecheck && npm run build`** must pass.
- **Manual QA checklist** (added to the PR description):
  - From MCP, ask Claude to author 5 math questions for "fractions on a number line." Verify a new bank named `Fractions on a number line — Math G3` appears in AI Studio with 5 draft items.
  - From the same MCP conversation, ask for 5 more. Verify they land in the *same* bank (bank.id reuse), bank now shows 10 items.
  - From MCP, author a reading passage with 4 questions for "main idea." Verify the bank has 1 passage + 4 question items.
  - In AI Studio, click Review on the math bank, publish all drafts, then click Assign and complete the existing assignment flow against Aarav.
  - Verify the kid sees the assigned bank on Kid Home and can take it.
  - From the manual New-question form, try to create a question without picking a bank — verify the submit button is disabled with helper text.
  - Try a `bank_name` collision: create a bank `Test — Math G2` then run MCP with `bank_name: 'Test'`, `subject: 'reading'`, `grade: 2` — verify the new bank is named `Test (2)` and the original is untouched.

## 10. Open questions

None blocking. Two follow-ups for after this lands:

- A "duplicate this bank" UX (clone the recipe / clone the curated set into a new bank). Useful for round 2 of a topic but not required for this loop.
- Bank archival vs soft-delete distinction. Today `soft_deleted_at` hides a bank entirely; an "archived" state that keeps history visible on kid pages but hides from the AI Studio list might be worth adding once the bank count grows.

## 11. References

- `migrations/20260518_map_question_banks.sql` — Phase 1 substrate
- `migrations/20260519_map_question_banks_custom.sql` — Phase 2 custom-lane RPCs
- `docs/superpowers/specs/2026-05-18-question-banks-and-assignment-design.md` — the original Banks design (this spec extends §4 and §6 of it)
- `api/_lib/mcp/tools/create-custom-questions.ts` and `create-custom-passage-and-questions.ts`
- `api/_lib/svg/capability-blurb.ts` — where the new naming-convention paragraph slots in
- `src/pages/parent/AiStudio.tsx`, `CustomBank.tsx`, `NewCustomQuestion.tsx`, `NewCustomPassage.tsx`
- `src/lib/banks/mutations.ts`
