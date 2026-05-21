// src/pages/parent/SaveVettedBank.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { createVettedBank } from '../../lib/banks/mutations'
import { CUSTOM_MIN_COUNT, CUSTOM_MAX_COUNT } from '../../lib/customTest'
import { errorMessage } from '../../lib/errorMessage'
import type { Subject } from '../../lib/types'

type Std = { id: string; subject: Subject; grade: number; teks_code: string; teks_title: string }
const SUBJECTS: Subject[] = ['math', 'reading', 'language']
const DIFFS = ['any', 'easy', 'medium', 'hard'] as const

export default function SaveVettedBank() {
  const navigate = useNavigate()
  const [subject, setSubject] = useState<Subject>('math')
  const [stds, setStds] = useState<Std[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState<(typeof DIFFS)[number]>('any')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPicked(new Set())
    supabase
      .from('map_standards')
      .select('id, subject, grade, teks_code, teks_title')
      .eq('subject', subject)
      .order('grade')
      .order('sort_order')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setErr(error.message); return }
        setStds((data ?? []) as Std[])
      })
    return () => { alive = false }
  }, [subject])

  const byGrade = useMemo(() => {
    const m = new Map<number, Std[]>()
    for (const s of stds) {
      const list = m.get(s.grade) ?? m.set(s.grade, []).get(s.grade)!
      list.push(s)
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [stds])

  const pickedStds = stds.filter((s) => picked.has(s.id))
  const grade = pickedStds[0]?.grade ?? 0
  const sameGrade = pickedStds.every((s) => s.grade === grade)
  const canSave =
    name.trim().length >= 1 && name.trim().length <= 120 &&
    pickedStds.length > 0 && sameGrade &&
    count >= CUSTOM_MIN_COUNT && count <= CUSTOM_MAX_COUNT && !busy

  const toggle = (id: string) => {
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await createVettedBank({
        name: name.trim(),
        subject,
        grade,
        standardCodes: pickedStds.map((s) => s.teks_code),
        plannedLength: count,
        difficulty,
      })
      navigate('/parent')
    } catch (e) {
      setErr(errorMessage(e, 'Could not save the bank.'))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="font-display text-3xl">New vetted test</h1>
      <p className="mt-1 text-sm text-smoke">
        Pick standards, name it, save it as a reusable test. Each kid you assign
        it to gets a freshly composed set from these standards.
      </p>

      <div className="mt-4 flex gap-2">
        {SUBJECTS.map((s) => (
          <button key={s} type="button" onClick={() => setSubject(s)}
            className={subject === s ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-72 overflow-auto rounded border border-cloud p-2">
        {byGrade.map(([g, list]) => (
          <div key={g} className="mb-2">
            <p className="text-xs font-semibold uppercase text-smoke">Grade {g}</p>
            {list.map((s) => (
              <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="font-mono">{s.teks_code}</span> {s.teks_title}
              </label>
            ))}
          </div>
        ))}
      </div>
      {!sameGrade && (
        <p className="mt-1 text-sm text-rust">Pick standards from a single grade.</p>
      )}

      <div className="mt-4">
        <label className="text-sm">Questions: {count}</label>
        <input type="range" min={CUSTOM_MIN_COUNT} max={CUSTOM_MAX_COUNT} step={5}
          value={count} onChange={(e) => setCount(Number(e.target.value))}
          className="ml-2 w-64 align-middle" />
      </div>

      <div className="mt-3 flex gap-2">
        {DIFFS.map((d) => (
          <button key={d} type="button" onClick={() => setDifficulty(d)}
            className={difficulty === d ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
            {d}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Name this test (e.g. Fractions Check)"
          maxLength={120}
          className="w-full rounded border border-cloud p-2 text-sm" />
      </div>

      {err && <p className="mt-2 text-sm text-rust">{err}</p>}

      <div className="mt-4 flex gap-2">
        <button type="button" disabled={!canSave} onClick={save}
          className="btn-primary disabled:opacity-50">
          {busy ? 'Saving…' : 'Save test'}
        </button>
        <button type="button" onClick={() => navigate('/parent')} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  )
}
