import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

// Reads ?return_to=<URL> and validates it. Only same-origin same-protocol
// targets are honored (defends against open-redirect). Returns null if the
// param is missing or unsafe.
function readReturnTo(search: string): string | null {
  const params = new URLSearchParams(search)
  const raw = params.get('return_to')
  if (!raw) return null
  try {
    const u = new URL(raw, window.location.origin)
    if (u.origin !== window.location.origin) return null
    return u.pathname + u.search + u.hash
  } catch {
    return null
  }
}

export default function Login() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return null
  if (user) {
    // OAuth flow attaches ?return_to=… to bring the parent back to the
    // /api/oauth/authorize URL after sign-in. Honor it before falling back
    // to location.state (used by RequireAuth) and finally /.
    const returnTo = readReturnTo(location.search)
    if (returnTo) {
      window.location.replace(returnTo)
      return null
    }
    const dest =
      (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'
    return <Navigate to={dest} replace />
  }

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (e1) {
      setError(e1.message)
      return
    }
    const returnTo = readReturnTo(location.search)
    if (returnTo) {
      window.location.replace(returnTo)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="mx-auto mt-12 max-w-md">
      <div className="card p-8">
        <h1 className="font-display text-3xl">Sign in</h1>
        <p className="mt-2 text-sm text-ink/60">Sign in to manage your family.</p>

        <form onSubmit={handleEmailLogin} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="font-semibold text-ink/80">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-cloud bg-paper px-4 py-3 focus:border-sky focus:outline-none"
              autoComplete="email"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-ink/80">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-cloud bg-paper px-4 py-3 focus:border-sky focus:outline-none"
              autoComplete="current-password"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-ink/60">
          New here?{' '}
          <Link to="/signup" className="text-sky hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
