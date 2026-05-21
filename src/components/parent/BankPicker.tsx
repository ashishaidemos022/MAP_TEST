// src/components/parent/BankPicker.tsx
// Required Bank selector for manual authoring. Lists family custom banks
// filtered by the form's current subject + grade; offers a "Create new bank…"
// inline dialog that captures only the name (subject/grade are inherited).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { createOrFindCustomBank } from '../../lib/banks/mutations'
import { errorMessage } from '../../lib/errorMessage'
import type { Subject } from '../../lib/types'

interface BankRow { id: string; name: string; subject: Subject; grade: number }

export function BankPicker(props: {
  subject: Subject
  grade: number
  value: string | null
  onChange: (bankId: string | null) => void
  /** When the picker is mounted from a bank-scoped URL (?bank=<uuid>), lock to that bank. */
  locked?: boolean
  /** Optional callback when the user clicks "Change bank" while locked. */
  onUnlock?: () => void
}) {
  const { subject, grade, value, onChange, locked, onUnlock } = props
  const [banks, setBanks] = useState<BankRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    supabase.from('map_v_custom_bank_overview')
      .select('id, name, subject, grade')
      .eq('subject', subject)
      .eq('grade', grade)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setError(error.message)
        else setBanks((data ?? []) as BankRow[])
        setLoading(false)
      })
    return () => { alive = false }
  }, [subject, grade])

  const selectedName = useMemo(() => banks.find(b => b.id === value)?.name ?? '', [banks, value])

  async function handleCreate() {
    setError(null)
    setCreating(true)
    try {
      const r = await createOrFindCustomBank({ name: newName.trim(), subject, grade })
      setBanks(prev => [{ id: r.bankId, name: r.resolvedName, subject, grade }, ...prev])
      onChange(r.bankId)
      setShowCreate(false)
      setNewName('')
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to create bank'))
    } finally {
      setCreating(false)
    }
  }

  if (locked) {
    return (
      <div className="flex items-center gap-2">
        <div className="px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-800 text-sm">
          Bank: <strong>{selectedName || '…'}</strong>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={onUnlock}>Change bank</button>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Bank <span className="text-red-500">*</span></label>
      <select
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === '__create__') setShowCreate(true)
          else onChange(e.target.value || null)
        }}
        className="w-full border rounded px-2 py-2 bg-white dark:bg-zinc-900"
        disabled={loading}
      >
        <option value="">{loading ? 'Loading…' : `Pick a ${subject} G${grade} bank…`}</option>
        {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        <option value="__create__">+ Create new bank…</option>
      </select>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      {showCreate && (
        <div className="mt-2 p-3 rounded border bg-zinc-50 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 mb-2">
            New {subject} G{grade} bank. Suggested naming: <code>{'{Topic} — '}{subject[0].toUpperCase() + subject.slice(1)} G{grade}</code>
          </p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`e.g. Fractions on a number line — ${subject[0].toUpperCase() + subject.slice(1)} G${grade}`}
            maxLength={120}
            className="w-full border rounded px-2 py-2 bg-white dark:bg-zinc-900"
          />
          <div className="mt-2 flex gap-2 justify-end">
            <button type="button" className="btn-ghost text-sm" onClick={() => setShowCreate(false)}>Cancel</button>
            <button
              type="button" className="btn-primary text-sm"
              disabled={creating || newName.trim().length < 1}
              onClick={handleCreate}
            >
              {creating ? 'Creating…' : 'Create bank'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
