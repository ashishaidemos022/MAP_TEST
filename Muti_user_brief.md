# Feature Brief: Multi-User Auth & Family Accounts (Phase 2)

> Hand this entire document to Claude Code in the MAP practice app repo. It is a complete spec — schema, RLS, auth flows, routes, migration, acceptance criteria. Read it end-to-end before starting. Append the relevant parts to `CLAUDE.md` when done.

---

## 1. What we are building and why

The app today is single-tenant: one student, no auth, no PII gate. This brief turns it into a **family-accounts app** where a parent creates one account and adds their kids as profiles under it.

The auth identity is the **parent**. Children never see a login screen — they pick their avatar from a profile picker, like Netflix. A PIN gates everything in the parent surface.

**Why this shape:**

- A 2nd-grader cannot manage a password.
- US COPPA forbids collecting personal data from under-13s without verifiable parental consent. Parental account ownership is the cleanest way to satisfy it.
- The existing parent dashboard in the mastery brief already assumes a PIN gate. This formalizes who the PIN belongs to (a family) and who it protects against (the child holding the tablet).

**Hard rules — do not violate these:**

- The child's UI never shows an email, password, or login form.
- The only PII allowed for a child is `display_name` and an emoji avatar. No real name, no birthdate, no school name.
- Every per-student table is RLS-gated. The shared question bank is RLS-readable to any authenticated user but writable only via service role.
- The PIN is hashed at rest. Never stored or logged plaintext.
- Account deletion cascades. When a family is deleted, every row tied to it disappears.
- The new project (`klhzfwxpztaojekwgzcg`) is the source of truth going forward. Do not write to the old project after migration completes.

---

## 2. Mental model

```
auth.users (Supabase managed) ── one parent identity
        │
        ▼
   map_families ──── parent_pin_hash, family_name
        │ 1:N
        ▼
   map_students ─── display_name, avatar_emoji, grade
        │ 1:N
        ▼
   map_test_sessions, map_attempts, map_misconception_signals
   (existing tables — gain RLS, no schema changes beyond the parent chain)
```

**The question bank is not in this chain.** `map_standards`, `map_reading_passages`, `map_questions`, `map_question_choices`, `map_misconception_tags` are global content. Every family reads the same rows.

---

## 3. New Supabase project

Project ref: `klhzfwxpztaojekwgzcg`. Old project (`mnrseaapxpofdznnqrsv`) is read-only for the migration script and decommissioned afterward.

### 3.1 Auth provider settings (set these in the Supabase dashboard before any migration runs)

- **Email + password:** enabled. Confirm email: ON. Minimum password length: 10.
- **Google OAuth:** enabled. (Optional but recommended — parents prefer one-click.)
- **Magic link, phone, anonymous:** disabled.
- **Site URL:** the production Vercel URL. Add the local dev URL to "Redirect URLs."
- **Email templates:** customize the confirmation email subject to "Confirm your MAP Practice account" and keep the body short.
- **JWT expiry:** default (1 hour) is fine.

### 3.2 Extensions

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- PIN hashing
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- if not already enabled
```

---

## 4. Database changes

Apply this as migration `map_multi_tenant`. Order matters — read it once before running.

```sql
-- =========================================================
-- 4.1: Families table
-- =========================================================
CREATE TABLE map_families (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  family_name     text NOT NULL DEFAULT 'My family',
  parent_pin_hash text,                          -- bcrypt; nullable until first set
  pin_set_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_map_families_owner ON map_families(owner_user_id);

-- =========================================================
-- 4.2: Update map_students
-- =========================================================
ALTER TABLE map_students
  ADD COLUMN family_id    uuid REFERENCES map_families(id) ON DELETE CASCADE,
  ADD COLUMN avatar_emoji text NOT NULL DEFAULT '🦊',
  ADD COLUMN created_at   timestamptz NOT NULL DEFAULT now();

-- family_id is nullable while the migration script backfills the existing
-- single student. After backfill (see section 7) flip it to NOT NULL:
--   ALTER TABLE map_students ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX idx_map_students_family ON map_students(family_id);

-- =========================================================
-- 4.3: Helper functions used by RLS policies
-- =========================================================
CREATE OR REPLACE FUNCTION map_current_family_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM map_families WHERE owner_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION map_student_in_my_family(p_student_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM map_students s
    JOIN map_families f ON f.id = s.family_id
    WHERE s.id = p_student_id
      AND f.owner_user_id = auth.uid()
  )
$$;

-- =========================================================
-- 4.4: PIN management (pgcrypto bcrypt)
-- =========================================================
CREATE OR REPLACE FUNCTION map_set_parent_pin(p_pin text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_family uuid;
BEGIN
  IF p_pin !~ '^\d{4,8}$' THEN
    RAISE EXCEPTION 'PIN must be 4-8 digits';
  END IF;
  SELECT id INTO v_family FROM map_families WHERE owner_user_id = auth.uid();
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'No family found for current user';
  END IF;
  UPDATE map_families
     SET parent_pin_hash = crypt(p_pin, gen_salt('bf')),
         pin_set_at = now(),
         updated_at = now()
   WHERE id = v_family;
END $$;

CREATE OR REPLACE FUNCTION map_verify_parent_pin(p_pin text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_hash text;
BEGIN
  SELECT parent_pin_hash INTO v_hash
    FROM map_families WHERE owner_user_id = auth.uid();
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN crypt(p_pin, v_hash) = v_hash;
END $$;
```

### 4.5 Validation queries

```sql
SELECT count(*) FROM map_families;        -- expect 0 immediately, 1 after first sign-up
SELECT count(*) FROM map_students WHERE family_id IS NULL;  -- expect 0 after backfill
```

---

## 5. RLS policies

Apply as part of the same migration. **Every per-family table gets RLS turned on. Skipping any of them is a security hole.**

```sql
-- =========================================================
-- 5.1: map_families — only the owner sees their own row
-- =========================================================
ALTER TABLE map_families ENABLE ROW LEVEL SECURITY;

CREATE POLICY families_select_own ON map_families
  FOR SELECT USING (owner_user_id = auth.uid());
CREATE POLICY families_insert_own ON map_families
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY families_update_own ON map_families
  FOR UPDATE USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
-- No DELETE policy: families are deleted via auth.users cascade only.

-- =========================================================
-- 5.2: map_students — gated by family
-- =========================================================
ALTER TABLE map_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY students_select_own ON map_students
  FOR SELECT USING (family_id = map_current_family_id());
CREATE POLICY students_insert_own ON map_students
  FOR INSERT WITH CHECK (family_id = map_current_family_id());
CREATE POLICY students_update_own ON map_students
  FOR UPDATE USING (family_id = map_current_family_id())
  WITH CHECK (family_id = map_current_family_id());
CREATE POLICY students_delete_own ON map_students
  FOR DELETE USING (family_id = map_current_family_id());

-- =========================================================
-- 5.3: Per-student data — gated by student-in-family
-- =========================================================
ALTER TABLE map_test_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_all_own ON map_test_sessions
  FOR ALL
  USING (map_student_in_my_family(student_id))
  WITH CHECK (map_student_in_my_family(student_id));

ALTER TABLE map_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY attempts_all_own ON map_attempts
  FOR ALL
  USING (map_student_in_my_family(student_id))
  WITH CHECK (map_student_in_my_family(student_id));

ALTER TABLE map_misconception_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY signals_all_own ON map_misconception_signals
  FOR ALL
  USING (map_student_in_my_family(student_id))
  WITH CHECK (map_student_in_my_family(student_id));

-- =========================================================
-- 5.4: Shared question bank — read-all-authed, no client writes
-- =========================================================
ALTER TABLE map_standards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_reading_passages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_questions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_question_choices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_misconception_tags   ENABLE ROW LEVEL SECURITY;

CREATE POLICY standards_read   ON map_standards          FOR SELECT TO authenticated USING (true);
CREATE POLICY passages_read    ON map_reading_passages   FOR SELECT TO authenticated USING (true);
CREATE POLICY questions_read   ON map_questions          FOR SELECT TO authenticated USING (true);
CREATE POLICY choices_read     ON map_question_choices   FOR SELECT TO authenticated USING (true);
CREATE POLICY misc_tags_read   ON map_misconception_tags FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies => only service_role can write. Authoring scripts must use the service role key.
```

### 5.5 RLS smoke test

After applying, sign up two test parents in two different browsers:

```
parent_a@example.com → adds student "Alpha"
parent_b@example.com → adds student "Bravo"
```

From parent A's session, run:

```sql
SELECT count(*) FROM map_students;  -- expect 1, the row for Alpha
```

From parent B's session, the same query returns 1 (Bravo). If either returns 2, **stop and fix RLS before continuing**.

---

## 6. Auth flows

### 6.1 Sign-up

Route: `/signup`. Two paths:

- **Email + password:** standard Supabase `signUp({ email, password })`. After this, Supabase sends a confirmation email. The user must click the link before they can sign in.
- **Google OAuth:** `signInWithOAuth({ provider: 'google' })`. Returns to `/onboarding` directly.

After successful confirmation/OAuth, redirect to `/onboarding`.

### 6.2 Onboarding (first-time only)

Route: `/onboarding`. Three steps in a single flow, persisted in component state until the final submit:

1. **Family name** (default: "{first name from auth metadata}'s family")
2. **Parent PIN** (4–8 digits, entered twice)
3. **First child** (display name, grade, emoji avatar from a fixed palette of ~12 emojis)

On final submit, run sequentially:

```ts
// 1. Create the family row
await supabase.from('map_families').insert({ owner_user_id: user.id, family_name });

// 2. Set the PIN via the SECURITY DEFINER function
await supabase.rpc('map_set_parent_pin', { p_pin: pin });

// 3. Create the first child
await supabase.from('map_students').insert({
  family_id: <fetched family id>,
  display_name,
  grade: 2,
  avatar_emoji,
});
```

If any step fails, surface the error and let the user retry. Don't half-create a family.

After onboarding completes, redirect to `/` (the profile picker).

### 6.3 Profile picker

Route: `/` (when authenticated and onboarded).

- Shows every child in the family as a big tappable card (avatar emoji + display name).
- One additional card: "Add a kid" → opens a modal that creates another `map_students` row.
- One additional card: "Parent" with a small lock icon → routes to PIN entry, then `/parent`.

Tapping a child sets `active_student_id` in a React context provider and `localStorage`, then navigates to `/home` (the existing child home screen).

### 6.4 Parent PIN gate

A page (`/parent/unlock`) with a 4–8 digit numeric keypad. On submit, call `map_verify_parent_pin`. On success, set a session-only flag (`sessionStorage.parent_unlocked = 'true'`) and route to `/parent`. Flag clears on tab close.

The `/parent` route checks this flag on every render. On reload, the parent re-enters the PIN. **Do not persist the unlock flag across browser sessions.**

### 6.5 Sign-in / sign-out

- `/login` — email+password and Google buttons. On success, route to `/` (profile picker) if onboarded, `/onboarding` otherwise.
- Sign-out is only reachable from the parent dashboard (`/parent`). Children cannot sign out by accident.

### 6.6 Forgot PIN

The PIN is recoverable only by re-authenticating with the parent's email password. From `/parent/unlock` there's a small "Forgot PIN?" link → routes to a confirm-password screen → on success, prompts for a new PIN.

### 6.7 Forgot password

Standard Supabase password reset flow. Configure the email template in the Supabase dashboard.

---

## 7. Routes (final shape)

| Route                  | Auth required | Active profile required | PIN unlocked required | Purpose                                        |
|------------------------|---------------|-------------------------|-----------------------|------------------------------------------------|
| `/signup`              | no            | no                      | no                    | Create parent account                          |
| `/login`               | no            | no                      | no                    | Sign in                                        |
| `/onboarding`          | yes           | no                      | no                    | First-run family/PIN/child setup               |
| `/`                    | yes           | no                      | no                    | Profile picker (kids + Parent)                 |
| `/home`                | yes           | yes                     | no                    | Child home — pick subject, see streaks         |
| `/test/new`            | yes           | yes                     | no                    | Build session, redirect to runner              |
| `/test/:id`            | yes           | yes                     | no                    | Test runner                                    |
| `/test/:id/results`    | yes           | yes                     | no                    | Results screen                                 |
| `/history`             | yes           | yes                     | no                    | Past sessions                                  |
| `/boost`               | yes           | yes                     | no                    | Targeted practice (mastery brief)              |
| `/parent/unlock`       | yes           | no                      | no                    | PIN entry                                      |
| `/parent`              | yes           | no                      | yes                   | Parent dashboard                               |
| `/parent/account`      | yes           | no                      | yes                   | Email/password, delete account, export data   |

Implement three route guards: `<RequireAuth>`, `<RequireActiveStudent>`, `<RequireParentUnlock>`. Compose them.

---

## 8. App code structure changes

### 8.1 Supabase client

Single client, anon key only, in `lib/supabase.ts`. Do **not** ship the service role key to the browser. Server-side authoring scripts (Node CLI for question generation) get a separate client using `process.env.SUPABASE_SERVICE_ROLE_KEY`.

### 8.2 Auth context

`AuthProvider` wraps the app, exposes `{ user, session, loading, signOut }`. Subscribe to `supabase.auth.onAuthStateChange`.

### 8.3 Active student context

`ActiveStudentProvider` exposes `{ activeStudent, setActiveStudent, students, refreshStudents }`. On mount, fetches `map_students` for the family. Persists the chosen `student.id` in `localStorage` and rehydrates on next visit.

Every existing query that hard-codes a student id needs to switch to `activeStudent.id`. Audit:

```bash
rg -n "student_id" src/
```

Anywhere a literal UUID was used (from Phase 1 single-student dev), replace with `activeStudent.id`.

### 8.4 The `map_record_attempt` function (from the mastery brief)

Already takes `p_student_id`. With RLS in place, that param must be a student in the calling user's family or the function call fails. No change to the function body itself, but add an explicit check at the top for clarity:

```sql
IF NOT map_student_in_my_family(p_student_id) THEN
  RAISE EXCEPTION 'student does not belong to caller';
END IF;
```

---

## 9. Migrating the question bank from the old project

The new project starts empty. Migrate **only** the question bank.

### 9.1 What to copy

- `map_standards` (TEKS catalog)
- `map_reading_passages`
- `map_questions`
- `map_question_choices`
- `map_misconception_tags` (only if the mastery tracker has been applied to the old project; otherwise create from scratch in the new project)

### 9.2 What NOT to copy

- `map_students` — recreated via the parent's onboarding
- `map_test_sessions`, `map_attempts` — dev-only data, no value to preserve
- `map_misconception_signals` — rebuilds from new attempts

### 9.3 Migration script

A one-shot Node script `scripts/migrate-question-bank.ts`:

1. Connects to **both** projects with their service role keys (read from `.env.migration`, never committed).
2. For each table in dependency order (standards → passages → questions → choices → misconception_tags), fetches all rows from old, inserts into new in batches of 200.
3. Preserves all primary keys (UUIDs) so the FKs match without remapping.
4. Logs `inserted: N, skipped: M` per table.
5. Idempotent: uses `upsert` on PK conflict.

Validate after running:

```sql
-- on the new project
SELECT subject, count(*) FROM map_questions GROUP BY subject;
SELECT count(*) FROM map_question_choices;
SELECT count(*) FROM map_reading_passages;
```

The numbers must match the old project.

### 9.4 Decommission

Once the new project is live and at least one practice session has been completed there, set the old project to "paused" in the Supabase dashboard. Do not delete it for at least 30 days — it's a safety net.

---

## 10. Privacy, COPPA, and data ownership

This is consumer-grade software handling children's data. The bar matters even before any commercial launch.

### 10.1 What goes in the privacy policy (linked from `/signup` and `/account`)

- We collect: parent email, child display name, child grade, child practice answers, timestamps. Nothing else.
- We do not sell, share, or use data for advertising.
- We use the data only to render the child's practice experience and the parent's dashboard.
- Parents can delete the entire family at any time from `/parent/account`. Deletion is immediate and cascades.
- Parents can export all their family's data as JSON from `/parent/account`.

### 10.2 Implementation hooks

- **Account deletion:** a button on `/parent/account` calls a server-side endpoint that deletes the `auth.users` row. The cascade does the rest. Confirm with PIN re-entry plus a typed phrase.
- **Data export:** server-side endpoint that joins `map_families`, `map_students`, `map_test_sessions`, `map_attempts`, `map_misconception_signals` for the caller's family and returns JSON.

### 10.3 What this brief does NOT include

A full COPPA verifiable parental consent flow (notarized form, credit card check, government ID). Email-based consent is the lightweight tier and is what we'll ship. If this app ever charges money or adds advertising, this section needs a lawyer.

---

## 11. Acceptance criteria

Before declaring the feature done, all of these must pass.

1. A new email sign-up sends a confirmation email and blocks sign-in until confirmed.
2. After confirmation, `/onboarding` walks the user through family name, PIN, and first child in one flow. Skipping any step is impossible.
3. After onboarding, `map_families` has exactly one row owned by `auth.uid()`, with `parent_pin_hash` not null, and `map_students` has exactly one row with `family_id` matching.
4. With two test accounts, `parent_a` cannot SELECT, INSERT, UPDATE, or DELETE any of `parent_b`'s `map_students`, `map_test_sessions`, `map_attempts`, or `map_misconception_signals`. Verify directly in SQL with two anon-key sessions.
5. Any authenticated user can SELECT from `map_questions`, `map_question_choices`, `map_standards`, `map_reading_passages`, `map_misconception_tags`. INSERT or UPDATE attempts from a non-service-role session fail.
6. `/parent` redirects to `/parent/unlock` when `sessionStorage.parent_unlocked` is unset. PIN verification routes back to `/parent`.
7. Closing the browser tab and reopening it requires re-entering the PIN to access `/parent`.
8. The profile picker shows every child for the family, plus an "Add a kid" card and a "Parent" card.
9. Tapping a child profile sets the active student. All subsequent queries on `/test/*`, `/history`, and `/boost` scope to that student. Switching profiles changes the data shown.
10. Account deletion from `/parent/account` removes the `auth.users` row and cascades through `map_families` → `map_students` → `map_test_sessions` → `map_attempts` → `map_misconception_signals`. Verify by counting rows before and after.
11. The migration script populates the new project with question-bank row counts identical to the old project.
12. The child UI surfaces no email, password, sign-out button, or family-management UI anywhere. `rg -n "auth\." src/app/(child|home|test|boost|history)` returns no application-level auth calls (the auth provider may load the session, but child screens do not surface it).
13. The service role key does not appear in any file under `src/` or in the Vercel client bundle. Verify with `rg "service_role" src/`.

---

## 12. What to do FIRST

Order matters. Each step has tests in section 11 that depend on the prior step. Stop and confirm each checkpoint with a human before continuing.

1. **Configure the new Supabase project** (section 3). Email auth on, Google OAuth on, confirmations required, redirect URLs set. Checkpoint: sign-up via the Supabase dashboard test flow works and an email arrives.
2. **Apply the migration** in sections 4 and 5 to the new project. Run the validation queries in 4.5 and the RLS smoke test in 5.5. Checkpoint: two test accounts cannot see each other's data.
3. **Build the auth scaffolding**: `lib/supabase.ts`, `AuthProvider`, `<RequireAuth>`. Wire `/signup` and `/login`. Checkpoint: a user can sign up, confirm email, sign in, and reach a placeholder page.
4. **Build `/onboarding`** (section 6.2). Verify directly in SQL that `map_families` and `map_students` are populated and `parent_pin_hash` is non-null after the flow.
5. **Build `ActiveStudentProvider` and `/` (profile picker)** (section 6.3). Verify with two children that switching profiles changes the active student id in localStorage.
6. **Wire the existing test-runner, history, boost routes through `<RequireActiveStudent>`** and replace any hard-coded student ids with `activeStudent.id`.
7. **Build `/parent/unlock` and `<RequireParentUnlock>`** (section 6.4). Verify reload-clears-unlock behavior.
8. **Migrate the question bank** with the script in section 9. Verify row counts match.
9. **Build `/parent/account`** with delete-account and data-export. Manually test both, especially the cascade delete.
10. **Run all acceptance criteria** in section 11 before merging.

---

## 13. What NOT to build

These were considered and rejected. Don't add them.

- **Per-child logins.** Children should not have passwords. The profile-picker pattern is the answer.
- **Magic-link or SMS auth for kids.** Same reason.
- **Two-parent households.** Phase 3. The schema is shaped to allow it (add `map_family_members` later) but Phase 2 is one parent per family.
- **Family invitations / share-with-grandparent.** Out of scope.
- **Auth0 / Clerk / Firebase Auth.** Supabase Auth is in the stack and integrates natively with RLS. Adding another auth provider doubles the surface area.
- **Anonymous "guest" play.** No incognito kid mode. Sign-up first.
- **Public profiles, leaderboards, social.** Single-family app.
- **Real verifiable parental consent (notarized, ID-checked).** Out of scope until we charge money or add advertising.

---

## 14. When in doubt

- If a question about kid-facing UI tone isn't covered here or in `CLAUDE.md` section 6, ask before deciding.
- If RLS behavior surprises you, stop and reproduce it in SQL before patching the application code. RLS bugs in the app layer are catastrophic.
- If the migration script reports any row-count mismatch between old and new, do not declare success. Re-run from scratch on a fresh new project if needed.
