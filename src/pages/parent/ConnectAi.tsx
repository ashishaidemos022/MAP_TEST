import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

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

export default function ConnectAi() {
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
      .select('id, tool_name, status, created_at, auth_kind, grant_id')
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

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <p className="font-display text-lg uppercase tracking-widest text-smoke">Parent view</p>
          <h1 className="font-display text-4xl">Connect AI</h1>
        </div>
        <Link to="/parent" className="btn-ghost text-sm">Back to parent view</Link>
      </header>

      {error && (
        <p className="mb-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
          {error}
        </p>
      )}

      {/* SECTION 1: Authorized agents */}
      <section className="card mb-6 p-5">
        <header>
          <h2 className="font-display text-xl">Authorized agents</h2>
          <p className="text-xs text-ink/60">
            AI agents you've authorized to read your family's data.{' '}
            <span className="text-ink/50">
              Removing a connector inside Claude.ai or ChatGPT doesn't always notify us — click
              Revoke to fully disconnect.
            </span>
          </p>
        </header>
        <div className="mt-4 space-y-2">
          {grants.length === 0 && (
            <p className="text-sm text-ink/60">
              No agents authorized yet. To connect Claude.ai or ChatGPT, see instructions below.
            </p>
          )}
          {grants.map((g) => {
            const lastUsedMs = g.last_used_at ? new Date(g.last_used_at).getTime() : 0
            const isActive = lastUsedMs > 0 && Date.now() - lastUsedMs < ACTIVE_WINDOW_MS
            return (
              <div key={g.grant_id} className="flex items-center justify-between rounded-xl border border-cloud bg-paper px-3 py-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'bg-leaf' : 'bg-ink/20'}`}
                    title={isActive ? 'Active — used in the last 24 hours' : 'Inactive — no activity in the last 24 hours'}
                    aria-label={isActive ? 'Active' : 'Inactive'}
                  />
                  <div>
                    <p className="font-semibold">
                      {g.client_name}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${isActive ? 'bg-leaf/15 text-leaf' : 'bg-cloud text-ink/60'}`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                    <p className="text-xs text-ink/60">
                      Connected {new Date(g.created_at).toLocaleDateString()} · Last used{' '}
                      <span title={g.last_used_at ? new Date(g.last_used_at).toLocaleString() : ''}>
                        {g.last_used_at ? formatRelative(g.last_used_at) : 'never'}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => void handleRevokeGrant(g.grant_id, g.client_name)}
                >
                  Revoke
                </button>
              </div>
            )
          })}
        </div>
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-semibold">How to connect Claude.ai</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink/80">
            <li>Claude.ai → Settings → Connectors → Add custom connector.</li>
            <li>Name: "MAP Practice" (or anything memorable).</li>
            <li>
              Remote MCP server URL:{' '}
              <code className="rounded bg-cream px-1.5 py-0.5 font-mono text-xs ring-1 ring-cloud">{MCP_URL}</code>
            </li>
            <li>Leave OAuth Client ID / Secret blank — registration is automatic.</li>
            <li>Click Add. Sign in here when prompted, then click Allow on the consent screen.</li>
          </ol>
        </details>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold">How to connect ChatGPT</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink/80">
            <li>ChatGPT → Settings → Connectors → Add custom connector.</li>
            <li>Paste the same URL above.</li>
            <li>Sign in to MAP Practice when prompted, then Allow.</li>
          </ol>
        </details>
      </section>

      {/* SECTION 1.5 — launch a test from the AI-authored bank */}
      <section className="card mb-6 p-5">
        <header>
          <h2 className="font-display text-xl">Launch a test from your AI questions</h2>
          <p className="text-xs text-ink/60">
            Build a one-off test using only the published custom questions in your family&apos;s bank.
            (Your AI must publish drafts — ask it: &ldquo;publish all my drafts&rdquo;.)
          </p>
        </header>
        <div className="mt-4 flex flex-wrap gap-2">
          {(['math', 'reading', 'language'] as const).map((subj) => (
            <Link
              key={subj}
              to={`/test/new?subject=${subj}&source=mine&count=10`}
              className="btn-secondary text-sm"
            >
              {subj === 'math' ? '🧮' : subj === 'reading' ? '📖' : '✏️'}{' '}
              {subj.charAt(0).toUpperCase() + subj.slice(1)} — 10 questions
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink/50">
          The test draws from <code>map_custom_questions</code> where{' '}
          <code>status = published</code> for your kid&apos;s practice grade.
          Reading mode pulls whole passages.
        </p>
      </section>

      {/* SECTION 2: Personal access tokens (collapsible) */}
      <section className="card mb-6 p-5">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          aria-expanded={showPatSection}
          onClick={() => setShowPatSection((v) => !v)}
        >
          <span className="font-display text-xl">Personal access tokens (advanced)</span>
          <span className="text-sm text-ink/60">{showPatSection ? '▾ Hide' : '▸ Show'}</span>
        </button>
        {showPatSection && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-ink/60">
              For scripts, CI, or your own tooling. Most people don't need these — the agent
              connections above are easier.
            </p>
            <div className="flex flex-wrap items-end gap-3">
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
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
              Show revoked
            </label>
            <div className="overflow-x-auto">
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
      </section>

      {/* SECTION 3: Recent activity */}
      <section className="card mb-6 p-5">
        <header>
          <h2 className="font-display text-xl">Recent activity</h2>
          <p className="text-xs text-ink/60">
            Every read by an AI agent is logged here. Nothing else can write.
          </p>
        </header>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip active={auditFilter === 'all'} onClick={() => setAuditFilter('all')}>All</Chip>
          {grants.map((g) => (
            <Chip key={g.grant_id} active={auditFilter === g.grant_id}
                  onClick={() => setAuditFilter(g.grant_id)}>{g.client_name}</Chip>
          ))}
          <Chip active={auditFilter === 'pat'} onClick={() => setAuditFilter('pat')}>Personal tokens</Chip>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-widest text-smoke">
              <tr>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Tool</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud/70">
              {audit.length === 0 && (
                <tr><td colSpan={4} className="py-3 text-ink/60">Nothing yet.</td></tr>
              )}
              {audit.map((r) => (
                <tr key={r.id}>
                  <td className="py-1 pr-3 font-mono text-xs">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-1 pr-3 text-xs">
                    {r.auth_kind === 'pat' ? 'PAT' :
                      grants.find((g) => g.grant_id === r.grant_id)?.client_name ?? 'OAuth'}
                  </td>
                  <td className="py-1 pr-3 font-mono text-xs">{r.tool_name}</td>
                  <td className="py-1 pr-3 text-xs">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-ghost mt-3 text-xs"
                onClick={() => setAuditLimit((n) => n + 50)}>Load 50 more</button>
      </section>

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
              This is the only time you'll see this token. Copy it now.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs"
                      onClick={() => void navigator.clipboard.writeText(reveal.plaintext)}>Copy token</button>
              <button type="button" className="btn-primary ml-auto text-sm"
                      onClick={() => setReveal(null)}>I've copied it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-ink bg-ink text-paper' : 'border-cloud bg-paper text-ink/70'}`}>
      {children}
    </button>
  )
}
