# Parent Area Redesign — Sub-cycle 2b: Library

**Date:** 2026-05-18
**Status:** Approved design, pre-plan
**Source brief:** Parent Area Redesign — Classroom + Library + Tests + AI Studio (Phase 5) — V1, §5.3
**Depends on:** Cycle 1 (`map_v_library_content` view, `getLibraryContent`, the custom-content RPCs) and 2a (the `parent_v2` resolver `ParentRoot`, `ParentShell` nav, the `?tab=` pattern). Branch `feat/parent-area-2b`, stacked on `feat/parent-area-2a` (PR #4), which stacks on Cycle-1 `feat/parent-area-redesign` (PR #3). All 2b UI ships behind `parent_v2`; build-ahead is safe.

## 1. Scope

2b is the **Library surface only**: a new `/parent/library` page with three source-separated tabs — **Vetted**, **My questions**, **AI Studio** — replacing the interim ParentShell "Library" → legacy `/parent/custom-bank` nav target. It is a leaf of the Cycle-2 decomposition (2a shell/Classroom/KidDetail done; 2c Tests+builder and 2d kid-home+flag-flip are separate later cycles).

**2b explicitly does NOT:** build the Tests surface or the builder, implement "Add to test" pre-fill, build an edit/revise editor, add in-app AI prompt entry, change kid-side code, flip `parent_v2`, or modify the Cycle-1 schema/views. The legacy `/parent/custom-bank` review queue and the create editors remain the flag-off path and the link targets.

## 2. Stack adaptation

Vite + React Router v6 SPA (same as 2a). The brief's Next.js IA maps to: a `/parent/library` route inside `ParentRoot`'s flag-on `<Routes>`, three tabs via `?tab=` query param (`useSearchParams`, default `vetted`, unknown→`vetted`) — the exact mechanic shipped in 2a's `KidDetail.tsx`. Existing Tailwind tokens; no design-system change; no component library; no React test runner (repo convention: Node DB script + `npm run typecheck && npm run build` + manual QA checklist).

## 3. Architecture — fresh on the Cycle-1 view, source isolation is structural

Build the Library fresh on the Cycle-1 `getLibraryContent` view + thin typed mutation wrappers. Each tab is a **separate component fed exactly one `source_tab`** — the brief's hard rule "vetted / my_questions / ai_studio never silently merge; AI vs human never silently merge, both directions" is enforced *structurally* (a tab component literally only ever calls `getLibraryContent` with its own `source_tab`; no runtime source branching in a shared list). The legacy `CustomBank.tsx` (status-tabbed, raw-table) is **left untouched** as the flag-off path; 2b does not extract from or modify it (the build-strategy decision).

## 4. Lib changes (`src/lib/parent/`)

**4.1 `getLibraryContent` — extend with optional server-side filters/pagination.** Verified: `getLibraryContent` currently has **zero callers** anywhere in `src`/`scripts`, so this is fully backward-compatible (no caller passes the new arg → identical behavior to today).

New signature:
```ts
export interface LibraryFilters {
  subject?: string
  grade?: number
  teksCode?: string
  ritBand?: string
  status?: string        // 'draft' | 'published' | 'archived'
  limit?: number         // default 500 (unchanged when omitted)
  offset?: number        // default 0
}
export async function getLibraryContent(
  sourceTab: 'vetted' | 'my_questions' | 'ai_studio',
  filters?: LibraryFilters,
): Promise<LibraryContentRow[]>
```
Implementation: apply `.eq()` for each provided filter (`subject`, `grade`, `teks_code`, `rit_band`, `status`) and `.range(offset, offset+limit-1)` (default `limit=500, offset=0`, preserving today's `.limit(500)` semantics when omitted), keeping `.eq('source_tab', sourceTab).order('created_at', { ascending:false })`. Filtering runs in Postgres against `map_v_library_content` so Vetted is correct over the full bank, not just the newest 500. RLS/source-tab semantics unchanged (vetted rows `family_id IS NULL`; custom rows RLS-scoped).

**4.2 New mutation wrappers in `src/lib/parent/mutations.ts`** (same shape/error-surfacing as the Cycle-1 wrappers; the publish RPC enforces §4.7 invariants server-side via `SET CONSTRAINTS ALL IMMEDIATE`):
```ts
export async function publishCustomQuestion(questionId: string): Promise<void>   // rpc map_publish_custom_question
export async function publishCustomPassage(passageId: string): Promise<void>     // rpc map_publish_custom_passage
export async function archiveCustomQuestion(questionId: string): Promise<void>   // rpc map_soft_delete_custom_question
export async function archiveCustomPassage(passageId: string): Promise<void>     // rpc map_soft_delete_custom_passage
```
Each: `const { error } = await supabase.rpc(<name>, { <param>: id }); if (error) throw error`. Param names per the existing RPCs: `p_question_id` / `p_passage_id`.

## 5. Routing

- New route inside `ParentRoot`'s flag-on `<Routes>` (sibling of `kids/:id`): `<Route path="library" element={<Library />} />`.
- `ParentShell` `navItems`: change the Library entry `to: '/parent/custom-bank'` → `to: '/parent/library'`. Tests/History entries unchanged (2c/legacy). The nav remains centralized for one-place future flips.
- Legacy routes untouched in `src/App.tsx`: `/parent/custom-bank`, `/parent/custom-bank/new-question`, `/parent/custom-bank/new-passage`, `/parent/connect-ai`, settings. These are the flag-off path and the link targets for "New question"/"New passage"/"Ask AI". No redirect for `/parent/library` (new surface).

## 6. Page + shared components

- `src/pages/parent/Library.tsx` — tab router, mirrors `KidDetail.tsx`: read `?tab=` (`useSearchParams`), `TABS = ['vetted','my_questions','ai_studio'] as const`, default/unknown → `vetted`, `setParams({tab})` on switch; header with overline + `Library` title + the tab nav (same pill styling as KidDetail; the AI Studio pill is amber-tinted per §8).
- `src/components/parent/library/`:
  - `VettedTab.tsx` — `getLibraryContent('vetted', filters)`. Read-only. Filter bar: subject, grade, TEKS code, RIT band, status (difficulty omitted — not a `LibraryContentRow` column; documented). Per-item: Preview, Add to test. Multi-select bulk: Add to test.
  - `MyQuestionsTab.tsx` — `getLibraryContent('my_questions', filters)` (covers `parent_manual` + `parent_ai_assisted`, mapped by the view). Per-item: Preview, Archive (`archiveCustom*` by `content_type`), status pill. Top actions: `+ New question` → `/parent/custom-bank/new-question`, `+ New passage` → `/parent/custom-bank/new-passage`. Filters: subject, grade, status. **No Edit action** (deferred — see §9).
  - `AiStudioTab.tsx` — see §8.
  - `LibraryItemCard.tsx` — renders one `LibraryContentRow` (content_type, subject, grade, teks_code/title, rit_band, status pill, created_at), a Preview affordance, a selection checkbox, and a slot for tab-specific actions. One card component, three callers; it never decides source itself.
  - `useLibrarySelection.ts` — `Set<string>` of `content_id` + toggle/clear/selected helpers; shared by the tabs that have bulk actions.
- Loading / error / empty states mirror 2a's `Classroom.tsx` (`rows: null` sentinel; `card p-8 text-center` error; empty-tab message). All copy uses the established curly glyphs (U+2019/U+201C/U+201D/U+2026) where apostrophes/quotes/ellipses occur — byte-fidelity discipline carried from 2a.

## 7. Vetted tab specifics

`getLibraryContent('vetted', filters)` — vetted rows have `family_id IS NULL` (visible to all signed-in via the `security_invoker` view). Filter bar drives server-side narrowing (§4.1). Pagination: `limit/offset` via `.range()` — a "Load more" / page control increments `offset`; sufficient for filtered browse at this scale (keyset deferred unless a perf need appears). "Add to test" (single + bulk) → navigate to legacy `/parent/custom-test`, **no pre-fill** (2a interim-nav precedent; pre-fill is 2c's, which owns the builder). Selection UI still functions (also reused by AI Studio bulk).

## 8. AI Studio isolation (the brief's load-bearing surface)

`AiStudioTab` lists `source = 'parent_ai_generated'` ONLY — it calls `getLibraryContent('ai_studio', …)` and nothing else; no other tab ever calls `'ai_studio'`. The boundary is structural and verified both directions (§10).

Visual/behavioral treatment (brief §5.3):
- The AI Studio **tab pill is amber/warning-tinted**, visually distinct from the neutral Vetted/My-questions pills.
- A **persistent banner** at the top of the tab: `AI-generated content lands here in draft. Review before publishing. The kid never sees draft content.`
- A **"Generated by AI" badge** on every item card (in addition to the status pill).
- Default filter `status = 'draft'` (this is the review queue; status filter can widen to published/archived/all).
- Per-card actions: Preview, **Publish** (single, with confirm), Archive.
- Bulk: multi-select → `Publish selected (N)` / `Archive selected (N)`. Implementation: iterate selected ids, call `publishCustomQuestion/Passage` (by `content_type`) per item; collect failures (the RPC raises on §4.7 invariant violation or not-draft) and surface them inline by id/title; the batch continues for the rest; refresh the list + selection after. No client-side re-validation (server-authoritative).
- `Ask AI to generate` CTA → navigate to `/parent/connect-ai` (brief §5.3/§10: "links out for now"; in-app prompt entry is a future phase).
- Filters: status, subject, grade.

Build order within the tab: amber tint + banner + "Generated by AI" badge + draft-default list first (the isolation is the point); bulk publish/archive second.

## 9. Deferrals (documented, not silent gaps)

- **Edit action on My-questions / AI-Studio items.** The existing editors (`NewCustomQuestion`/`NewCustomPassage`) are **create-only** (verified: no `:id`/revise). A revise/edit editor is `Custom_Questions_Brief.md`'s scope ("Library links to editors, doesn't reimplement them"); `map_revise_custom_*` RPCs exist server-side but no UI. 2b cards therefore expose **no Edit action**; this is an explicit, documented deferral (analogous to 2a's source-mix-badge deferral), not an omission.
- "Add to test" pre-fill → 2c.
- In-app "Ask AI" prompt entry → future phase (links out per brief §10).
- Difficulty filter on Vetted — not a `LibraryContentRow` column; omitted.

## 10. Verification

`scripts/test-parent-2b-data.mjs`, reusing the Cycle-1 `_parent-redesign-helpers.mjs` harness. For an ephemeral family A signed-in client, assert:

1. **Source boundary, both directions:** seed (service-role) a `parent_ai_generated` draft custom question + version for family A. `getLibraryContent('ai_studio')` returns it (status `draft`, family-scoped). `getLibraryContent('my_questions')` does NOT return it (AI never bleeds into My-questions). `getLibraryContent('vetted')` returns only `family_id IS NULL` rows — never the family's custom/AI rows.
2. **Publish lifecycle:** `publishCustomQuestion(id)` flips the draft → `published` (re-query `ai_studio` with `status:'published'` shows it; `status:'draft'` no longer); calling it again (now non-draft) rejects (RPC raises) — proving the server-side gate the bulk UI relies on.
3. **Archive:** `archiveCustomQuestion(id)` soft-deletes (subsequent `getLibraryContent` excludes it).
4. **Extended filters narrow server-side:** `getLibraryContent('ai_studio', { status:'draft' })` and a `subject`/`grade` filter return only matching rows; `limit/offset` paginate.
5. Cross-family: family B's signed-in client never sees family A's `my_questions`/`ai_studio` rows (RLS via the security_invoker view — already proven in Cycle 1; re-asserted at the lib boundary 2b consumes).

Plus `npm run typecheck && npm run build` (both exit 0) and a manual-QA checklist: flag-off unchanged (legacy `/parent/custom-bank` still the Library experience when `parent_v2=false`); flag-on `/parent/library` 3 tabs; copyable `?tab=ai_studio` URL; AI Studio amber pill + banner + "Generated by AI" badge present and default `status=draft`; a bulk publish with one invalid item surfaces that item inline and publishes the rest; `+ New question`/`+ New passage` reach the existing create editors; "Add to test" reaches legacy `/parent/custom-test`. Exit condition: data script green, typecheck+build green, checklist passes.

## 11. Risks / open assumptions

- **Editing a Cycle-1 file (`queries.ts`) on the stacked 2b branch.** Mitigated: the `getLibraryContent` change is additive (optional `filters` arg), has zero existing callers, behavior identical when omitted; same stacked-branch model as 2a→Cycle1.
- **AI/human/vetted boundary.** Enforced structurally (one source_tab per tab component, no shared source-branching list) and asserted both directions in §10.1; the underlying `security_invoker` view + RLS were proven by Cycle-1's §9.6 gate.
- **`map_v_library_content` filter columns.** The view exposes `subject, grade, rit_band, teks_code, status, source_tab` (per `LibraryContentRow`); the §4.1 filters map 1:1. The plan's first step re-confirms these column names against the live view before wiring filters (a defect-class guard, like 2a's pre-flight).
- **Vetted pagination UX.** `limit/offset` is acceptable for filtered browse now; if a filtered vetted result set is still large, a follow-up keyset refinement is a 2b-internal change (no schema impact).
- **Glyph fidelity.** Apostrophes/quotes/ellipses in new copy must use U+2019/U+201C/U+201D/U+2026 — the recurring 2a defect class; the plan calls it out and verification hexdump-checks new user-facing strings.
