import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { createSession } from '../lib/sessionBuilder'
import type { Subject } from '../lib/types'

export default function NewTest() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { activeStudent } = useActiveStudent()
  const subject = (params.get('subject') ?? 'math') as Subject
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeStudent) return
    let active = true
    void (async () => {
      try {
        const id = await createSession(subject, activeStudent.id)
        if (!active) return
        navigate(`/test/${id}`, { replace: true })
      } catch (e: unknown) {
        if (!active) return
        const msg = e instanceof Error ? e.message : 'Could not start a test.'
        setError(msg)
      }
    })()
    return () => {
      active = false
    }
  }, [subject, navigate, activeStudent])

  return (
    <div className="mx-auto max-w-2xl text-center">
      {error ? (
        <div className="card mt-12 p-8">
          <p className="font-display text-2xl">Hmm — couldn’t start that test.</p>
          <p className="mt-2 text-sm text-ink/60">{error}</p>
          <Link to="/" className="btn-primary mt-6">
            Back home
          </Link>
        </div>
      ) : (
        <div className="card mt-12 p-10">
          <p className="font-display text-3xl">Building your {subject} test…</p>
          <div className="mx-auto mt-6 h-2 w-48 overflow-hidden rounded-full bg-cream">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-sun" />
          </div>
        </div>
      )}
    </div>
  )
}
