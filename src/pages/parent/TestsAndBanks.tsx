// src/pages/parent/TestsAndBanks.tsx
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { listBanks, getBankAssignmentOverview } from '../../lib/banks/queries'
import { revokeBankAssignment, deleteBank, dismissBankAssignment } from '../../lib/banks/mutations'
import { AssignBankDialog } from '../../components/parent/AssignBankDialog'
import { errorMessage } from '../../lib/errorMessage'
import type { BankRow, BankAssignmentOverviewRow, BankLane } from '../../lib/banks/types'

/* ---------- inline SVG icons (no dependency) ---------- */
type IconProps = { className?: string }
function IconClipboard({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M8 6H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  )
}
function IconFolder({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z" />
    </svg>
  )
}
function IconDots({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
    </svg>
  )
}
function IconPlus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function IconFolderPlus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  )
}

/* ---------- pure visual helpers ---------- */
// Map the existing lane to the test/bank type pill (relabel only — no new data).
function typePill(lane: BankLane): { label: string; bg: string; fg: string } {
  return lane === 'vetted'
    ? { label: 'test', bg: '#E6F1FB', fg: '#0C447C' }
    : { label: 'bank', bg: '#EEEDFE', fg: '#3C3489' }
}
function typeIconBox(lane: BankLane): { bg: string; fg: string } {
  return lane === 'vetted'
    ? { bg: '#E6F1FB', fg: '#185FA5' }
    : { bg: '#EEEDFE', fg: '#534AB7' }
}

// Stable per-kid avatar color, 6 warm non-green tones (green clashes with "vetted").
const AVATAR_PALETTE = [
  { bg: '#FAEEDA', fg: '#854F0B' },
  { bg: '#E6F1FB', fg: '#0C447C' },
  { bg: '#EEEDFE', fg: '#3C3489' },
  { bg: '#FBE9F1', fg: '#9B2C5E' },
  { bg: '#FCEAE3', fg: '#9A3B1B' },
  { bg: '#EAEEF3', fg: '#334155' },
]
function avatarColor(seed: string): { bg: string; fg: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

// Status/score pill — color thresholds per the handoff spec. No new states.
function statusPill(r: BankAssignmentOverviewRow): { label: string; bg: string; fg: string } {
  const C = {
    green: { bg: '#EAF3DE', fg: '#27500A' },
    amber: { bg: '#FAEEDA', fg: '#854F0B' },
    red: { bg: '#FBE7E7', fg: '#B42318' },
    blue: { bg: '#E6F1FB', fg: '#0C447C' },
    gray: { bg: '#EAEEF3', fg: '#475569' },
  }
  if (r.status === 'in_progress') return { label: 'In progress', ...C.blue }
  if (r.status === 'assigned') return { label: 'Assigned', ...C.gray }
  if (r.status === 'revoked') return { label: 'Revoked', ...C.gray }
  // completed — mirror existing display: score only when totals present
  if (r.questions_total != null) {
    const correct = r.questions_correct ?? 0
    const total = r.questions_total
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0
    const ramp = pct >= 80 ? C.green : pct >= 50 ? C.amber : C.red
    return { label: `Completed · ${correct} / ${total} · ${pct}%`, ...ramp }
  }
  return { label: 'Completed', ...C.green }
}

export default function TestsAndBanks() {
  const [banks, setBanks] = useState<BankRow[]>([])
  const [rows, setRows] = useState<BankAssignmentOverviewRow[]>([])
  const [assignFor, setAssignFor] = useState<BankRow | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(() => {
    listBanks().then(setBanks).catch((e) => setErr(String(e)))
    getBankAssignmentOverview().then(setRows).catch((e) => setErr(String(e)))
  }, [])
  useEffect(reload, [reload])

  const revoke = async (id: string) => {
    try { await revokeBankAssignment(id); reload() }
    catch (e) { setErr(errorMessage(e, 'Could not revoke.')) }
  }

  const del = async (b: BankRow) => {
    if (!window.confirm(`Delete “${b.name}”? This can’t be undone.`)) return
    try { await deleteBank(b.id); reload() }
    catch (e) { setErr(errorMessage(e, 'Could not delete.')) }
  }

  const dismiss = async (id: string) => {
    try { await dismissBankAssignment(id); reload() }
    catch (e) { setErr(errorMessage(e, 'Could not dismiss.')) }
  }

  // "Assigned to N kids" — derived from the already-fetched assignment rows.
  const assignedCount = (bankId: string) =>
    rows.filter((r) => r.bank_id === bankId).length

  return (
    <section className="my-8">
      {/* page intro */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">Tests &amp; Banks</h1>
          <p className="mt-1 max-w-xl text-sm text-smoke">
            Your library of tests and question banks. Open one to view its contents, or
            assign a test to one or more kids.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to="/parent/banks/new-custom" className="btn-secondary text-sm">
            <IconFolderPlus className="h-4 w-4" />
            New question bank
          </Link>
          <Link to="/parent/banks/new" className="btn-primary text-sm">
            <IconPlus className="h-4 w-4" />
            New vetted test
          </Link>
        </div>
      </div>
      {err && <p className="mt-3 text-sm text-berry">{err}</p>}

      {/* library */}
      <div className="mt-6 flex items-center gap-2">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-smoke">
          Your library
        </h2>
        <span className="text-xs text-smoke/70">
          {banks.length} {banks.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {banks.length === 0 && (
          <p className="text-sm text-smoke">No saved tests yet.</p>
        )}
        {banks.map((b) => {
          const tp = typePill(b.lane)
          const ib = typeIconBox(b.lane)
          const n = assignedCount(b.id)
          return (
            <div
              key={b.id}
              className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-cloud/70"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: ib.bg, color: ib.fg }}
              >
                {b.lane === 'vetted'
                  ? <IconClipboard className="h-[18px] w-[18px]" />
                  : <IconFolder className="h-[18px] w-[18px]" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{b.name}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: tp.bg, color: tp.fg }}
                  >
                    {tp.label}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px]"
                    style={
                      b.lane === 'vetted'
                        ? { background: '#EAF3DE', color: '#27500A' }
                        : { background: '#EAEEF3', color: '#475569' }
                    }
                  >
                    {b.lane}
                  </span>
                </div>
                <div className="mt-1 text-xs text-smoke">
                  {b.subject} · Grade {b.grade}
                  {b.lane === 'vetted' &&
                    ` · ${b.standard_codes.length} std · ${b.planned_length} Q · ${b.difficulty}`}
                  {` · ${n === 0 ? 'Not yet assigned' : `Assigned to ${n} ${n === 1 ? 'kid' : 'kids'}`}`}
                </div>
              </div>

              <div className="relative flex shrink-0 items-center gap-1">
                {b.lane === 'custom' && (
                  <Link to={`/parent/banks/${b.id}`} className="btn-ghost text-xs">
                    Open
                  </Link>
                )}
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => setAssignFor(b)}
                >
                  Assign
                </button>
                <button
                  type="button"
                  className="btn-ghost px-2 text-xs"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={menuFor === b.id}
                  onClick={() => setMenuFor(menuFor === b.id ? null : b.id)}
                >
                  <IconDots className="h-4 w-4" />
                </button>
                {menuFor === b.id && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-10 mt-1 min-w-[8rem] rounded-xl bg-white py-1 shadow-card ring-1 ring-cloud"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-1.5 text-left text-xs text-berry hover:bg-cream"
                      onClick={() => { setMenuFor(null); del(b) }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* assignments */}
      <div className="mt-8 flex items-center gap-2">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-smoke">
          Assignments
        </h2>
        <span className="text-xs text-smoke/70">
          {rows.length} {rows.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {rows.length === 0 && <p className="text-sm text-smoke">Nothing assigned yet.</p>}
        {rows.map((r) => {
          const av = avatarColor(r.student_id)
          const sp = statusPill(r)
          const dateStr =
            r.status === 'completed' && r.completed_at
              ? `completed ${new Date(r.completed_at).toLocaleDateString()}`
              : `assigned ${new Date(r.assigned_at).toLocaleDateString()}`
          return (
            <div
              key={r.assignment_id}
              className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-cloud/70"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                style={{ background: av.bg, color: av.fg }}
                aria-hidden="true"
              >
                {(r.student_name || '?').charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{r.student_name}</span>
                  <span className="text-xs text-smoke">Grade {r.grade}</span>
                </div>
                <div className="mt-1 text-xs text-smoke">
                  {r.bank_name} · {dateStr}
                  {r.due_by && ` · due ${new Date(r.due_by).toLocaleDateString()}`}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: sp.bg, color: sp.fg }}
                >
                  {sp.label}
                </span>
                {r.status === 'assigned' && (
                  <button
                    type="button"
                    className="text-xs text-smoke hover:text-ink"
                    onClick={() => revoke(r.assignment_id)}
                  >
                    Revoke
                  </button>
                )}
                {(r.status === 'completed' || r.status === 'revoked') && (
                  <button
                    type="button"
                    className="text-xs text-smoke hover:text-ink"
                    onClick={() => dismiss(r.assignment_id)}
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {assignFor && (
        <AssignBankDialog
          bankId={assignFor.id}
          bankName={assignFor.name}
          onClose={() => setAssignFor(null)}
          onAssigned={() => { setAssignFor(null); reload() }}
        />
      )}
    </section>
  )
}
