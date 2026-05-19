# Delete a Bank — Design Spec

**Date:** 2026-05-19
**Status:** Approved design, pre-plan
**Topic:** Let a parent delete a question bank (vetted or custom) from Tests & Banks, blocked if the bank has any assignments.
**Builds on:** `main` (Question Banks P1+P2 + Parent Shell shipped).
**Branch:** `feat/delete-bank` (off `main`).

## 1. Problem

`TestsAndBanks` lists saved banks with Open/Assign actions but no way to remove a bank. Parents accumulate banks they no longer want. There is no delete affordance and no delete RPC.

## 2. Decisions (locked in brainstorming)

| # | Decision |
|---|---|
| Mechanism | **Soft-delete** — set `map_question_banks.soft_deleted_at = now()`. No hard `DELETE` (the `bank_id` FKs are `ON DELETE CASCADE`; soft-delete is the existing codebase pattern and `listBanks` already filters `.is('soft_deleted_at', null)`). No schema change. |
| Assignment behavior | **Block delete if the bank has ANY `map_bank_assignments` row** (any status). The RPC raises a clear message; the parent must revoke assignments first. |
| Scope | Both lanes (vetted + custom). One Delete affordance per bank row. |
| Confirm UX | Lightweight confirmation before the call (destructive action, even though blocked banks can't be removed). |

## 3. Stack & reuse

React + Vite + TS + RR v6, Supabase + RLS. Repo convention: Node data-guard + `typecheck && build` + manual QA. This **adds a DB surface (one RPC)** → a data-guard IS warranted (unlike the parent-shell refactor). Reuses: `map_question_banks.soft_deleted_at` (exists), `listBanks` filter (exists), `map_current_family_id()`, the existing bank-RPC idiom (`map_revoke_bank_assignment` etc.).

## 4. Architecture

### 4.1 RPC — `map_soft_delete_bank(p_bank_id uuid) → void`
New migration `migrations/20260520_map_delete_bank.sql`, single idempotent `BEGIN; … COMMIT;`, header block matching the `2026051*` migrations. `LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''`, fully-qualified refs, family resolved via `public.map_current_family_id()` (never a param). Logic:
1. Resolve `v_family := public.map_current_family_id()`; null → `RAISE 'no family for current user'`.
2. If the bank does not exist for this family and is not already soft-deleted (`SELECT 1 FROM public.map_question_banks WHERE id = p_bank_id AND family_id = v_family AND soft_deleted_at IS NULL`) → `RAISE 'bank not found or not yours'`.
3. If `EXISTS (SELECT 1 FROM public.map_bank_assignments WHERE bank_id = p_bank_id)` → `RAISE 'This bank has been assigned and can''t be deleted. Revoke its assignments first.'`.
4. `UPDATE public.map_question_banks SET soft_deleted_at = now(), updated_at = now() WHERE id = p_bank_id AND family_id = v_family`.

`GRANT EXECUTE … TO authenticated` (match the existing bank RPCs' grant pattern).

### 4.2 Lib — `deleteBank(bankId: string): Promise<void>`
Append to `src/lib/banks/mutations.ts`, mirroring `revokeBankAssignment`: `await supabase.rpc('map_soft_delete_bank', { p_bank_id: bankId }); if (error) throw error`.

### 4.3 UI — `TestsAndBanks.tsx`
Add a **Delete** action (`btn-ghost text-sm`) in each bank row's action area, beside the existing Open (custom only) / Assign buttons, for both lanes. On click: a lightweight confirmation (e.g. an inline two-step "Delete?" → "Confirm/Cancel" or `window.confirm`, matching the file's existing patterns — the plan picks one concretely). On confirm: `await deleteBank(b.id)` then `reload()`. Errors (including the block message) are caught and shown in the component's existing `err` text slot. After success the bank disappears (the existing `listBanks` `soft_deleted_at` filter).

## 5. Data flow & errors

Parent → Delete → confirm → `map_soft_delete_bank`. Two outcomes: (a) bank had assignments → RPC raises → message in `err`, bank stays listed; (b) no assignments → `soft_deleted_at` set → `reload()` → bank gone from the list and from `/parent/banks/:id` (custom detail; navigating to a soft-deleted bank id is already excluded by every bank RPC's `soft_deleted_at IS NULL` guard, so its actions fail cleanly). `map_v_bank_assignment_overview` is unaffected (a deletable bank has no assignments by definition). All RLS family-scoped.

## 6. Testing

`scripts/test-delete-bank-data.mjs` (mirrors the Phase-1/2 guard harness — service-role admin + two signed-in families): create a vetted bank → `map_soft_delete_bank` → assert `soft_deleted_at` set and `listBanks`-shaped query (`.is('soft_deleted_at', null)`) no longer returns it; create a bank, assign it to a kid, attempt delete → assert it RAISES and the bank is still listed; cross-family: family B calling `map_soft_delete_bank` on family A's bank → RAISES, A's bank untouched; deleting an already-soft-deleted / nonexistent id → RAISES. Plus `npm run typecheck && npm run build` exit 0. No-regression: existing Phase-1/2 bank guards still green. One spec, one short plan.

## 7. Risks / out of scope

- **No un-delete UI.** Soft-deleted banks are simply hidden; restoring is a DB op if ever needed. YAGNI — not requested.
- **`map_question_bank_items`** rows for a soft-deleted custom bank remain (harmless; hidden with the bank, no listing path reaches them). No cleanup needed.
- **Block is on ALL assignment statuses** (including `completed`/`revoked`), per the decision — a bank ever assigned can't be deleted until those rows are removed. Accepted; revisit only if it proves annoying (not in scope now).
- No change to assignment, composition, or kid-side flows; no new tables/views; only one new RPC + one lib fn + one UI affordance.
