import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { createSession } from '../lib/sessionBuilder'
import { createCustomTestFromMyBank, NoQuestionsError } from '../lib/customTest'
import type { Subject } from '../lib/types'

export default function NewTest() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { activeStudent } = useActiveStudent()
  const subject = (params.get('subject') ?? 'math') as Subject
  // Phase 4 Cycle 2: ?source=mine builds a test from the family's published
  // custom-question bank rather than the vetted/adaptive pickers.
  const source = params.get('source') ?? 'vetted'
  const requestedCount = Number(params.get('count') ?? '10')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeStudent) return
    let active = true
    void (async () => {
      try {
        let id: string
        if (source === 'mine') {
          const result = await createCustomTestFromMyBank({
            studentId: activeStudent.id,
            subject,
            requestedCount,
          })
          id = result.sessionId
        } else {
          id = await createSession(subject, activeStudent.id)
        }
        if (!active) return
        navigate(`/test/${id}`, { replace: true })
      } catch (e: unknown) {
        if (!active) return
        if (e instanceof NoQuestionsError) {
          setError(
            `No published custom ${subject} questions in your family bank yet. Have your AI agent author + publish some first (any grade — custom questions aren't grade-filtered).`,
          )
        } else {
          // supabase-js PostgrestError is a plain object, not an Error
          // instance. Read .message / .details from any object shape so the
          // real reason (RLS, FK, CHECK violation, etc.) surfaces to the
          // parent instead of a generic fallback string.
          let msg = 'Could not start a test.'
          if (e instanceof Error) {
            msg = e.message
          } else if (e && typeof e === 'object') {
            const o = e as { message?: string; details?: string; hint?: string; code?: string }
            msg = [o.message, o.details, o.hint, o.code].filter(Boolean).join(' — ') || msg
          }
          console.error('[NewTest] start failed:', e)
          setError(msg)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [subject, source, requestedCount, navigate, activeStudent])

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
