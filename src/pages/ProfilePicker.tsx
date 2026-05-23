import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useActiveStudent, type Student } from '../lib/activeStudent'
import { useAuth } from '../lib/auth'
import { recommendedTestLengthForGrade, supabase } from '../lib/supabase'

const EMOJIS = ['🦊', '🐶', '🐱', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐢', '🐧', '🦉']
const GRADES = [1, 2, 3, 4, 5] as const

export default function ProfilePicker() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { students, familyId, setActiveStudent, refreshStudents, loading } = useActiveStudent()
  const [showAdd, setShowAdd] = useState(false)

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-ink/50">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  // Signed in but no family yet → onboard.
  if (!familyId) {
    return <Navigate to="/onboarding" replace />
  }

  const pickStudent = (s: Student) => {
    setActiveStudent(s)
    navigate('/home')
  }

  return (
    <div className="mx-auto mt-10 max-w-3xl">
      <p className="font-display text-lg uppercase tracking-widest text-smoke">
        Who’s practicing?
      </p>
      <h1 className="font-display text-4xl">Pick your profile</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {students.map((s) => {
          const onGrade = s.grade === s.school_grade
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => pickStudent(s)}
              className="card flex flex-col items-center gap-2 p-6 transition hover:-translate-y-1 hover:shadow-cardHover"
            >
              <span className="text-7xl leading-none" aria-hidden>
                {s.avatar_emoji}
              </span>
              <span className="font-display text-2xl">{s.display_name}</span>
              <span className="text-xs uppercase tracking-widest text-ink/50">
                Grade {s.school_grade}
              </span>
              {!onGrade && (
                <span
                  className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                    s.grade > s.school_grade ? 'bg-sky/15 text-sky' : 'bg-sun/25 text-ink/70'
                  }`}
                  title={`Practicing Grade ${s.grade} — ${s.grade > s.school_grade ? 'stretch' : 'review'}`}
                >
                  Practicing Grade {s.grade}
                </span>
              )}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="card flex flex-col items-center justify-center gap-2 border-2 border-dashed border-cloud bg-paper p-6 text-ink/60 transition hover:border-sky/40 hover:text-ink"
        >
          <span className="text-6xl leading-none" aria-hidden>
            +
          </span>
          <span className="font-display text-xl">Add a kid</span>
        </button>

        <Link
          to="/parent"
          className="card flex flex-col items-center gap-2 p-6 transition hover:-translate-y-1 hover:shadow-cardHover"
        >
          <span className="text-7xl leading-none" aria-hidden>
            🔒
          </span>
          <span className="font-display text-2xl">Parent</span>
          <span className="text-xs uppercase tracking-widest text-ink/50">PIN required</span>
        </Link>
      </div>

      <section className="mt-10 rounded-2xl bg-cream/60 p-5 ring-1 ring-cloud">
        <p className="font-display text-xs uppercase tracking-widest text-smoke">For parents</p>
        <p className="mt-1 text-sm text-ink/80">
          Tap{' '}
          <span className="font-semibold">🔒 Parent</span> above (PIN required) to manage how your
          kid practices.
        </p>
        <ul className="mt-3 grid gap-2 text-sm text-ink/70 md:grid-cols-2">
          <li className="flex items-start gap-2">
            <span aria-hidden>🎚️</span>
            <span>
              <span className="font-semibold text-ink">Set test length & grade level.</span> Pick
              5–50 questions; drop a grade for review or step up for a stretch — progress is kept
              either way.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden>📈</span>
            <span>
              <span className="font-semibold text-ink">Tests are adaptive.</span> Each question
              calibrates to your kid&apos;s level — they get questions that meet them where they
              are, then stretch.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden>🗺️</span>
            <span>
              <span className="font-semibold text-ink">Topic mastery heatmap.</span> See exactly
              which topics are strong, which are growing, and which need attention.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden>🎯</span>
            <span>
              <span className="font-semibold text-ink">Custom tests.</span> Once you spot a weak
              spot, build a one-off test from the exact topics you want to drill — across any
              grades.
            </span>
          </li>
        </ul>
      </section>

      <div className="mt-10 text-center">
        <button type="button" onClick={() => void signOut()} className="btn-ghost text-sm">
          Sign out
        </button>
      </div>

      {showAdd && (
        <AddKidModal
          familyId={familyId}
          onClose={() => setShowAdd(false)}
          onCreated={async () => {
            setShowAdd(false)
            await refreshStudents()
          }}
        />
      )}
    </div>
  )
}

function AddKidModal({
  familyId,
  onClose,
  onCreated,
}: {
  familyId: string
  onClose: () => void
  onCreated: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [grade, setGrade] = useState<(typeof GRADES)[number]>(2)
  const [emoji, setEmoji] = useState<string>(EMOJIS[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Please enter a name.')
      return
    }
    setSubmitting(true)
    const { error: e1 } = await supabase.from('map_students').insert({
      family_id: familyId,
      display_name: name.trim(),
      grade,
      school_grade: grade,
      default_test_length: recommendedTestLengthForGrade(grade),
      avatar_emoji: emoji,
    })
    setSubmitting(false)
    if (e1) {
      setError(e1.message)
      return
    }
    void onCreated()
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-md p-6">
        <h2 className="font-display text-2xl">Add a kid</h2>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="font-semibold text-ink/80">Display name</span>
            <input
              type="text"
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maya"
              className="mt-1 w-full rounded-2xl border border-cloud bg-paper px-4 py-3 focus:border-sky focus:outline-none"
            />
          </label>
          <div>
            <span className="block text-sm font-semibold text-ink/80">Grade</span>
            <div className="mt-2 flex gap-2">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`flex-1 rounded-2xl border px-4 py-3 font-display text-xl ${
                    grade === g
                      ? 'border-sky bg-sky/10 text-ink'
                      : 'border-cloud bg-paper text-ink/70'
                  }`}
                >
                  Grade {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-sm font-semibold text-ink/80">Pick a picture</span>
            <div className="mt-2 grid grid-cols-6 gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  aria-label={`Pick ${e}`}
                  className={`grid aspect-square place-items-center rounded-2xl border text-3xl transition ${
                    emoji === e ? 'border-sky bg-sky/10' : 'border-cloud bg-paper hover:border-sky/40'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-ghost text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add kid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
