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

type AuditRow = {
  id: number
  tool_name: string
  status: string
  created_at: string
}

const MCP_URL = `${import.meta.env.VITE_PUBLIC_BASE_URL ?? window.location.origin}/api/mcp`
const EXPIRY_OPTIONS = [30, 90, 180, 365]

export default function ConnectAi() {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [showRevoked, setShowRevoked] = useState(false)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [auditLimit, setAuditLimit] = useState(50)
  const [label, setLabel] = useState('Claude.ai')
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

  async function loadAudit() {
    const { data, error: e } = await supabase
      .from('map_mcp_audit')
      .select('id, tool_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(auditLimit)
    if (e) setError(e.message)
    else setAudit((data ?? []) as AuditRow[])
  }

  useEffect(() => {
    void loadTokens()
    void loadAudit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditLimit])

  async function handleGenerate() {
    setCreating(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('map_create_mcp_token', {
      p_label: label,
      p_expires_days: expiresDays,
    })
    setCreating(false)
    if (e) {
      setError(e.message)
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.plaintext_token) {
      setError('No token returned')
      return
    }
    setReveal({ plaintext: row.plaintext_token, tokenId: row.token_id })
    void loadTokens()
  }

  async function handleRevoke(id: string) {
    if (!window.confirm('Revoke this token? Any AI agent using it will lose access immediately.')) {
      return
    }
    const { error: e } = await supabase.rpc('map_revoke_mcp_token', { p_token_id: id })
    if (e) setError(e.message)
    else void loadTokens()
  }

  const visibleTokens = useMemo(
    () => tokens.filter((t) => showRevoked || !t.revoked_at),
    [tokens, showRevoked],
  )

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <p className="font-display text-lg uppercase tracking-widest text-smoke">
            Parent view
          </p>
          <h1 className="font-display text-4xl">Connect AI</h1>
        </div>
        <Link to="/parent" className="btn-ghost text-sm">
          Back to parent view
        </Link>
      </header>

      <section className="card mb-6 p-5">
        <h2 className="font-display text-xl">How this works</h2>
        <p className="mt-1 text-sm text-ink/70">
          Generate a token to let Claude (or another AI agent) read your family&apos;s practice
          data. The agent can read but cannot change anything. Tokens expire after 90 days by
          default. You can revoke a token at any time.
        </p>
      </section>

      <section className="card mb-6 p-5">
        <header>
          <h2 className="font-display text-xl">Generate a token</h2>
          <p className="text-xs text-ink/60">
            Pick a label (something memorable, like &quot;Claude.ai&quot;) and an expiry window.
          </p>
        </header>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">
              Label
            </span>
            <input
              className="w-56 rounded-xl border border-cloud bg-paper px-3 py-2 text-sm text-ink focus:border-sky focus:outline-none"
              value={label}
              maxLength={50}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-widest text-smoke">
              Expires in
            </span>
            <select
              className="w-40 rounded-xl border border-cloud bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-sky focus:outline-none"
              value={expiresDays}
              onChange={(e) => setExpiresDays(Number(e.target.value))}
            >
              {EXPIRY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
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
        {error && (
          <p className="mt-3 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
            {error}
          </p>
        )}
      </section>

      <section className="card mb-6 p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Active tokens</h2>
            <p className="text-xs text-ink/60">
              Showing the last 4 characters only. Revoking is instant.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={showRevoked}
              onChange={(e) => setShowRevoked(e.target.checked)}
            />
            Show revoked
          </label>
        </header>
        <div className="mt-4 overflow-x-auto">
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
                <tr>
                  <td colSpan={6} className="py-3 text-ink/60">
                    No tokens yet.
                  </td>
                </tr>
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
                  <td className="py-2 pr-3">
                    {t.last_used_at ? new Date(t.last_used_at).toLocaleString() : '—'}
                  </td>
                  <td className="py-2 text-right">
                    {!t.revoked_at && (
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => void handleRevoke(t.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card mb-6 p-5">
        <header>
          <h2 className="font-display text-xl">Recent activity</h2>
          <p className="text-xs text-ink/60">
            Every read by an AI agent is logged here. Nothing else can write.
          </p>
        </header>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-widest text-smoke">
              <tr>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Tool</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud/70">
              {audit.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-ink/60">
                    Nothing yet.
                  </td>
                </tr>
              )}
              {audit.map((r) => (
                <tr key={r.id}>
                  <td className="py-1 pr-3 font-mono text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="py-1 pr-3 font-mono text-xs">{r.tool_name}</td>
                  <td className="py-1 pr-3 text-xs">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="btn-ghost mt-3 text-xs"
          onClick={() => setAuditLimit((n) => n + 50)}
        >
          Load 50 more
        </button>
      </section>

      <section className="card mb-6 p-5">
        <header>
          <h2 className="font-display text-xl">Connect with Claude</h2>
          <p className="text-xs text-ink/60">
            Steps to wire up a generated token in Claude.ai.
          </p>
        </header>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink/80">
          <li>Open Claude.ai → Settings → Custom Integrations → Add custom integration.</li>
          <li>
            Paste this server URL:{' '}
            <code className="rounded bg-cream px-1.5 py-0.5 font-mono text-xs ring-1 ring-cloud">
              {MCP_URL}
            </code>
          </li>
          <li>
            When prompted for an Authorization header, paste{' '}
            <code className="rounded bg-cream px-1.5 py-0.5 font-mono text-xs ring-1 ring-cloud">
              Bearer &lt;your-token&gt;
            </code>
            .
          </li>
          <li>
            Save. Test with: <em>&ldquo;What kids are in my family?&rdquo;</em>
          </li>
        </ol>
      </section>

      {reveal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reveal-modal-title"
          tabIndex={-1}
          onKeyDown={(e) => { if (e.key === 'Escape') setReveal(null); }}
        >
          <div className="card w-full max-w-lg space-y-4 p-5">
            <h3 id="reveal-modal-title" className="font-display text-2xl">Your token (shown only once)</h3>
            <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
              Token
            </p>
            <div className="break-all rounded-xl bg-cream px-3 py-2 font-mono text-xs ring-1 ring-cloud">
              {reveal.plaintext}
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
              Server URL
            </p>
            <div className="break-all rounded-xl bg-cream px-3 py-2 font-mono text-xs ring-1 ring-cloud">
              {MCP_URL}
            </div>
            <p className="rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
              This is the only time you&apos;ll see this token. Copy it now.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => void navigator.clipboard.writeText(reveal.plaintext)}
              >
                Copy token
              </button>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => void navigator.clipboard.writeText(MCP_URL)}
              >
                Copy URL
              </button>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    `URL: ${MCP_URL}\nToken: ${reveal.plaintext}`,
                  )
                }
              >
                Copy both
              </button>
              <button
                type="button"
                className="btn-primary ml-auto text-sm"
                onClick={() => setReveal(null)}
              >
                I&apos;ve copied it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
