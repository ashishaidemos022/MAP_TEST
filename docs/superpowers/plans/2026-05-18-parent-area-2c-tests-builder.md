# Parent Area 2c — Tests + 4-step Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/parent/tests` (Active/Completed/Templates `?tab=` tabs) + `/parent/tests/builder` (4-section page) + `/parent/tests/definitions/:id`, on three new additive definition-grain/count lib queries, with the 4 interim CTAs rewired to the builder via URL pre-fill — behind `parent_v2`.

**Architecture:** Mirror the shipped 2a `KidDetail` / 2b `Library` `?tab=` pattern. Read tabs use the assignment-grain `getAssignmentOverview`; Templates + definition-detail use new definition-grain queries (a zero-assignment template is invisible to `map_v_assignment_overview`). Builder submit branches on `?from=`: from-template = `assignTestDefinition` only (reuse defId, no bloat); fresh = `createTestDefinition` then `assignTestDefinition`. Legacy `/parent/custom-test` + `CustomBank` untouched (flag-off path).

**Tech Stack:** Vite + React 18 + React Router v6 + TypeScript + Tailwind. No new deps, no React test runner (repo convention: Node DB script + `npm run typecheck && npm run build` + manual QA). Cycle-1 lib `src/lib/parent/{queries,mutations,types}.ts` exists.

**Reference spec:** `docs/superpowers/specs/2026-05-18-parent-area-2c-tests-builder-design.md`. Branch: `feat/parent-area-2c` (checked out, stacked on 2b).

**Glyph-fidelity rule (recurring 2a defect class — non-negotiable):** every apostrophe/quote/ellipsis in user-facing copy MUST be the Unicode glyph — `’` U+2019, `“`/`”` U+201C/U+201D, `…` U+2026 — never ASCII `'` `"` `...`. Type the literal glyphs exactly as shown in code blocks.

**Mount-guard convention (enforced since 2a `f724f1b`, applied throughout 2b — bake in from the start, do NOT omit):** every component that fetches in a `useEffect` and `setState`s after the await uses a `mountedRef` (`const mountedRef = useRef(true)` + a mount effect setting it true/false) and guards every post-await `setState`/callback with `if (mountedRef.current)`. The `useEffect(loadFn, [deps])` idiom (loadFn is the callback, deps the array) is the established pattern.

---

## File Structure

- Modify `src/lib/parent/types.ts` — add `TestDefinitionRow`.
- Modify `src/lib/parent/queries.ts` — add `listTestDefinitions`, `getTestDefinition`, `getCandidateCount` (+ import).
- Create `src/components/parent/tests/KidPicker.tsx` — shared kid multi/single picker.
- Create `src/components/parent/tests/CandidatePreview.tsx` — debounced live candidate count.
- Create `src/components/parent/tests/SourceMixSlider.tsx` — custom-% slider (mixed only).
- Create `src/components/parent/tests/StandardsAutocomplete.tsx` — comma TEKS code multi-entry.
- Create `src/pages/parent/TestBuilder.tsx` — the 4-section builder.
- Create `src/pages/parent/Tests.tsx` — `?tab=` router.
- Create `src/components/parent/tests/ActiveTab.tsx` — assigned/in_progress, grouped by kid, source-mix badge + optimistic revoke.
- Create `src/components/parent/tests/CompletedTab.tsx` — completed, grouped by week.
- Create `src/components/parent/tests/TemplatesTab.tsx` — `listTestDefinitions({templatesOnly})`.
- Create `src/pages/parent/DefinitionDetail.tsx` — `/parent/tests/definitions/:id`.
- Modify `src/pages/parent/ParentRoot.tsx` — 3 routes + 3 imports.
- Modify `src/components/parent/ParentShell.tsx` — Tests nav → `/parent/tests`.
- Modify `src/components/parent/classroom/KidRosterCard.tsx`, `src/components/parent/classroom/ClassroomQuickActions.tsx`, `src/pages/parent/KidDetail.tsx`, `src/components/parent/library/VettedTab.tsx` — rewire CTAs.
- Create `scripts/test-parent-2c-data.mjs` — Node verification.

---

### Task 1: `TestDefinitionRow` type

**Files:** Modify `src/lib/parent/types.ts`

- [ ] **Step 1: Append at end of file** (after `LibraryFilters`):

```ts

export interface TestDefinitionRow {
  id: string;
  family_id: string;
  name: string;
  subject: string;
  grade: number;
  planned_length: number;
  source_mix: 'vetted_only' | 'custom_only' | 'mixed';
  custom_pct: number | null;
  standard_codes: string[];
  is_template: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.
- [ ] **Step 3: Commit**
```bash
git add src/lib/parent/types.ts
git commit -m "feat(parent) TestDefinitionRow type (definition-grain reads)"
```

---

### Task 2: definition-grain + candidate-count queries

**Files:** Modify `src/lib/parent/queries.ts`

- [ ] **Step 1: Change the type import** (line 5–7) from:
```ts
import type {
  ClassroomRosterRow, AssignmentOverviewRow, LibraryContentRow, LibraryFilters,
} from './types';
```
to:
```ts
import type {
  ClassroomRosterRow, AssignmentOverviewRow, LibraryContentRow, LibraryFilters,
  TestDefinitionRow,
} from './types';
```

- [ ] **Step 2: Append these three functions at the end of `src/lib/parent/queries.ts`** (after `getParentV2`):

```ts

export async function listTestDefinitions(
  opts?: { templatesOnly?: boolean },
): Promise<TestDefinitionRow[]> {
  let q = supabase.from('map_test_definitions').select('*');
  if (opts?.templatesOnly) q = q.eq('is_template', true);
  const { data, error } = await q.order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TestDefinitionRow[];
}

export async function getTestDefinition(
  id: string,
): Promise<TestDefinitionRow | null> {
  const { data, error } = await supabase
    .from('map_test_definitions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as TestDefinitionRow | null;
}

export async function getCandidateCount(args: {
  subject: string;
  grade: number;
  standardCodes: string[];
  sourceMix: 'vetted_only' | 'custom_only' | 'mixed';
}): Promise<number> {
  let q = supabase
    .from('map_v_library_content')
    .select('*', { count: 'exact', head: true })
    .eq('subject', args.subject)
    .eq('grade', args.grade);
  if (args.sourceMix === 'vetted_only') {
    q = q.eq('source_tab', 'vetted');
  } else if (args.sourceMix === 'custom_only') {
    q = q.in('source_tab', ['my_questions', 'ai_studio']).eq('status', 'published');
  } else {
    q = q.or('source_tab.eq.vetted,status.eq.published');
  }
  if (args.standardCodes.length > 0) {
    q = q.in('teks_code', args.standardCodes);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 3: Typecheck** — `npm run typecheck` → exit 0. (RLS `map_td_select` already scopes `map_test_definitions` to family + `soft_deleted_at IS NULL`; no client family filter. `maybeSingle()` returns null for a foreign/missing id under RLS — no throw.)
- [ ] **Step 4: Commit**
```bash
git add src/lib/parent/queries.ts
git commit -m "feat(parent) listTestDefinitions / getTestDefinition / getCandidateCount"
```

---

### Task 3: `KidPicker` shared component

**Files:** Create `src/components/parent/tests/KidPicker.tsx`

- [ ] **Step 1: Write the file** (mount-guarded fetch; `mode` single|multi):

```tsx
// src/components/parent/tests/KidPicker.tsx
// Shared kid picker. mode='single' → one selection; mode='multi' → set.
// Fed by getClassroomRoster (RLS-scoped). Mount-guarded per repo convention.
import { useEffect, useRef, useState } from 'react'
import { getClassroomRoster } from '../../../lib/parent/queries'
import type { ClassroomRosterRow } from '../../../lib/parent/types'

export function KidPicker({
  mode,
  selected,
  onChange,
  definitionGrade,
}: {
  mode: 'single' | 'multi'
  selected: Set<string>
  onChange: (next: Set<string>) => void
  definitionGrade?: number
}) {
  const [kids, setKids] = useState<ClassroomRosterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void getClassroomRoster()
      .then((r) => {
        if (mountedRef.current) setKids(r)
      })
      .catch((e) => {
        if (mountedRef.current) setError(e?.message ?? 'Failed to load kids.')
      })
  }, [])

  if (error) return <div className="card p-4 text-sm text-ink/60">{error}</div>
  if (!kids) return <p className="text-sm text-ink/50">Loading…</p>

  const toggle = (id: string) => {
    if (mode === 'single') {
      onChange(new Set([id]))
      return
    }
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {mode === 'multi' && kids.length > 1 && (
        <button
          type="button"
          onClick={() => onChange(new Set(kids.map((k) => k.student_id)))}
          className="btn-ghost text-xs"
        >
          Select all
        </button>
      )}
      {kids.map((k) => {
        const on = selected.has(k.student_id)
        const gap =
          definitionGrade != null && Math.abs(k.grade - definitionGrade) >= 2
        return (
          <button
            key={k.student_id}
            type="button"
            onClick={() => toggle(k.student_id)}
            className={`rounded-2xl px-3 py-2 text-sm ring-1 transition ${
              on
                ? 'bg-white text-ink shadow ring-cloud'
                : 'bg-cream text-ink/60 ring-cloud hover:text-ink'
            }`}
          >
            <span className="font-semibold">{k.display_name}</span>{' '}
            <span className="text-xs text-ink/50">Grade {k.grade}</span>
            {on && gap && (
              <span className="ml-1 rounded-full bg-sun/20 px-2 py-0.5 text-[11px] text-ink/70 ring-1 ring-sun/40">
                grade gap — sure?
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0. (`ClassroomRosterRow` has `student_id`, `display_name`, `grade` — Cycle-1 type. `Loading…` uses U+2026; "grade gap — sure?" uses U+2014 em-dash — type the literal glyphs.)
- [ ] **Step 3: Commit**
```bash
git add src/components/parent/tests/KidPicker.tsx
git commit -m "feat(parent) KidPicker shared single/multi kid selector (grade-gap warn)"
```

---

### Task 4: builder sub-components (CandidatePreview, SourceMixSlider, StandardsAutocomplete)

**Files:** Create `src/components/parent/tests/CandidatePreview.tsx`, `SourceMixSlider.tsx`, `StandardsAutocomplete.tsx`

- [ ] **Step 1: `CandidatePreview.tsx`** (debounced count; mount-guarded):

```tsx
// src/components/parent/tests/CandidatePreview.tsx
// Live "~N candidates" for the builder Step 1. Debounced getCandidateCount.
import { useEffect, useRef, useState } from 'react'
import { getCandidateCount } from '../../../lib/parent/queries'

export function CandidatePreview({
  subject,
  grade,
  standardCodes,
  sourceMix,
  plannedLength,
}: {
  subject: string
  grade: number
  standardCodes: string[]
  sourceMix: 'vetted_only' | 'custom_only' | 'mixed'
  plannedLength: number
}) {
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setCount(null)
    setError(null)
    const t = setTimeout(() => {
      void getCandidateCount({ subject, grade, standardCodes, sourceMix })
        .then((c) => {
          if (mountedRef.current) setCount(c)
        })
        .catch((e) => {
          if (mountedRef.current) setError(e?.message ?? 'Count failed.')
        })
    }, 350)
    return () => clearTimeout(t)
  }, [subject, grade, standardCodes.join(','), sourceMix])

  if (error) return <p className="text-xs text-ink/50">{error}</p>
  if (count == null) return <p className="text-xs text-ink/40">Counting…</p>
  const tight = count < plannedLength * 1.5
  return (
    <p className={`text-xs ${tight ? 'text-ink/80' : 'text-ink/50'}`}>
      ~{count} candidate{count === 1 ? '' : 's'} match these filters
      {tight && (
        <span className="ml-2 rounded-full bg-sun/20 px-2 py-0.5 text-[11px] text-ink/70 ring-1 ring-sun/40">
          Tight question pool — consider widening
        </span>
      )}
    </p>
  )
}
```

- [ ] **Step 2: `SourceMixSlider.tsx`**:

```tsx
// src/components/parent/tests/SourceMixSlider.tsx
// Custom-% slider, shown only when source_mix === 'mixed'.
export function SourceMixSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <label className="mt-2 block text-sm">
      <span className="text-ink/70">Custom %: {value}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  )
}
```

- [ ] **Step 3: `StandardsAutocomplete.tsx`** (lightweight comma-entry — no network; TEKS codes are free text per the brief's "autocomplete" simplified to chip entry for 2c, documented):

```tsx
// src/components/parent/tests/StandardsAutocomplete.tsx
// Comma/Enter-entered TEKS code chips. Empty = "any standard". (Brief's
// "autocomplete" is simplified to validated chip-entry for 2c — no standards
// catalog endpoint exists; documented in spec §11.)
import { useState } from 'react'

export function StandardsAutocomplete({
  codes,
  onChange,
}: {
  codes: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim().toUpperCase()
    if (v && !codes.includes(v)) onChange([...codes, v])
    setDraft('')
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {codes.map((c) => (
          <span
            key={c}
            className="rounded-full bg-cream px-2 py-0.5 text-xs ring-1 ring-cloud"
          >
            {c}{' '}
            <button
              type="button"
              onClick={() => onChange(codes.filter((x) => x !== c))}
              className="text-ink/40 hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
        placeholder="TEKS code, Enter to add (empty = any)"
        className="mt-1 w-full rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
      />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck** — `npm run typecheck` → exit 0. (`Counting…` / `Tight question pool — consider widening` use U+2026 and U+2014; the `×` remove glyph is U+00D7 MULTIPLICATION SIGN — type the literals.)
- [ ] **Step 5: Commit**
```bash
git add src/components/parent/tests/CandidatePreview.tsx src/components/parent/tests/SourceMixSlider.tsx src/components/parent/tests/StandardsAutocomplete.tsx
git commit -m "feat(parent) builder sub-components: CandidatePreview, SourceMixSlider, StandardsAutocomplete"
```

---

### Task 5: `TestBuilder` page (4 sections + from-template submit)

**Files:** Create `src/pages/parent/TestBuilder.tsx`

- [ ] **Step 1: Write the file**

```tsx
// src/pages/parent/TestBuilder.tsx
// 4-section builder (one scrollable page, not a wizard). Pre-fill via URL
// params. From-template (?from=) = assign-only against the existing defId
// (Step 1 read-only); fresh = createTestDefinition then assignTestDefinition.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getTestDefinition } from '../../lib/parent/queries'
import { assignTestDefinition, createTestDefinition } from '../../lib/parent/mutations'
import type { CreateDefinitionInput, TestDefinitionRow } from '../../lib/parent/types'
import { KidPicker } from '../../components/parent/tests/KidPicker'
import { CandidatePreview } from '../../components/parent/tests/CandidatePreview'
import { SourceMixSlider } from '../../components/parent/tests/SourceMixSlider'
import { StandardsAutocomplete } from '../../components/parent/tests/StandardsAutocomplete'

type SourceMix = 'vetted_only' | 'custom_only' | 'mixed'

export default function TestBuilder() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const fromId = params.get('from')
  const preKid = params.get('kid')
  const preSubject = params.get('subject')
  const preGrade = params.get('grade')
  const preStandards = params.get('standards')

  const [template, setTemplate] = useState<TestDefinitionRow | null>(null)
  const [templateLoadErr, setTemplateLoadErr] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState(preSubject ?? 'math')
  const [grade, setGrade] = useState(preGrade ? Number(preGrade) : 3)
  const [sourceMix, setSourceMix] = useState<SourceMix>('vetted_only')
  const [customPct, setCustomPct] = useState(30)
  const [standards, setStandards] = useState<string[]>(
    preStandards ? preStandards.split(',').map((s) => s.trim()).filter(Boolean) : [],
  )
  const [length, setLength] = useState(25)
  const [kids, setKids] = useState<Set<string>>(
    new Set(preKid ? [preKid] : []),
  )
  const [dueBy, setDueBy] = useState('')
  const [note, setNote] = useState('')
  const [saveTemplate, setSaveTemplate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fromId) return
    setTemplate(null)
    setTemplateLoadErr(null)
    void getTestDefinition(fromId)
      .then((d) => {
        if (!mountedRef.current) return
        if (!d) {
          setTemplateLoadErr('That template was not found in your tests.')
          return
        }
        setTemplate(d)
        setName(d.name)
        setSubject(d.subject)
        setGrade(d.grade)
        setSourceMix(d.source_mix)
        setCustomPct(d.custom_pct ?? 30)
        setStandards(d.standard_codes ?? [])
        setLength(d.planned_length)
      })
      .catch((e) => {
        if (mountedRef.current) setTemplateLoadErr(e?.message ?? 'Load failed.')
      })
  }, [fromId])

  const fromTemplate = Boolean(fromId)
  const step1Locked = fromTemplate && !!template

  const canAssign = useMemo(
    () => kids.size > 0 && (!fromTemplate || !!template) && !busy,
    [kids, fromTemplate, template, busy],
  )

  const submit = async (mode: 'assign' | 'draft') => {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'draft') {
        const input: CreateDefinitionInput = {
          name: name || 'Untitled test',
          subject,
          grade,
          planned_length: length,
          source_mix: sourceMix,
          custom_pct: sourceMix === 'mixed' ? customPct : null,
          difficulty_mix: null,
          standard_codes: standards,
          custom_question_ids: [],
          custom_passage_ids: [],
          is_template: true,
        }
        await createTestDefinition(input)
        if (mountedRef.current) navigate('/parent/tests?tab=templates')
        return
      }
      let defId: string
      if (fromTemplate && template) {
        defId = template.id
      } else {
        const input: CreateDefinitionInput = {
          name: name || 'Untitled test',
          subject,
          grade,
          planned_length: length,
          source_mix: sourceMix,
          custom_pct: sourceMix === 'mixed' ? customPct : null,
          difficulty_mix: null,
          standard_codes: standards,
          custom_question_ids: [],
          custom_passage_ids: [],
          is_template: saveTemplate,
        }
        // NOTE: map_create_test_definition is not idempotent (plain INSERT, no
        // idempotency key). The busy-guard prevents UI double-submit; a network
        // failure AFTER server commit but before response could orphan a
        // definition on manual retry. A client idempotency key is a Cycle-1 RPC
        // concern (out of 2c's no-schema scope) — documented carry-over risk.
        defId = await createTestDefinition(input)
      }
      await assignTestDefinition(
        defId,
        [...kids],
        dueBy ? new Date(dueBy + 'T23:59:59').toISOString() : null,
        note || null,
      )
      if (mountedRef.current) navigate('/parent/tests?tab=active')
    } catch (e) {
      if (mountedRef.current) setError((e as Error)?.message ?? 'Failed.')
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">
          Parent view
        </p>
        <h1 className="font-display text-4xl">
          {fromTemplate ? 'Assign a template' : 'Build a test'}
        </h1>
        {templateLoadErr && (
          <div className="mt-2 text-sm text-ink/60">
            <p>{templateLoadErr}</p>
            <button
              type="button"
              onClick={() => navigate('/parent/tests')}
              className="btn-ghost mt-2 text-xs"
            >
              Back to tests
            </button>
          </div>
        )}
      </header>

      <section className="card mb-5 p-5">
        <h2 className="font-display text-2xl">1 · Content</h2>
        {step1Locked && (
          <p className="mt-1 text-xs text-ink/50">
            Reusing the template’s content — assigning it as-is.
          </p>
        )}
        <fieldset disabled={step1Locked} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-ink/70">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fraction review week"
              className="mt-1 w-full rounded-full bg-cream px-3 py-1.5 text-sm ring-1 ring-cloud"
            />
          </label>
          <div className="flex gap-2 text-sm">
            {(['math', 'reading', 'language'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubject(s)}
                className={`rounded-full px-3 py-1 capitalize ring-1 ring-cloud ${
                  subject === s ? 'bg-white shadow' : 'bg-cream text-ink/60'
                }`}
              >
                {s}
              </button>
            ))}
            <label className="ml-2 inline-flex items-center gap-1 text-ink/70">
              Grade
              <input
                type="number"
                min={1}
                max={12}
                value={grade}
                onChange={(e) => setGrade(Number(e.target.value))}
                className="w-16 rounded-full bg-cream px-2 py-1 ring-1 ring-cloud"
              />
            </label>
          </div>
          <div className="flex gap-2 text-sm">
            {(['vetted_only', 'custom_only', 'mixed'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSourceMix(m)}
                className={`rounded-full px-3 py-1 ring-1 ring-cloud ${
                  sourceMix === m ? 'bg-white shadow' : 'bg-cream text-ink/60'
                }`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
          {sourceMix === 'mixed' && (
            <SourceMixSlider value={customPct} onChange={setCustomPct} />
          )}
          <div>
            <span className="text-sm text-ink/70">Standards (empty = any)</span>
            <StandardsAutocomplete codes={standards} onChange={setStandards} />
          </div>
          <label className="block text-sm">
            <span className="text-ink/70">Length: {length}</span>
            <input
              type="range"
              min={5}
              max={50}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        </fieldset>
        <div className="mt-3">
          <CandidatePreview
            subject={subject}
            grade={grade}
            standardCodes={standards}
            sourceMix={sourceMix}
            plannedLength={length}
          />
        </div>
      </section>

      <section className="card mb-5 p-5">
        <h2 className="font-display text-2xl">2 · Kids</h2>
        <div className="mt-3">
          <KidPicker
            mode="multi"
            selected={kids}
            onChange={setKids}
            definitionGrade={grade}
          />
        </div>
      </section>

      <section className="card mb-5 p-5">
        <h2 className="font-display text-2xl">3 · Schedule (optional)</h2>
        <div className="mt-3 space-y-3 text-sm">
          <label className="block">
            <span className="text-ink/70">Due by</span>
            <input
              type="date"
              value={dueBy}
              onChange={(e) => setDueBy(e.target.value)}
              className="mt-1 block rounded-full bg-cream px-3 py-1.5 ring-1 ring-cloud"
            />
          </label>
          <label className="block">
            <span className="text-ink/70">Note to the kid (optional)</span>
            <input
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Try this after dinner"
              className="mt-1 w-full rounded-full bg-cream px-3 py-1.5 ring-1 ring-cloud"
            />
          </label>
        </div>
      </section>

      <section className="card mb-5 p-5">
        <h2 className="font-display text-2xl">4 · Review &amp; assign</h2>
        <p className="mt-2 text-sm text-ink/70">
          {subject} test, {length} questions,{' '}
          {sourceMix.replace('_', ' ')}
          {sourceMix === 'mixed' ? ` (${customPct}% custom)` : ''}
          {standards.length ? `, standards ${standards.join(', ')}` : ''}, to{' '}
          {kids.size} kid{kids.size === 1 ? '' : 's'}.
        </p>
        {!fromTemplate && (
          <label className="mt-3 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveTemplate}
              onChange={(e) => setSaveTemplate(e.target.checked)}
            />
            Save as template
          </label>
        )}
        {error && <p className="mt-3 text-sm text-ink/60">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={!canAssign}
            onClick={() => submit('assign')}
            className="btn-secondary text-sm disabled:opacity-40"
          >
            {busy ? '…' : 'Assign now'}
          </button>
          {!fromTemplate && (
            <button
              type="button"
              disabled={busy}
              onClick={() => submit('draft')}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              Save as draft
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0. Imports resolve: `getTestDefinition` (Task 2), `assignTestDefinition`/`createTestDefinition` (Cycle-1 mutations), `CreateDefinitionInput`/`TestDefinitionRow` (types Task 1 + Cycle-1), the 4 Task 3/4 components. `CreateDefinitionInput` requires `custom_question_ids`/`custom_passage_ids` — passed `[]` (spec §8/§11: raw per-question composition is deferred; builder seeds Step 1 from `?subject=`/`?standards=` only). Glyphs: `…` U+2026 (busy), `’` U+2019 in "template’s content", `&amp;` is fine HTML-entity in JSX text — keep as written.
- [ ] **Step 3: Commit**
```bash
git add src/pages/parent/TestBuilder.tsx
git commit -m "feat(parent) TestBuilder: 4-section page, from-template assign-only vs fresh create+assign"
```

---

### Task 6: `Tests` tab router + `ActiveTab` (source-mix badge + optimistic revoke)

**Files:** Create `src/pages/parent/Tests.tsx`, `src/components/parent/tests/ActiveTab.tsx`

- [ ] **Step 1: `ActiveTab.tsx`**

```tsx
// src/components/parent/tests/ActiveTab.tsx
// assigned + in_progress, grouped by kid. Source-mix badge + optimistic
// revoke (the two items deferred from 2a).
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAssignmentOverview } from '../../../lib/parent/queries'
import { revokeAssignment } from '../../../lib/parent/mutations'
import type { AssignmentOverviewRow } from '../../../lib/parent/types'

const MIX_LABEL: Record<string, string> = {
  vetted_only: 'Vetted',
  custom_only: 'My questions',
  mixed: 'Mixed',
}

export function ActiveTab() {
  const [rows, setRows] = useState<AssignmentOverviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = () => {
    void getAssignmentOverview(['assigned', 'in_progress'])
      .then((r) => {
        if (mountedRef.current) setRows(r)
      })
      .catch((e) => {
        if (mountedRef.current) setError(e?.message ?? 'Failed to load.')
      })
  }
  useEffect(load, [])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!rows) return <p className="mt-8 text-center font-display text-xl">Loading…</p>
  if (rows.length === 0)
    return (
      <p className="card p-6 text-center text-sm text-ink/60">
        No active assignments.
      </p>
    )

  const byKid = new Map<string, AssignmentOverviewRow[]>()
  for (const r of rows) {
    const k = `${r.student_name} · Grade ${r.student_grade}`
    if (!byKid.has(k)) byKid.set(k, [])
    byKid.get(k)!.push(r)
  }

  const onRevoke = async (id: string) => {
    const prev = rows
    setRows((r) => (r ?? []).filter((row) => row.assignment_id !== id)) // optimistic
    try {
      await revokeAssignment(id)
      load()
    } catch (e) {
      if (mountedRef.current) {
        setRows(prev)
        setError((e as Error)?.message ?? 'Revoke failed.')
      }
    }
  }

  return (
    <div className="space-y-6">
      {[...byKid.entries()].map(([kid, items]) => (
        <section key={kid} className="card p-5">
          <h2 className="font-display text-xl">{kid}</h2>
          <ul className="mt-3 divide-y divide-cloud/70">
            {items.map((r) => (
              <li
                key={r.assignment_id}
                className="flex items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="font-semibold">{r.definition_name}</p>
                  <p className="text-xs text-ink/60">
                    <span className="capitalize">{r.subject}</span> ·{' '}
                    <span className="rounded-full bg-cream px-2 py-0.5 ring-1 ring-cloud">
                      {MIX_LABEL[r.source_mix] ?? r.source_mix}
                    </span>{' '}
                    · {r.status}
                    {r.due_by
                      ? ` · due ${new Date(r.due_by).toLocaleDateString()}`
                      : ''}
                  </p>
                  {r.parent_note && (
                    <p className="mt-1 text-xs text-ink/50">“{r.parent_note}”</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    to={`/parent/tests/definitions/${r.definition_id}`}
                    className="btn-ghost text-xs"
                  >
                    View definition
                  </Link>
                  {r.status === 'assigned' && (
                    <button
                      type="button"
                      onClick={() => onRevoke(r.assignment_id)}
                      className="btn-ghost text-xs"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: `Tests.tsx`** (tab router, mirrors `Library.tsx`; neutral pills):

```tsx
// src/pages/parent/Tests.tsx
// Tests tab router. ?tab= ∈ active|completed|templates, default active,
// unknown → active. Mirrors Library.tsx / KidDetail.tsx.
import { useSearchParams } from 'react-router-dom'
import { ActiveTab } from '../../components/parent/tests/ActiveTab'
import { CompletedTab } from '../../components/parent/tests/CompletedTab'
import { TemplatesTab } from '../../components/parent/tests/TemplatesTab'

const TABS = ['active', 'completed', 'templates'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = {
  active: 'Active',
  completed: 'Completed',
  templates: 'Templates',
}

export default function Tests() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '')
    ? (raw as Tab)
    : 'active'
  return (
    <div>
      <header className="mb-5">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">
          Parent view
        </p>
        <h1 className="font-display text-4xl">Tests</h1>
        <nav className="mt-4 flex gap-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setParams({ tab: t }, { replace: false })}
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                tab === t
                  ? 'bg-white text-ink shadow ring-1 ring-cloud'
                  : 'text-ink/60 hover:text-ink'
              }`}
            >
              {LABEL[t]}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'active' && <ActiveTab />}
      {tab === 'completed' && <CompletedTab />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck** — `npm run typecheck` → expected FAIL on missing `./CompletedTab`/`./TemplatesTab` imports (created in Tasks 7–8). This task's commit is allowed to precede them ONLY if you instead temporarily stub — DO NOT stub. Instead: implement Tasks 7 and 8 BEFORE typechecking/committing Task 6. Reorder locally: write `ActiveTab.tsx` + `Tests.tsx` (this task), then `CompletedTab.tsx` (Task 7), then `TemplatesTab.tsx` (Task 8), then run `npm run typecheck` once (exit 0), then make the three commits in Task 6/7/8 order. (Tasks 7 and 8 contain the exact file contents.)
- [ ] **Step 4: Commit (after Tasks 7 & 8 files exist and typecheck is 0)**
```bash
git add src/pages/parent/Tests.tsx src/components/parent/tests/ActiveTab.tsx
git commit -m "feat(parent) Tests tab router + ActiveTab (source-mix badge, optimistic revoke)"
```

---

### Task 7: `CompletedTab`

**Files:** Create `src/components/parent/tests/CompletedTab.tsx`

- [ ] **Step 1: Write the file**

```tsx
// src/components/parent/tests/CompletedTab.tsx
// Completed assignments, grouped by ISO week (Mon-anchored).
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAssignmentOverview } from '../../../lib/parent/queries'
import type { AssignmentOverviewRow } from '../../../lib/parent/types'

const MIX_LABEL: Record<string, string> = {
  vetted_only: 'Vetted',
  custom_only: 'My questions',
  mixed: 'Mixed',
}

function weekKey(iso: string): string {
  const d = new Date(iso)
  const day = (d.getDay() + 6) % 7 // Mon=0
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function CompletedTab() {
  const [rows, setRows] = useState<AssignmentOverviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  useEffect(() => {
    void getAssignmentOverview(['completed'])
      .then((r) => {
        if (mountedRef.current) setRows(r)
      })
      .catch((e) => {
        if (mountedRef.current) setError(e?.message ?? 'Failed to load.')
      })
  }, [])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!rows) return <p className="mt-8 text-center font-display text-xl">Loading…</p>
  if (rows.length === 0)
    return (
      <p className="card p-6 text-center text-sm text-ink/60">
        No completed assignments yet.
      </p>
    )

  const byWeek = new Map<string, AssignmentOverviewRow[]>()
  for (const r of rows) {
    const k = r.completed_at ? weekKey(r.completed_at) : 'Earlier'
    if (!byWeek.has(k)) byWeek.set(k, [])
    byWeek.get(k)!.push(r)
  }

  return (
    <div className="space-y-6">
      {[...byWeek.entries()].map(([wk, items]) => (
        <section key={wk} className="card p-5">
          <h2 className="font-display text-xl">Week of {wk}</h2>
          <ul className="mt-3 divide-y divide-cloud/70">
            {items.map((r) => (
              <li
                key={r.assignment_id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div>
                  <p className="font-semibold">
                    {r.student_name}{' '}
                    <span className="text-xs text-ink/50">
                      Grade {r.student_grade}
                    </span>
                  </p>
                  <p className="text-xs text-ink/60">
                    {r.definition_name} ·{' '}
                    <span className="rounded-full bg-cream px-2 py-0.5 ring-1 ring-cloud">
                      {MIX_LABEL[r.source_mix] ?? r.source_mix}
                    </span>
                    {r.score != null ? ` · ${r.score}%` : ''}
                    {r.estimated_rit != null ? ` · RIT ${r.estimated_rit}` : ''}
                  </p>
                </div>
                <Link
                  to={`/parent/tests/definitions/${r.definition_id}`}
                  className="btn-ghost text-xs"
                >
                  Details
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — run as part of Task 6 Step 3 (combined; expect exit 0 once Task 8 also exists).
- [ ] **Step 3: Commit**
```bash
git add src/components/parent/tests/CompletedTab.tsx
git commit -m "feat(parent) Tests CompletedTab (grouped by week, source-mix badge)"
```

---

### Task 8: `TemplatesTab`

**Files:** Create `src/components/parent/tests/TemplatesTab.tsx`

- [ ] **Step 1: Write the file**

```tsx
// src/components/parent/tests/TemplatesTab.tsx
// Definition-grain: listTestDefinitions({templatesOnly}). A zero-assignment
// template is visible here (invisible to the assignment-grain overview).
// Completed-count = client aggregate over getAssignmentOverview by definition.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAssignmentOverview, listTestDefinitions } from '../../../lib/parent/queries'
import type { AssignmentOverviewRow, TestDefinitionRow } from '../../../lib/parent/types'

export function TemplatesTab() {
  const [defs, setDefs] = useState<TestDefinitionRow[] | null>(null)
  const [assigns, setAssigns] = useState<AssignmentOverviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  useEffect(() => {
    void Promise.all([
      listTestDefinitions({ templatesOnly: true }),
      getAssignmentOverview(),
    ])
      .then(([d, a]) => {
        if (!mountedRef.current) return
        setDefs(d)
        setAssigns(a)
      })
      .catch((e) => {
        if (mountedRef.current) setError(e?.message ?? 'Failed to load.')
      })
  }, [])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!defs) return <p className="mt-8 text-center font-display text-xl">Loading…</p>
  if (defs.length === 0)
    return (
      <p className="card p-6 text-center text-sm text-ink/60">
        No templates yet. Build a test and toggle “Save as template”.
      </p>
    )

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {defs.map((d) => {
        const forDef = assigns.filter((a) => a.definition_id === d.id)
        const done = forDef.filter((a) => a.status === 'completed').length
        return (
          <div key={d.id} className="card p-5">
            <p className="font-display text-xl">{d.name}</p>
            <p className="mt-1 text-xs text-ink/60">
              <span className="capitalize">{d.subject}</span> · Grade {d.grade} ·{' '}
              {d.planned_length} q · {d.source_mix.replace('_', ' ')} ·{' '}
              {d.standard_codes.length} standard
              {d.standard_codes.length === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-[11px] text-ink/40">
              {done} of {forDef.length} assignment
              {forDef.length === 1 ? '' : 's'} completed
            </p>
            <div className="mt-3 flex gap-2">
              <Link
                to={`/parent/tests/builder?from=${d.id}`}
                className="btn-secondary text-xs"
              >
                Assign to kids
              </Link>
              <Link
                to={`/parent/tests/definitions/${d.id}`}
                className="btn-ghost text-xs"
              >
                View
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — now run `npm run typecheck` (Tasks 6+7+8 files all exist) → exit 0.
- [ ] **Step 3: Commit**
```bash
git add src/components/parent/tests/TemplatesTab.tsx
git commit -m "feat(parent) Tests TemplatesTab (definition-grain; zero-assignment templates visible)"
```

---

### Task 9: `DefinitionDetail` page

**Files:** Create `src/pages/parent/DefinitionDetail.tsx`

- [ ] **Step 1: Write the file**

```tsx
// src/pages/parent/DefinitionDetail.tsx
// /parent/tests/definitions/:id — the definition (even with 0 assignments)
// + its per-kid assignments. Foreign/unknown id → not-found (RLS → null).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAssignmentOverview, getTestDefinition } from '../../lib/parent/queries'
import type { AssignmentOverviewRow, TestDefinitionRow } from '../../lib/parent/types'

export default function DefinitionDetail() {
  const { id = '' } = useParams()
  const [def, setDef] = useState<TestDefinitionRow | null>(null)
  const [assigns, setAssigns] = useState<AssignmentOverviewRow[]>([])
  const [resolved, setResolved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  useEffect(() => {
    void Promise.all([getTestDefinition(id), getAssignmentOverview()])
      .then(([d, a]) => {
        if (!mountedRef.current) return
        setDef(d)
        setAssigns(a.filter((x) => x.definition_id === id))
        setResolved(true)
      })
      .catch((e) => {
        if (mountedRef.current) {
          setError(e?.message ?? 'Failed to load.')
          setResolved(true)
        }
      })
  }, [id])

  const mine = useMemo(() => assigns, [assigns])

  if (error) return <div className="card p-6 text-sm text-ink/60">{error}</div>
  if (!resolved)
    return <p className="mt-12 text-center font-display text-2xl">Loading…</p>
  if (!def)
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl">Not found in your tests.</p>
        <Link to="/parent/tests" className="btn-secondary mt-4 inline-block text-sm">
          Back to tests
        </Link>
      </div>
    )

  return (
    <div>
      <header className="mb-5">
        <p className="text-xs text-ink/50">
          <Link to="/parent/tests" className="hover:underline">
            Tests
          </Link>{' '}
          · {def.name}
        </p>
        <h1 className="mt-1 font-display text-3xl">
          {def.name}{' '}
          {def.is_template && (
            <span className="rounded-full bg-cream px-2 py-0.5 text-xs ring-1 ring-cloud">
              template
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          <span className="capitalize">{def.subject}</span> · Grade {def.grade} ·{' '}
          {def.planned_length} questions · {def.source_mix.replace('_', ' ')}
        </p>
        <Link
          to={`/parent/tests/builder?from=${def.id}`}
          className="btn-secondary mt-3 inline-block text-sm"
        >
          Assign to kids
        </Link>
      </header>

      <section className="card p-5">
        <h2 className="font-display text-xl">Assignments</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">
            Not assigned to anyone yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-cloud/70">
            {mine.map((a) => (
              <li
                key={a.assignment_id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <p className="font-semibold">
                  {a.student_name}{' '}
                  <span className="text-xs text-ink/50">
                    Grade {a.student_grade}
                  </span>
                </p>
                <p className="text-xs text-ink/60">
                  {a.status}
                  {a.status === 'completed' && a.score != null
                    ? ` · ${a.score}%`
                    : ''}
                  {a.status === 'completed' && a.estimated_rit != null
                    ? ` · RIT ${a.estimated_rit}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → exit 0.
- [ ] **Step 3: Commit**
```bash
git add src/pages/parent/DefinitionDetail.tsx
git commit -m "feat(parent) DefinitionDetail page (def + per-kid assignments, RLS not-found)"
```

---

### Task 10: route wiring (ParentRoot + ParentShell)

**Files:** Modify `src/pages/parent/ParentRoot.tsx`, `src/components/parent/ParentShell.tsx`

- [ ] **Step 1: `ParentRoot.tsx` imports** — add after `import Library from './Library'` (line 12):
```tsx
import Tests from './Tests'
import TestBuilder from './TestBuilder'
import DefinitionDetail from './DefinitionDetail'
```
- [ ] **Step 2: `ParentRoot.tsx` routes** — inside `<Route element={<ParentShell />}>`, add immediately after the `library` route line (currently line 65):
```tsx
        <Route path="tests" element={<Tests />} />
        <Route path="tests/builder" element={<TestBuilder />} />
        <Route path="tests/definitions/:id" element={<DefinitionDetail />} />
```
Block becomes (index, kids/:id, library, tests, tests/builder, tests/definitions/:id, dashboard, *). Change nothing else.
- [ ] **Step 3: `ParentShell.tsx` navItems** — change ONLY the Tests entry:
```tsx
  { to: '/parent/custom-test', label: 'Tests' },
```
to:
```tsx
  { to: '/parent/tests', label: 'Tests' },
```
Leave Classroom/Library/History entries unchanged.
- [ ] **Step 4: Typecheck + build** — `npm run typecheck && npm run build` → both exit 0. `grep -n 'path="/parent/custom-test"' src/App.tsx` → still present (legacy route untouched). `grep -rn "custom-test" src/components/parent/ParentShell.tsx` → no match.
- [ ] **Step 5: Commit**
```bash
git add src/pages/parent/ParentRoot.tsx src/components/parent/ParentShell.tsx
git commit -m "feat(parent) wire /parent/tests* routes + ParentShell Tests nav swap"
```

---

### Task 11: rewire the interim CTAs to the builder

**Files:** Modify `src/components/parent/classroom/KidRosterCard.tsx`, `src/components/parent/classroom/ClassroomQuickActions.tsx`, `src/pages/parent/KidDetail.tsx`, `src/components/parent/library/VettedTab.tsx`

- [ ] **Step 1: `KidRosterCard.tsx`** — change the per-kid `+` button onClick (currently `onClick={() => navigate('/parent/custom-test')}`) to:
```tsx
          onClick={() => navigate(`/parent/tests/builder?kid=${row.student_id}`)}
```
- [ ] **Step 2: `ClassroomQuickActions.tsx`** — change the two `<Link>`s:
  - `to="/parent/custom-test"` → `to="/parent/tests/builder"`
  - `to="/parent/custom-bank"` → `to="/parent/library"` (2b shipped Library; keep nav consistent)
- [ ] **Step 3: `KidDetail.tsx`** — the header "Assign a test" button (currently `onClick={() => navigate('/parent/custom-test')}`) → :
```tsx
              onClick={() => navigate(`/parent/tests/builder?kid=${id}`)}
```
(`id` is the `:id` route param already in scope in `KidDetail`.)
- [ ] **Step 4: `VettedTab.tsx`** — add `seedQuery` helper (just before `return (`; after the `rows` null guard) that derives `?subject=` (only when exactly one distinct subject) and `?standards=<distinct teks_codes csv>` from a `LibraryContentRow[]` slice. Wire both CTAs to use it — no `?content=` parameter:
  - `seedQuery` helper:
```tsx
  const seedQuery = (selRows: LibraryContentRow[]): string => {
    const subjects = [...new Set(selRows.map((s) => s.subject).filter(Boolean))]
    const teks = [...new Set(
      selRows.map((s) => s.teks_code).filter((t): t is string => !!t),
    )]
    const qp = new URLSearchParams()
    if (subjects.length === 1) qp.set('subject', subjects[0])
    if (teks.length > 0) qp.set('standards', teks.join(','))
    const qs = qp.toString()
    return qs ? `?${qs}` : ''
  }
```
  - bulk button onClick (replaces `?content=` ≤25 logic entirely):
```tsx
            onClick={() => {
              const selRows = rows.filter((r) => sel.selected.has(r.content_id))
              navigate(`/parent/tests/builder${seedQuery(selRows)}`)
            }}
```
  - per-item button onClick:
```tsx
                  onClick={() =>
                    navigate(`/parent/tests/builder${seedQuery([r])}`)
                  }
```
  (`r` is the mapped `LibraryContentRow` in scope; `rows`/`sel`/`navigate` already in scope; `rows` is non-null at this render point due to the early null guard above.)
- [ ] **Step 5: Typecheck + build** — `npm run typecheck && npm run build` → both exit 0. `grep -rn "custom-test" src/components/parent/classroom src/pages/parent/KidDetail.tsx src/components/parent/library/VettedTab.tsx` → NO matches (all rewired). `grep -n 'path="/parent/custom-test"' src/App.tsx` → still present (legacy route intact, just unreferenced by new shell).
- [ ] **Step 6: Commit**
```bash
git add src/components/parent/classroom/KidRosterCard.tsx src/components/parent/classroom/ClassroomQuickActions.tsx src/pages/parent/KidDetail.tsx src/components/parent/library/VettedTab.tsx
git commit -m "feat(parent) rewire interim Assign/Add-to-test CTAs → /parent/tests/builder with pre-fill"
```

---

### Task 12: verification — data script + build + manual QA

**Files:** Create `scripts/test-parent-2c-data.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/test-parent-2c-data.mjs
// 2c data guard: definition-grain queries, zero-assignment-template
// visibility gap, from-template = assign-only (no new definition), candidate
// count narrows, cross-family isolation. Reuses the Cycle-1 harness.
// Run: node --env-file=.env.local scripts/test-parent-2c-data.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  // Create a TEMPLATE definition (zero assignments).
  const { data: tplId, error: ce } = await ca.rpc('map_create_test_definition', {
    p_name: '2c template', p_subject: 'math', p_grade: 3, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: true,
  });
  assert(!ce && typeof tplId === 'string', 'create template definition');

  // listTestDefinitions({templatesOnly}) sees it; assignment-overview does NOT.
  const { data: defs, error: de } = await ca
    .from('map_test_definitions').select('*').eq('is_template', true);
  assert(!de && defs.some((d) => d.id === tplId), 'listTestDefinitions(templatesOnly) returns the 0-assignment template');
  const { data: ov0 } = await ca.from('map_v_assignment_overview').select('definition_id');
  assert(!(ov0 ?? []).some((r) => r.definition_id === tplId),
    'zero-assignment template is INVISIBLE to assignment-overview (the gap)');

  // getTestDefinition RLS: family B cannot fetch A's definition.
  const cb = await signInClient(ctx.B.email, ctx.B.password);
  const { data: bDef } = await cb.from('map_test_definitions').select('*').eq('id', tplId).maybeSingle();
  assert(bDef == null, 'getTestDefinition: family B cannot read family A definition (RLS)');
  const { data: bList } = await cb.from('map_test_definitions').select('id');
  assert(!(bList ?? []).some((d) => d.id === tplId), 'listTestDefinitions: B excludes A definitions');

  // From-template = assign-only: definition count unchanged, assignment added.
  const { count: before } = await admin
    .from('map_test_definitions').select('*', { count: 'exact', head: true })
    .eq('family_id', ctx.A.familyId);
  const { data: aIds, error: ae } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: tplId, p_student_ids: [ctx.A.kids[0].id], p_due_by: null, p_parent_note: null,
  });
  assert(!ae && Array.isArray(aIds) && aIds.length === 1, 'from-template assign creates 1 assignment');
  const { count: after } = await admin
    .from('map_test_definitions').select('*', { count: 'exact', head: true })
    .eq('family_id', ctx.A.familyId);
  assert(before === after, 'from-template path created NO new definition row (reuse, no bloat)');

  // Fresh path: create+assign → definition count +1.
  const { data: freshId } = await ca.rpc('map_create_test_definition', {
    p_name: '2c fresh', p_subject: 'math', p_grade: 3, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  await ca.rpc('map_assign_test_definition', {
    p_definition_id: freshId, p_student_ids: [ctx.A.kids[1].id], p_due_by: null, p_parent_note: null,
  });
  const { count: after2 } = await admin
    .from('map_test_definitions').select('*', { count: 'exact', head: true })
    .eq('family_id', ctx.A.familyId);
  assert(after2 === after + 1, 'fresh path created exactly one new definition');

  // getCandidateCount narrows server-side: a bogus standard yields fewer than no filter.
  const vettedAll = await ca.from('map_v_library_content')
    .select('*', { count: 'exact', head: true })
    .eq('source_tab', 'vetted').eq('subject', 'math').eq('grade', 3);
  const vettedBogus = await ca.from('map_v_library_content')
    .select('*', { count: 'exact', head: true })
    .eq('source_tab', 'vetted').eq('subject', 'math').eq('grade', 3)
    .in('teks_code', ['ZZ.9Z']);
  assert((vettedBogus.count ?? 0) <= (vettedAll.count ?? 0) && (vettedBogus.count ?? 0) === 0,
    'getCandidateCount standardCodes filter narrows server-side (bogus → 0)');

  console.log('\n2c data checks complete.');
} finally {
  await teardown(ctx);
}
```

- [ ] **Step 2: Run** — `node --env-file=.env.local scripts/test-parent-2c-data.mjs ; echo "exit=$?"` → every `PASS:`, ends `2c data checks complete.`, `exit=0`. Cycle-1 migration already live. If a column/RPC mismatch, report BLOCKED with the exact error (do NOT hand-wave). Harness exports `admin, setup, signInClient, teardown, assert`.
- [ ] **Step 3: Build** — `npm run typecheck && npm run build ; echo "exit=$?"` → both 0. Paste vite summary.
- [ ] **Step 4: Manual-QA (static analysis)** — report PASS/CONCERN with file:concept evidence:
  1. Flag-off untouched: `ParentRoot` `!v2→<Parent/>`; `git log <2c-base>..HEAD -- src/pages/parent/CustomBank.tsx` empty (2c base = `git merge-base HEAD feat/parent-area-2b`); `App.tsx` `path="/parent/custom-test"` still present.
  2. `/parent/tests` 3 tabs; `?tab=` default `active`, unknown→`active`; copy `?tab=templates` deep-links.
  3. ActiveTab: source-mix badge (`MIX_LABEL`), optimistic revoke (filters row out, restores `prev` on error), grouped by kid, Revoke only `status==='assigned'`.
  4. TemplatesTab: `listTestDefinitions({templatesOnly:true})`; a 0-assignment template renders; completed-count aggregates `getAssignmentOverview` by `definition_id`; "Assign to kids"→`?from=`.
  5. TestBuilder: from-template (`?from=`) → `getTestDefinition` seeds Step 1, `<fieldset disabled>`, submit calls ONLY `assignTestDefinition` (no `createTestDefinition`); fresh → `createTestDefinition` then `assignTestDefinition`; `Save as draft` → `createTestDefinition({is_template:true})` no assign; grade-gap warn chip never disables Assign; `CandidatePreview` debounced.
  6. DefinitionDetail: `getTestDefinition` + filtered assignments; foreign id → "Not found in your tests".
  7. CTAs rewired: `grep -rn "custom-test" src/components/parent/classroom src/pages/parent/KidDetail.tsx src/components/parent/library/VettedTab.tsx` → 0; KidRosterCard→`?kid=`, KidDetail→`?kid=`, VettedTab bulk and per-item→`seedQuery`-derived `?subject=`/`?standards=` (no `?content=`), QuickActions→`/parent/tests/builder` & `/parent/library`.
  8. Glyph hexdump: `Loading…`/`Counting…`/busy `'…'` = U+2026; KidPicker/CandidatePreview ` — ` = U+2014; ActiveTab `“{parent_note}”` = U+201C/U+201D; "template’s content" = U+2019. Zero ASCII `'`/`"`/`...` in user copy.
- [ ] **Step 5: Final commit**
```bash
git add scripts/test-parent-2c-data.mjs
git commit -m "test(parent) 2c data guard; Tests+builder slice complete (definition-grain+from-template+candidate-count green, typecheck+build green, QA verified)"
```

---

## Self-Review

**Spec coverage:**
- §4.1 `TestDefinitionRow` → Task 1. §4.2 three queries → Task 2. ✓
- §5 routing (`tests`/`builder`/`definitions/:id` in ParentRoot, ParentShell Tests→`/parent/tests`, legacy untouched) → Task 10. ✓
- §6 Active (source-mix badge + optimistic revoke, by kid) → Task 6; Completed (by week) → Task 7; Templates (definition-grain, 0-assignment visible, Assign-to-kids `?from=`) → Task 8. ✓
- §7 DefinitionDetail (def + per-kid, RLS not-found) → Task 9. ✓
- §8 builder (4 sections; from-template assign-only vs fresh create+assign; Save-as-draft template; pre-fill URL params; grade-gap warn-not-block; CandidatePreview tight-pool) → Tasks 3/4/5. ✓
- §9 rewire 4 CTA files (KidRosterCard `?kid=`, ClassroomQuickActions, KidDetail `?kid=`, VettedTab `seedQuery`-derived `?subject=`/`?standards=` — no `?content=`) → Task 11. Growth "Build a boost test" — not present in shipped code (2a GrowthAreas has no CTA), correctly NOT rewired (spec §9 "if present"). ✓
- §10 verification (0-assignment-template gap, from-template no-new-definition both directions, RLS cross-family on new queries, candidate-count narrows) → Task 12. ✓
- §11 deferrals honored: no Edit/Duplicate/Archive-definition (Templates card actions = only Assign/View); StandardsAutocomplete simplified to chip-entry (documented in the component header + spec §11); raw per-question composition deferred (VettedTab derives `?subject=`/`?standards=` — no `?content=`; Task 5 passes `custom_question_ids:[]`); kid-home panel/`map_start_assignment` NOT touched (2d). ✓
- §12 risks: additive lib (Tasks 1–2 zero-caller-impact), from-template branch (Task 12 asserts no-new-def both ways), `seedQuery`-derived VettedTab params (Task 11 — no `?content=` cap concern), glyph rule (header + Task 12 step 4.8 hexdump), client-side definition_id filtering (Tasks 8/9). ✓

No spec requirement without a task.

**Placeholder scan:** No TBD/TODO/"handle errors". Every step has complete code. Deferrals (Edit/Duplicate/Archive-definition; StandardsAutocomplete simplification) are explicit non-actions with rationale in component/spec, not placeholders. Task 6 Step 3 explicitly orders the build-once-after-7-8 sequencing rather than stubbing.

**Type consistency:** `TestDefinitionRow` (Task 1) fields used identically in `listTestDefinitions`/`getTestDefinition` (Task 2), TemplatesTab (8), DefinitionDetail (9), TestBuilder (5). `getCandidateCount` arg shape (`subject,grade,standardCodes,sourceMix`) identical Task 2 ↔ CandidatePreview (4) ↔ TestBuilder (5). `CreateDefinitionInput` (Cycle-1) used in TestBuilder with all required fields incl. `custom_question_ids:[]`/`custom_passage_ids:[]`. `AssignmentOverviewRow` fields (`assignment_id, definition_id, definition_name, subject, source_mix, status, due_by, parent_note, student_name, student_grade, completed_at, score, estimated_rit`) match Cycle-1 type, used consistently in ActiveTab/CompletedTab/TemplatesTab/DefinitionDetail. Route paths `tests`/`tests/builder`/`tests/definitions/:id` and `?tab=` values `active|completed|templates` consistent Task 10 ↔ Tests.tsx ↔ CTAs. `KidPicker` props (`mode,selected,onChange,definitionGrade`) consistent Task 3 ↔ Task 5 consumer. Mutation names (`createTestDefinition`,`assignTestDefinition`,`revokeAssignment`) match Cycle-1. No mismatches.
