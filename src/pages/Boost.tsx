import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { createBoostSession } from '../lib/sessionBuilder'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errorMessage'
import type { MisconceptionSignal, MisconceptionTag } from '../lib/types'

interface BoostCard {
  signal: MisconceptionSignal
  tag: MisconceptionTag
}

export default function Boost() {
  const navigate = useNavigate()
  const { activeStudent } = useActiveStudent()
  const [cards, setCards] = useState<BoostCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startingTag, setStartingTag] = useState<string | null>(null)

  useEffect(() => {
    if (!activeStudent) return
    void (async () => {
      const { data, error: e } = await supabase
        .from('map_misconception_signals')
        .select('*, tag:map_misconception_tags(*)')
        .eq('student_id', activeStudent.id)
        .eq('active', true)
        .gte('occurrence_count', 3)
        .order('occurrence_count', { ascending: false })
      if (e) {
        setError(e.message)
        return
      }
      const rows = (data ?? []) as Array<MisconceptionSignal & { tag: MisconceptionTag }>
      const filtered = rows
        .filter((r) => r.tag && r.tag.tag !== '_misc_other' && r.tag.child_cta)
        .map((r) => ({ signal: r, tag: r.tag }))
      setCards(filtered)
    })()
  }, [activeStudent])

  const handleStart = async (tag: string) => {
    if (!activeStudent) return
    setStartingTag(tag)
    try {
      const sessionId = await createBoostSession(tag, activeStudent.id)
      navigate(`/test/${sessionId}`)
    } catch (e: unknown) {
      const msg = errorMessage(e, 'Could not start a boost.')
      setError(msg)
      setStartingTag(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mt-4 animate-slideUp">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">
          Boost practice
        </p>
        <h1 className="font-display text-5xl">⚡ Power-up time</h1>
        <p className="mt-2 max-w-xl text-base text-ink/70">
          Short 10-question practice sets to build a specific skill stronger.
        </p>
      </header>

      {error && (
        <div className="mt-6 rounded-2xl bg-berry/10 p-4 ring-1 ring-berry/30">
          <p className="font-semibold text-ink">{error}</p>
        </div>
      )}

      {cards === null && !error && (
        <p className="mt-12 text-center font-display text-xl text-ink/60">Loading…</p>
      )}

      {cards !== null && cards.length === 0 && !error && (
        <section className="mt-10 animate-slideUp">
          <div className="card p-10 text-center">
            <p className="text-6xl">🌟</p>
            <h2 className="mt-3 font-display text-3xl">
              No boost practice needed right now.
            </h2>
            <p className="mt-2 text-base text-ink/70">You're doing great!</p>
            <Link to="/" className="btn-primary mt-6">
              Back home
            </Link>
          </div>
        </section>
      )}

      {cards !== null && cards.length > 0 && (
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {cards.map(({ signal, tag }) => {
            const subjectAccent =
              tag.subject === 'math' ? 'from-sky/15 to-sky/5' : 'from-leaf/15 to-leaf/5'
            const subjectIcon =
              tag.subject === 'math' ? '➕' : tag.subject === 'language' ? '✏️' : '📖'
            const isStarting = startingTag === tag.tag
            return (
              <button
                key={tag.tag}
                type="button"
                onClick={() => void handleStart(tag.tag)}
                disabled={isStarting}
                className={`card group relative overflow-hidden p-5 text-left transition hover:-translate-y-0.5 hover:shadow-cardHover disabled:opacity-60`}
              >
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${subjectAccent} opacity-60`}
                />
                <div className="relative flex items-start gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-cream text-3xl shadow-card">
                    {subjectIcon}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-widest text-smoke">
                      {tag.subject} skill
                    </p>
                    <h3 className="mt-0.5 font-display text-2xl leading-tight">
                      {tag.child_cta ?? tag.display_name}?
                    </h3>
                    <p className="mt-3 inline-flex items-center gap-1 font-display text-sun">
                      {isStarting ? 'Starting…' : '⚡ Start 10-question boost →'}
                    </p>
                    <p className="mt-2 text-xs text-ink/50">
                      We've seen this come up {signal.occurrence_count} times
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </section>
      )}

      <section className="mt-10 text-center text-sm text-ink/50">
        <Link to="/" className="underline-offset-4 hover:underline">
          ← Back to home
        </Link>
      </section>
    </div>
  )
}
