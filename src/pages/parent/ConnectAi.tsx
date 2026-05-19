// src/pages/parent/ConnectAi.tsx
// Visual redesign: cleaner page identity inside the AI Studio area
// (breadcrumb instead of a "back" escape hatch), a primary "Connect new
// agent" CTA opening an instructions modal, compact agent rows with a
// "View permissions" affordance, restyled Quick launch, human-readable
// recent-activity sentences (tool_name → sentence dictionary with kid-name
// interpolation from tool_args.student_id), and Personal access tokens as
// a collapsed advanced disclosure. Every RPC, fetch, and handler from the
// previous version is preserved verbatim; only markup/styling changed,
// plus one extra column (tool_args) on the existing audit select and two
// new presentational modals.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useActiveStudent } from '../../lib/activeStudent'

type TokenRow = {
  id: string
  label: string
  token_last4: string
  created_at: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
}

type GrantRow = {
  grant_id: string
  client_id: string
  client_name: string
  scope: string
  created_at: string
  last_used_at: string | null
}

type AuditRow = {
  id: number
  tool_name: string
  status: string
  created_at: string
  auth_kind: 'pat' | 'oauth_access'
  grant_id: string | null
  tool_args: Record<string, unknown> | null
}

const MCP_URL = `${import.meta.env.VITE_PUBLIC_BASE_URL ?? window.location.origin}/api/mcp`
const EXPIRY_OPTIONS = [30, 90, 180, 365]
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  return `${months} mo ago`
}

// "3:23 PM today" / "3:23 PM yesterday" / "May 12" for activity rows.
function prettyTime(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === y.toDateString()
  const hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `${hm} today`
  if (isYesterday) return `${hm} yesterday`
  return d.toLocaleDateString()
}

// tool_name → sentence. {kid} interpolated from tool_args.student_id resolved
// against the family's kids list (already in memory via useActiveStudent).
const TOOL_LABELS: Record<string, (kid: string | null) => string> = {
  // Read tools
  list_kids: () => 'listed your kids',
  get_kid_overview: (k) => (k ? `got an overview for ${k}` : "got a kid's overview"),
  list_recent_sessions: (k) => (k ? `listed ${k}'s recent sessions` : 'listed recent sessions'),
  get_session_details: () => 'looked at a session in detail',
  get_recent_wrong_answers: (k) => (k ? `read ${k}'s recent wrong answers` : "read a kid's recent wrong answers"),
  get_accuracy_by_standard: (k) => (k ? `checked ${k}'s accuracy by standard` : 'checked accuracy by standard'),
  get_top_misconceptions: (k) => (k ? `got the top misconceptions for ${k}` : 'got the top misconceptions'),
  get_activity_calendar: (k) => (k ? `checked ${k}'s activity calendar` : 'checked the activity calendar'),
  compare_kids: () => 'compared your kids',
  // Custom-bank read tools
  list_custom_questions: () => 'listed your custom questions',
  list_custom_passages: () => 'listed your custom passages',
  get_custom_question: () => 'looked at a custom question',
  get_custom_passage: () => 'looked at a custom passage',
  // Custom-bank write tools
  create_custom_questions: () => 'drafted new custom questions',
  create_custom_passage_and_questions: () => 'drafted a new passage and questions',
  publish_custom_question: () => 'published a custom question',
  publish_custom_passage: () => 'published a custom passage',
  update_custom_question: () => 'updated a custom question',
  update_custom_passage: () => 'updated a custom passage',
  bulk_upgrade_passage_references: () => 'upgraded passage references',
}
function describeTool(name: string, kidName: string | null): string {
  const f = TOOL_LABELS[name]
  return f ? f(kidName) : `called ${name}`
}

/* ---------- inline SVG icons ---------- */
type IconProps = { className?: string }
function IconArrowLeft({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 12H5M11 18l-6-6 6-6" />
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
function IconChat({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 12a8.5 8.5 0 0 1-12.2 7.7L4 21l1.4-4.6A8.5 8.5 0 1 1 21 12Z" />
    </svg>
  )
}
function IconHelp({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17v.01" />
    </svg>
  )
}
function IconCalculator({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0M8 19h2M12 19h2M16 19h0" />
    </svg>
  )
}
function IconBook({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Z" />
      <path d="M4 19a2 2 0 0 0 2 2h12" />
    </svg>
  )
}
function IconPencil({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M16 4l4 4-11 11H5v-4L16 4Z" />
    </svg>
  )
}
function IconChevronRight({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
function IconChevronDown({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
function IconClose({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// Static permissions list shown in the View-permissions modal.
const PERMISSION_GROUPS: { title: string; items: { name: string; desc: string }[] }[] = [
  {
    title: 'Read your family’s practice data',
    items: [
      { name: 'list_kids', desc: 'List your kids' },
      { name: 'get_kid_overview', desc: "Get a kid's high-level overview" },
      { name: 'list_recent_sessions', desc: "List a kid's recent sessions" },
      { name: 'get_session_details', desc: 'Look at one session in detail' },
      { name: 'get_recent_wrong_answers', desc: "Read a kid's recent wrong answers" },
      { name: 'get_accuracy_by_standard', desc: 'Check accuracy by TEKS standard' },
      { name: 'get_top_misconceptions', desc: 'See most-frequent misconception tags' },
      { name: 'get_activity_calendar', desc: 'See per-day question counts' },
      { name: 'compare_kids', desc: 'Compare your kids side-by-side' },
    ],
  },
  {
    title: 'Manage your custom bank',
    items: [
      { name: 'list_custom_questions / list_custom_passages', desc: 'List your custom items' },
      { name: 'get_custom_question / get_custom_passage', desc: 'Look at one in detail' },
      { name: 'create_custom_questions / create_custom_passage_and_questions', desc: 'Draft new items (always land in draft)' },
      { name: 'update_custom_question / update_custom_passage', desc: 'Edit a draft (creates a new version)' },
      { name: 'publish_custom_question / publish_custom_passage', desc: 'Publish a draft so kids can see it' },
      { name: 'bulk_upgrade_passage_references', desc: 'Relink questions to the latest passage version' },
    ],
  },
]

export default function ConnectAi() {
  const { students } = useActiveStudent()
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [showRevoked, setShowRevoked] = useState(false)
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [auditLimit, setAuditLimit] = useState(50)
  const [auditFilter, setAuditFilter] = useState<'all' | 'pat' | string>('all') // 'all' | 'pat' | grant_id
  const [showPatSection, setShowPatSection] = useState(false)
  const [label, setLabel] = useState('Personal CLI')
  const [expiresDays, setExpiresDays] = useState(90)
  const [creating, setCreating] = useState(false)
  const [reveal, setReveal] = useState<{ plaintext: string; tokenId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [permsForGrant, setPermsForGrant] = useState<GrantRow | null>(null)

  // student_id → display_name for activity-row {kid} interpolation
  const kidNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of students) m.set(s.id, s.display_name)
    return m
  }, [students])

  async function loadTokens() {
    const { data, error: e } = await supabase
      .from('map_mcp_tokens')
      .select('id, label, token_last4, created_at, expires_at, last_used_at, revoked_at')
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    else setTokens((data ?? []) as TokenRow[])
  }

  async function loadGrants() {
    const { data, error: e } = await supabase.rpc('map_list_oauth_grants')
    if (e) setError(e.message)
    else setGrants((data ?? []) as GrantRow[])
  }

  async function loadAudit() {
    let q = supabase
      .from('map_mcp_audit')
      .select('id, tool_name, status, created_at, auth_kind, grant_id, tool_args')
      .order('created_at', { ascending: false })
      .limit(auditLimit)
    if (auditFilter === 'pat') q = q.eq('auth_kind', 'pat')
    else if (auditFilter !== 'all') q = q.eq('grant_id', auditFilter)
    const { data, error: e } = await q
    if (e) setError(e.message)
    else setAudit((data ?? []) as AuditRow[])
  }

  useEffect(() => {
    void loadTokens()
    void loadGrants()
    void loadAudit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditLimit, auditFilter])

  async function handleGenerate() {
    setCreating(true); setError(null)
    const { data, error: e } = await supabase.rpc('map_create_mcp_token', {
      p_label: label, p_expires_days: expiresDays,
    })
    setCreating(false)
    if (e) { setError(e.message); return }
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.plaintext_token) { setError('No token returned'); return }
    setReveal({ plaintext: row.plaintext_token, tokenId: row.token_id })
    void loadTokens()
  }

  async function handleRevokeToken(id: string) {
    if (!window.confirm('Revoke this token? Any AI agent using it will lose access immediately.')) return
    const { error: e } = await supabase.rpc('map_revoke_mcp_token', { p_token_id: id })
    if (e) setError(e.message)
    else void loadTokens()
  }

  async function handleRevokeGrant(grant_id: string, name: string) {
    if (!window.confirm(`Revoke ${name}? It will lose access immediately and the parent will need to reconnect from ${name}.`)) return
    const { error: e } = await supabase.rpc('map_revoke_oauth_grant', { p_grant_id: grant_id })
    if (e) setError(e.message)
    else { void loadGrants(); void loadAudit() }
  }

  const visibleTokens = useMemo(
    () => tokens.filter((t) => showRevoked || !t.revoked_at),
    [tokens, showRevoked],
  )

  // Source label and kid lookup for an activity row.
  function sourceLabel(r: AuditRow): { name: string; tag?: string } {
    if (r.auth_kind === 'pat') {
      const tokLabel = (r.tool_args && typeof (r.tool_args as { _label?: unknown })._label === 'string')
        ? (r.tool_args as { _label: string })._label
        : null
      return { name: 'Personal token', tag: tokLabel ?? undefined }
    }
    const g = grants.find((x) => x.grant_id === r.grant_id)
    return { name: g?.client_name ?? 'OAuth agent' }
  }
  function kidForRow(r: AuditRow): string | null {
    const sid = r.tool_args && typeof (r.tool_args as { student_id?: unknown }).student_id === 'string'
      ? (r.tool_args as { student_id: string }).student_id
      : null
    return sid ? (kidNameById.get(sid) ?? null) : null
  }
  function statusOk(s: string): boolean {
    return s === 'ok' || s === 'success' || s === '200'
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* breadcrumb */}
      <div className="mt-4 flex items-center gap-2 text-xs text-smoke">
        <Link to="/parent/ai-studio" className="inline-flex items-center gap-1 hover:text-ink">
          <IconArrowLeft className="h-3 w-3" />
          AI Studio
        </Link>
        <span>/</span>
        <span className="text-ink/70">Connect AI</span>
      </div>

      {/* page intro */}
      <header className="mt-2">
        <h1 className="font-display text-2xl">Connect AI</h1>
        <p className="mt-1 max-w-2xl text-sm text-smoke">
          Manage which AI agents can read your family&apos;s practice data and see what they&apos;ve been doing.
        </p>
      </header>

      {error && (
        <p className="mt-4 whitespace-pre-line rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
          {error}
        </p>
      )}

      {/* ---------- CONNECTED AGENTS ---------- */}
      <div className="mt-7 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-smoke">
          Connected agents <span className="opacity-70">· {grants.length}</span>
        </h2>
        <button
          type="button"
          className="btn-primary text-sm"
          onClick={() => setShowConnectModal(true)}
        >
          <IconPlus className="h-4 w-4" />
          Connect new agent
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {grants.length === 0 && (
          <p className="rounded-2xl bg-white p-5 text-sm text-smoke ring-1 ring-cloud/70">
            No agents authorized yet. Click <strong>Connect new agent</strong> to get a step-by-step
            for Claude.ai or ChatGPT.
          </p>
        )}
        {grants.map((g) => {
          const lastUsedMs = g.last_used_at ? new Date(g.last_used_at).getTime() : 0
          const isActive = lastUsedMs > 0 && Date.now() - lastUsedMs < ACTIVE_WINDOW_MS
          return (
            <div key={g.grant_id} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-cloud/70">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: '#EAEEF3', color: '#1f2937' }}
              >
                <IconChat className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{g.client_name}</span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      isActive
                        ? { background: '#EAF3DE', color: '#27500A' }
                        : { background: '#EAEEF3', color: '#475569' }
                    }
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: isActive ? '#639922' : '#94A3B8' }}
                    />
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-smoke">
                  Connected {new Date(g.created_at).toLocaleDateString()} · Last used{' '}
                  <span title={g.last_used_at ? new Date(g.last_used_at).toLocaleString() : ''}>
                    {g.last_used_at ? formatRelative(g.last_used_at) : 'never'}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => setPermsForGrant(g)}
                >
                  View permissions
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-berry hover:underline"
                  onClick={() => void handleRevokeGrant(g.grant_id, g.client_name)}
                >
                  Revoke
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 px-1 text-xs text-smoke">
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-ink"
          onClick={() => setShowConnectModal(true)}
        >
          <IconHelp className="h-3.5 w-3.5" />
          How to connect Claude.ai
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-ink"
          onClick={() => setShowConnectModal(true)}
        >
          <IconHelp className="h-3.5 w-3.5" />
          How to connect ChatGPT
        </button>
      </div>

      {/* ---------- QUICK LAUNCH ---------- */}
      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-smoke">Quick launch</h2>
        <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-cloud/70">
          <p className="text-xs text-smoke">
            Run a one-off test using only your family&apos;s published custom questions.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/test/new?subject=math&source=mine&count=10"
              className="btn-secondary text-xs"
            >
              <IconCalculator className="h-4 w-4" />
              Math · 10 questions
            </Link>
            <Link
              to="/test/new?subject=reading&source=mine&count=10"
              className="btn-secondary text-xs"
            >
              <IconBook className="h-4 w-4" />
              Reading · 10 questions
            </Link>
            <Link
              to="/test/new?subject=language&source=mine&count=10"
              className="btn-secondary text-xs"
            >
              <IconPencil className="h-4 w-4" />
              Language · 10 questions
            </Link>
          </div>
        </div>
      </div>

      {/* ---------- RECENT ACTIVITY ---------- */}
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-smoke">
          Recent activity <span className="opacity-70">· {audit.length}</span>
        </h2>
        <div className="flex flex-wrap gap-1">
          <Chip active={auditFilter === 'all'} onClick={() => setAuditFilter('all')}>All</Chip>
          {grants.map((g) => (
            <Chip key={g.grant_id} active={auditFilter === g.grant_id}
              onClick={() => setAuditFilter(g.grant_id)}>{g.client_name}</Chip>
          ))}
          <Chip active={auditFilter === 'pat'} onClick={() => setAuditFilter('pat')}>Personal tokens</Chip>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl bg-white ring-1 ring-cloud/70">
        {audit.length === 0 && (
          <p className="p-5 text-sm text-smoke">Nothing yet.</p>
        )}
        {audit.map((r, idx) => {
          const src = sourceLabel(r)
          const kid = kidForRow(r)
          const sentence = describeTool(r.tool_name, kid)
          const ok = statusOk(r.status)
          return (
            <div
              key={r.id}
              className={`flex items-center gap-3 px-4 py-3 ${idx < audit.length - 1 ? 'border-b border-cloud/70' : ''}`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: ok ? '#639922' : '#B42318' }}
                aria-label={ok ? 'success' : 'failed'}
              />
              <div className="min-w-0 flex-1 text-[13px]">
                <span className="font-semibold">{src.name}</span>
                {src.tag && (
                  <span
                    className="ml-1.5 rounded px-1.5 py-0.5 text-[11px] text-smoke"
                    style={{ background: '#EAEEF3' }}
                  >
                    {src.tag}
                  </span>
                )}{' '}
                <span className="text-smoke">{sentence}</span>
              </div>
              <span className="shrink-0 text-xs text-smoke" title={new Date(r.created_at).toLocaleString()}>
                {prettyTime(r.created_at)}
              </span>
            </div>
          )
        })}
      </div>

      <div className="py-2 text-center">
        <button
          type="button"
          className="text-xs text-smoke hover:text-ink"
          onClick={() => setAuditLimit((n) => n + 50)}
        >
          Load more activity →
        </button>
      </div>

      {/* ---------- PERSONAL ACCESS TOKENS (collapsed advanced) ---------- */}
      <div className="mt-8">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 text-left ring-1 ring-cloud/70 transition hover:bg-cream/30"
          aria-expanded={showPatSection}
          onClick={() => setShowPatSection((v) => !v)}
        >
          <div className="flex items-center gap-3">
            {showPatSection ? (
              <IconChevronDown className="h-3.5 w-3.5 text-smoke" />
            ) : (
              <IconChevronRight className="h-3.5 w-3.5 text-smoke" />
            )}
            <span className="text-sm font-semibold">Personal access tokens</span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px]"
              style={{ background: '#EAEEF3', color: '#475569' }}
            >
              advanced
            </span>
          </div>
          <span className="text-xs text-smoke">For developers and custom MCP clients</span>
        </button>

        {showPatSection && (
          <div className="mt-2 rounded-2xl bg-white p-5 ring-1 ring-cloud/70">
            <p className="text-xs text-smoke">
              For scripts, CI, or your own tooling. Most people don&apos;t need these — the agent
              connections above are easier.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-sm">
                <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Label</span>
                <input
                  className="w-56 rounded-xl border border-cloud bg-paper px-3 py-2 text-sm text-ink focus:border-sky focus:outline-none"
                  value={label} maxLength={50} onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label className="flex flex-col text-sm">
                <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">Expires in</span>
                <select
                  className="w-40 rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none"
                  value={expiresDays} onChange={(e) => setExpiresDays(Number(e.target.value))}
                >
                  {EXPIRY_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </label>
              <button
                type="button"
                className="btn-primary text-sm disabled:opacity-50"
                disabled={creating || !label.trim()}
                onClick={() => void handleGenerate()}
              >
                {creating ? 'Generating…' : 'Generate token'}
              </button>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
              Show revoked
            </label>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-widest text-smoke">
                  <tr>
                    <th className="py-2 pr-3">Label</th>
                    <th className="py-2 pr-3">Last 4</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 pr-3">Expires</th>
                    <th className="py-2 pr-3">Last used</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud/70">
                  {visibleTokens.length === 0 && (
                    <tr><td colSpan={6} className="py-3 text-ink/60">No tokens yet.</td></tr>
                  )}
                  {visibleTokens.map((t) => (
                    <tr key={t.id} className={t.revoked_at ? 'text-ink/40' : ''}>
                      <td className="py-2 pr-3">
                        {t.label}
                        {t.revoked_at && (
                          <span className="ml-2 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink/60">
                            revoked
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">…{t.token_last4}</td>
                      <td className="py-2 pr-3">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">{new Date(t.expires_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : '—'}</td>
                      <td className="py-2 text-right">
                        {!t.revoked_at && (
                          <button type="button" className="btn-ghost text-xs"
                            onClick={() => void handleRevokeToken(t.id)}>Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ---------- MODALS ---------- */}
      {showConnectModal && (
        <Modal onClose={() => setShowConnectModal(false)} titleId="connect-modal-title" title="Connect a new agent">
          <p className="text-sm text-smoke">
            Use this URL in your AI client&apos;s connector / MCP setup. Sign in here when prompted
            and click Allow on the consent screen.
          </p>
          <div className="mt-3 break-all rounded-xl bg-cream px-3 py-2 font-mono text-xs ring-1 ring-cloud">
            {MCP_URL}
          </div>
          <h4 className="mt-5 text-sm font-semibold">Claude.ai</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink/80">
            <li>Claude.ai → Settings → Connectors → Add custom connector.</li>
            <li>Name: &quot;MAP Practice&quot; (or anything memorable).</li>
            <li>Paste the URL above as the Remote MCP server URL.</li>
            <li>Leave OAuth Client ID / Secret blank — registration is automatic.</li>
            <li>Click Add. Sign in here, then Allow.</li>
          </ol>
          <h4 className="mt-4 text-sm font-semibold">ChatGPT</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink/80">
            <li>ChatGPT → Settings → Connectors → Add custom connector.</li>
            <li>Paste the same URL above.</li>
            <li>Sign in to MAP Practice when prompted, then Allow.</li>
          </ol>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => void navigator.clipboard.writeText(MCP_URL)}
            >
              Copy URL
            </button>
            <button type="button" className="btn-primary text-sm" onClick={() => setShowConnectModal(false)}>
              Done
            </button>
          </div>
        </Modal>
      )}

      {permsForGrant && (
        <Modal
          onClose={() => setPermsForGrant(null)}
          titleId="perms-modal-title"
          title={`What ${permsForGrant.client_name} can do`}
        >
          <p className="text-sm text-smoke">
            This agent is scoped to your family only and cannot see other families&apos; data.
            Below is the full set of tools it can call.
          </p>
          {PERMISSION_GROUPS.map((g) => (
            <div key={g.title} className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-smoke">{g.title}</h4>
              <ul className="mt-2 space-y-1.5 text-sm">
                {g.items.map((it) => (
                  <li key={it.name} className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-leaf/70" />
                    <div>
                      <span className="font-mono text-[11px] text-ink/70">{it.name}</span>
                      <span className="ml-2 text-ink/80">{it.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="mt-5 flex justify-end">
            <button type="button" className="btn-primary text-sm" onClick={() => setPermsForGrant(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {reveal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
          role="dialog" aria-modal="true" aria-labelledby="reveal-modal-title"
          tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') setReveal(null); }}
        >
          <div className="card w-full max-w-lg space-y-4 p-5">
            <h3 id="reveal-modal-title" className="font-display text-2xl">Your token (shown only once)</h3>
            <p className="text-xs font-semibold uppercase tracking-widest text-smoke">Token</p>
            <div className="break-all rounded-xl bg-cream px-3 py-2 font-mono text-xs ring-1 ring-cloud">
              {reveal.plaintext}
            </div>
            <p className="rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
              This is the only time you&apos;ll see this token. Copy it now.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs"
                onClick={() => void navigator.clipboard.writeText(reveal.plaintext)}>Copy token</button>
              <button type="button" className="btn-primary ml-auto text-sm"
                onClick={() => setReveal(null)}>I&apos;ve copied it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- helpers ---------- */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] transition ${
        active ? 'font-semibold text-ink' : 'text-smoke hover:text-ink'
      }`}
      style={active ? { background: '#EAEEF3' } : undefined}
    >
      {children}
    </button>
  )
}

function Modal({
  title, titleId, children, onClose,
}: { title: string; titleId: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div className="card w-full max-w-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <h3 id={titleId} className="font-display text-xl">{title}</h3>
          <button
            type="button"
            className="btn-ghost px-2 text-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  )
}
