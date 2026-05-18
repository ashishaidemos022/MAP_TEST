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
        defId = await createTestDefinition(input)
      }
      await assignTestDefinition(
        defId,
        [...kids],
        dueBy ? new Date(dueBy).toISOString() : null,
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
          <p className="mt-2 text-sm text-ink/60">{templateLoadErr}</p>
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
