# Misconception Taxonomy Cleanup Plan

**Goal:** Eliminate the FK gap between `map_question_choices.misconception_tag` and `map_misconception_tags`, fold synonymous tags, seed the canonical Grade 3 tags listed in CLAUDE.md §9.5, and wire the orphan check into the authoring workflow so this never recurs.

**Background:** A 2026-05-03 incident took down a Grade 4 test session with `409: violates foreign key constraint map_misconception_signals_misconception_tag_fkey`. Root cause: `map_record_attempt` inserts into `map_misconception_signals` referencing the chosen distractor's `misconception_tag`, but ~140 distinct tag values that question authors used on choices were never registered in the parent taxonomy table. Hot-fix: 28 tags inserted on 2026-05-03 (16 G3 + 2 G3 + 10 G3 canonicals), then 29 G4-blocking tags inserted (same day) to unblock the kid. Remaining: **1,438 distractors across G2 (120) + G3 (1,318) carry orphan tags** — they will 409 the moment a student takes a G2 or G3 test that surfaces them.

**Why this matters:** The mastery tracker silently degrades when tags don't exist — no signal recorded → parent dashboard misses the misconception → recommended boost sets are wrong. Even if we never trigger another 409, every orphaned tag is a missed teaching signal.

---

## Brief→Repo facts (locked)

| Fact | Detail |
|---|---|
| Parent table | `public.map_misconception_tags` — columns: `tag, subject, display_name, description, remediation_hint, related_teks (text[]), child_cta`. All non-null in existing rows. |
| FK source | `map_misconception_signals.misconception_tag` references `map_misconception_tags.tag`. |
| Authoring source | `map_question_choices.misconception_tag` (text, nullable). Distractors set this; correct answers don't. |
| Canonical-tag list of record | `CLAUDE.md §9.5` lists ~30 canonical Grade 3 tags. Many were never seeded. |
| Check script | `scripts/check-misconception-orphans.mjs` (added 2026-05-03). Paginated PostgREST scan; exit 1 on orphans. |
| TEKS references | Math Grade 3: TAC §111.5, Grade 4: §111.6. ELAR Grade 3: §110.5, Grade 4: §110.6. Grade 2 math: §111.4. |

---

## Out of scope

- Backfilling `misconception_tag` on choices that are missing one (separate gap).
- Renaming or splitting existing parent rows that authors disagree with.
- Editing question stems or distractor bodies — only the tag→parent mapping.
- Updating the parent dashboard / boost-route logic — those read from `map_misconception_tags` and will pick up new rows automatically.
- Auto-fold logic in the runtime picker — folds happen via UPDATEs on `map_question_choices`, not at query time.

---

## Tasks

### Task 1: Inventory the orphan tags with usage counts and grade/subject breakdown

- [ ] Run `node --env-file=.env.local scripts/check-misconception-orphans.mjs` and capture output to `/tmp/orphan-report.txt`.
- [ ] Augment the script (or write `scripts/orphan-tag-inventory.mjs`) to also report **per-tag sample stems** — pull 1-2 example question stems for each orphan tag so the reviewer can judge what the tag was meant to capture.
- [ ] Group the inventory into three buckets:
  - **Canonical missing** — tags listed in CLAUDE.md §9.5 that aren't in the parent. These get seeded as-is.
  - **Synonyms / fold candidates** — tags that look like variants of an existing parent row (e.g., `evidence_wrong_paragraph` + `evidence_wrong_detail` may be one concept).
  - **Genuinely new** — tags that capture an error pattern not in the parent and not in §9.5. These get authored fresh.

**Acceptance:** A markdown report at `docs/notes/2026-05-03-orphan-tag-inventory.md` with three tables (one per bucket), each row containing tag · usage count · grade/subject distribution · sample stem.

### Task 2: Seed the canonical Grade 3 tags from CLAUDE.md §9.5

- [ ] Cross-reference the §9.5 lists (math, reading, language) against the current parent table and identify which canonical tags are missing.
- [ ] Author proper metadata for each (`display_name`, `description`, `remediation_hint`, `related_teks`, `child_cta`) — same shape as existing rows.
- [ ] Insert via a migration file at `migrations/20260504_map_seed_canonical_misconceptions.sql` (uses `INSERT ... ON CONFLICT (tag) DO NOTHING` for idempotency).

**Acceptance:** Every tag listed in CLAUDE.md §9.5 exists in `map_misconception_tags`. Re-run the orphan check; the canonical-bucket count drops to 0.

### Task 3: Decide folds for synonym candidates

- [ ] For each fold candidate from Task 1, write a short rationale: "Fold `X` into existing `Y` because Z." Examples to evaluate:
  - `pronoun_subject_as_object` ↔ canonical `pronoun_object_as_subject` — these are inverses; might keep both as distinct rows OR fold into one symmetric `pronoun_case_swap`.
  - `author_purpose_topic_not_purpose` ↔ canonical `purpose_picked_topic_overgeneralization` (already added in 2026-05-03 hot-fix).
  - `evidence_wrong_paragraph` + `evidence_wrong_detail` ↔ canonical `text_evidence_misread`.
  - `verb_tense_inconsistent` (89 distractors) — likely needs its own row, not a fold.
- [ ] For each accepted fold, write SQL to `UPDATE map_question_choices SET misconception_tag = 'canonical_tag' WHERE misconception_tag = 'old_tag'`. Bundle into the same migration as Task 4.

**Acceptance:** A decision log at `docs/notes/2026-05-03-misconception-fold-decisions.md` listing each fold with rationale. No fold runs without a decision row.

### Task 4: Author + seed the genuinely-new tags

- [ ] For each orphan tag that is *not* canonical and *not* a fold candidate, author full metadata (same 7-column shape).
- [ ] Insert into `migrations/20260504_map_seed_canonical_misconceptions.sql` alongside the canonical seeds and fold UPDATEs.

**Acceptance:** After applying the migration, `node scripts/check-misconception-orphans.mjs` exits 0 across all grades.

### Task 5: Wire the orphan check into the authoring workflow

- [ ] Add an npm script: `"check-tags": "node --env-file=.env.local scripts/check-misconception-orphans.mjs"` in `package.json`.
- [ ] Document in `CLAUDE.md §9.5` (the "Misconception tagging is the firm rule" section) that **`npm run check-tags` MUST exit 0 before any question-bank migration is applied** — same status as the misconception rollup.
- [ ] Optional but recommended: add a Vercel cron at `/api/cron/check-tag-health` that runs the check daily and pushes a notification on regression.

**Acceptance:** A new author following CLAUDE.md cannot ship a question-bank migration without confirming the check passes.

### Task 6: Audit the runtime picker for grade leakage

- [ ] Verify `src/lib/adaptive/picker.ts` and `passagePicker.ts` enforce `.eq('grade', studentGrade)` on every candidate fetch — confirmed visually 2026-05-03 (`picker.ts:200`, `passagePicker.ts:122`), but add an integration test.
- [ ] Add `scripts/test-adaptive-grade-isolation.mjs` that simulates 50 G4 sessions and asserts every picked question has `grade = 4`. Add to CI.

**Acceptance:** Test passes 50/50 and is added to the pre-merge checklist.

### Task 7: Add an `is_active` flag (or use `archived_at`) for retiring stale tags

- [ ] If Task 3 generates many folds, the source tags become unreferenced but still exist in the parent. Decide whether to delete them outright or mark them inactive (preserves audit trail of "this tag was once used").
- [ ] If keeping them, add an `archived_at timestamptz` column to `map_misconception_tags` and update the parent dashboard to hide archived rows.

**Acceptance:** Either deletion is documented as the chosen path, OR `archived_at` is added with parent-dashboard support.

---

## Acceptance for the whole plan

- [ ] `scripts/check-misconception-orphans.mjs` exits 0 for all grades.
- [ ] CLAUDE.md §9.5 references `npm run check-tags` as a required pre-merge step.
- [ ] CLAUDE.md §9.5 canonical tag list matches `map_misconception_tags` exactly (no §9.5 tag missing from the table).
- [ ] Adaptive grade-isolation test in CI.
- [ ] Decision log committed for any tag folds, so future authors know why merges happened.

---

## Risk / open questions

- **Fold direction matters.** Folding `verb_tense_inconsistent` into something coarser (like `verb_form_missing_helper`) loses signal in the parent dashboard. Lean toward keeping distinct rows unless the kid-facing remediation would be identical.
- **TEKS code accuracy.** The 2026-05-03 hot-fix used best-guess TEKS codes (e.g., `4.5C` for perimeter). A second pass should verify against TAC §111.6 / §110.6 — wrong codes cause weird associations on the parent dashboard's TEKS heatmap.
- **G2 orphans (120 distractors).** Lower priority since G2 is the original Phase 1 grade and presumably stable, but they'll 409 if anyone runs a G2 test on the new mastery code path. Worth confirming whether G2 even goes through `map_record_attempt` (it might predate the misconception signal logic).
