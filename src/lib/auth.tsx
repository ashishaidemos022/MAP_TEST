import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// supabase-js stores the session in localStorage by default. The server-side
// OAuth handlers in api/_lib/oauth/session.ts read the session from a cookie
// named sb-<project-ref>-auth-token, so we mirror the localStorage session
// into that cookie on every auth state change.
function projectRefFromUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) return ''
  try { return new URL(url).hostname.split('.')[0] ?? '' }
  catch { return '' }
}

function syncSessionCookie(s: Session | null): void {
  const ref = projectRefFromUrl()
  if (!ref) return
  const name = `sb-${ref}-auth-token`
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  if (!s) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
    return
  }
  // Array form matches api/_lib/oauth/session.ts:extractAccessToken array path.
  // Five elements mirror what supabase's getSession() returns when serialized.
  const value = encodeURIComponent(JSON.stringify([
    s.access_token, s.refresh_token, null, null, null,
  ]))
  // 1h matches access-token TTL; refreshes will rotate the cookie via onAuthStateChange.
  document.cookie = `${name}=${value}; Path=/; Max-Age=3600; SameSite=Lax${secure}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      syncSessionCookie(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      syncSessionCookie(s)
      setLoading(false)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    // Drop the parent-area unlock flag — otherwise a different family member
    // signing in next on the same tab would walk straight into the parent
    // dashboard without a PIN check.
    const { lockParentArea } = await import('./parentPin')
    lockParentArea()
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-ink/50">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}
