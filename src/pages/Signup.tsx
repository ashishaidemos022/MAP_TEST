import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const PASSWORD_MIN = 10

export default function Signup() {
  const { user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (loading) return null
  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`)
      return
    }
    if (password !== passwordConfirm) {
      setError('The two passwords do not match. Try again.')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: e1 } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })
    setSubmitting(false)
    if (e1) {
      setError(e1.message)
      return
    }
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <div className="mx-auto mt-12 max-w-md">
        <div className="card p-8 text-center">
          <p className="text-5xl">📬</p>
          <h1 className="mt-3 font-display text-3xl">Check your email</h1>
          <p className="mt-3 text-sm text-ink/70">
            We sent a confirmation link to <span className="font-semibold">{sentTo}</span>. Click
            it, then come back here and sign in.
          </p>
          <Link to="/login" className="btn-primary mt-6 inline-block">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  const passwordsMatch = password.length > 0 && password === passwordConfirm

  return (
    <div className="mx-auto mt-12 max-w-md">
      <div className="card p-8">
        <h1 className="font-display text-3xl">Create account</h1>
        <p className="mt-2 text-sm text-ink/60">
          One account per family. Each kid gets their own profile inside.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
            <span className="font-semibold text-ink/80">
              Password <span className="text-ink/40">(at least {PASSWORD_MIN} characters)</span>
            </span>
            <input
              type="password"
              required
              minLength={PASSWORD_MIN}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-cloud bg-paper px-4 py-3 focus:border-sky focus:outline-none"
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-ink/80">Confirm password</span>
            <input
              type="password"
              required
              minLength={PASSWORD_MIN}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-cloud bg-paper px-4 py-3 focus:border-sky focus:outline-none"
              autoComplete="new-password"
            />
            {passwordConfirm.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-xs text-berry">Passwords do not match yet.</p>
            )}
          </label>
          <button
            type="submit"
            disabled={
              submitting || !email || password.length < PASSWORD_MIN || !passwordsMatch
            }
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-ink/60">
          Already have an account?{' '}
          <Link to="/login" className="text-sky hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
