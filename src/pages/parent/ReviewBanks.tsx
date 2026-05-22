// src/pages/parent/ReviewBanks.tsx
// AI Studio default view. Lists custom Banks the family owns. Clicking a bank's
// name navigates to /parent/ai-studio?bank=<uuid>, which AiStudio.tsx routes to
// <CustomBank /> (the per-bank review screen). A bank that is fully ready
// (no drafts, >=5 published questions — the threshold map_assign_bank enforces
// server-side for custom-lane banks) gets an "Assign →" button that opens the
// AssignBankDialog inline; everything else gets a "Review →" link into the bank.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AssignBankDialog } from '../../components/parent/AssignBankDialog'

interface BankOverview {
  id: string
  name: string
  subject: 'math' | 'reading' | 'language'
  grade: number
  question_count: number
  passage_count: number
  draft_question_count: number
  ready_question_count: number
  updated_at: string
}

export default function ReviewBanks() {
  const [banks, setBanks] = useState<BankOverview[] | null>(null)
  const [legacyCount, setLegacyCount] = useState<number>(0)
  const [err, setErr] = useState<string | null>(null)
  const [assignFor, setAssignFor] = useState<BankOverview | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('map_v_custom_bank_overview')
        .select('id, name, subject, grade, question_count, passage_count, draft_question_count, ready_question_count, updated_at')
        .order('updated_at', { ascending: false }),
      supabase.from('map_v_custom_legacy_items')
        .select('id', { count: 'exact', head: true }),
    ]).then(([b, l]) => {
      if (!alive) return
      if (b.error) setErr(b.error.message)
      else setBanks((b.data ?? []) as BankOverview[])
      if (!l.error) setLegacyCount(l.count ?? 0)
    })
    return () => { alive = false }
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">AI Studio · Review Banks</h1>
          <p className="text-sm text-zinc-500">Banks Claude and your manual authoring have built for this family.</p>
        </div>
        <Link to="/parent/ai-studio?tab=connect" className="btn-ghost text-sm">⚡ Connect AI</Link>
      </header>

      {err && <div className="p-3 mb-4 bg-red-50 text-red-700 rounded">{err}</div>}
      {!banks ? (
        <p className="text-zinc-500">Loading…</p>
      ) : banks.length === 0 ? (
        <p className="text-zinc-500">
          No banks yet. Generate questions with Claude (see <Link to="/parent/ai-studio?tab=connect" className="underline">Connect AI</Link>),
          or click <Link to="/parent/custom-bank/new-question" className="underline">+ New question</Link> to author manually.
        </p>
      ) : (
        <ul className="divide-y rounded border bg-white dark:bg-zinc-900">
          {banks.map(b => {
            const canAssign = b.draft_question_count === 0 && b.ready_question_count >= 5
            return (
              <li key={b.id} className="p-4 flex items-center gap-4">
                <Link to={`/parent/ai-studio?bank=${b.id}`} className="flex-1 min-w-0 group">
                  <div className="font-medium truncate group-hover:underline">{b.name}</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {b.subject} · G{b.grade} ·
                    {' '}{b.question_count} {b.question_count === 1 ? 'question' : 'questions'}
                    {b.passage_count > 0 && ` · ${b.passage_count} passage${b.passage_count === 1 ? '' : 's'}`}
                    {' · '}{b.draft_question_count} draft · {b.ready_question_count} ready
                  </div>
                </Link>
                {canAssign ? (
                  <button type="button" className="btn-primary text-sm" onClick={() => setAssignFor(b)}>
                    Assign →
                  </button>
                ) : (
                  <Link to={`/parent/ai-studio?bank=${b.id}`} className="btn-secondary text-sm">
                    Review →
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {legacyCount > 0 && (
        <div className="mt-4 text-sm">
          <Link to="/parent/ai-studio?legacy=1" className="text-zinc-500 hover:underline">
            ℓ Legacy items ({legacyCount} not in any bank) →
          </Link>
        </div>
      )}

      {assignFor && (
        <AssignBankDialog
          bankId={assignFor.id}
          bankName={assignFor.name}
          onClose={() => setAssignFor(null)}
          onAssigned={() => setAssignFor(null)}
        />
      )}
    </div>
  )
}
