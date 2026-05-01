import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './auth'
import { supabase } from './supabase'

// Per-tab unlock flag. Lives in module scope so it persists across React route
// changes within a single tab — but resets on full page reload, on a new tab,
// and on sign out. We deliberately do NOT use localStorage: a kid loading the
// tab from a parent's still-warm session shouldn't get free access. The
// trade-off (parent re-types the PIN once per tab) is the right one for a
// kid-shared device.
let unlockedAt: number | null = null
const UNLOCK_TTL_MS = 30 * 60 * 1000 // 30 minutes within the same tab
const MAX_ATTEMPTS = 5

function isUnlocked(): boolean {
  if (unlockedAt == null) return false
  return Date.now() - unlockedAt < UNLOCK_TTL_MS
}

function markUnlocked() {
  unlockedAt = Date.now()
}

/** Reset the unlock — call from sign-out flows so a re-sign-in still requires
 * the PIN. Currently exported but not yet wired into the auth provider; safe
 * to call any time. */
export function lockParentArea() {
  unlockedAt = null
}

interface RequireParentPinProps {
  children: ReactNode
}

export function RequireParentPin({ children }: RequireParentPinProps) {
  const { user } = useAuth()
  const [unlocked, setUnlocked] = useState<boolean>(isUnlocked())

  // Re-evaluate on mount/route change in case another tab unlocked (won't),
  // or in case the TTL expired since the last render.
  useEffect(() => {
    setUnlocked(isUnlocked())
  }, [])

  if (unlocked) return <>{children}</>
  return (
    <PinGate
      onSuccess={() => {
        markUnlocked()
        setUnlocked(true)
      }}
      hasUser={!!user}
    />
  )
}

function PinGate({ onSuccess, hasUser }: { onSuccess: () => void; hasUser: boolean }) {
  const [pin, setPin] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const lockedOut = attempts >= MAX_ATTEMPTS

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (lockedOut || submitting) return
    setError(null)
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN is 4 to 8 digits.')
      return
    }
    setSubmitting(true)
    const { data, error: rpcErr } = await supabase.rpc('map_verify_parent_pin', { p_pin: pin })
    setSubmitting(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    if (data === true) {
      setPin('')
      onSuccess()
      return
    }
    const next = attempts + 1
    setAttempts(next)
    setPin('')
    if (next >= MAX_ATTEMPTS) {
      setError('Too many wrong PINs. Reload the page to try again.')
    } else {
      setError(`Wrong PIN. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? '' : 's'} left.`)
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-8">
        <p className="font-display text-xs uppercase tracking-widest text-smoke">Parent area</p>
        <h1 className="mt-1 font-display text-3xl">Enter your parent PIN</h1>
        <p className="mt-2 text-sm text-ink/60">
          The PIN keeps grown-up settings, dashboards, and custom tests private from your kid.
        </p>

        {!hasUser && (
          <p className="mt-3 rounded-xl bg-sun/15 px-3 py-2 text-sm text-ink/80 ring-1 ring-sun/40">
            You need to be signed in. <Link to="/login" className="underline">Sign in →</Link>
          </p>
        )}

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="sr-only">Parent PIN</span>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="\d{4,8}"
              autoComplete="off"
              required
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              disabled={lockedOut || submitting}
              className="w-full rounded-2xl border border-cloud bg-paper px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] focus:border-sky focus:outline-none disabled:opacity-50"
            />
          </label>
          {error && (
            <p className="rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={lockedOut || submitting || pin.length < 4}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Checking…' : 'Unlock parent area'}
          </button>
          <Link to="/" className="btn-ghost block w-full text-center text-sm">
            Cancel
          </Link>
        </form>

        <p className="mt-5 text-xs text-ink/40">
          Forgot your PIN? Sign out and back in to reset it from onboarding.
        </p>
      </div>
    </div>
  )
}
