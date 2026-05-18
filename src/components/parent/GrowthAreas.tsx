// src/components/parent/GrowthAreas.tsx
// Presentational. Markup copied verbatim from the legacy ParentDashboard
// "Active areas of weakness" card — no redesign.
import type { SignalWithTag } from './useKidDashboardData'

export function GrowthAreas({ signals }: { signals: SignalWithTag[] }) {
  const activeSignals = signals.filter((s) => s.active && s.tag)
  const clearedSignals = signals.filter((s) => !s.active && s.tag)

  return (
    <div className="card p-5">
      <header className="mb-4">
        <h2 className="font-display text-2xl">Active areas of weakness</h2>
        <p className="text-xs text-ink/60">
          Patterns the student has gotten wrong at least 3 times. Sorted by frequency.
          These are the only places the word "weakness" is used in the app — never shown to
          the student.
        </p>
      </header>
      {activeSignals.length === 0 ? (
        <p className="rounded-2xl bg-leaf/10 p-4 text-sm text-ink/80 ring-1 ring-leaf/30">
          No active weakness signals right now. The student is clearing misconceptions or
          hasn’t accumulated enough evidence yet.
        </p>
      ) : (
        <div className="space-y-3">
          {activeSignals.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      )}
      {clearedSignals.length > 0 && (
        <details className="mt-5 rounded-2xl bg-cream/60 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            {clearedSignals.length} cleared signal
            {clearedSignals.length === 1 ? '' : 's'} (history)
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-ink/70">
            {clearedSignals.map((s) => (
              <li key={s.id}>
                <span className="font-semibold">{s.tag?.display_name}</span> — cleared{' '}
                {s.cleared_at && new Date(s.cleared_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function SignalCard({ signal }: { signal: SignalWithTag }) {
  const tag = signal.tag!
  const lastSeen = new Date(signal.last_seen_at).toLocaleDateString()
  return (
    <div className="rounded-2xl border border-sun/30 bg-sun/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg leading-snug">{tag.display_name}</p>
        <p className="text-xs font-semibold text-ink/60">
          ×{signal.occurrence_count} • last seen {lastSeen}
        </p>
      </div>
      <p className="mt-2 text-sm text-ink/80">{tag.description}</p>
      {tag.remediation_hint && (
        <p className="mt-3 rounded-xl bg-paper p-3 text-sm text-ink/90 ring-1 ring-cloud">
          <span className="font-semibold">Try this at home: </span>
          {tag.remediation_hint}
        </p>
      )}
      {tag.related_teks && tag.related_teks.length > 0 && (
        <p className="mt-2 font-mono text-[11px] text-ink/50">
          Topics: {tag.related_teks.join(', ')}
        </p>
      )}
    </div>
  )
}
