Good — that decides it. **826 Grade 2 questions is way too much to re-author.** Option (b): replay schema migrations, dump data with `pg_dump --data-only`, restore to destination.

Two pieces of pre-work before the actual migration, and then the cutover.

---

## Phase 0: Pre-work (do these first, in this order)

### 0.1 Lift Supabase URL and key into env vars

Hand this to a Claude Code session in the repo:

> Refactor the Supabase client to read from environment variables instead of hard-coded strings.
>
> 1. Edit `src/lib/supabase.ts` — replace the hard-coded URL and anon key with `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`. Throw a clear error at module load if either is missing.
> 2. Edit each script in `scripts/` that has a hard-coded URL/key (`check-legacy-sessions.mjs`, `grade3-coverage.mjs`, `grade3-author-prompt.mjs`, `test-grade3-picker.mjs`, `test-adaptive-simulator.mjs`) to read from `process.env.SUPABASE_URL` and `process.env.SUPABASE_PUBLISHABLE_KEY`. Throw on missing.
> 3. Create `.env.example` at repo root with the four variable names and placeholder values.
> 4. Create `.env.local` at repo root with the *current* (source-project) values. Add `.env.local` to `.gitignore` if it isn't already.
> 5. Add a one-line note in `CLAUDE.md` §2 next to the Supabase row: "Connection details live in `.env.local` (see `.env.example`)."
> 6. Run `npm run dev` and confirm the app still loads. Run `node scripts/grade3-coverage.mjs` and confirm it still works.
>
> Do not change any Supabase URLs or keys — just relocate them. The migration to a new project happens later.

After this lands, also add the same two vars to your Vercel project (Settings → Environment Variables) with the *current* source-project values. Redeploy. App should be unchanged. This is your "before" baseline — env-var-driven, but still pointing at the old project.

### 0.2 Pull the verify-pin edge function source

Save it locally somewhere (`supabase/functions/verify-pin/index.ts` if you don't already have it checked into the repo). Note any secrets it references — if it uses `SUPABASE_SERVICE_ROLE_KEY`, that's set at the Supabase project level and you'll set the destination's equivalent in Phase 2.

---

## Phase 1: Set up the destination project (`klhzfwxpztaojekwgzcg`)

### 1.1 Enable required extensions

On destination, run:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()
```

(Supabase enables this by default in `extensions` schema, but verify — `gen_random_uuid()` is in your defaults.)

### 1.2 Replay the MAP migrations in order — schema only, NOT seed

Take this exact ordered list, pulled from your migration history, and apply each one to the destination project via `apply_migration`. **Skip the seed migrations** — those will be re-inserted by the data dump in Phase 2, and applying them now will cause unique-constraint conflicts on restore.

**Apply in this order:**

```
map_practice_phase1_schema
map_grant_anon_phase1_access
map_mastery_tracker
map_grant_anon_delete_session_attempts
map_record_attempt_fn
map_views_security_invoker
map_boost_sessions_and_child_cta
map_parent_settings_and_pin
map_add_language_subject
map_taxonomy_extensions_and_language_tags
map_taxonomy_round2_5_new_tags
map_consolidate_umbrella_chunk1
map_consolidate_umbrella_chunk2
map_drop_umbrella_lang_tags
map_adaptive_schema
map_pick_diagnostics_align_schema
map_grade3_question_format_and_index
```

**Skip these — data will come from the dump:**

```
map_seed_grade2_teks_standards
map_backfill_misconception_tags
map_seed_grade2_language_standards
map_backfill_v2_misc_lang_math_gap
map_backfill_round2_chunk1
map_backfill_round2_chunk2
map_seed_grade3_teks_standards
map_seed_grade3_math_sample
map_seed_grade3_reading_sample
map_seed_grade3_language_sample
```

The rule: any migration that's *schema* (CREATE TABLE/TYPE/FUNCTION/VIEW, ALTER, GRANT) → apply now. Any migration that's *data* (INSERT, UPDATE backfill) → skip; the data dump replays it.

After this phase, the destination has empty `map_*` tables with the right shape, all enums, all functions, all views, all grants — but no rows.

### 1.3 Verify the destination is structurally complete

```sql
-- Tables
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'map_%' ORDER BY tablename;

-- Enums
SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname LIKE 'map_%' GROUP BY t.typname;

-- Functions
SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'map_%';

-- Views
SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname LIKE 'map_v_%';

-- Row counts (should all be 0)
SELECT 'map_standards' AS t, count(*) FROM map_standards
UNION ALL SELECT 'map_questions', count(*) FROM map_questions
UNION ALL SELECT 'map_question_choices', count(*) FROM map_question_choices
UNION ALL SELECT 'map_reading_passages', count(*) FROM map_reading_passages
UNION ALL SELECT 'map_attempts', count(*) FROM map_attempts;
```

Compare each list against the source. Any missing piece, fix before moving on.

---

## Phase 2: Move the data

### 2.1 Get connection strings

You need the Postgres connection strings for both projects. In each Supabase dashboard: Settings → Database → Connection string → "URI" format. Use the **session pooler** or **direct connection** — *not* the transaction pooler (it doesn't support `pg_dump`'s prepared statements).

Save as env vars locally:

```bash
export SOURCE_DB="postgres://postgres.mnrseaapxpofdznnqrsv:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
export DEST_DB="postgres://postgres.klhzfwxpztaojekwgzcg:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
```

### 2.2 Dump data

```bash
pg_dump "$SOURCE_DB" \
  --data-only \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  --table='public.map_*' \
  --file=map_data.sql
```

`--disable-triggers` matters: your tables likely have foreign key constraints that need to load in the right order, and this lets the dump bypass them during load. `--no-owner` and `--no-privileges` keep Supabase-internal role assignments out of the file.

Open `map_data.sql` and skim the top — confirm it only references `public.map_*` tables. If anything from another project leaked in, stop and tell me.

### 2.3 Restore data to destination

```bash
psql "$DEST_DB" \
  --single-transaction \
  --set ON_ERROR_STOP=on \
  --file=map_data.sql
```

`--single-transaction` means if anything fails, it rolls back the whole load — no half-migrated state.

### 2.4 Verify row counts match

Run this on **both** projects and diff:

```sql
SELECT 'standards' AS t, count(*) FROM map_standards UNION ALL
SELECT 'passages', count(*) FROM map_reading_passages UNION ALL
SELECT 'questions', count(*) FROM map_questions UNION ALL
SELECT 'choices', count(*) FROM map_question_choices UNION ALL
SELECT 'students', count(*) FROM map_students UNION ALL
SELECT 'sessions', count(*) FROM map_test_sessions UNION ALL
SELECT 'attempts', count(*) FROM map_attempts UNION ALL
SELECT 'misc_tags', count(*) FROM map_misconception_tags UNION ALL
SELECT 'misc_signals', count(*) FROM map_misconception_signals
ORDER BY t;
```

Expected: identical counts on both sides. If any row is off, stop and investigate before cutover.

Also verify a view works:

```sql
SELECT count(*) FROM map_v_mastery_by_standard;
```

### 2.5 Deploy `verify-pin` edge function to destination

Using the Supabase CLI or dashboard, deploy the function source you saved in Phase 0. If it references any secrets, set them on the destination project.

Test it: hit the function endpoint with a known correct PIN; confirm a matching response.

---

## Phase 3: Cutover

### 3.1 Update env vars and redeploy

- **Local:** edit `.env.local` to point at destination URL + anon key. Run `npm run dev`, click around, take a test, confirm it works against the new DB.
- **Vercel:** update the two env vars in Settings → Environment Variables. Trigger a redeploy.

### 3.2 Smoke test in production

After Vercel redeploy:

1. Load the home page.
2. Start a math test — confirm questions load.
3. Answer a few — confirm `map_record_attempt` is logging by checking the destination's `map_attempts` table grows.
4. Hit `/parent`, enter PIN — confirm `verify-pin` works against the destination.
5. Run `node scripts/grade3-coverage.mjs` — confirm it returns the same numbers as before the migration.

If all five pass, you're cut over.

### 3.3 Decommission

- Wait 48 hours before deleting anything from source. You want at least one full day of usage against the new project before burning the bridge.
- After 48 hours of clean operation, in source project: `DROP TABLE` each `map_*` table (the source project hosts other apps, so don't delete the project itself — just remove your tables from it).
- Drop the MAP functions, views, and enums from source too. Order: views → functions → tables → enums.
- Pull the `verify-pin` edge function from source.
- Update `CLAUDE.md` §2 to reference the new project ref `klhzfwxpztaojekwgzcg`.

---

## Things that can go wrong, and what to do

**Enum ordering.** If `map_add_language_subject` was applied as `ALTER TYPE map_subject ADD VALUE 'language'` in the source, but you're rebuilding the destination from migrations in order, the destination's `map_subject` will already have all three values from the start (because `map_practice_phase1_schema` likely defines the type, and the later migration adds 'language' on top — the replay does the same thing in the same order, so this should just work). If you see an enum mismatch, check the order of those two migrations in your replay.

**`--disable-triggers` requires superuser.** Supabase's `postgres` user has it. If `pg_dump` complains, you're probably connected as the wrong role.

**Pooler connection rejects `pg_dump`.** If you used the transaction pooler (port 6543) by mistake, `pg_dump` will hang or error. Use the session pooler (port 5432) or direct connection.

**Sequence values.** If any tables have serial/identity columns (I don't think yours do — everything is UUID — but verify), `pg_dump --data-only` may not advance the sequence on destination. After restore, run `SELECT setval(...)` for each. Skip if all PKs are UUIDs.

**The `map_misconception_signals.active` generated column.** It's `GENERATED ALWAYS AS (cleared_at IS NULL) STORED`. The data dump will try to insert into it and fail. If you see this error, add `--exclude-table-data='public.map_misconception_signals'` to the dump and reload that one table separately with explicit column lists, or modify the dump SQL to drop the `active` column from the INSERT lists. Easiest fix: edit the dump file and remove `active` from the column list and value tuples for that table — it's auto-recomputed.

---

Send me the output of the row-count diff in step 2.4 once you get there. If anything else surprises you mid-runbook, stop and ask before pushing through.
