# Parent Area 2b — Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/parent/library` — three source-separated tabs (Vetted / My questions / AI Studio, AI Studio amber-isolated) built fresh on the Cycle-1 `getLibraryContent` view (extended with server-side filters/pagination) + thin publish/archive mutation wrappers, behind `parent_v2`.

**Architecture:** Mirror the shipped 2a `KidDetail` pattern: a `/parent/library` route inside `ParentRoot`'s flag-on `<Routes>`, three tabs via `?tab=` (default `vetted`). Each tab is its own component fed exactly one `source_tab` (the brief's AI/human/vetted boundary is structural, not a runtime branch). Legacy `CustomBank.tsx` + the create editors are untouched (flag-off path + link targets).

**Tech Stack:** Vite + React 18 + React Router v6 + TypeScript + Tailwind. No new deps, no React test runner (repo convention: Node DB script + `npm run typecheck && npm run build` + manual QA). Cycle-1 lib `src/lib/parent/{queries,mutations,types}.ts` exists; custom-content RPCs (`map_publish_custom_*`, `map_soft_delete_custom_*`) exist server-side.

**Reference spec:** `docs/superpowers/specs/2026-05-18-parent-area-2b-library-design.md`. Branch: `feat/parent-area-2b` (checked out, stacked on 2a).

**Glyph-fidelity rule (recurring 2a defect class — non-negotiable):** every apostrophe/quote/ellipsis in user-facing copy MUST be the Unicode glyph — `’` U+2019, `“`/`”` U+201C/U+201D, `…` U+2026 — never ASCII `'` `"` `...`. Type the literal glyphs exactly as shown in the code blocks.

---

## File Structure

- Modify `src/lib/parent/types.ts` — add `LibraryFilters` interface.
- Modify `src/lib/parent/queries.ts` — extend `getLibraryContent(sourceTab, filters?)` (additive, backward-compatible).
- Modify `src/lib/parent/mutations.ts` — add `publishCustomQuestion/Passage`, `archiveCustomQuestion/Passage`.
- Create `src/components/parent/library/useLibrarySelection.ts` — multi-select `Set` hook.
- Create `src/components/parent/library/LibraryItemCard.tsx` — one `LibraryContentRow` card (presentational; actions via slot prop).
- Create `src/components/parent/library/VettedTab.tsx` — read-only browse + filters + Add-to-test.
- Create `src/components/parent/library/MyQuestionsTab.tsx` — manual/AI-assisted; Archive + New question/passage links.
- Create `src/components/parent/library/AiStudioTab.tsx` — amber-isolated draft review queue + bulk publish/archive.
- Create `src/pages/parent/Library.tsx` — `?tab=` router (mirrors `KidDetail.tsx`).
- Modify `src/pages/parent/ParentRoot.tsx` — add `<Route path="library" element={<Library />} />` + import.
- Modify `src/components/parent/ParentShell.tsx` — Library nav `to: '/parent/library'`.
- Create `scripts/test-parent-2b-data.mjs` — Node verification (reuses Cycle-1 harness).

---

### Task 1: Add `LibraryFilters` type

**Files:** Modify `src/lib/parent/types.ts`

- [ ] **Step 1: Append the interface** (add at end of file, after `LibraryContentRow`)

```ts

export interface LibraryFilters {
  subject?: string;
  grade?: number;
  teksCode?: string;
  ritBand?: string;
  status?: string;
  limit?: number;
  offset?: number;
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/parent/types.ts
git commit -m "feat(parent) LibraryFilters type for getLibraryContent server-side filters"
```

---

### Task 2: Extend `getLibraryContent` with server-side filters/pagination

**Files:** Modify `src/lib/parent/queries.ts`

- [ ] **Step 1: Replace the existing `getLibraryContent` function** (lines 28–39) with:

```ts
export async function getLibraryContent(
  sourceTab: 'vetted' | 'my_questions' | 'ai_studio',
  filters?: LibraryFilters,
): Promise<LibraryContentRow[]> {
  let q = supabase
    .from('map_v_library_content')
    .select('*')
    .eq('source_tab', sourceTab);
  if (filters?.subject) q = q.eq('subject', filters.subject);
  if (filters?.grade != null) q = q.eq('grade', filters.grade);
  if (filters?.teksCode) q = q.eq('teks_code', filters.teksCode);
  if (filters?.ritBand) q = q.eq('rit_band', filters.ritBand);
  if (filters?.status) q = q.eq('status', filters.status);
  const limit = filters?.limit ?? 500;
  const offset = filters?.offset ?? 0;
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as LibraryContentRow[];
}
```

- [ ] **Step 2: Add `LibraryFilters` to the type import** — change line 5–7 from:

```ts
import type {
  ClassroomRosterRow, AssignmentOverviewRow, LibraryContentRow,
} from './types';
```
to:
```ts
import type {
  ClassroomRosterRow, AssignmentOverviewRow, LibraryContentRow, LibraryFilters,
} from './types';
```

- [ ] **Step 3: Typecheck** — `npm run typecheck` → exit 0. (Backward-compatible: no existing caller passes `filters`; `.range(0, 499)` == old `.limit(500)`.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/parent/queries.ts
git commit -m "feat(parent) getLibraryContent: optional server-side filters + pagination"
```

---

### Task 3: Publish/archive mutation wrappers

**Files:** Modify `src/lib/parent/mutations.ts`

- [ ] **Step 1: Append these four functions** at the end of `src/lib/parent/mutations.ts` (same shape as the existing `revokeAssignment` wrapper; RPC param names are `p_question_id` / `p_passage_id` — verified against the live RPCs and the legacy CustomBank usage):

```ts

export async function publishCustomQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.rpc('map_publish_custom_question', {
    p_question_id: questionId,
  });
  if (error) throw error;
}

export async function publishCustomPassage(passageId: string): Promise<void> {
  const { error } = await supabase.rpc('map_publish_custom_passage', {
    p_passage_id: passageId,
  });
  if (error) throw error;
}

export async function archiveCustomQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.rpc('map_soft_delete_custom_question', {
    p_question_id: questionId,
  });
  if (error) throw error;
}

export async function archiveCustomPassage(passageId: string): Promise<void> {
  const { error } = await supabase.rpc('map_soft_delete_custom_passage', {
    p_passage_id: passageId,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/parent/mutations.ts
git commit -m "feat(parent) publish/archive custom question/passage mutation wrappers"
```

---

### Task 4: `useLibrarySelection` hook

**Files:** Create `src/components/parent/library/useLibrarySelection.ts`

- [ ] **Step 1: Write the file**

```ts
// src/components/parent/library/useLibrarySelection.ts
// Multi-select set keyed by content_id, shared by tabs with bulk actions.
import { useCallback, useState } from 'react'

export function useLibrarySelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  return { selected, toggle, clear, count: selected.size }
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/library/useLibrarySelection.ts
git commit -m "feat(parent) useLibrarySelection hook for Library bulk actions"
```

---

### Task 5: `LibraryItemCard`

**Files:** Create `src/components/parent/library/LibraryItemCard.tsx`

- [ ] **Step 1: Write the file** (presentational; selection + an `actions` render slot; never decides source itself)

```tsx
// src/components/parent/library/LibraryItemCard.tsx
// One LibraryContentRow rendered as a card. Selection checkbox + a tab-supplied
// actions slot. Presentational only — the tab decides which actions exist.
import type { ReactNode } from 'react'
import type { LibraryContentRow } from '../../../lib/parent/types'

export function LibraryItemCard({
  row,
  selected,
  onToggleSelect,
  badge,
  actions,
}: {
  row: LibraryContentRow
  selected: boolean
  onToggleSelect: (id: string) => void
  badge?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <input
        type="checkbox"
        className="mt-1"
        checked={selected}
        onChange={() => onToggleSelect(row.content_id)}
        aria-label="Select item"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-cloud">
            {row.content_type}
          </span>
          <span className="text-xs capitalize text-ink/60">{row.subject}</span>
          {row.grade != null && (
            <span className="text-xs text-ink/50">Grade {row.grade}</span>
          )}
          {row.status && (
            <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold capitalize text-ink/70 ring-1 ring-cloud">
              {row.status}
            </span>
          )}
          {badge}
        </div>
        {row.teks_code && (
          <p className="mt-1 font-mono text-[11px] text-ink/60">
            {row.teks_code}
            {row.teks_title ? ` — ${row.teks_title}` : ''}
          </p>
        )}
        {row.rit_band && (
          <p className="mt-1 text-[11px] text-ink/40">RIT {row.rit_band}</p>
        )}
        <p className="mt-1 text-[11px] text-ink/40">
          {new Date(row.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
      {actions && <div className="flex shrink-0 flex-col items-end gap-1">{actions}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/library/LibraryItemCard.tsx
git commit -m "feat(parent) LibraryItemCard presentational component"
```

---

### Task 6: `VettedTab`

**Files:** Create `src/components/parent/library/VettedTab.tsx`

- [ ] **Step 1: Write the file** (read-only browse; server-side filters; Add-to-test → legacy, no pre-fill)

```tsx
// src/components/parent/library/VettedTab.tsx
// Vetted platform bank (family_id IS NULL via the security_invoker view).
// Read-only. Server-side filters + offset pagination. "Add to test" deep-links
// to the legacy builder (no pre-fill — 2c owns pre-fill).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLibraryContent } from '../../../lib/parent/queries'
import type { LibraryContentRow, LibraryFilters } from '../../../lib/parent/types'
import { LibraryItemCard } from './LibraryItemCard'
import { useLibrarySelection } from './useLibrarySelection'

const PAGE = 100

export function VettedTab() {
  const navigate = useNavigate()
  const sel = useLibrarySelection()
  const [subject, setSubject] = useState('')
  const [grade, setGrade] = useState('')
  const [rows, setRows] = useState<LibraryContentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError(null)
    setAtEnd(false)
    const filters: LibraryFilters = { limit: PAGE, offset }
    if (subject) filters.subject = subject
    if (grade) filters.grade = Number(grade)
    void getLibraryContent('vetted', filters)
      .then((r) => {
        if (cancelled) return
        setRows(r)
        setAtEnd(r.length < PAGE)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load vetted content.')
      })
    return () => {
      cancelled = true
    }
  }, [subject, grade, offset])

  if (error) {
    return <div className="card p-6 text-sm text-ink/60">{error}</div>
  }
  if (!rows) {
    return <p className="mt-8 text-center font-display text-xl">Loading…</p>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={subject}
          onChange={(e) => {
            setOffset(0)
            setSubject(e.target.value)
          }}
          className="rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
        >
          <option value="">All subjects</option>
          <option value="math">Math</option>
          <option value="reading">Reading</option>
          <option value="language">Language</option>
        </select>
        <input
          type="number"
          placeholder="Grade"
          value={grade}
          onChange={(e) => {
            setOffset(0)
            setGrade(e.target.value)
          }}
          className="w-24 rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
        />
        {sel.count > 0 && (
          <button
            type="button"
            onClick={() => navigate('/parent/custom-test')}
            className="btn-secondary text-sm"
          >
            Add {sel.count} to test
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink/60">
          No vetted content matches these filters.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <LibraryItemCard
              key={r.content_id}
              row={r}
              selected={sel.selected.has(r.content_id)}
              onToggleSelect={sel.toggle}
              actions={
                <button
                  type="button"
                  onClick={() => navigate('/parent/custom-test')}
                  className="btn-ghost text-xs"
                >
                  Add to test
                </button>
              }
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-between">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE))}
          className="btn-ghost text-sm disabled:opacity-40"
        >
          ‹ Newer
        </button>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => setOffset(offset + PAGE)}
          className="btn-ghost text-sm disabled:opacity-40"
        >
          Older ›
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/library/VettedTab.tsx
git commit -m "feat(parent) Library VettedTab: filtered browse + interim Add-to-test"
```

---

### Task 7: `MyQuestionsTab`

**Files:** Create `src/components/parent/library/MyQuestionsTab.tsx`

- [ ] **Step 1: Write the file** (parent_manual + parent_ai_assisted via the view's `my_questions` source_tab; Archive; New question/passage links; no Edit — deferred per spec §9)

```tsx
// src/components/parent/library/MyQuestionsTab.tsx
// Family's parent_manual + parent_ai_assisted content (view maps both to
// source_tab='my_questions'). Archive via soft-delete RPC wrappers. New
// question/passage link to the existing create editors. No Edit action —
// the editors are create-only; a revise editor is out of 2b scope (spec §9).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getLibraryContent } from '../../../lib/parent/queries'
import { archiveCustomPassage, archiveCustomQuestion } from '../../../lib/parent/mutations'
import type { LibraryContentRow } from '../../../lib/parent/types'
import { LibraryItemCard } from './LibraryItemCard'
import { useLibrarySelection } from './useLibrarySelection'

export function MyQuestionsTab() {
  const sel = useLibrarySelection()
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<LibraryContentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    setRows(null)
    setError(null)
    void getLibraryContent('my_questions', status ? { status } : undefined)
      .then(setRows)
      .catch((e) => setError(e?.message ?? 'Failed to load your questions.'))
  }
  useEffect(load, [status])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!rows) return <p className="mt-8 text-center font-display text-xl">Loading…</p>

  const onArchive = async (row: LibraryContentRow) => {
    setBusy(row.content_id)
    try {
      if (row.content_type === 'passage') await archiveCustomPassage(row.content_id)
      else await archiveCustomQuestion(row.content_id)
      load()
    } catch (e) {
      setError((e as Error)?.message ?? 'Archive failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/parent/custom-bank/new-question" className="btn-secondary text-sm">
          + New question
        </Link>
        <Link to="/parent/custom-bank/new-passage" className="btn-secondary text-sm">
          + New passage
        </Link>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink/60">
          No questions or passages here yet. Use “+ New question” to author one.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <LibraryItemCard
              key={r.content_id}
              row={r}
              selected={sel.selected.has(r.content_id)}
              onToggleSelect={sel.toggle}
              actions={
                <button
                  type="button"
                  disabled={busy === r.content_id}
                  onClick={() => onArchive(r)}
                  className="btn-ghost text-xs"
                >
                  {busy === r.content_id ? '…' : 'Archive'}
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/library/MyQuestionsTab.tsx
git commit -m "feat(parent) Library MyQuestionsTab: archive + create-editor links (no Edit, per spec §9)"
```

---

### Task 8: `AiStudioTab` (the amber-isolated review surface)

**Files:** Create `src/components/parent/library/AiStudioTab.tsx`

- [ ] **Step 1: Write the file** (source `ai_studio` ONLY; amber banner; "Generated by AI" badge; default `status=draft`; per-item + bulk publish/archive surfacing per-item RPC failures)

```tsx
// src/components/parent/library/AiStudioTab.tsx
// AI-generated content ONLY (view source_tab='ai_studio' = source
// 'parent_ai_generated'). The single amber-isolated surface. Never calls any
// other source_tab; no other tab calls 'ai_studio'. Bulk publish/archive run
// per item; the publish RPC enforces §4.7 invariants server-side and raises —
// failures are surfaced inline by id, the batch continues for the rest.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLibraryContent } from '../../../lib/parent/queries'
import {
  archiveCustomPassage,
  archiveCustomQuestion,
  publishCustomPassage,
  publishCustomQuestion,
} from '../../../lib/parent/mutations'
import type { LibraryContentRow } from '../../../lib/parent/types'
import { LibraryItemCard } from './LibraryItemCard'
import { useLibrarySelection } from './useLibrarySelection'

export function AiStudioTab() {
  const navigate = useNavigate()
  const sel = useLibrarySelection()
  const [status, setStatus] = useState('draft')
  const [rows, setRows] = useState<LibraryContentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failures, setFailures] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = () => {
    setRows(null)
    setError(null)
    void getLibraryContent('ai_studio', status ? { status } : undefined)
      .then(setRows)
      .catch((e) => setError(e?.message ?? 'Failed to load AI Studio.'))
  }
  useEffect(load, [status])

  const runBulk = async (action: 'publish' | 'archive') => {
    if (!rows) return
    setBulkBusy(true)
    setFailures([])
    const targets = rows.filter((r) => sel.selected.has(r.content_id))
    const failed: string[] = []
    for (const r of targets) {
      try {
        if (action === 'publish') {
          if (r.content_type === 'passage') await publishCustomPassage(r.content_id)
          else await publishCustomQuestion(r.content_id)
        } else if (r.content_type === 'passage') {
          await archiveCustomPassage(r.content_id)
        } else {
          await archiveCustomQuestion(r.content_id)
        }
      } catch (e) {
        failed.push(`${r.teks_code ?? r.content_type} (${r.content_id.slice(0, 8)}): ${(e as Error)?.message ?? 'failed'}`)
      }
    }
    setFailures(failed)
    sel.clear()
    setBulkBusy(false)
    load()
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-sun/10 p-4 text-sm text-ink/80 ring-1 ring-sun/40">
        AI-generated content lands here in draft. Review before publishing. The
        kid never sees draft content.
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/parent/connect-ai')}
          className="btn-secondary text-sm"
        >
          Ask AI to generate
        </button>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
          <option value="">All</option>
        </select>
        {sel.count > 0 && (
          <>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => runBulk('publish')}
              className="btn-secondary text-sm"
            >
              {bulkBusy ? '…' : `Publish selected (${sel.count})`}
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => runBulk('archive')}
              className="btn-ghost text-sm"
            >
              {bulkBusy ? '…' : `Archive selected (${sel.count})`}
            </button>
          </>
        )}
      </div>

      {failures.length > 0 && (
        <div className="mb-4 rounded-2xl bg-red/10 p-4 text-xs text-ink/80 ring-1 ring-red/40">
          <p className="font-semibold">Some items could not be published:</p>
          <ul className="mt-1 list-disc pl-5">
            {failures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="card p-6 text-sm text-ink/60">{error}</div>}
      {!error && !rows && (
        <p className="mt-8 text-center font-display text-xl">Loading…</p>
      )}
      {!error && rows && rows.length === 0 && (
        <p className="card p-6 text-center text-sm text-ink/60">
          No AI-generated content with this status.
        </p>
      )}
      {!error && rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <LibraryItemCard
              key={r.content_id}
              row={r}
              selected={sel.selected.has(r.content_id)}
              onToggleSelect={sel.toggle}
              badge={
                <span className="rounded-full bg-sun/20 px-2 py-0.5 text-[11px] font-semibold text-ink/70 ring-1 ring-sun/40">
                  Generated by AI
                </span>
              }
              actions={
                <AiItemActions row={r} onDone={load} onError={setError} />
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AiItemActions({
  row,
  onDone,
  onError,
}: {
  row: LibraryContentRow
  onDone: () => void
  onError: (m: string) => void
}) {
  const [busy, setBusy] = useState<'publish' | 'archive' | null>(null)
  const run = async (action: 'publish' | 'archive') => {
    setBusy(action)
    try {
      if (action === 'publish') {
        if (row.content_type === 'passage') await publishCustomPassage(row.content_id)
        else await publishCustomQuestion(row.content_id)
      } else if (row.content_type === 'passage') {
        await archiveCustomPassage(row.content_id)
      } else {
        await archiveCustomQuestion(row.content_id)
      }
      onDone()
    } catch (e) {
      onError((e as Error)?.message ?? `${action} failed.`)
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      {row.status === 'draft' && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('publish')}
          className="btn-secondary text-xs"
        >
          {busy === 'publish' ? '…' : 'Publish'}
        </button>
      )}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('archive')}
        className="btn-ghost text-xs"
      >
        {busy === 'archive' ? '…' : 'Archive'}
      </button>
    </>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0. (`bg-sun/*`, `bg-red/*`, `ring-*` tokens are used elsewhere in the app — same palette as 2a's `KidRosterCard`/`GrowthAreas`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/parent/library/AiStudioTab.tsx
git commit -m "feat(parent) Library AiStudioTab: amber-isolated draft queue + per-item/bulk publish-archive"
```

---

### Task 9: `Library` page + route wiring

**Files:** Create `src/pages/parent/Library.tsx`; Modify `src/pages/parent/ParentRoot.tsx`, `src/components/parent/ParentShell.tsx`

- [ ] **Step 1: Create `src/pages/parent/Library.tsx`** (mirrors `KidDetail.tsx` `?tab=` mechanic; AI Studio pill amber-tinted)

```tsx
// src/pages/parent/Library.tsx
// Library tab router. ?tab= ∈ vetted|my_questions|ai_studio, default vetted,
// unknown → vetted. Mirrors KidDetail's tab mechanic. The ai_studio pill is
// amber-tinted — the only non-neutral tab (brief §5.3).
import { useSearchParams } from 'react-router-dom'
import { VettedTab } from '../../components/parent/library/VettedTab'
import { MyQuestionsTab } from '../../components/parent/library/MyQuestionsTab'
import { AiStudioTab } from '../../components/parent/library/AiStudioTab'

const TABS = ['vetted', 'my_questions', 'ai_studio'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = {
  vetted: 'Vetted',
  my_questions: 'My questions',
  ai_studio: 'AI Studio',
}

export default function Library() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '')
    ? (raw as Tab)
    : 'vetted'

  return (
    <div>
      <header className="mb-5">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">
          Parent view
        </p>
        <h1 className="font-display text-4xl">Library</h1>
        <nav className="mt-4 flex gap-1 text-sm">
          {TABS.map((t) => {
            const active = tab === t
            const amber = t === 'ai_studio'
            return (
              <button
                key={t}
                type="button"
                onClick={() => setParams({ tab: t }, { replace: false })}
                className={`rounded-full px-3 py-1.5 font-semibold transition ${
                  active
                    ? amber
                      ? 'bg-sun/20 text-ink shadow ring-1 ring-sun/50'
                      : 'bg-white text-ink shadow ring-1 ring-cloud'
                    : amber
                      ? 'text-amber-700/70 hover:text-amber-700'
                      : 'text-ink/60 hover:text-ink'
                }`}
              >
                {LABEL[t]}
              </button>
            )
          })}
        </nav>
      </header>

      {tab === 'vetted' && <VettedTab />}
      {tab === 'my_questions' && <MyQuestionsTab />}
      {tab === 'ai_studio' && <AiStudioTab />}
    </div>
  )
}
```

- [ ] **Step 2: Modify `src/pages/parent/ParentRoot.tsx`** — add the import and the route.

Add to the import block (with the other page imports, after `import KidDetail from './KidDetail'`):
```tsx
import Library from './Library'
```
Add the route inside `<Route element={<ParentShell />}>`, immediately after the `kids/:id` route line:
```tsx
        <Route path="library" element={<Library />} />
```
The block becomes:
```tsx
      <Route element={<ParentShell />}>
        <Route index element={<Classroom />} />
        <Route path="kids/:id" element={<KidDetail />} />
        <Route path="library" element={<Library />} />
        <Route path="dashboard" element={<DashboardRedirect />} />
        <Route path="*" element={<Navigate to="/parent" replace />} />
      </Route>
```

- [ ] **Step 3: Modify `src/components/parent/ParentShell.tsx`** — change ONLY the Library navItems entry:
```tsx
  { to: '/parent/custom-bank', label: 'Library' },
```
to:
```tsx
  { to: '/parent/library', label: 'Library' },
```
Leave the other navItems entries unchanged.

- [ ] **Step 4: Typecheck + build** — `npm run typecheck && npm run build` → both exit 0. Then `grep -rn "custom-bank" src/components/parent/ParentShell.tsx` → no match (Library nav now points at `/parent/library`). Legacy `/parent/custom-bank` route in `src/App.tsx` must be unchanged: `grep -n 'path="/parent/custom-bank"' src/App.tsx` → still present.

- [ ] **Step 5: Commit**

```bash
git add src/pages/parent/Library.tsx src/pages/parent/ParentRoot.tsx src/components/parent/ParentShell.tsx
git commit -m "feat(parent) Library page + /parent/library route + ParentShell nav swap"
```

---

### Task 10: Verification — data script + build + manual QA

**Files:** Create `scripts/test-parent-2b-data.mjs`

- [ ] **Step 1: Write the script** (reuses the Cycle-1 harness; seeds a draft `parent_ai_generated` question via service-role admin, asserts the source boundary both directions + publish/archive + filters)

```js
// scripts/test-parent-2b-data.mjs
// 2b data guard: source-boundary isolation (both directions), publish/archive
// lifecycle, and extended getLibraryContent filters — at the lib boundary 2b
// consumes. Reuses the Cycle-1 ephemeral-family harness.
// Run: node --env-file=.env.local scripts/test-parent-2b-data.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

// Inline the production query (kept in sync with src/lib/parent/queries.ts).
async function libraryContent(client, sourceTab, filters) {
  let q = client.from('map_v_library_content').select('*').eq('source_tab', sourceTab);
  if (filters?.subject) q = q.eq('subject', filters.subject);
  if (filters?.grade != null) q = q.eq('grade', filters.grade);
  if (filters?.status) q = q.eq('status', filters.status);
  const limit = filters?.limit ?? 500;
  const offset = filters?.offset ?? 0;
  const { data, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  // Seed one parent_ai_generated DRAFT question + version for family A (service role).
  const { data: cq, error: cqe } = await admin
    .from('map_custom_questions')
    .insert({ family_id: ctx.A.familyId, source: 'parent_ai_generated', status: 'draft', created_via: 'mcp' })
    .select('id')
    .single();
  assert(!cqe && cq?.id, 'seed: parent_ai_generated draft custom question created');
  const { data: ver, error: ve } = await admin
    .from('map_custom_question_versions')
    .insert({
      question_id: cq.id, version_number: 1, subject: 'math', grade: 3,
      stem: '2b test stem', question_focus: 'test', standard_code: '3.4A', difficulty: 'medium',
    })
    .select('id')
    .single();
  assert(!ve && ver?.id, 'seed: question version created');
  await admin.from('map_custom_questions').update({ current_version_id: ver.id }).eq('id', cq.id);

  // 1. Source boundary — both directions.
  const ai = await libraryContent(ca, 'ai_studio', { status: 'draft' });
  assert(ai.some((r) => r.content_id === cq.id), '§10.1 ai_studio returns the AI draft');
  const mine = await libraryContent(ca, 'my_questions');
  assert(!mine.some((r) => r.content_id === cq.id), '§10.1 my_questions never returns the AI item');
  const vetted = await libraryContent(ca, 'vetted', { limit: 50 });
  assert(vetted.every((r) => r.family_id === null), '§10.1 vetted returns only family_id IS NULL rows');
  assert(!vetted.some((r) => r.content_id === cq.id), '§10.1 vetted never returns the family AI item');

  // 2. Publish lifecycle (server-side §4.7 gate the bulk UI relies on).
  const { error: pubErr } = await ca.rpc('map_publish_custom_question', { p_question_id: cq.id });
  assert(!pubErr, 'publish: draft AI question publishes');
  const aiPub = await libraryContent(ca, 'ai_studio', { status: 'published' });
  assert(aiPub.some((r) => r.content_id === cq.id), 'publish: now visible under status=published');
  const aiDraft2 = await libraryContent(ca, 'ai_studio', { status: 'draft' });
  assert(!aiDraft2.some((r) => r.content_id === cq.id), 'publish: no longer under status=draft');
  const { error: pubErr2 } = await ca.rpc('map_publish_custom_question', { p_question_id: cq.id });
  assert(!!pubErr2, 'publish: re-publishing a non-draft is rejected (server gate)');

  // 3. Archive (soft delete) removes it from the view.
  const { error: arcErr } = await ca.rpc('map_soft_delete_custom_question', { p_question_id: cq.id });
  assert(!arcErr, 'archive: soft-delete succeeds');
  const aiAll = await libraryContent(ca, 'ai_studio', {});
  assert(!aiAll.some((r) => r.content_id === cq.id), 'archive: excluded from the view after soft-delete');

  // 4. Cross-family isolation at this boundary.
  const cb = await signInClient(ctx.B.email, ctx.B.password);
  const bAi = await libraryContent(cb, 'ai_studio', {});
  assert(!bAi.some((r) => r.content_id === cq.id), '§10.5 family B never sees family A AI content');

  console.log('\n2b data checks complete.');
} finally {
  await teardown(ctx);
}
```

- [ ] **Step 2: Run the data script**

Run: `node --env-file=.env.local scripts/test-parent-2b-data.mjs ; echo "exit=$?"`
Expected: every line `PASS:`, ends `2b data checks complete.`, `exit=0`. The Cycle-1 migration is already applied to the live dev DB so this passes immediately (regression/boundary guard). If `map_custom_questions`/`map_custom_question_versions` insert columns differ from what's used here, that is a real finding — report it (the seed shape must match the live schema; do NOT hand-wave a pass). The harness `_parent-redesign-helpers.mjs` exports `admin, setup, signInClient, teardown, assert`.

- [ ] **Step 3: Full typecheck + build**

Run: `npm run typecheck && npm run build ; echo "exit=$?"`
Expected: both exit 0 (all new components/page/route compile; pre-existing chunk-size warnings are not failures).

- [ ] **Step 4: Manual-QA checklist (static analysis — no browser)**

Verify each against committed code, report PASS/CONCERN with file:concept evidence:
1. Flag-off unchanged: `ParentRoot` `!v2 → <Parent/>`; `CustomBank.tsx` untouched in this branch range (`git log --oneline <2b-base>..HEAD -- src/pages/parent/CustomBank.tsx` empty).
2. Flag-on `/parent/library` renders 3 tabs; `?tab=` default `vetted`, unknown→`vetted`; copy `?tab=ai_studio` deep-links (Library.tsx reads `params.get('tab')`).
3. Source boundary structural: `VettedTab` only calls `getLibraryContent('vetted',…)`, `MyQuestionsTab` only `'my_questions'`, `AiStudioTab` only `'ai_studio'` (grep each file: exactly one `getLibraryContent(` call with its own literal).
4. AI Studio amber: banner present; tab pill amber when `ai_studio`; "Generated by AI" badge on every card; default `status='draft'`; bulk publish/archive iterate per-item and collect `failures` surfaced inline.
5. My questions: Archive wired to `archiveCustom*` by `content_type`; New question/passage → `/parent/custom-bank/new-question|new-passage`; NO Edit action (spec §9 deferral).
6. Vetted: server-side filters (subject/grade) reset offset to 0; Add-to-test → `/parent/custom-test` (no pre-fill); Newer/Older offset paging.
7. ParentShell Library nav → `/parent/library`; legacy `/parent/custom-bank` route still declared in `src/App.tsx`.
8. Glyph fidelity: hexdump-spot-check new files for U+2026 in `Loading…`, U+201C/U+201D in MyQuestionsTab’s “+ New question” copy — confirm `e2 80 a6` / `e2 80 9c`/`e2 80 9d`, no ASCII `...`/`"` in user copy.

- [ ] **Step 5: Final commit**

```bash
git add scripts/test-parent-2b-data.mjs
git commit -m "test(parent) 2b data guard; Library slice complete (boundary+publish+filters green, typecheck+build green, QA verified)"
```

---

## Self-Review

**Spec coverage:**
- §3 fresh build on getLibraryContent, source isolation structural → Tasks 6/7/8 (one source_tab per component). ✓
- §4.1 getLibraryContent filters/pagination → Task 2; §4.2 mutation wrappers → Task 3. ✓
- §5 routing (`/parent/library` in ParentRoot, ParentShell nav swap, legacy untouched) → Task 9. ✓
- §6 Library page + shared components (`LibraryItemCard`, `useLibrarySelection`, 3 tabs) → Tasks 4/5/6/7/8/9. ✓
- §7 Vetted (server filters, offset paging, Add-to-test→legacy no pre-fill) → Task 6. ✓
- §8 AI Studio (only `ai_studio`; amber pill+banner+badge; default draft; per-item + bulk publish/archive surfacing server-side failures; Ask AI → /parent/connect-ai) → Task 8 + Task 9 (amber pill). ✓
- §9 deferrals: no Edit action (Task 7 explicit), Add-to-test no pre-fill (Task 6), difficulty filter omitted (not in card/filters). ✓
- §10 verification (boundary both directions, publish lifecycle incl. re-publish rejection, archive, filters, cross-family) → Task 10 data script + manual QA. ✓
- §11 risks: additive getLibraryContent (Task 2 backward-compat note), structural boundary (Tasks 6-8 + Task 10 §10.1), glyph fidelity (header rule + Task 10 Step 4.8). ✓

No spec requirement without a task.

**Placeholder scan:** No TBD/TODO/"handle errors". Every component/page/script step is complete code. Deferrals (Edit) are explicit non-actions with rationale, not placeholders.

**Type consistency:** `LibraryFilters` defined Task 1, imported Task 2, used Tasks 6/8 (and the inlined script copy Task 10) with identical field names (`subject, grade, teksCode, ritBand, status, limit, offset`). `getLibraryContent(sourceTab, filters?)` signature consistent Tasks 2/6/7/8. Mutation names `publishCustomQuestion/Passage`, `archiveCustomQuestion/Passage` defined Task 3, consumed Tasks 7/8 identically. `LibraryContentRow` fields (`content_id, content_type, subject, grade, teks_code, teks_title, rit_band, status, family_id, created_at`) used consistently in Card/tabs and match `src/lib/parent/types.ts`. `LibraryItemCard` prop names (`row, selected, onToggleSelect, badge, actions`) consistent Task 5↔6/7/8. `useLibrarySelection` returns `{selected, toggle, clear, count}` — consumed with those exact names. Route path `library`, nav `/parent/library` consistent Task 9. `?tab=` values `vetted|my_questions|ai_studio` consistent Task 9 ↔ tab components. No mismatches.
