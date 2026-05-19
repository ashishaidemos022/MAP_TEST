# Feature Brief: Parent Question Bank + MCP Write Tools (Phase 4) — V3

> Hand this entire document to Claude Code in the MAP practice app repo. It is a complete spec — schema, routes, tools, UI, acceptance criteria. Read it end-to-end before starting. Read `MULTI_USER_BRIEF.md` and `MCP_Brief_V1.md` first; this brief depends on `map_families`, `map_students`, the `map_current_family_id()` function, and the MCP server, token table, audit table, and tool-registration scaffolding from those briefs. Append the relevant parts to `CLAUDE.md` when done.
>
> **V2 changes vs V1:** adds full first-class support for reading passages and passage-based language questions. Passages are a separate entity, versioned independently, with their own author/edit/publish lifecycle. A composite MCP tool creates a passage and its questions atomically. The schema enforces per-subject rules: math is always standalone, reading always passage-based, language allows both.
>
> **V3 changes vs V2 — SVG illustrations (MCP-only authoring in this phase):** Passages, question stems, and individual answer choices may carry an optional inline SVG illustration. AI agents authoring through MCP can generate SVGs natively (a geometry diagram for a math question, a small figure inside a passage, a "which of these shapes" set of four answer SVGs). The parent UI **does not author or edit SVGs in this phase** — it only renders and previews what AI produced, and gives the parent a one-click "remove this image" action per slot. SVG content is sanitized server-side at write time against a strict allowlist (no script, no external references, no `foreignObject`, no event handlers); a `bytea`-stored sanitized form is rendered as `data:image/svg+xml;base64,...` rather than injected into the DOM, which neutralizes any sanitizer gap. The MCP tool descriptions include an explicit capability statement so agents know SVG is supported and what the constraints are.

---

## 1. What we are building and why

The custom-test feature today lets a parent compose a test by picking topics from our **vetted** question bank — they choose subject/grade/difficulty/length and we draw from questions our team has written and reviewed. This brief adds a second source: a **parent-authored question bank** spanning all three subjects (math, reading, language), with full support for reading passages and passage-based language items.

The bank lives in two places at once. Parents can author content through the new `/parent/questions` and `/parent/passages` UI, but they can also author through their AI agent: from Claude.ai or Cursor or anywhere MCP-compatible, the same agent that already reads their family's practice data (Phase 3) can now *write* custom passages and questions into the bank. The intended loop is the one that makes the feature actually valuable: Claude reads `get_top_misconceptions` and `get_recent_wrong_answers`, sees that Maya keeps confusing equivalent fractions and struggling with author's-purpose questions, and generates ten targeted math practice questions plus a short nonfiction passage with five reading questions tuned to her actual weaknesses. Without that loop, parents will write five questions and stop.

Letting an agent write into a database belonging to a family with kids in it is a different kind of trust than letting it read. We handle that with **draft-by-default**: every passage and every question created via MCP — and optionally also via UI — lands in `status='draft'` and is invisible to kids until the parent reviews and publishes it. The parent's UI has a review queue. AI never auto-publishes.

**Why this shape, not "just let parents write questions in the UI":**

- The MCP-driven loop is the differentiator. A blank "create question" form will get used twice and abandoned. An agent that says "I noticed Maya struggles with X, want me to draft 10 questions and one passage on it?" gets used weekly.
- Versioned content is the only way edit semantics work without corrupting history. We commit to versioning from day one — for both questions and passages — rather than retrofitting it later when a parent edits a passage and three months of analytics shift under their feet.
- Reading is a passage-first medium. Trying to retrofit passage support after shipping standalone-question-only would mean migrating data and rewriting every analytics surface. We do it now.
- Parent-authored content is segregated from vetted analytics by default. We never silently blend the two — a parent's bad question shouldn't make their kid look weaker than they are.

**Hard rules — do not violate these:**

- **Family-scoped, always.** Every passage and every question belongs to exactly one family. No cross-family read or write, ever. Acceptance test §12.5 verifies this with two real families; if it fails, ship is blocked.
- **AI-created content ALWAYS lands in draft.** No exceptions, no "trust me" flag, no opt-out. Manual UI creation may default to draft or published per parent setting (default: draft); MCP creation is always draft. This applies equally to passages and questions.
- **Soft delete only.** Custom questions and passages may be referenced by historical attempts. Hard-deleting them corrupts session history. Use `soft_deleted_at` everywhere.
- **Versioned content.** Editing a *published* question or passage creates a new version. Old attempts continue to reference the version they were answered against. Drafts edit in place.
- **Subject rules enforced in the database.** Math questions never have a passage. Published reading questions always have a passage. Language questions may have either shape. Trigger-enforced; not just documented in code.
- **Passage edits do not auto-propagate to questions.** When a parent revises a published passage, existing questions keep pointing at the old passage version. The UI surfaces a one-click "upgrade to current passage version" action. This preserves the kid's attempt history and gives the parent explicit control over which questions move forward.
- **Write tools are scoped.** The MCP write surface only ever touches the custom-question and custom-passage tables. Never sessions, never attempts, never kids, never the vetted bank. Acceptance test §12.10 greps for this.
- **Vetted and custom analytics never silently merge.** Reports, the test builder, and the MCP read tools all distinguish source. Custom content is opt-in inclusion, not default contribution.
- **Custom content is visually marked everywhere it appears.** Test results, review screens, MCP responses. The marker is a `source` field in API output and a badge in UI.
- **Community submission is gated and out of scope for v1.** The schema accommodates it (`community_submitted_at` columns on both passages and questions) but no submission flow ships in this brief. AI-generated content can never be community-submitted, period — only `source='parent_manual'` is eligible when that feature lands.
- **No question-bank exfiltration via MCP.** The existing rule from `MCP_Brief_V1` §1 stands: tools may only return content tied to the requesting family. Custom content is family-scoped by construction; the rule applies trivially. Just don't build a `search_all_custom_passages` tool.
- **SVG is sanitized at write time, never trusted at read time.** Every SVG passing through any MCP tool or RPC is run through the allowlist sanitizer in §4.12 *before* persistence. The stored form is the post-sanitization output, not the agent's submission. Renderers always render via base64 data URL into an `<img>` tag — never inject SVG into the DOM. If the sanitizer fails, the write is rejected, not silently stripped. There is no "SVG passthrough" mode, no admin override, no "trusted source" exemption.
- **SVG authoring is MCP-only in this phase.** The parent UI shows what AI produced and lets the parent remove individual SVGs, but does not include a drawing tool, file upload, or paste-SVG affordance. This is a deliberate scope boundary — `parent_manual` source content has no SVG fields populated, ever.

---

## 2. Amendments to MCP_Brief_V1

This brief amends the prior MCP brief in three places. Update those sections in `MCP_Brief_V1.md` after this work ships, or note the amendment inline.

**Amendment A — §1 Hard rules.** "Read-only in v1" becomes:

> **Reads are unrestricted within family scope. Writes are restricted to the custom question bank — specifically `map_custom_questions`, `map_custom_question_versions`, `map_custom_question_choices`, `map_custom_passages`, `map_custom_passage_versions` — and nothing else.** No tool may insert, update, or delete any row in any other table. Audit-log inserts and the `last_used_at` bump on `map_mcp_tokens` are server-internal mutations, not exposed via tools.

**Amendment B — §4.4 Rate limiting.** Add write quotas:

| Window | Limit | Scope |
|---|---|---|
| 1 min | 60 requests | per token (existing) |
| 1 day | 2,000 requests | per token (existing) |
| 1 day | 250 question creates | **per family** (new) |
| 1 day | 50 passage creates | **per family** (new) |
| 1 day | 100 question updates | **per family** (new) |
| 1 day | 25 passage updates | **per family** (new) |

Write quotas are per-family, not per-token, because the cost is content volume in the database, not request volume. A parent with three tokens can't bypass the quota by rotating through them. The composite tool `create_custom_passage_and_questions` counts against both the passage quota (1) and the question quota (N). Quota refills at midnight in the family's timezone (fall back to UTC if not set). Exceeded write quota returns 429 with `{ "error": "write_quota_exceeded", "scope": "family", "kind": "passage_create" | "question_create" | "question_update" | "passage_update", "resets_at": "<iso>" }`.

**Amendment C — §6.4 Audit log redaction.** For *write* tools, log full `tool_args` without truncation (within the existing 50KB cap). The audit row is the parent's record of what the agent created on their behalf; redacting it defeats the point. Passage bodies in particular can be long — keep the cap at 50KB and truncate with a `[truncated]` marker if a single tool call exceeds it. **For SVG fields specifically, log only a SHA-256 hash and byte length** rather than the SVG body — SVGs are large, mostly noise to skim through, and the actual sanitized content is already persisted in the database where the parent can review it. The redaction rule from the prior brief still applies to read tools — that hasn't changed.

**Amendment D — new §4.13 Server capability statement.** The MCP server exposes its capabilities (including SVG support, sanitization rules, and slot locations) via the `serverInfo.instructions` field in the `initialize` response, plus echoed in each write tool's description. This is how agents know SVG authoring is supported and what the constraints are — see §5.0.

---

## 3. Mental model

```
                    ┌───────────────────────────┐
                    │   Parent (UI or via AI)   │
                    └───────────┬───────────────┘
                                │
                ┌───────────────┴────────────────┐
                │                                │
                ▼                                ▼
    ┌─────────────────────┐         ┌───────────────────────┐
    │ /parent/questions/* │         │  MCP /api/mcp         │
    │ /parent/passages/*  │         │  (token-authed)       │
    └──────────┬──────────┘         └───────────┬───────────┘
               │                                │
               │  RLS-scoped via authed         │  service role +
               │  Supabase client               │  explicit family_id filter
               │                                │
               └────────────────┬───────────────┘
                                ▼
        ┌─────────────────────────────────────────────────┐
        │  map_custom_passages         (header)           │
        │  map_custom_passage_versions (versioned body)   │
        │                                                 │
        │  map_custom_questions        (header)           │
        │  map_custom_question_versions (versioned body)  │
        │      └─ passage_version_id (nullable FK) ──┐   │
        │  map_custom_question_choices               │   │
        │      (3–5 per version, exactly 1 correct)  │   │
        └────────────────────────────────────────────┴───┘
                                 │
                                 │ referenced by version_id
                                 ▼
                  ┌─────────────────────────────┐
                  │  existing test_sessions /   │  attempt rows now polymorphic:
                  │  test_attempts tables       │  vetted_question_id OR
                  │                             │  custom_question_version_id
                  └─────────────────────────────┘
```

Both write paths land in the same tables. Both observe family scoping (UI via RLS; MCP via service role + explicit `family_id` filter, same pattern as Phase 3 reads). The lifecycle for both passages and questions is `draft → published → archived` with soft-delete orthogonal to status.

The passage–question relationship: a question version optionally references a passage version. When a parent revises a passage, the passage's `current_version_id` advances but existing questions keep their old `passage_version_id`. The UI shows "this question references passage v2; the passage is now at v3 — upgrade?" with a one-click upgrade button. This preserves attempt history and respects parent agency.

---

## 4. Database changes

Apply as migration `map_custom_questions_and_passages`. Single transaction, idempotent, wrapped `BEGIN; ... COMMIT;`. Validation queries below the COMMIT as comments.

### 4.1 Passages: header table

```sql
CREATE TABLE IF NOT EXISTS public.map_custom_passages (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id               uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_version_id      uuid,                          -- FK added after versions table exists
  source                  text NOT NULL,
  status                  text NOT NULL DEFAULT 'draft',
  created_via             text NOT NULL,
  community_submitted_at  timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  soft_deleted_at         timestamptz,
  CONSTRAINT map_cp_source_check
    CHECK (source IN ('parent_manual','parent_ai_assisted','parent_ai_generated')),
  CONSTRAINT map_cp_status_check
    CHECK (status IN ('draft','published','archived')),
  CONSTRAINT map_cp_via_check
    CHECK (created_via IN ('ui','mcp')),
  CONSTRAINT map_cp_community_only_manual
    CHECK (community_submitted_at IS NULL OR source = 'parent_manual')
);

CREATE INDEX IF NOT EXISTS map_cp_family_idx
  ON public.map_custom_passages (family_id) WHERE soft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS map_cp_family_status_idx
  ON public.map_custom_passages (family_id, status) WHERE soft_deleted_at IS NULL;
```

### 4.2 Passages: versions table

```sql
CREATE TABLE IF NOT EXISTS public.map_custom_passage_versions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passage_id              uuid NOT NULL REFERENCES public.map_custom_passages(id) ON DELETE CASCADE,
  version_number          int  NOT NULL,
  subject                 text NOT NULL,                 -- 'reading' or 'language' only
  grade                   int  NOT NULL,
  title                   text,
  body                    text NOT NULL,
  genre                   text,                          -- 'fiction'|'nonfiction'|'poetry'|'drama'|'informational'|'editing_draft'
  estimated_grade_level   numeric(3,1),                  -- e.g. 4.2; optional, parent can set or AI can suggest
  standard_codes          text[] DEFAULT '{}',           -- TEKS codes the passage supports; multiple allowed
  passage_svg             bytea,                         -- sanitized SVG; null when no illustration
  passage_svg_alt_text    text,                          -- alt text, required when passage_svg is non-null
  ai_metadata             jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_cpv_subject_check CHECK (subject IN ('reading','language')),
  CONSTRAINT map_cpv_grade_check CHECK (grade BETWEEN 0 AND 12),
  CONSTRAINT map_cpv_body_len CHECK (char_length(body) BETWEEN 50 AND 10000),
  CONSTRAINT map_cpv_title_len CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT map_cpv_genre_check CHECK (
    genre IS NULL OR genre IN ('fiction','nonfiction','poetry','drama','informational','editing_draft')
  ),
  CONSTRAINT map_cpv_svg_size CHECK (passage_svg IS NULL OR octet_length(passage_svg) BETWEEN 100 AND 65536),
  CONSTRAINT map_cpv_svg_needs_alt CHECK (passage_svg IS NULL OR (passage_svg_alt_text IS NOT NULL AND char_length(passage_svg_alt_text) BETWEEN 1 AND 500)),
  UNIQUE (passage_id, version_number)
);

CREATE INDEX IF NOT EXISTS map_cpv_passage_idx
  ON public.map_custom_passage_versions (passage_id, version_number DESC);
CREATE INDEX IF NOT EXISTS map_cpv_subject_grade_idx
  ON public.map_custom_passage_versions (subject, grade);
```

`subject` is constrained to reading and language only — math questions never reference passages. `genre='editing_draft'` is the natural label for language passages with numbered sentences that the questions ask the kid to revise. `standard_codes` is an array because a single passage commonly supports multiple TEKS standards (a fiction passage might cover both inferencing and figurative language).

`body` text supports basic markdown (bold, italic, paragraph breaks). Sanitize on write — disallow raw HTML, script tags, image markdown for now (image support is Phase 5). 50–10000 char range covers everything from a 3-sentence prompt to a 1500-word STAAR-length passage with headroom.

For language editing passages with numbered sentences, the convention is to write them inline: `(1) The dog ran. (2) It was happy.` Questions then reference "sentence 2" in their stem. No special infrastructure needed for this; it lives in the body text.

`passage_svg` stores the post-sanitization SVG bytes (raw UTF-8 SVG XML, not gzipped — Postgres TOAST handles compression). 64KB is plenty for any reasonable diagram and well under the practical render budget. `passage_svg_alt_text` is required whenever `passage_svg` is non-null — both for accessibility and so a parent reviewing AI-generated content can read what the figure is supposed to depict before approving. Alt text is also what the screen reader speaks and what gets shown if rendering fails. If a parent later removes an SVG (single-click action in the UI), both `passage_svg` and `passage_svg_alt_text` are nulled in a new version.

### 4.3 Header → version FK for passages

```sql
ALTER TABLE public.map_custom_passages
  ADD CONSTRAINT map_cp_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES public.map_custom_passage_versions(id)
  DEFERRABLE INITIALLY DEFERRED;
```

### 4.4 Questions: header table

```sql
CREATE TABLE IF NOT EXISTS public.map_custom_questions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id               uuid NOT NULL REFERENCES public.map_families(id) ON DELETE CASCADE,
  owner_user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_version_id      uuid,
  source                  text NOT NULL,
  status                  text NOT NULL DEFAULT 'draft',
  created_via             text NOT NULL,
  community_submitted_at  timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  soft_deleted_at         timestamptz,
  CONSTRAINT map_cq_source_check
    CHECK (source IN ('parent_manual','parent_ai_assisted','parent_ai_generated')),
  CONSTRAINT map_cq_status_check
    CHECK (status IN ('draft','published','archived')),
  CONSTRAINT map_cq_via_check
    CHECK (created_via IN ('ui','mcp')),
  CONSTRAINT map_cq_community_only_manual
    CHECK (community_submitted_at IS NULL OR source = 'parent_manual')
);

CREATE INDEX IF NOT EXISTS map_cq_family_idx
  ON public.map_custom_questions (family_id) WHERE soft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS map_cq_family_status_idx
  ON public.map_custom_questions (family_id, status) WHERE soft_deleted_at IS NULL;
```

`source` distinguishes how the question was authored. `parent_manual` means the parent typed it. `parent_ai_assisted` means the parent started in the UI and used an AI helper for distractors/explanations/tags but reviewed each piece. `parent_ai_generated` means it came in through MCP (or a future "generate N for me" UI button). The same enum applies to passages.

`created_via` is an orthogonal axis — `'ui'` or `'mcp'` — useful for debugging and analytics. Don't conflate with `source`: a parent can manually type a question through MCP (`source='parent_manual'`, `created_via='mcp'`) and that's fine, just rare.

### 4.5 Questions: versions table (with passage reference)

```sql
CREATE TABLE IF NOT EXISTS public.map_custom_question_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id         uuid NOT NULL REFERENCES public.map_custom_questions(id) ON DELETE CASCADE,
  version_number      int  NOT NULL,
  subject             text NOT NULL,
  grade               int  NOT NULL,
  stem                text NOT NULL,
  stem_svg            bytea,                             -- sanitized SVG illustration of the question stem
  stem_svg_alt_text   text,                              -- required when stem_svg is non-null
  passage_version_id  uuid REFERENCES public.map_custom_passage_versions(id) ON DELETE RESTRICT,
  question_focus      text,                              -- optional pointer like "the underlined word" or "sentence 3"
  standard_code       text,
  difficulty          int,
  ai_metadata         jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_cqv_subject_check CHECK (subject IN ('math','reading','language')),
  CONSTRAINT map_cqv_grade_check CHECK (grade BETWEEN 0 AND 12),
  CONSTRAINT map_cqv_stem_len CHECK (char_length(stem) BETWEEN 5 AND 2000),
  CONSTRAINT map_cqv_focus_len CHECK (question_focus IS NULL OR char_length(question_focus) BETWEEN 1 AND 200),
  CONSTRAINT map_cqv_difficulty_check CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5),
  CONSTRAINT map_cqv_stem_svg_size CHECK (stem_svg IS NULL OR octet_length(stem_svg) BETWEEN 100 AND 65536),
  CONSTRAINT map_cqv_stem_svg_needs_alt
    CHECK (stem_svg IS NULL OR (stem_svg_alt_text IS NOT NULL AND char_length(stem_svg_alt_text) BETWEEN 1 AND 500)),
  -- Math questions cannot reference a passage. Always.
  CONSTRAINT map_cqv_math_no_passage
    CHECK (subject <> 'math' OR passage_version_id IS NULL),
  UNIQUE (question_id, version_number)
);

CREATE INDEX IF NOT EXISTS map_cqv_question_idx
  ON public.map_custom_question_versions (question_id, version_number DESC);
CREATE INDEX IF NOT EXISTS map_cqv_standard_idx
  ON public.map_custom_question_versions (standard_code) WHERE standard_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS map_cqv_passage_idx
  ON public.map_custom_question_versions (passage_version_id) WHERE passage_version_id IS NOT NULL;
```

Three subject-shape rules:
- **Math**: `passage_version_id` is always null. Enforced by CHECK above.
- **Reading**: `passage_version_id` must be non-null when the question is published. Enforced by trigger in §4.7 (so drafts can be assembled in any order).
- **Language**: `passage_version_id` may be either null (standalone, e.g. "what's the past tense of run?") or non-null (passage-based, e.g. an editing-draft passage). No constraint either way.

`question_focus` is a short optional pointer used mainly for passage-based language questions. Examples: `"the underlined word in sentence 3"`, `"the comma after 'However'"`, `"line 14"`. For math and most reading it stays null.

The FK to passage versions uses `ON DELETE RESTRICT` — even an admin running raw SQL can't delete a passage version that questions point at. Pair with the soft-delete-only rule for defense in depth.

### 4.6 Choices

```sql
CREATE TABLE IF NOT EXISTS public.map_custom_question_choices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id          uuid NOT NULL REFERENCES public.map_custom_question_versions(id) ON DELETE CASCADE,
  ordinal             int  NOT NULL,
  label               text NOT NULL,
  text                text NOT NULL,
  choice_svg          bytea,                             -- sanitized SVG; for visual choices like "which shape"
  choice_svg_alt_text text,                              -- required when choice_svg is non-null
  is_correct          boolean NOT NULL DEFAULT false,
  explanation_correct text,
  explanation_wrong   text,
  misconception_tag   text REFERENCES public.map_misconception_tags(tag) ON DELETE SET NULL,
  CONSTRAINT map_cqc_ordinal_check CHECK (ordinal BETWEEN 0 AND 4),
  CONSTRAINT map_cqc_label_check CHECK (label IN ('A','B','C','D','E')),
  CONSTRAINT map_cqc_text_len CHECK (char_length(text) BETWEEN 1 AND 500),
  CONSTRAINT map_cqc_explcorrect_len
    CHECK (explanation_correct IS NULL OR char_length(explanation_correct) BETWEEN 1 AND 1500),
  CONSTRAINT map_cqc_explwrong_len
    CHECK (explanation_wrong IS NULL OR char_length(explanation_wrong) BETWEEN 1 AND 1500),
  CONSTRAINT map_cqc_correct_needs_expl
    CHECK (is_correct = false OR explanation_correct IS NOT NULL),
  CONSTRAINT map_cqc_choice_svg_size
    CHECK (choice_svg IS NULL OR octet_length(choice_svg) BETWEEN 100 AND 32768),
  CONSTRAINT map_cqc_choice_svg_needs_alt
    CHECK (choice_svg IS NULL OR (choice_svg_alt_text IS NOT NULL AND char_length(choice_svg_alt_text) BETWEEN 1 AND 300)),
  UNIQUE (version_id, ordinal),
  UNIQUE (version_id, label)
);

CREATE INDEX IF NOT EXISTS map_cqc_version_idx
  ON public.map_custom_question_choices (version_id, ordinal);
```

`misconception_tag` references the existing taxonomy. Parents pick from existing tags — they cannot create new ones in v1. This is intentional: a parent-authored taxonomy will fragment the misconception aggregation almost immediately.

`choice_svg` exists for the "visual answer choice" pattern: a math question asking "which figure has the largest area" with four shape SVGs as options, or a geometry question asking "which net folds into a cube" with four nets to pick from. The cap is smaller than passage/stem SVG (32KB vs 64KB) because answer-choice illustrations are by nature small and simple — if AI is generating something complex enough to need 64KB for a single choice, it's almost certainly drawing the wrong thing. Either all choices in a version have an SVG or none do — enforced by trigger in §4.7. Mixing text-only choices with visual choices in the same question is allowed *only* when text-only choices have a `text` field that is meaningful on its own (like a label "Figure A" alongside the SVG); the renderer checks this and the agent is instructed in tool descriptions to generate parallel choice formats.

### 4.7 Triggers for shape invariants

Two layers of invariants the schema can't express in CHECK alone:

1. Every **published** question version must have 3–5 choices and exactly 1 correct.
2. Every **published** reading question must have a non-null `passage_version_id`.
3. The passage referenced by a published question must itself be `published` (you can't ship a question pointing at a draft passage).

Enforce all three with deferred constraint triggers that fire on COMMIT.

```sql
CREATE OR REPLACE FUNCTION public.map_validate_custom_question_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_version_id uuid;
  v_choice_count int;
  v_correct_count int;
  v_choice_svg_count int;
  v_subject text;
  v_passage_version_id uuid;
  v_question_status text;
  v_passage_status text;
BEGIN
  v_version_id := COALESCE(NEW.version_id, OLD.version_id);

  SELECT count(*),
         count(*) FILTER (WHERE is_correct),
         count(*) FILTER (WHERE choice_svg IS NOT NULL)
    INTO v_choice_count, v_correct_count, v_choice_svg_count
  FROM public.map_custom_question_choices
  WHERE version_id = v_version_id;

  SELECT v.subject, v.passage_version_id, q.status
    INTO v_subject, v_passage_version_id, v_question_status
  FROM public.map_custom_question_versions v
  JOIN public.map_custom_questions q ON q.id = v.question_id
  WHERE v.id = v_version_id;

  -- Only enforce on published questions; drafts may be in flight.
  IF v_question_status = 'published' THEN
    IF v_choice_count NOT BETWEEN 3 AND 5 THEN
      RAISE EXCEPTION 'published version % must have 3-5 choices, has %', v_version_id, v_choice_count;
    END IF;
    IF v_correct_count <> 1 THEN
      RAISE EXCEPTION 'published version % must have exactly 1 correct choice, has %', v_version_id, v_correct_count;
    END IF;
    -- All choices have an SVG, or none do. No partial sets.
    IF v_choice_svg_count <> 0 AND v_choice_svg_count <> v_choice_count THEN
      RAISE EXCEPTION 'published version % has SVG on % of % choices; must be all or none',
        v_version_id, v_choice_svg_count, v_choice_count;
    END IF;
    IF v_subject = 'reading' AND v_passage_version_id IS NULL THEN
      RAISE EXCEPTION 'published reading question % must reference a passage', v_version_id;
    END IF;
    IF v_passage_version_id IS NOT NULL THEN
      SELECT p.status INTO v_passage_status
      FROM public.map_custom_passage_versions pv
      JOIN public.map_custom_passages p ON p.id = pv.passage_id
      WHERE pv.id = v_passage_version_id;
      IF v_passage_status <> 'published' THEN
        RAISE EXCEPTION 'published question % cannot reference a passage in status %', v_version_id, v_passage_status;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER map_validate_custom_question_version_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.map_custom_question_choices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.map_validate_custom_question_version();

-- Also fire when the version row itself changes (e.g. status of its question changes).
CREATE CONSTRAINT TRIGGER map_validate_custom_question_version_self_trg
  AFTER INSERT OR UPDATE ON public.map_custom_question_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.map_validate_custom_question_version();
```

The publish RPCs (§4.9) wrap their final step in `SET CONSTRAINTS ALL IMMEDIATE` to surface validation errors before the transaction commits.

### 4.8 Polymorphic attempt reference

Add to the existing attempts table:

```sql
ALTER TABLE public.map_test_attempts
  ADD COLUMN IF NOT EXISTS custom_question_version_id uuid
    REFERENCES public.map_custom_question_versions(id) ON DELETE RESTRICT;

ALTER TABLE public.map_test_attempts
  ADD CONSTRAINT map_test_attempts_question_xor
  CHECK (
    (question_id IS NOT NULL AND custom_question_version_id IS NULL) OR
    (question_id IS NULL AND custom_question_version_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS map_test_attempts_custom_version_idx
  ON public.map_test_attempts (custom_question_version_id) WHERE custom_question_version_id IS NOT NULL;
```

Note: the attempt row references the `custom_question_version_id` only. The passage version the kid actually saw is reachable by joining through the question version. This keeps the attempt row narrow and is sufficient because once a question is published, the parent has to *explicitly* upgrade its passage reference to a new version — the kid will never see a question with a passage version that wasn't current at the time of the attempt unless the parent did that upgrade after the fact, in which case the attempt history correctly reflects the version that *was* in force.

### 4.9 RPCs

Five RPCs cover the operations that benefit from being atomic:

```sql
-- Create a passage with its first version. Returns passage_id. Defaults to draft.
CREATE OR REPLACE FUNCTION public.map_create_custom_passage(
  p_source         text,
  p_created_via    text,
  p_subject        text,                                  -- 'reading' or 'language'
  p_grade          int,
  p_title          text,
  p_body           text,
  p_genre          text,
  p_estimated_grade_level numeric,
  p_standard_codes text[],
  p_ai_metadata    jsonb,
  p_passage_svg    bytea DEFAULT NULL,                    -- pre-sanitized by caller (lib/svg/sanitize.ts)
  p_passage_svg_alt_text text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family_id uuid;
  v_user_id uuid;
  v_passage_id uuid;
  v_version_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_family_id := public.map_current_family_id();
  IF v_family_id IS NULL THEN RAISE EXCEPTION 'no family for current user'; END IF;

  -- alt text required when SVG present (also enforced by CHECK)
  IF p_passage_svg IS NOT NULL AND (p_passage_svg_alt_text IS NULL OR length(p_passage_svg_alt_text) = 0) THEN
    RAISE EXCEPTION 'passage_svg_alt_text required when passage_svg is provided';
  END IF;

  INSERT INTO public.map_custom_passages
    (family_id, owner_user_id, source, created_via)
    VALUES (v_family_id, v_user_id, p_source, p_created_via)
    RETURNING id INTO v_passage_id;

  INSERT INTO public.map_custom_passage_versions
    (passage_id, version_number, subject, grade, title, body, genre, estimated_grade_level,
     standard_codes, passage_svg, passage_svg_alt_text, ai_metadata)
    VALUES (v_passage_id, 1, p_subject, p_grade, p_title, p_body, p_genre, p_estimated_grade_level,
            COALESCE(p_standard_codes, '{}'), p_passage_svg, p_passage_svg_alt_text, p_ai_metadata)
    RETURNING id INTO v_version_id;

  UPDATE public.map_custom_passages
     SET current_version_id = v_version_id
   WHERE id = v_passage_id;

  RETURN v_passage_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_create_custom_passage(text,text,text,int,text,text,text,numeric,text[],jsonb,bytea,text) TO authenticated;
```

```sql
-- Publish a draft passage. Validates immediately.
CREATE OR REPLACE FUNCTION public.map_publish_custom_passage(p_passage_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.map_custom_passages
     SET status = 'published', updated_at = now()
   WHERE id = p_passage_id
     AND family_id = public.map_current_family_id()
     AND status = 'draft'
     AND soft_deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'passage not found, not yours, not in draft, or deleted';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_publish_custom_passage(uuid) TO authenticated;
```

```sql
-- Revise a published passage by creating a new version atomically.
CREATE OR REPLACE FUNCTION public.map_revise_custom_passage(
  p_passage_id     uuid,
  p_subject        text,
  p_grade          int,
  p_title          text,
  p_body           text,
  p_genre          text,
  p_estimated_grade_level numeric,
  p_standard_codes text[],
  p_ai_metadata    jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family_id uuid;
  v_next_version int;
  v_version_id uuid;
BEGIN
  v_family_id := public.map_current_family_id();
  IF NOT EXISTS (
    SELECT 1 FROM public.map_custom_passages
    WHERE id = p_passage_id AND family_id = v_family_id
      AND soft_deleted_at IS NULL AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'passage not found, not yours, deleted, or not published';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM public.map_custom_passage_versions WHERE passage_id = p_passage_id;

  INSERT INTO public.map_custom_passage_versions
    (passage_id, version_number, subject, grade, title, body, genre, estimated_grade_level, standard_codes, ai_metadata)
    VALUES (p_passage_id, v_next_version, p_subject, p_grade, p_title, p_body, p_genre, p_estimated_grade_level,
            COALESCE(p_standard_codes, '{}'), p_ai_metadata)
    RETURNING id INTO v_version_id;

  UPDATE public.map_custom_passages
     SET current_version_id = v_version_id, updated_at = now()
   WHERE id = p_passage_id;

  RETURN v_version_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_revise_custom_passage(uuid,text,int,text,text,text,numeric,text[],jsonb) TO authenticated;
```

The corresponding RPCs for questions — `map_create_custom_question`, `map_publish_custom_question`, `map_revise_custom_question` — are unchanged in shape from the V1 brief, except that the create and revise RPCs now accept additional `p_passage_version_id uuid`, `p_question_focus text`, `p_stem_svg bytea`, `p_stem_svg_alt_text text` parameters which can be null. Add them as positional parameters at the end of each signature so calling code can be migrated incrementally. The `p_choices` jsonb argument now also accepts `choice_svg` (base64-encoded SVG; the RPC decodes and stores as bytea) and `choice_svg_alt_text` per choice.

```sql
-- Updated signature (additions in trailing positions):
CREATE OR REPLACE FUNCTION public.map_create_custom_question(
  p_source             text,
  p_created_via        text,
  p_subject            text,
  p_grade              int,
  p_stem               text,
  p_standard_code      text,
  p_difficulty         int,
  p_ai_metadata        jsonb,
  p_choices            jsonb,                            -- now may include choice_svg, choice_svg_alt_text per choice
  p_passage_version_id uuid DEFAULT NULL,
  p_question_focus     text DEFAULT NULL,
  p_stem_svg           bytea DEFAULT NULL,               -- pre-sanitized by caller
  p_stem_svg_alt_text  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
-- body identical to V1 except:
--   - the version INSERT now also includes (passage_version_id, question_focus, stem_svg, stem_svg_alt_text);
--   - the choice INSERT loop reads choice_svg (decoding from base64) and choice_svg_alt_text per choice;
--   - alt-text requirement is enforced for any non-null SVG;
--   - server validates that any non-null p_passage_version_id belongs to a passage in the same family.
$$;
```

The SECURITY DEFINER body is responsible for verifying that any non-null `p_passage_version_id` belongs to a passage owned by the current family — do not trust the caller. Reject with `RAISE EXCEPTION 'passage not in family'` if not.

Soft-delete for both passages and questions is a one-line UPDATE through RLS; no RPC needed. **A passage cannot be soft-deleted if any non-archived question references any of its versions.** Enforce this in a BEFORE UPDATE trigger on `map_custom_passages` that fires when `soft_deleted_at` transitions from null to non-null.

### 4.10 RLS

Apply the same pattern to passages as to questions:

```sql
ALTER TABLE public.map_custom_passages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_custom_passage_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_custom_questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_custom_question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_custom_question_choices  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS map_cp_select ON public.map_custom_passages;
CREATE POLICY map_cp_select ON public.map_custom_passages FOR SELECT
  USING (family_id = public.map_current_family_id() AND soft_deleted_at IS NULL);
DROP POLICY IF EXISTS map_cp_insert ON public.map_custom_passages;
CREATE POLICY map_cp_insert ON public.map_custom_passages FOR INSERT
  WITH CHECK (family_id = public.map_current_family_id());
DROP POLICY IF EXISTS map_cp_update ON public.map_custom_passages;
CREATE POLICY map_cp_update ON public.map_custom_passages FOR UPDATE
  USING (family_id = public.map_current_family_id())
  WITH CHECK (family_id = public.map_current_family_id());

-- Passage versions: select/insert/update via join to header.
DROP POLICY IF EXISTS map_cpv_select ON public.map_custom_passage_versions;
CREATE POLICY map_cpv_select ON public.map_custom_passage_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.map_custom_passages p
    WHERE p.id = passage_id AND p.family_id = public.map_current_family_id()
  ));
-- (mirror INSERT and UPDATE)

-- Questions, question_versions, question_choices policies are the same as the V1 brief
-- — repeat them here unchanged. No DELETE policy on any table; soft-delete only.
```

### 4.11 Helper view: `map_custom_questions_resolved`

A convenience view that joins question version + choices + (optional) passage version, scoped by RLS:

```sql
CREATE OR REPLACE VIEW public.map_custom_questions_resolved AS
SELECT
  q.id                            AS question_id,
  q.family_id,
  q.status                        AS question_status,
  q.source                        AS question_source,
  qv.id                           AS version_id,
  qv.version_number               AS question_version_number,
  qv.subject,
  qv.grade,
  qv.stem,
  qv.stem_svg,
  qv.stem_svg_alt_text,
  qv.standard_code,
  qv.difficulty,
  qv.question_focus,
  pv.id                           AS passage_version_id,
  pv.passage_id,
  pv.version_number               AS passage_version_number,
  pv.title                        AS passage_title,
  pv.body                         AS passage_body,
  pv.passage_svg,
  pv.passage_svg_alt_text,
  pv.genre                        AS passage_genre,
  pv.standard_codes               AS passage_standard_codes,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'label', c.label, 'text', c.text, 'is_correct', c.is_correct,
      'choice_svg', c.choice_svg, 'choice_svg_alt_text', c.choice_svg_alt_text,
      'explanation_correct', c.explanation_correct,
      'explanation_wrong', c.explanation_wrong,
      'misconception_tag', c.misconception_tag
    ) ORDER BY c.ordinal)
    FROM public.map_custom_question_choices c
    WHERE c.version_id = qv.id
  )                                AS choices
FROM public.map_custom_questions q
JOIN public.map_custom_question_versions qv ON qv.id = q.current_version_id
LEFT JOIN public.map_custom_passage_versions pv ON pv.id = qv.passage_version_id
WHERE q.soft_deleted_at IS NULL;
```

The MCP read tools and the kid-side test renderer both query this view rather than reassembling the join in app code each time. Note that SVG bytes are returned in the view; consumers that don't need them should select explicit columns. The MCP `get_custom_question` tool base64-encodes SVG bytes before returning to the client (see §5.2).

### 4.12 SVG sanitization

Every SVG entering the system passes through a single sanitizer module before persistence. There is no path that bypasses it — UI (when a future phase enables UI authoring), MCP tools, RPCs, and admin scripts all funnel through `lib/svg/sanitize.ts`.

**Sanitization rules (allowlist, not blocklist):**

- **Root element must be `<svg>`** with a `viewBox` attribute. Width/height are optional but if present must be unitless or `px`.
- **Allowed elements:** `svg`, `g`, `defs`, `title`, `desc`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `text`, `tspan`, `marker`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `use` (only when the `href` is a same-document fragment id, never external), `pattern`, `mask`, `symbol`.
- **Disallowed elements (rejected, not stripped):** `script`, `foreignObject`, `iframe`, `image` (no raster embed in v1), `animate`, `animateTransform`, `animateMotion`, `set`, `a` (no hyperlinks), `style` (style tags banned; use attributes), `metadata`, `switch`, anything else not in the allowlist.
- **Allowed attributes per element:** standard geometric and presentation attributes (`d`, `x`, `y`, `cx`, `cy`, `r`, `rx`, `ry`, `points`, `transform`, `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-dasharray`, `opacity`, `fill-opacity`, `stroke-opacity`, `font-family`, `font-size`, `font-weight`, `text-anchor`, `dominant-baseline`, `viewBox`, `width`, `height`, `preserveAspectRatio`, `id`, `class`, `clip-path`, `mask`, `marker-start`, `marker-mid`, `marker-end`, `offset`, `stop-color`, `stop-opacity`, `gradientUnits`, `gradientTransform`, `patternUnits`, `patternTransform`, `xlink:href` and `href` *only when same-document fragment*).
- **Disallowed attributes:** any `on*` event handler, `style` attribute (use individual attributes), `xlink:href` or `href` to anything that is not a same-document fragment (`#foo` is fine; `https://...`, `data:`, `javascript:`, `file:`, etc. are all rejected), any `xmlns` other than `http://www.w3.org/2000/svg` and `http://www.w3.org/1999/xlink`, any namespace declaration that imports HTML or unknown namespaces.
- **Disallowed content:** XML processing instructions (`<?...?>`), DOCTYPE declarations, CDATA sections, XML entity declarations, comments containing `<` or `>` characters.
- **`<text>` content** is rendered as text only — sanitizer escapes any markup-looking content within text nodes.
- **`viewBox` must be present** on the root and must consist of four non-negative numbers within a sensible range (e.g. each ≤ 10000). This prevents the "huge viewBox to crash the renderer" attack.
- **Total node count cap: 1000.** SVGs with more elements after parsing are rejected.
- **Total nesting depth cap: 20.** Deeper trees are rejected.
- **Color values** must be hex, rgb(), rgba(), hsl(), hsla(), `none`, or one of the named CSS colors. No `url()` references except to same-document fragments (for gradients and patterns).
- **Font families** must be from a small allowlist (`sans-serif`, `serif`, `monospace`, `system-ui`). No external font loading.

**Implementation:** use a battle-tested SVG sanitization library (DOMPurify in `IN_PLACE` mode with `USE_PROFILES: { svg: true, svgFilters: false }`, plus our own additional allowlist constraints applied as a post-pass). Do not roll our own XML parser. Run the sanitizer in a try/catch — any thrown error from the parser is treated as a rejection, never as "well, we sanitized what we could."

**Output:** the sanitizer returns the canonicalized SVG bytes (UTF-8) with a stable element/attribute ordering, or throws `SvgRejected(reason)` with one of: `disallowed_element`, `disallowed_attribute`, `external_reference`, `script_content`, `parse_error`, `size_exceeded`, `node_count_exceeded`, `depth_exceeded`, `missing_viewbox`, `invalid_viewbox`. The reason is surfaced verbatim in the MCP tool error response so the agent can correct and retry.

**Render path:** the kid-facing renderer never injects SVG into the DOM. Instead it serves SVG bytes as `data:image/svg+xml;base64,<b64>` to an `<img>` tag. Browsers in image-mode parse SVG with scripts disabled, isolated origin, and no DOM access — even if the sanitizer missed something, this layer would block actual exploitation. This is defense in depth; both layers must function.

**Audit log handling:** as noted in Amendment C, write tools log the SHA-256 hash and byte length of each sanitized SVG, not the body. The actual sanitized bytes live in the database where parents can review them via the UI.

### 4.13 Server capability advertisement

The MCP server's `initialize` response includes an `instructions` field that tells the agent what content shapes are supported. This is what makes "AI knows it can generate SVG" work — agents read this on connect and adjust their behavior. Pseudo-content:

> *This MCP server represents one family's practice data on the MAP test prep platform. You can read the family's practice history (8 read tools) and create custom practice content (write tools).*
>
> *Custom content supports SVG illustrations as inline graphics. SVG is supported in three slots: on a passage, on a question stem, and on each of a question's answer choices. Use SVG when a figure makes the question clearer — geometry diagrams, charts a question asks about, visual choices like "which shape" — and skip it when text alone is sufficient.*
>
> *SVG constraints (enforced server-side; violations return errors):*
> - *Root must be `<svg>` with a `viewBox`. No external references, no scripts, no event handlers, no foreignObject, no animations, no embedded raster images.*
> - *Use only basic geometric and text elements: path, rect, circle, line, polygon, text, g, defs, gradients, patterns, markers.*
> - *Size cap: 64KB for passages and stems, 32KB for individual answer choices.*
> - *Always include readable alt text. Every SVG you submit must come with an alt_text field that describes the figure for screen readers and for parents previewing the content.*
> - *On a single question, either every answer choice has an SVG or none do. Don't mix text-only choices with visual choices.*
> - *Use neutral colors that work on light and dark backgrounds. Avoid relying on color alone to convey information (a kid might be colorblind).*
>
> *All content you create lands in `status='draft'` and requires the parent to publish it via the app's review queue. There is no auto-publish.*

Echo a shorter version of this in each write tool's `description` so agents that don't read `instructions` still get the gist.

---

## 5. New MCP write tools

These extend the tool set from `MCP_Brief_V1` §5. All seven live alongside the existing nine read tools and use the same `ctx`, the same family-scoping helpers, the same audit pipeline. Register them in the same `registerTools(server, ctx)` function.

### 5.0 SVG capability across tools

Every write tool's description begins with a shared boilerplate paragraph that tells the agent SVG is supported in this surface, where it can attach SVG, and what the constraints are. This boilerplate is produced by `lib/mcp/svg-capability-blurb.ts` and concatenated into each tool's description string at registration time. The blurb is what makes "AI knows it can generate SVG" actually work — agents read tool descriptions before deciding what arguments to send.

The shared blurb (paraphrase as needed for tone, but keep the constraints precise):

> *This tool supports inline SVG illustrations. SVG is accepted as a base64-encoded string in the `*_svg` fields and is required to come paired with a `*_svg_alt_text` describing the figure. Use SVG when a diagram or figure makes the question or passage clearer (geometry, charts, "which shape" choices). Constraints enforced server-side: root must be `<svg>` with a `viewBox`; no `<script>`, no `<foreignObject>`, no event handlers, no external URLs, no embedded raster images, no animations; size cap 64KB for passages and stems, 32KB per answer choice; on a single question either every choice has an SVG or none do. Violations are returned as `invalid_svg` errors with a specific reason — read the reason and retry. Use neutral colors that work on light or dark backgrounds.*

Per-tool descriptions add a short clause noting which slots the tool exposes:
- `create_custom_questions`: "...stem and choices may have SVG. Math questions cannot have a passage but can still have stem and choice SVG (e.g. a geometry diagram)."
- `create_custom_passage_and_questions`: "...passage, each question stem, and each choice may have SVG."
- `update_custom_question`, `update_custom_passage`: "...replacing or adding SVG follows the same rules as creation."

**SVG transport on the wire:** The MCP transport is JSON, which doesn't carry binary natively. SVG bytes are base64-encoded in tool inputs (`stem_svg` is a base64 string in the tool schema, decoded server-side, then sanitized, then stored as `bytea`). On output, `get_custom_question` and `get_custom_passage` return SVG as base64 likewise. Agents that re-fetch and round-trip will get sanitized canonical bytes back, not their exact original input — this is intentional and expected.

**SVG validation order in tool handlers:**
1. Zod schema check: shape, base64 decodability, alt-text presence when SVG present.
2. `lib/svg/sanitize.ts` runs against decoded bytes; throws `SvgRejected(reason)` on failure.
3. Quota check (a write that includes SVG still counts as one write; SVG bytes do not count against a separate quota in v1).
4. RPC call with sanitized bytes.

If sanitization fails on any SVG within a batch (`create_custom_questions` with 5 questions, one of which has a malformed SVG), the entire batch is rejected — no partial success. The error response identifies which question/choice/passage and the specific reason. Agents are expected to fix and retry.

### 5.1 `list_custom_questions`

> List the family's custom questions. Filterable by status, subject, source, and whether they have a passage. Returns at most 100 per call. Use this to find a question_id before calling get_custom_question or update_custom_question.

**Input:**
```ts
{
  status?: 'draft' | 'published' | 'archived';
  subject?: 'math' | 'reading' | 'language';
  source?: 'parent_manual' | 'parent_ai_assisted' | 'parent_ai_generated';
  has_passage?: boolean;             // filter by presence of passage reference
  limit?: number;                    // default 25, max 100
  offset?: number;
}
```
**Output:** unchanged from V1, plus:
```ts
{
  ...
  passage_id: string | null;         // present if question references a passage
  passage_version_number: number | null;
  passage_is_outdated: boolean;      // true if the question's passage_version_id is not the passage's current_version_id
}
```

### 5.2 `get_custom_question`

> Return one custom question with all its choices, explanations, and (if present) the full passage it references. Returns the current version by default; pass version_number to fetch an old version. The output shape is identical to the input shape of update_custom_question, so an agent can fetch, edit, and round-trip. SVG fields (stem_svg, passage_svg, each choice's choice_svg) are returned as base64-encoded strings; SVG bytes shown back to the agent are the sanitized canonical form that was persisted, not necessarily the agent's original submission.

**Input:** `{ question_id: string; version_number?: number }`
**Output:**
```ts
{
  question_id: string;
  status: string;
  source: string;
  version_number: number;
  subject: 'math' | 'reading' | 'language';
  grade: number;
  stem: string;
  stem_svg: string | null;             // base64-encoded sanitized SVG
  stem_svg_alt_text: string | null;
  standard_code: string | null;
  difficulty: number | null;
  question_focus: string | null;
  passage: {
    passage_id: string;
    passage_version_id: string;
    passage_version_number: number;
    is_current_version: boolean;
    subject: 'reading' | 'language';
    grade: number;
    title: string | null;
    body: string;
    passage_svg: string | null;        // base64-encoded sanitized SVG
    passage_svg_alt_text: string | null;
    genre: string | null;
    estimated_grade_level: number | null;
    standard_codes: string[];
  } | null;
  choices: Array<{
    label: 'A' | 'B' | 'C' | 'D' | 'E';
    text: string;
    choice_svg: string | null;         // base64-encoded sanitized SVG
    choice_svg_alt_text: string | null;
    is_correct: boolean;
    explanation_correct: string | null;
    explanation_wrong: string | null;
    misconception_tag: string | null;
  }>;
  ai_metadata: object | null;
}
```

### 5.3 `list_custom_passages`

> List the family's custom passages. Returns at most 100. Each row includes how many published questions currently reference any version of the passage, so the agent can spot orphan passages and stale references at a glance.

**Input:**
```ts
{
  status?: 'draft' | 'published' | 'archived';
  subject?: 'reading' | 'language';
  source?: 'parent_manual' | 'parent_ai_assisted' | 'parent_ai_generated';
  genre?: 'fiction' | 'nonfiction' | 'poetry' | 'drama' | 'informational' | 'editing_draft';
  limit?: number;                    // default 25, max 100
  offset?: number;
}
```
**Output:**
```ts
{ passages: Array<{
  passage_id: string;
  status: string;
  source: string;
  subject: 'reading' | 'language';
  grade: number;
  title: string | null;
  body_excerpt: string;              // first 200 chars
  genre: string | null;
  estimated_grade_level: number | null;
  standard_codes: string[];
  current_version_number: number;
  question_count: number;            // published questions referencing any version
  question_count_outdated: number;   // those referencing a non-current version
  created_at: string;
  updated_at: string;
}> }
```

### 5.4 `get_custom_passage`

> Return a passage with its full body. Returns the current version by default. Output shape matches the input shape of update_custom_passage for clean round-trips. SVG is returned as a base64-encoded string when present.

**Input:** `{ passage_id: string; version_number?: number }`
**Output:**
```ts
{
  passage_id: string;
  status: string;
  source: string;
  version_number: number;
  subject: 'reading' | 'language';
  grade: number;
  title: string | null;
  body: string;
  passage_svg: string | null;          // base64-encoded sanitized SVG
  passage_svg_alt_text: string | null;
  genre: string | null;
  estimated_grade_level: number | null;
  standard_codes: string[];
  ai_metadata: object | null;
  questions: Array<{
    question_id: string;
    status: string;
    references_version_number: number;
    is_outdated_reference: boolean;
  }>;
}
```

### 5.5 `create_custom_questions`

> Create one or more standalone custom questions in a single call. For passage-based questions, use create_custom_passage_and_questions instead — that tool creates the passage and its questions atomically. All created questions land in status='draft'. Maximum 25 questions per call, 250 per family per day. To attach questions to an existing passage, pass passage_id on each question; the question will be linked to that passage's current published version. **SVG-capable** on stem and on each choice — see the SVG capability section above. Math questions cannot have a passage but can still have stem and choice SVG (e.g. a geometry diagram or "which shape" choices).

**Input:**
```ts
{
  questions: Array<{
    subject: 'math' | 'reading' | 'language';
    grade: number;
    stem: string;
    stem_svg?: string;                 // base64-encoded SVG; ≤64KB after decode
    stem_svg_alt_text?: string;        // required when stem_svg is set
    standard_code?: string;
    difficulty?: number;
    question_focus?: string;
    passage_id?: string;               // optional; if set, links to that passage's current_version_id
    ai_metadata?: object;
    choices: Array<{
      label: 'A' | 'B' | 'C' | 'D' | 'E';
      text: string;
      choice_svg?: string;             // base64-encoded SVG; ≤32KB after decode
      choice_svg_alt_text?: string;    // required when choice_svg is set
      is_correct: boolean;
      explanation_correct?: string;
      explanation_wrong?: string;
      misconception_tag?: string;
    }>;
  }>;
}
```

**Output:**
```ts
{
  created: Array<{ question_id: string; status: 'draft'; passage_version_id: string | null }>;
  warnings?: Array<{ index: number; message: string }>;
}
```

`source` is **always** `'parent_ai_generated'` for this tool. `created_via` is always `'mcp'`. Math questions with a non-null `passage_id` are rejected with `invalid_question_shape`. Reading questions without `passage_id` are accepted into draft (parent will need to attach a passage before publishing) but the response includes a warning. SVG sanitization failures are returned as `invalid_svg` errors with the rejection reason; the entire batch fails on any SVG rejection. Mixed SVG/text choices in the same question (some have choice_svg, some don't) are rejected with `mixed_choice_svg_not_allowed`.

### 5.6 `create_custom_passage_and_questions`

> Create a passage AND its questions in one atomic call. This is the natural unit for reading and passage-based language: a passage with 3–8 questions about it. The passage and all questions land in status='draft' together. Maximum 8 questions per passage; 1 passage and up to 8 questions per call. Counts against both the passage and question daily quotas. **SVG-capable** on the passage, on each question stem, and on each choice. A small SVG inside a passage (e.g. a hand-drawn-style figure inside an informational nonfiction piece) is fine; for math diagrams as the focus of the question, use stem_svg instead.

**Input:**
```ts
{
  passage: {
    subject: 'reading' | 'language';
    grade: number;
    title?: string;
    body: string;                      // 50..10000 chars; basic markdown allowed
    passage_svg?: string;              // base64-encoded SVG; ≤64KB after decode
    passage_svg_alt_text?: string;     // required when passage_svg is set
    genre?: 'fiction' | 'nonfiction' | 'poetry' | 'drama' | 'informational' | 'editing_draft';
    estimated_grade_level?: number;
    standard_codes?: string[];
    ai_metadata?: object;
  };
  questions: Array<{                   // 1..8 items
    subject: 'reading' | 'language';
    grade: number;
    stem: string;
    stem_svg?: string;
    stem_svg_alt_text?: string;
    standard_code?: string;
    difficulty?: number;
    question_focus?: string;
    ai_metadata?: object;
    choices: Array<{
      label: 'A' | 'B' | 'C' | 'D' | 'E';
      text: string;
      choice_svg?: string;
      choice_svg_alt_text?: string;
      is_correct: boolean;
      explanation_correct?: string;
      explanation_wrong?: string;
      misconception_tag?: string;
    }>;
  }>;
}
```

**Output:**
```ts
{
  passage: { passage_id: string; passage_version_id: string; status: 'draft' };
  questions: Array<{ question_id: string; status: 'draft' }>;
  warnings?: Array<{ scope: 'passage' | 'question'; index?: number; message: string }>;
}
```

Atomicity is real: if any one question fails validation OR any one SVG fails sanitization, neither the passage nor any of the questions is created. Single transaction. The passage's first version is created, then each question links to that `passage_version_id`. `source` is always `'parent_ai_generated'`; `created_via` is always `'mcp'`.

### 5.7 `update_custom_question`

> Update a custom question. If the question is in draft, this edits the current version in place. If it is published, this creates a new version and atomically points the question at it. To upgrade a published question's passage reference to the passage's current version, pass passage_action: 'upgrade_to_current'. To attach a different passage entirely, pass passage_id. To detach (only valid for language), pass passage_action: 'detach'. SVG-capable: pass `stem_svg` (with alt text) to set/replace the stem SVG, or omit it to leave unchanged. To explicitly remove an existing SVG, pass `stem_svg: null`. Same for choices.

**Input:** the question fields from §5.5 (including SVG fields), plus `question_id`, plus an optional:
```ts
{
  question_id: string;
  // ...all fields from 5.5 including stem_svg / stem_svg_alt_text / per-choice choice_svg / choice_svg_alt_text...
  passage_action?: 'upgrade_to_current' | 'detach';   // mutually exclusive with passage_id
}
```
**Output:** `{ question_id: string; new_version_number: number; status: 'draft' | 'published'; passage_version_id: string | null }`

Note on update semantics for SVG specifically: a *missing* SVG field in the request payload means "leave whatever was there alone." A *null* SVG field means "remove it." This matters because the parent UI's "remove this image" button calls `update_custom_question` with `stem_svg: null` (and `stem_svg_alt_text: null`); an agent doing a partial update without explicitly nulling SVG won't accidentally wipe a parent's image.

### 5.8 `update_custom_passage`

> Update a passage. Drafts edit in place; published passages create a new version. Existing questions keep pointing at the old version — the agent can call update_custom_question with passage_action: 'upgrade_to_current' on each affected question to migrate them, or use bulk_upgrade_passage_references. SVG-capable: same null-vs-omit semantics as on questions — omit `passage_svg` to leave it unchanged, pass null to remove it.

**Input:** the passage fields from §5.6's `passage` (including `passage_svg` and `passage_svg_alt_text`), plus `passage_id`.
**Output:** `{ passage_id: string; new_version_number: number; status: 'draft' | 'published' }`

### 5.9 `bulk_upgrade_passage_references`

> When a passage has been revised, sweep all of the family's published questions that reference an old version and update them to the current version. Each affected question gets a new version. Use this after editing a passage to fix a typo across all its questions in one shot.

**Input:** `{ passage_id: string }`
**Output:** `{ upgraded: Array<{ question_id: string; from_version_number: number; to_version_number: number; new_question_version_number: number }> }`

This is one call rather than N for two reasons: it's the natural follow-up to a passage edit, and it makes write-quota accounting saner (each question version counts as one update, but the parent's mental model is "I edited the passage, now propagate it" — bundling matches that mental model).

### 5.10 `publish_custom_question`, `publish_custom_passage`

> Move a draft to published. After this call, the content is eligible to appear in tests. Reversible only by manual archival in the parent UI — the agent has no archive tool by design.

**Input:** `{ question_id }` or `{ passage_id }`
**Output:** `{ id; status: 'published' }`

We deliberately give the agent no archive or delete tool. If a parent regrets a question or passage, they fix it in the UI. This keeps the destructive surface narrow.

### 5.11 No `suggest_questions_from_weakness` tool

The composition is already trivial for an agent: it calls `get_top_misconceptions` + `get_recent_wrong_answers`, then `create_custom_questions` or `create_custom_passage_and_questions`. Bundling is no easier and removes the parent's ability to see which read calls happened in the audit log. The pattern lives in the example prompts on the connect-AI page, not as a tool.

---

## 6. Server-side scoping for writes

The Phase 3 pattern carries over: `ctx.family_id` is derived from the token, never from arguments. Write tools add three helpers:

```ts
// lib/mcp/db.ts (new helpers)
export async function getCustomQuestionInFamily(ctx: McpContext, questionId: string) { /* as V1 */ }

export async function getCustomPassageInFamily(ctx: McpContext, passageId: string) {
  const { data, error } = await ctx.supabase
    .from('map_custom_passages')
    .select('id, family_id, status, current_version_id, soft_deleted_at')
    .eq('id', passageId)
    .eq('family_id', ctx.family_id)
    .is('soft_deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new McpError('passage_not_in_family', `passage ${passageId} not found in this family`);
  return data;
}

export async function getCustomPassageVersionInFamily(ctx: McpContext, versionId: string) {
  // join through to passages.family_id; throw passage_not_in_family if mismatch.
}

export async function enforceWriteQuota(
  ctx: McpContext,
  kind: 'question_create' | 'question_update' | 'passage_create' | 'passage_update',
  count: number
) {
  // Family-scoped daily quota check. Throws McpError('write_quota_exceeded', { kind, ... }).
  // Implementation: count map_mcp_audit rows with family_id=ctx.family_id, status='ok', tool_name in
  // the relevant set, created_at >= today_start_local.
}
```

Tool-by-tool quota accounting:
- `create_custom_questions`: one `question_create` per question in the batch.
- `create_custom_passage_and_questions`: one `passage_create` plus one `question_create` per question.
- `update_custom_question`: one `question_update`.
- `update_custom_passage`: one `passage_update`.
- `bulk_upgrade_passage_references`: one `question_update` per question upgraded. If this would breach quota, the call returns 429 *before* upgrading any — atomic check, all-or-nothing.

The shape invariants from §4.7 are also validated in the Zod schemas — fail fast with `invalid_question_shape` or `invalid_passage_shape`, don't rely on the database trigger to be the user-facing validator.

**SVG sanitization happens in tool handlers, between Zod validation and quota check.** The order matters: Zod confirms the SVG field is base64-decodable and that alt text is present; the sanitizer (`lib/svg/sanitize.ts`) parses, validates, and canonicalizes the SVG bytes; quota is checked; the RPC is called with the sanitized bytes. Quota is checked *after* sanitization so an agent submitting malformed SVG doesn't burn quota on rejected requests, but *before* the RPC so a quota breach doesn't waste DB connections. SVG sanitization failures throw `McpError('invalid_svg', { reason, field_path })` where `field_path` identifies which slot rejected (e.g. `'questions[2].choices[1].choice_svg'`); the entire batch is rejected, no partial success.

---

## 7. Routes and UI

Three new authenticated, PIN-gated routes. Same gating pattern as `/parent/account` and `/parent/connect-ai`.

### 7.1 `/parent/questions` and `/parent/passages`

Two parallel index pages. Same shape: header with "X drafts awaiting review," persistent unvetted-content disclaimer banner, filter bar, list of cards with primary actions, "+ New" button, multi-select for bulk publish/archive.

The passage index card additionally shows: number of published questions referencing this passage, and a flag if any of those questions reference a non-current version (the "stale references" indicator). Clicking the indicator drops into the passage detail page with the affected questions pre-filtered.

### 7.2 `/parent/passages/new` and `/parent/passages/[id]`

Single-page form. Fields:

- Subject (Reading / Language).
- Grade (0–12).
- Title (optional, ≤200 chars).
- Body (the editor — plain textarea with a markdown preview toggle in v1; a richer editor is a Phase 5 nicety). Char counter; soft warning at 8000+ chars to consider splitting.
- Genre (radio).
- Estimated grade level (slider, 0.0–12.9 in 0.1 steps; optional). An "Estimate with AI" button calls a server endpoint that uses Claude to assess Lexile-equivalent and fills the field.
- Standard codes (multi-select autocomplete from `map_standards`).
- **SVG illustration (read-and-curate only in this phase).** If the passage was created via MCP and AI included an illustration, this section shows the rendered SVG with a "Generated by AI" badge, the alt text underneath in editable form, and a single "Remove illustration" button (with confirm). The parent cannot draw, upload, or paste their own SVG in this phase; that's a Phase 5 feature. The remove action calls `map_revise_custom_passage` (or edits the draft in place) with the SVG fields nulled.
- AI helpers:
  - "Write a passage from a prompt" → opens a side panel where the parent describes the topic and length, Claude drafts the body, parent edits before saving. **In this phase, the in-UI Claude path does NOT generate SVG** — that's only available via the MCP path. The reason: a parent in the UI is in "writing mode," where adding a sanitization-and-render-and-review step on every iteration would slow them down. MCP-based generation is async and batched, where AI-illustrated content makes more sense.
  - "Generate questions for this passage" → after the body is written, Claude proposes 3–5 questions; each lands as a draft attached to this passage. Same rule: no inline SVG generation from this UI path in v1.

Edit view adds: version history sidebar, "Save and publish" / "Save as draft revision" actions, and — for published passages with questions referencing older versions — a banner with a "Upgrade N questions to this passage version" button that calls the same logic as the MCP `bulk_upgrade_passage_references` tool.

### 7.3 `/parent/questions/new` and `/parent/questions/[id]`

Question form. The structural change from V1: a **passage attachment section** at the top.

- For Math: section is hidden entirely.
- For Reading: section says "Reading questions need a passage." Two options: "Pick an existing passage" (autocomplete over the family's published passages, filtered by grade) or "Create a new passage." Picking an existing passage shows the body inline above the question fields (collapsible). Creating a new one drops into an inline mini-form, or links out to the full passage editor with "return here when done." Either way the question's `passage_version_id` is set to the chosen passage's current version.
- For Language: section says "Optional: attach a passage if this question is about a specific text." Same picker, but the "skip — this is a standalone question" option is the default.

Below that, a `question_focus` field (only shown when a passage is attached): "What in the passage is this question about?" with examples — "the underlined word in sentence 3," "line 14," etc. Optional.

**SVG illustrations (read-and-curate only in this phase).** Two slots are surfaced in the UI when AI created them via MCP:
- **Stem SVG.** If present, renders above the choices. Shows a "Generated by AI" badge, the alt text in an editable text field below the rendered image, and a "Remove illustration" button.
- **Choice SVGs.** If the question's choices have SVGs (all of them, never partial), each choice card renders the SVG above its text. Same "Generated by AI" badge on each. The remove action here is all-or-nothing — clicking "Remove illustrations from all choices" nulls every choice's SVG fields, because the schema requires either every choice has SVG or none do.

The parent cannot author or upload SVG in v1, only review and remove. If the parent wants different/better illustrations, the workflow is: ask AI through the MCP loop again. This is a deliberate scope cut.

The rest of the form (stem, choices, explanations, misconception tags, "Preview as kid," save actions) is unchanged from V1. The "Preview as kid" modal renders the passage above the question if one is attached — and includes any passage SVG, stem SVG, and choice SVGs at their actual rendered size, so parents can sanity-check the visual layout, not just the text.

Edit view for published reading questions whose passage has been revised shows the same kind of banner as on the passage page: "This question references passage v2. Passage is at v3. [View diff] [Upgrade]." Clicking Upgrade creates a new question version pointing at the passage's current version.

### 7.4 Test builder change

The existing custom-test builder gets a new section: **Question source**. Three options:
- **Vetted only** (default).
- **My questions only** — pulls from `map_custom_questions` where `status='published'`, joined to passages where applicable, filtered by chosen subject/grade/standard.
- **Mixed** — combines both with a percentage slider (default 30% custom).

Reading-mode behavior to flag: the builder samples *passages*, not questions, when building reading sections. A "5-question reading test" is one passage with 5 questions, not 5 passages with 1 question each. When mixing custom and vetted reading content, that means each passage in the test is wholly vetted *or* wholly custom — we don't mix question sources within a single passage's question set. The builder enforces this. Same rule for passage-based language items.

Custom passages and questions render in the test screen with a small "By you" badge. After the test, the results page groups attempts by source (Vetted / Your questions) with separate accuracy numbers.

### 7.5 `/parent/connect-ai` updates

Add example prompts that exercise the new write loop:

> *"Look at Maya's recent wrong answers in reading. Generate one nonfiction passage and 5 questions targeting her two weakest comprehension standards."*

> *"Maya keeps getting subject-verb agreement wrong. Write me a short editing-draft passage with numbered sentences and 4 language questions about the errors."*

> *"My passage about whales has a typo in paragraph 2. Fix it and update all the questions that reference it."*

> *"Show me my draft passages and tell me which ones don't have any questions yet."*

These set expectations for what the agent can do and lower activation energy for the loops we want.

### 7.6 Kid-side rendering

Passages render at the top of the question screen with a "By [parent name]" badge in a small caption beneath the title. The question and choices follow. The passage scrolls independently of the question on long passages. The post-question explanation screen shows the parent-authored `explanation_correct` text verbatim. The kid never sees the unvetted disclaimer banner — that's adult context, not test-time content.

For multi-question reading sections (one passage, several questions), the passage stays pinned at the top across all of its questions; the kid doesn't re-read it for each item. This already exists for the vetted bank — the custom flow plugs into the same renderer.

**SVG rendering.** Any SVG (passage, stem, or choice) is rendered as `<img src="data:image/svg+xml;base64,...">` with the alt text from the corresponding `*_svg_alt_text` column on the `alt` attribute. Never inline `<svg>` injection into the DOM. This isolates SVG into image-rendering mode where browsers disable scripting, external resource loading, and DOM access — defense in depth on top of write-time sanitization. Sizing: passage and stem SVGs render at full width up to a max-width that respects mobile viewports; choice SVGs render at a fixed sensible size (e.g. 200px square) so the four/five visual choices line up cleanly. If an SVG fails to render in the browser for any reason, the alt text is shown in its place.

---

## 8. Integration with existing reports and MCP read tools

This is where the "never silently merge" rule from §1 cashes out.

**Existing MCP read tools** (from Phase 3) gain `include_custom?: 'none' | 'separate' | 'merged'`, default `'separate'`. The semantics are the same as in V1, with two notes specific to passages:

- `get_recent_wrong_answers` and `get_session_details` return `passage_excerpt` (first 300 chars) for reading and passage-based language attempts. For custom-source attempts the excerpt comes from the `passage_version_id` the kid actually saw, not the passage's current version.
- `get_top_misconceptions` aggregates across vetted and custom because the misconception taxonomy is shared (parents can only pick from existing tags). With `'separate'` the response splits the aggregation; with `'merged'` it combines. Either is valid; default `'separate'`.

**In-app reports** follow the same default. The kid's progress page shows vetted accuracy as the primary number and "Custom: X% across Y questions" as a secondary line.

---

## 9. File layout

```
app/
  api/
    mcp/
      route.ts                               # existing; tools/list now shows 16 tools
  parent/
    questions/
      page.tsx
      new/page.tsx
      [id]/page.tsx
    passages/
      page.tsx
      new/page.tsx
      [id]/page.tsx
lib/
  svg/
    sanitize.ts                            # the allowlist sanitizer (§4.12)
    sanitize.test.ts                       # exhaustive sanitizer tests
    capability-blurb.ts                    # the shared SVG capability text used in MCP tool descriptions
  mcp/
    tools/
      list-custom-questions.ts
      get-custom-question.ts
      list-custom-passages.ts                # new
      get-custom-passage.ts                  # new
      create-custom-questions.ts
      create-custom-passage-and-questions.ts # new
      update-custom-question.ts
      update-custom-passage.ts               # new
      bulk-upgrade-passage-references.ts     # new
      publish-custom-question.ts
      publish-custom-passage.ts              # new
    db.ts                                    # add passage helpers
    schemas.ts                               # add zod schemas for the new tools
  custom-questions/
    api.ts
    validation.ts                            # shared between UI and MCP — single source of truth
    preview.tsx                              # passage-aware preview modal
    ai-helpers.ts                            # distractor / explanation / standard / passage / question-from-passage
  custom-passages/
    api.ts
    editor.tsx                               # the passage body editor
    versioning.tsx                           # version history sidebar component (shared with questions)
supabase/
  migrations/
    2026xxxx_map_custom_questions_and_passages.sql
    2026xxxx_map_test_attempts_custom.sql
```

`lib/custom-questions/validation.ts` is the file Zod schemas in `lib/mcp/schemas.ts` import — same validators on UI submissions and MCP tool inputs. Don't fork them.

---

## 10. Dependencies

No new runtime dependencies are strictly required beyond what `MCP_Brief_V1` pulled in (`@modelcontextprotocol/sdk`, `zod`), with the addition of an SVG sanitization library:

```jsonc
{
  "dependencies": {
    "isomorphic-dompurify": "^2.x",   // for SVG sanitization in §4.12
    "@xmldom/xmldom": "^0.x"          // jsdom alternative for server-side SVG parsing in node runtime
  }
}
```

If you add the AI helper buttons from §7.2/7.3 in this phase rather than deferring, you'll call the Anthropic API server-side from a Next.js route — `@anthropic-ai/sdk`. Otherwise nothing else new.

---

## 11. Environment variables

| Variable | Used by | Required |
|---|---|---|
| All existing | (unchanged) | — |
| `ANTHROPIC_API_KEY` | server (AI helpers) | only if shipping AI helpers |
| `MAP_CUSTOM_Q_DAILY_CREATE_LIMIT` | MCP write quota | optional, default 250 |
| `MAP_CUSTOM_Q_DAILY_UPDATE_LIMIT` | MCP write quota | optional, default 100 |
| `MAP_CUSTOM_P_DAILY_CREATE_LIMIT` | MCP write quota | optional, default 50 |
| `MAP_CUSTOM_P_DAILY_UPDATE_LIMIT` | MCP write quota | optional, default 25 |

---

## 12. Acceptance criteria

All must pass before declaring done. Run in order. Cross-family isolation (12.5) is the show-stopper — if it fails, do not ship.

### 12.1 Migration applies cleanly
Apply migrations to a fresh Supabase project; re-apply. Both runs return COMMIT with no errors. All five new tables exist with their constraints. The polymorphic CHECK on `map_test_attempts` is in place.

### 12.2 Subject-shape invariants enforced
- Try to publish a math question with a passage_version_id → fails on `map_cqv_math_no_passage`.
- Try to publish a reading question with no passage → fails on the published-reading-needs-passage trigger.
- Try to publish a question whose passage is in draft → fails on the published-question-cannot-reference-draft-passage trigger.
- A draft reading question with no passage → succeeds (drafts are exempt).
- A published language question with no passage → succeeds (language is flexible).
- A published language question with a passage → succeeds.

### 12.3 Choice-shape invariants enforced
- Publish with 2 choices → fails. With 6 → fails. With 3, none correct → fails. With 3, one correct, no `explanation_correct` → fails on column CHECK. With 3, one correct, valid → succeeds.

### 12.4 RPC round-trips
- Create a passage via `map_create_custom_passage`. Publish. Revise → new version exists, current_version_id moves, old version intact.
- Create a question via `map_create_custom_question` with `p_passage_version_id` set to the published passage's current version. Verify FK and that the question's subject is reading or language.
- Try to create a question with `p_passage_version_id` pointing at a passage in *another* family → fails with `passage not in family`.

### 12.5 Cross-family write isolation (the critical test)
Two families with two tokens.
- Token A creates a passage and a question via `create_custom_passage_and_questions`. Confirm both are owned by family A.
- Token B `list_custom_passages` and `list_custom_questions` → returns zero of family A's content.
- Token B `get_custom_passage` and `get_custom_question` with family A's IDs → MCP errors `passage_not_in_family` and `question_not_in_family`. No data returned.
- Token B `update_custom_passage`, `update_custom_question`, `bulk_upgrade_passage_references`, `publish_custom_passage`, `publish_custom_question` with family A's IDs → all return errors, no row mutation. Verify in DB that family A's content is unchanged.
- Token B `create_custom_questions` with `passage_id` pointing at family A's passage → MCP error `passage_not_in_family`.

If any of these returns success or mutates data, **stop and fix**. Do not ship.

### 12.6 Draft-by-default for MCP
`create_custom_questions` and `create_custom_passage_and_questions` always return `status: 'draft'` and store `source='parent_ai_generated'`, `created_via='mcp'`. There is no MCP argument that can override these. Confirm by reading tool source.

### 12.7 Write quotas (per kind, per family)
With low test limits set via env: token A creates passages until the passage quota trips → 429 with `kind: 'passage_create'`. A separate quota tracks question creates and trips independently. `bulk_upgrade_passage_references` is rejected atomically if it would breach the question_update quota — no questions get upgraded when it 429s.

### 12.8 Versioning preserves attempt history (questions and passages)
- Family A publishes a passage and a reading question. Kid attempts the question; attempt row has `custom_question_version_id = qv1`, which transitively points at `pv1`.
- Parent revises the passage → pv2 exists, passage `current_version_id` advances. The kid's past attempt still resolves to `pv1` content via the join through qv1.
- Parent revises the question (not the passage) → qv2 exists. The past attempt still references qv1 with pv1.
- Parent calls `bulk_upgrade_passage_references` → qv3 exists pointing at pv2. The past attempt is *still* on qv1 with pv1. (This is the point: history is immutable.)

### 12.9 Passage upgrade UX
- After revising a passage, the question detail page shows the upgrade banner with the correct count of stale-reference questions.
- Clicking "Upgrade" creates new question versions and moves the questions' `current_version_id` to point at them.
- Stale-reference indicators on `/parent/passages` clear after upgrade.

### 12.10 Read-only verification, updated
Grep `lib/mcp/tools/` for `.insert(`, `.update(`, `.delete(`, `.upsert(`, `.rpc(`. Allowed mutation targets:
- `map_custom_questions`, `map_custom_question_versions`, `map_custom_question_choices`
- `map_custom_passages`, `map_custom_passage_versions`
- `map_mcp_audit` (audit inserts; existing)
- `map_mcp_tokens` (last_used_at bump; existing)

Any other mutation target is a violation.

### 12.10a SVG sanitization

Through MCP `create_custom_passage_and_questions`, attempt to create content with each of the following malicious or malformed SVGs. Each should be rejected with `invalid_svg` and a specific reason; nothing should be persisted.

- `<svg><script>alert(1)</script></svg>` → `disallowed_element` (script).
- `<svg><foreignObject><iframe src="..."/></foreignObject></svg>` → `disallowed_element` (foreignObject).
- `<svg onload="alert(1)"><circle cx="5" cy="5" r="4"/></svg>` → `disallowed_attribute` (onload).
- `<svg><image href="https://evil.example.com/track.png"/></svg>` → `disallowed_element` (image).
- `<svg><use href="https://evil.example.com/x.svg#foo"/></svg>` → `external_reference`.
- `<svg><a href="https://evil.example.com/"><circle/></a></svg>` → `disallowed_element` (a).
- `<svg style="background: url(javascript:alert(1))"/>` → `disallowed_attribute` (style on root).
- An SVG with 1500 `<path>` elements → `node_count_exceeded`.
- An SVG with 30 levels of `<g>` nesting → `depth_exceeded`.
- An SVG without a `viewBox` → `missing_viewbox`.
- A 200KB SVG (well-formed but oversize) → rejected at the size CHECK or the sanitizer's size check, whichever fires first.
- A valid SVG without alt_text → rejected at the schema layer with a clear message.

Then attempt to create a *valid* SVG: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#3366cc"/></svg>` with alt text "A blue circle." Should succeed; subsequent `get_custom_question` returns the SVG base64-decoded into a string that re-parses to equivalent SVG.

### 12.10b SVG render path is image-mode only

Grep the codebase for any SVG render path that does NOT go through `<img src="data:image/svg+xml;base64,...">`. Specifically: there should be no `dangerouslySetInnerHTML` of SVG content, no React `<svg>{...inline...}</svg>` blocks rendering parent-authored content, no `innerHTML` of SVG anywhere outside of the sanitizer's own internal parsing. Any hit on these patterns in the kid-facing render code is a violation.

### 12.10c SVG round-trip preserves canonical form

An agent submits an SVG with messy attribute ordering, extra whitespace, and a mix of valid+stripped attributes. The sanitizer normalizes. Calling `get_custom_question` returns the canonical form, not the original submission. Calling `update_custom_question` with that canonical form back round-trips identically (sanitization is idempotent on already-sanitized input).

### 12.10d Mixed-SVG-choices rejection

Through `create_custom_questions`, attempt to create a question where 2 of 4 choices have `choice_svg` and 2 don't. Rejected with `mixed_choice_svg_not_allowed` *before* any DB write. Then create one where all 4 have SVGs — succeeds. Try to publish a question whose choices have a partial SVG set (somehow constructed in draft) — rejected by the trigger at publish time.

### 12.11 Test builder with passages
- Reading mode: a 5-question test with "My questions only" produces one passage with 5 questions about it (or, if the parent's bank doesn't have a passage with 5+ questions, falls back gracefully and surfaces a note).
- Mixed reading mode: passages are wholly vetted or wholly custom within a single test; question sources do not mingle within one passage's question set.
- Language mode with mixed question types (some passage-based, some standalone) renders correctly.

### 12.12 Kid-side rendering for passages
- A custom reading question with a passage renders with the passage at the top, "By [parent name]" badge, question and choices below.
- The passage stays pinned across multiple questions in the same reading section.
- Post-question explanation shows the parent's `explanation_correct` text verbatim.

### 12.13 End-to-end with Claude.ai
Connect the dev server. Run the full loop:
1. *"What reading standards is Maya weakest on?"* (read)
2. *"Write a 200-word nonfiction passage about volcanoes and 5 questions targeting those standards."* (write — `create_custom_passage_and_questions`)
3. *"Maya keeps missing geometry questions about area. Make me 5 math questions, each with an SVG diagram of the figure."* (write with stem_svg — `create_custom_questions`)
4. *"Show me what you just created."* (read — `list_custom_passages`, `list_custom_questions`)
5. In the app: review queue shows the new draft passage, the 5 reading questions, and the 5 math questions with rendered geometry diagrams. Parent previews each, reads the questions, removes one diagram that looks wrong via the "Remove illustration" button, and approves the rest.
6. Kid takes a math test in "My questions only" mode. The 4 remaining custom math questions render with their geometry SVGs visible, alt text accessible to screen readers.
7. Kid takes a reading test in "Mixed" mode at 50%. The custom passage appears with its 5 questions; renders correctly.

If this loop doesn't feel useful end-to-end, fix UX before shipping even if all other tests pass.

### 12.14 UI checks
- All three new sections (`/parent/questions`, `/parent/passages`, edit pages) require auth + PIN.
- Unvetted disclaimer banner present everywhere parent-authored content is listed.
- "Drafted by AI" badge on AI-generated content in review lists.
- "Generated by AI" badge on each AI-produced SVG, with editable alt text and working "Remove illustration" button.
- Parent UI in v1 has NO drawing tool, NO SVG file upload, NO paste-SVG box. (Verify by inspecting the UI; if any such affordance exists for parent-authored SVG, that's a scope violation.)
- Bulk-publish works.
- "Preview as kid" renders passages above questions correctly, including any SVG illustrations at their actual rendered size.
- Stale-reference indicators appear and clear correctly.

---

## 13. What this brief does NOT include

- **Image upload (raster) on questions or passages.** Phase 5. Schema accommodates with `image_url` columns added later. For passages this is significant — illustrated passages with photographs are a real STAAR pattern — but text-and-SVG-first is the right starting scope.
- **UI-side SVG authoring.** Drawing tool, file upload, paste-SVG box. None of these in v1. The parent UI only renders, previews, edits alt text on, and removes AI-generated SVGs. The agent loop is the only authoring path. Phase 5 might add a simple drawing tool or a "describe and AI generates" UI button, but neither is in this phase.
- **Animated, interactive, or scriptable SVG.** The sanitizer rejects all of it. If a future feature needs e.g. an interactive number line, it gets a different rendering pipeline (a React component with bounded inputs), not SVG with animations.
- **Multi-select questions, fill-in, free response.** Out of scope. Single-correct multiple choice only.
- **Audio passages.** Out of scope; future phase.
- **Paired passages** (two passages, questions that compare them). Schema can be extended later with a `passage_pair_id` or by allowing question versions to reference two passage versions. Out of scope for v1.
- **Community question/passage bank.** Schema accommodates, no submission flow ships. AI-generated content is ineligible at the database level.
- **Quality scoring on parent content.** Phase 5 once enough attempts exist.
- **Folder/tag organization for parents with large banks.** Search + status + subject + genre filters are sufficient until somebody has 200+ items.
- **Inline AI helper buttons** (suggest distractors, suggest standard, write passage, generate questions for passage). May slip to Phase 4.5 — the MCP write loop replaces them functionally.
- **Parent-defined misconception tags.** Pick from existing taxonomy only.
- **Per-question access controls** (share with one specific kid only, etc.). All published custom content is visible to the test builder for the entire family.
- **An MCP tool to generate from weakness in one call.** Discussed in §5.11; deliberately not built.
- **Auto-propagating passage edits to all referencing questions.** Explicitly rejected; the manual upgrade flow is the design.

---

## 14. Ordered checkpoints for Claude Code

Do these in order. Run §12.5 immediately after step 7 and do not proceed if it fails. Run §12.10a immediately after step 4.

1. Apply the migrations from §4. Verify §12.1, §12.2, §12.3 (all shape invariants).
2. Implement the five RPCs (`map_create_custom_passage`, `map_publish_custom_passage`, `map_revise_custom_passage`, plus the updated question RPCs from V1 with new params including SVG). Verify §12.4.
3. Add the polymorphic column on `map_test_attempts` (§4.8). Update any code that writes attempts to use it for custom questions.
4. **Implement `lib/svg/sanitize.ts` with exhaustive tests against the malicious-SVG corpus from §12.10a.** This is the security spine of the SVG feature; build and test it in isolation before any tool wires it in. Verify §12.10a (sanitizer rejection) and §12.10c (canonicalization). Do not move on if any sanitizer test fails.
5. Create the `map_custom_questions_resolved` view (§4.11).
6. Implement `lib/custom-questions/validation.ts` and `lib/custom-passages/*` validators. Implement `lib/mcp/schemas.ts` importing from validation. The schemas for `create_custom_passage_and_questions` are the trickiest — get the cross-field validation (subject compatibility, question count, SVG presence + alt text, all-or-none choice SVG) right here so MCP and UI share the rules.
7. Implement `getCustomQuestionInFamily`, `getCustomPassageInFamily`, `getCustomPassageVersionInFamily`, and `enforceWriteQuota` in `lib/mcp/db.ts`.
8. Implement `lib/mcp/svg-capability-blurb.ts` and the per-tool description composition (§5.0).
9. Implement the new MCP tools, one file each. Wire them into `registerTools`. Each write tool calls the sanitizer on every SVG field before passing to the RPC. Verify §12.5 (the critical isolation test), §12.6 (draft-by-default), §12.10a (end-to-end SVG rejection through MCP), §12.10d (mixed-choice rejection).
10. Verify §12.7 (quotas), §12.8 (versioning preserves history), §12.10 (read-only verification grep).
11. Build `/parent/passages`, `/parent/passages/new`, `/parent/passages/[id]`. Include the version history sidebar, the upgrade-references banner, and the read-only SVG render with alt-text editor and remove button.
12. Build `/parent/questions`, `/parent/questions/new`, `/parent/questions/[id]`. Include the passage attachment section that conditionally appears for reading and language. Include the read-only SVG render for stem and choices, with alt-text editing and a "Remove illustration(s)" button per slot. Verify §12.9 (passage upgrade UX) end to end through UI.
13. Update the test builder for source mode + passage-aware sampling (§7.4). Verify §12.11.
14. Update the kid-side renderer to support passages above questions for custom content (§7.6) AND to render SVG via `<img src="data:image/svg+xml;base64,...">` only — never inline. Verify §12.10b (no `dangerouslySetInnerHTML` in render path) and §12.12 (passage rendering).
15. Update `/parent/connect-ai` with the new example prompts (§7.5), including SVG-generation prompts.
16. Add `include_custom` to the eight Phase 3 read tools (§8). Default `'separate'`. Make sure `passage_excerpt` resolves through the right version for custom attempts.
17. Run §12.13 (the end-to-end Claude.ai loop with SVG). If the experience doesn't feel useful, fix UX before shipping even if all earlier tests pass.
18. Append a section to `CLAUDE.md` summarizing: the two new entity families (passages and questions), the lifecycle (draft → published → archived), per-subject shape rules, the versioning model and explicit-upgrade rule for passage references, the 7 new MCP write tools, the source/status/created_via enums, the write quotas, **the SVG sanitization model and the MCP-only authoring rule**, and the Phase 5 list from §13.
