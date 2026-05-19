# Assignment Management (Dismiss) — Design Spec

**Date:** 2026-05-19
**Status:** Approved (user pre-authorized: "use your own judgement, complete the feature, you have my permission")
**Topic:** Let a parent clear terminal (completed / revoked) bank-assignment rows out of the Assignments lists, so the list stays manageable.
**Builds on:** `main` (Question Banks P1+P2, Parent Shell, Delete-bank all shipped).
**Branch:** `feat/assignment-mgmt` (off `main`).

## 1. Problem

The Assignments list (parent `Tests & Banks` and per-kid `KidDetail → Assignments`) accumulates rows forever. `Revoke` is correctly **pre-start only** (`map_revoke_bank_assignment` rejects non-`assigned`). Once a kid starts/finishes, the row is permanent clutter with no management affordance. The user asked for assignment management after observing this.

## 2. Decisions (my judgment, per delegated authority — recorded for transparency)

| # | Decision | Rationale |
|---|---|---|
| Mechanism | **Soft "dismiss"**: new nullable `map_bank_assignments.dismissed_at timestamptz`; the overview view filters `dismissed_at IS NULL`. | Matches the soft-delete pattern used everywhere here (`soft_deleted_at` on banks/custom questions). Preserves history at the DB layer (mastery/analytics untouched). |
| What's dismissable | Only **terminal** states: `status IN ('completed','revoked')`. `assigned` → use existing Revoke; `in_progress` → active, let it finish (no dismiss, no revoke). RPC enforces. | Dismissing an active/not-started assignment is ambiguous and risky; terminal rows are pure history and safe to hide. |
| Surface | A **Dismiss** button on terminal rows in **both** `TestsAndBanks` Assignments and `KidDetail → Assignments` (`KidAssignmentsList`). Both read the same view, so a dismiss hides the row everywhere. | Consistency; both lists share `getBankAssignmentOverview`. One RPC, one lib fn, two thin button additions. |
| Out of scope (YAGNI) | No bulk "clear all", no un-dismiss UI, no dismissing `assigned`/`in_progress`, no new analytics. | Keep it minimal; not requested. |

## 3. Stack & reuse

Supabase + RLS; React + Vite + TS. Repo convention: Node data-guard + `typecheck && build` + manual QA. This **adds a DB surface** (column + view change + RPC) → a data-guard IS warranted. Reuses: the soft-delete idiom, `map_current_family_id()`, the existing bank-RPC structure (`map_revoke_bank_assignment` is the exact pattern), `getBankAssignmentOverview`/`BankAssignmentOverviewRow` (unchanged — the view keeps identical columns), the `revoke` handler pattern in `TestsAndBanks`.

## 4. Architecture

### 4.1 Migration `migrations/20260521_map_assignment_dismiss.sql` (single idempotent `BEGIN;…COMMIT;`, header block matching `2026052*`)
1. `ALTER TABLE public.map_bank_assignments ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;`
2. **Recreate** `public.map_v_bank_assignment_overview` *byte-identical* to the current definition (18 columns, same names/order, `security_invoker = true`) with one added clause: `WHERE a.dismissed_at IS NULL`. (The current full DDL is captured in the plan; `BankAssignmentOverviewRow` and every consumer stay unchanged — `dismissed_at` is a filter, not an exposed column.)
3. `CREATE OR REPLACE FUNCTION public.map_dismiss_bank_assignment(p_assignment_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''`:
   - `v_family := public.map_current_family_id()`; null → `RAISE 'no family for current user'`.
   - `UPDATE public.map_bank_assignments SET dismissed_at = now() WHERE id = p_assignment_id AND family_id = v_family AND dismissed_at IS NULL AND status IN ('completed','revoked')`.
   - `IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found, not yours, already dismissed, or not in a dismissable (completed/revoked) state';`
   - No explicit `GRANT` (consistent with the other bank RPCs — default privileges suffice).

### 4.2 Lib — `src/lib/banks/mutations.ts`
Append `dismissBankAssignment(assignmentId: string): Promise<void>` mirroring `revokeBankAssignment` (rpc `map_dismiss_bank_assignment`, `{ p_assignment_id }`, throw on error).

### 4.3 UI
- `src/pages/parent/TestsAndBanks.tsx`: add a `dismiss` handler mirroring the existing `revoke` (try/catch → `setErr` → `reload()`). In each Assignments row, render **Dismiss** (`btn-ghost text-xs`) when `r.status === 'completed' || r.status === 'revoked'` (alongside the existing `r.status === 'assigned'` → Revoke). Errors land in the existing `err` slot.
- `src/components/parent/KidAssignmentsList.tsx`: it's currently read-only. Add the same Dismiss button on terminal rows, calling `dismissBankAssignment` then re-running its loader (it already has a `useEffect` keyed on `studentId`; add a manual refresh via a `reload` callback / state bump). Keep its mount-guard pattern.

## 5. Data flow & errors

Parent clicks Dismiss on a completed/revoked row → `map_dismiss_bank_assignment` → row's `dismissed_at` set → `reload()` → the view no longer returns it, so it vanishes from **both** lists. Non-terminal or cross-family or already-dismissed → RPC raises → message in the list's existing error slot; row stays. All RLS family-scoped (the view is `security_invoker`; the RPC filters `family_id = map_current_family_id()`). No assignment/session/mastery data is deleted.

## 6. Testing

`scripts/test-assignment-dismiss-data.mjs` (Phase-1/2 harness style, two signed-in families): assign→complete a bank, dismiss → assert gone from `map_v_bank_assignment_overview` and `dismissed_at` set; revoke an assigned one, dismiss the revoked row → gone; attempt dismiss on `assigned` and on `in_progress` → both raise and stay; already-dismissed → raises; cross-family B dismiss of A's row → raises, untouched. Plus `npm run typecheck && npm run build` exit 0; no-regression: Phase-1/2 + delete-bank guards still green (the view recreate must not change their results — they don't set `dismissed_at`, so all existing rows remain visible).

## 7. Risks / out of scope

- **View recreate fidelity is load-bearing.** `BankAssignmentOverviewRow` and `getBankAssignmentOverview` must keep working unchanged → the plan recreates the view with the exact 18 columns verbatim, only adding the `WHERE`. The data-guard's no-regression check (Phase-1/2 guards read this view) catches any drift.
- No un-dismiss path (YAGNI; a dismissed row is recoverable via a one-off DB update if ever needed). Not requested.
- `in_progress` assignments remain unmanageable by design (can't revoke a started test, can't dismiss an active one) — accepted; revisit only if it proves a real pain.
- No change to composition, kid-side flows, or the assignment state machine; only one nullable column + view filter + RPC + lib fn + two button additions.
