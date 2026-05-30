# Delete a Student — Design

**Date:** 2026-05-30
**Status:** Approved (pending spec review)
**Project:** klhzfwxpztaojekwgzcg

## Problem

A parent can add kids (Onboarding, ProfilePicker "add a kid") and edit them
(grade, school grade, test length via the settings tab), but there is no way to
**delete** a student from a family. This adds that.

## Decisions

- **Hard delete, not soft.** The student row and all per-student data are
  permanently removed. There is no "undelete kid" use case, and `map_students`
  has no `is_active`/soft-delete column (soft-delete in this repo is reserved for
  content — banks, custom questions — where audit/restore matters).
- **Placement:** the per-kid **settings tab** (`ParentSettings.tsx`, rendered
  under `KidDetail` → `?tab=settings`). Already PIN-gated and per-kid.
- **Confirmation:** a simple confirm dialog (not type-the-name).
- **Active/last kid:** if the deleted kid was the active profile, clear the
  active selection and redirect to the profile picker (`/`). If it was the last
  kid, the picker shows its empty "add your first kid" state.

## The core hazard — why an RPC, not a client `.delete()`

`map_students` already has a family-scoped DELETE RLS policy
(`students_delete_own`, migration `20260428_map_multi_tenant.sql`), so a direct
`supabase.from('map_students').delete()` would appear to work. But there is a
cascade-ordering trap, already documented in
`ParentSettings.cleanupStubs` (lines ~173–183):

- Deleting a student cascades to **both** `map_test_sessions` (FK `student_id`
  `ON DELETE CASCADE`) **and** `map_bank_assignments` (FK `student_id`
  `ON DELETE CASCADE`).
- When a `map_test_sessions` row is deleted, `map_bank_assignments.session_id`
  fires **`ON DELETE SET NULL`**. If that assignment is still `in_progress`, the
  `map_ba_status_coherent` CHECK rejects the NULL (Postgres error 23514),
  aborting the entire delete — even though that assignment row is itself about to
  be cascade-deleted.

The fix is to delete in a controlled order inside a `SECURITY DEFINER` RPC.
This also matches the repo convention (`map_soft_delete_bank`,
`map_dismiss_bank_assignment`, `map_soft_delete_custom_*`).

## Blast radius (confirmed against migrations)

| Table | Relationship | Outcome on student delete |
|---|---|---|
| `map_test_sessions` | `student_id` CASCADE | deleted |
| `map_attempts` | `session_id` CASCADE | deleted (via session) |
| `map_pick_diagnostics` | `session_id` CASCADE | deleted (via session) |
| `map_misconception_signals` | `student_id` CASCADE | deleted |
| `map_bank_assignments` | `student_id` CASCADE | deleted (explicitly, first) |
| `map_question_reports` | `student_id` SET NULL | **survives, anonymized** |
| custom questions / passages / banks | family-scoped | untouched |
| `map_mcp_tokens`, OAuth grants/tokens | family-scoped | untouched |

## Migration — `map_delete_student`

New file `migrations/20260530_map_delete_student.sql`. Single transaction,
`CREATE OR REPLACE` (idempotent), modeled on `20260520_map_delete_bank.sql`.

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.map_delete_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;

  -- Ownership check (also the not-found guard)
  IF NOT EXISTS (
    SELECT 1 FROM public.map_students
     WHERE id = p_student_id AND family_id = v_family
  ) THEN
    RAISE EXCEPTION 'student not found or not yours';
  END IF;

  -- Controlled order avoids the session -> assignment SET NULL / CHECK trap.
  DELETE FROM public.map_bank_assignments WHERE student_id = p_student_id;
  DELETE FROM public.map_test_sessions    WHERE student_id = p_student_id; -- cascades attempts + diagnostics
  DELETE FROM public.map_students         WHERE id = p_student_id;          -- cascades signals; reports -> SET NULL
END
$$;

GRANT EXECUTE ON FUNCTION public.map_delete_student(uuid) TO authenticated;

COMMIT;
```

Note: deleting `map_bank_assignments` directly (rather than relying on its own
`student_id` cascade) is what makes the order deterministic and sidesteps the
trap. Same data outcome either way.

## UI — Danger zone

Add a section at the bottom of `ParentSettings.tsx` (renders under KidDetail's
`settings` tab):

- A muted "Danger zone" card containing a **Delete {name}** button.
- Click opens a confirm dialog (reuse the existing modal markup pattern in that
  file): *"Permanently delete {name}? This erases all their tests, answers, and
  progress. This can't be undone."* — Cancel / Delete.
- On confirm: `supabase.rpc('map_delete_student', { p_student_id: studentId })`.
- A `deleting` busy flag disables buttons; errors render via the existing
  `error` state + `errorMessage()` helper.

## Post-delete app-state handling

After the RPC resolves successfully (in order):

1. `await refreshStudents()` (from `useActiveStudent`) — re-pulls the family list.
2. If the deleted id was the active student, `setActiveStudent(null)`
   (clears localStorage).
3. `navigate('/')` → ProfilePicker. Last-kid case shows the empty state for free.

`ParentSettings` will need `setActiveStudent` and `activeStudent` from
`useActiveStudent` (it already calls the hook), a `useNavigate`, and the new
`studentId`/`displayName` props it already receives.

## Verification

- **`scripts/test-delete-student.mjs`** (mirrors `test-delete-bank-data.mjs`,
  run via `node --env-file=.env.local`): seed a throwaway student with a couple
  of sessions, attempts, an **in_progress** bank assignment (the trap case), and
  a question report; call `map_delete_student`; assert:
  - student row gone,
  - its sessions / attempts / pick diagnostics / misconception signals gone,
  - its bank assignments gone,
  - its question report survives with `student_id IS NULL`,
  - a second call (already deleted) raises "student not found or not yours",
  - calling for a student in another family raises the same (isolation).
- **`npm run typecheck`** for the UI changes.

## Out of scope

- Soft delete / restore.
- Bulk delete of multiple students.
- Deleting the family itself (already handled by `auth.users` cascade).
- Any change to RLS policies (the existing `students_delete_own` plus the new
  RPC's ownership guard are sufficient).
