import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './auth'
import { supabase } from './supabase'

const STORAGE_KEY = 'active_student_id'

export interface Student {
  id: string
  display_name: string
  /** Practice grade — the bank tests draw from. Editable from parent settings. */
  grade: number
  /** School grade — the kid's actual grade. May differ from `grade` (practice grade). */
  school_grade: number
  avatar_emoji: string
}

interface ActiveStudentContextValue {
  activeStudent: Student | null
  setActiveStudent: (s: Student | null) => void
  students: Student[]
  familyId: string | null
  refreshStudents: () => Promise<void>
  loading: boolean
}

const Ctx = createContext<ActiveStudentContextValue | null>(null)

export function ActiveStudentProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [activeStudent, setActiveStudentState] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshStudents = useCallback(async () => {
    if (!user) {
      setStudents([])
      setFamilyId(null)
      setActiveStudentState(null)
      window.localStorage.removeItem(STORAGE_KEY)
      setLoading(false)
      return
    }
    setLoading(true)

    // Family id via the SECURITY DEFINER helper. Returns null if no family yet.
    const { data: famId } = await supabase.rpc('map_current_family_id')
    const fid: string | null = (famId as string | null) ?? null
    setFamilyId(fid)

    // Students. RLS scopes this to the caller's family automatically; no
    // explicit family_id filter needed.
    const { data, error } = await supabase
      .from('map_students')
      .select('id, display_name, grade, school_grade, avatar_emoji, created_at')
      .order('created_at')

    if (error) {
      setStudents([])
      setActiveStudentState(null)
      setLoading(false)
      return
    }

    const list = (data ?? []).map((r) => ({
      id: r.id,
      display_name: r.display_name,
      grade: r.grade,
      school_grade: r.school_grade,
      avatar_emoji: r.avatar_emoji,
    })) as Student[]
    setStudents(list)

    // Rehydrate active student from localStorage only if the saved id is
    // still in the family. Switching parents (and thus families) drops it.
    const savedId = window.localStorage.getItem(STORAGE_KEY)
    let found = savedId ? list.find((s) => s.id === savedId) ?? null : null
    if (savedId && !found) {
      window.localStorage.removeItem(STORAGE_KEY)
    }
    // Single-kid families: auto-select the only kid. Otherwise the parent
    // hits /parent right after onboarding and gets bounced away because
    // RequireActiveStudent sees no active student. With just one kid there's
    // no real choice on the profile picker anyway.
    if (!found && list.length === 1) {
      found = list[0]
      window.localStorage.setItem(STORAGE_KEY, found.id)
    }
    setActiveStudentState(found)
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    void refreshStudents()
  }, [authLoading, refreshStudents])

  const setActiveStudent = useCallback((s: Student | null) => {
    setActiveStudentState(s)
    if (s) {
      window.localStorage.setItem(STORAGE_KEY, s.id)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  return (
    <Ctx.Provider
      value={{
        activeStudent,
        setActiveStudent,
        students,
        familyId,
        refreshStudents,
        loading,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useActiveStudent(): ActiveStudentContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useActiveStudent must be used within an ActiveStudentProvider')
  return ctx
}

/**
 * Route guard that requires both a signed-in user and a selected active student
 * profile. Redirects to "/" (the profile picker) if no profile is active. Use
 * inside a <RequireAuth> wrapper.
 */
export function RequireActiveStudent({ children }: { children: ReactNode }) {
  const { activeStudent, loading } = useActiveStudent()
  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-ink/50">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }
  if (!activeStudent) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
