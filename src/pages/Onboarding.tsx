import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveStudent } from '../lib/activeStudent'
import { useAuth } from '../lib/auth'
import { recommendedTestLengthForGrade, supabase } from '../lib/supabase'

const EMOJIS = ['🦊', '🐶', '🐱', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐢', '🐧', '🦉']
const GRADES = [1, 2, 3, 4] as const

type Step = 'family' | 'pin' | 'child'


export default function Onboarding() {
  const { user, loading: authLoading } = useAuth()
  const { refreshStudents } = useActiveStudent()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [step, setStep] = useState<Step>('family')

  const [familyName, setFamilyName] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentGrade, setStudentGrade] = useState<(typeof GRADES)[number]>(2)
  const [studentEmoji, setStudentEmoji] = useState<string>(EMOJIS[0])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Redirect away if a family already exists for this user.
  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false
    void (async () => {
      const { data, error: e1 } = await supabase
        .from('map_families')
        .select('id')
        .maybeSingle()
      if (cancelled) return
      if (e1) {
        setError(`Could not check existing family: ${e1.message}`)
        setChecking(false)
        return
      }
      if (data) {
        navigate('/', { replace: true })
        return
      }
      setChecking(false)
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, user, navigate])

  const goFromFamily = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!familyName.trim()) {
      setError('Please enter a family name.')
      return
    }
    setStep('pin')
  }

  const goFromPin = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN must be 4 to 8 digits, numbers only.')
      return
    }
    if (pin !== pinConfirm) {
      setError('The two PINs do not match. Try again.')
      return
    }
    setStep('child')
  }

  const submitAll = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!studentName.trim()) {
      setError('Please enter the kid’s name.')
      return
    }
    if (!user) {
      setError('You are not signed in. Please sign in again.')
      return
    }
    setSubmitting(true)

    // Step 1: get-or-create the family. The UNIQUE on owner_user_id makes this
    // safe across retries — if the row exists from a prior partial submit, we
    // reuse it rather than erroring out.
    let familyId: string
    {
      const { data: existing } = await supabase
        .from('map_families')
        .select('id')
        .maybeSingle()
      if (existing) {
        familyId = existing.id
        // Update the family name in case the user edited it on retry.
        await supabase
          .from('map_families')
          .update({ family_name: familyName.trim() })
          .eq('id', familyId)
      } else {
        const { data, error: e1 } = await supabase
          .from('map_families')
          .insert({ owner_user_id: user.id, family_name: familyName.trim() })
          .select('id')
          .single()
        if (e1 || !data) {
          setSubmitting(false)
          setError(`Could not create family: ${e1?.message ?? 'unknown error'}`)
          return
        }
        familyId = data.id
      }
    }

    // Step 2: set the PIN via the SECURITY DEFINER function.
    const { error: e2 } = await supabase.rpc('map_set_parent_pin', { p_pin: pin })
    if (e2) {
      setSubmitting(false)
      setError(`Could not set PIN: ${e2.message}`)
      return
    }

    // Step 3: create the first child. Practice grade and school grade start
    // equal — the parent can later stretch the practice grade up or down from
    // the parent dashboard without touching the school grade. Test length
    // starts at the recommended value for the grade.
    const { error: e3 } = await supabase.from('map_students').insert({
      family_id: familyId,
      display_name: studentName.trim(),
      grade: studentGrade,
      school_grade: studentGrade,
      default_test_length: recommendedTestLengthForGrade(studentGrade),
      avatar_emoji: studentEmoji,
    })
    if (e3) {
      setSubmitting(false)
      setError(`Could not create kid: ${e3.message}`)
      return
    }

    // The active-student context was created before the family/student rows
    // existed, so its cached familyId is still null. If we navigate to "/"
    // now, ProfilePicker sees no family and bounces back here — a redirect
    // loop the user could only break by hard-refreshing. Refresh the context
    // first, then navigate.
    await refreshStudents()
    navigate('/', { replace: true })
  }

  if (authLoading || checking) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-ink/50">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-8">
        <p className="font-display text-xs uppercase tracking-widest text-smoke">
          Step {step === 'family' ? 1 : step === 'pin' ? 2 : 3} of 3
        </p>

        {step === 'family' && (
          <form onSubmit={goFromFamily} className="mt-2 space-y-4">
            <h1 className="font-display text-3xl">Name your family</h1>
            <p className="text-sm text-ink/60">
              You can change this later. Just something to label this account.
            </p>
            <label className="block text-sm">
              <span className="font-semibold text-ink/80">Family name</span>
              <input
                type="text"
                required
                maxLength={60}
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-cloud bg-paper px-4 py-3 focus:border-sky focus:outline-none"
              />
            </label>
            <button type="submit" className="btn-primary w-full">
              Next
            </button>
          </form>
        )}

        {step === 'pin' && (
          <form onSubmit={goFromPin} className="mt-2 space-y-4">
            <h1 className="font-display text-3xl">Pick a parent PIN</h1>
            <p className="text-sm text-ink/60">
              4 to 8 digits. You’ll use this to open the parent dashboard. Don’t share it with the
              kid.
            </p>
            <label className="block text-sm">
              <span className="font-semibold text-ink/80">PIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4,8}"
                required
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="mt-1 w-full rounded-2xl border border-cloud bg-paper px-4 py-3 font-mono text-center text-2xl tracking-[0.4em] focus:border-sky focus:outline-none"
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-ink/80">Confirm PIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4,8}"
                required
                maxLength={8}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                className="mt-1 w-full rounded-2xl border border-cloud bg-paper px-4 py-3 font-mono text-center text-2xl tracking-[0.4em] focus:border-sky focus:outline-none"
                autoComplete="new-password"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setStep('family')
                }}
                className="btn-ghost text-sm"
              >
                Back
              </button>
              <button type="submit" className="btn-primary flex-1">
                Next
              </button>
            </div>
          </form>
        )}

        {step === 'child' && (
          <form onSubmit={submitAll} className="mt-2 space-y-4">
            <h1 className="font-display text-3xl">Add your first kid</h1>
            <p className="text-sm text-ink/60">
              Just a display name and a picture. You can add more kids later.
            </p>
            <label className="block text-sm">
              <span className="font-semibold text-ink/80">Display name</span>
              <input
                type="text"
                required
                maxLength={40}
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
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
                    onClick={() => setStudentGrade(g)}
                    className={`flex-1 rounded-2xl border px-4 py-3 font-display text-xl ${
                      studentGrade === g
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
                    onClick={() => setStudentEmoji(e)}
                    aria-label={`Pick ${e}`}
                    className={`grid aspect-square place-items-center rounded-2xl border text-3xl transition ${
                      studentEmoji === e
                        ? 'border-sky bg-sky/10'
                        : 'border-cloud bg-paper hover:border-sky/40'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setStep('pin')
                }}
                disabled={submitting}
                className="btn-ghost text-sm disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Create family'}
              </button>
            </div>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry ring-1 ring-berry/30">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
