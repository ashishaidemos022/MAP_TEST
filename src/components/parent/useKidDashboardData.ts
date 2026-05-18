// src/components/parent/useKidDashboardData.ts
// The exact combined dashboard fetch previously inline in ParentDashboard.tsx,
// parametrized by studentId. Single unified loading/error so the legacy
// flag-off composition stays byte-identical (one "Loading…", not three).
import { useEffect, useState } from 'react'
import { fetchStudentGrade, supabase } from '../../lib/supabase'
import type { MisconceptionSignal, MisconceptionTag, Session, Standard } from '../../lib/types'

export interface MasteryRow {
  standard_id: string
  status: 'mastered' | 'developing' | 'growth'
  attempts: number
  mastery_score: number | null
}

export type SignalWithTag = MisconceptionSignal & { tag: MisconceptionTag | null }

export interface WeekStats {
  attempts: number
  daysActive: number
  streakDays: number
}

export interface KidDashboardData {
  standards: Standard[]
  mastery: MasteryRow[]
  signals: SignalWithTag[]
  recent: Session[]
  weekStats: WeekStats | null
  loading: boolean
  error: string | null
}

export function useKidDashboardData(studentId: string | undefined): KidDashboardData {
  const [standards, setStandards] = useState<Standard[]>([])
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [signals, setSignals] = useState<SignalWithTag[]>([])
  const [recent, setRecent] = useState<Session[]>([])
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      const since28 = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
      const grade = await fetchStudentGrade(studentId)
      if (cancelled) return
      const [stdRes, masteryRes, signalsRes, sessionsRes, attemptsRes] = await Promise.all([
        supabase
          .from('map_standards')
          .select('*')
          .eq('grade', grade)
          .order('subject')
          .order('sort_order'),
        supabase
          .from('map_v_mastery_by_standard')
          .select('standard_id, status, attempts, mastery_score')
          .eq('student_id', studentId),
        supabase
          .from('map_misconception_signals')
          .select('*, tag:map_misconception_tags(*)')
          .eq('student_id', studentId)
          .order('occurrence_count', { ascending: false }),
        supabase
          .from('map_test_sessions')
          .select('*')
          .eq('student_id', studentId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(10),
        supabase
          .from('map_attempts')
          .select('answered_at')
          .eq('student_id', studentId)
          .gte('answered_at', since28)
          .order('answered_at', { ascending: false }),
      ])
      if (cancelled) return
      if (stdRes.error || masteryRes.error || signalsRes.error || sessionsRes.error || attemptsRes.error) {
        setError(
          stdRes.error?.message ??
            masteryRes.error?.message ??
            signalsRes.error?.message ??
            sessionsRes.error?.message ??
            attemptsRes.error?.message ??
            'Failed to load.',
        )
        setLoading(false)
        return
      }
      setStandards((stdRes.data ?? []) as Standard[])
      setMastery((masteryRes.data ?? []) as MasteryRow[])
      setSignals((signalsRes.data ?? []) as SignalWithTag[])
      setRecent((sessionsRes.data ?? []) as Session[])
      setWeekStats(computeWeekStats((attemptsRes.data ?? []) as { answered_at: string }[]))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [studentId])

  return { standards, mastery, signals, recent, weekStats, loading, error }
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function computeWeekStats(rows: { answered_at: string }[]): WeekStats {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const dayMap = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.answered_at)
    const key = dateKey(d)
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1)
  }
  let attempts = 0
  let daysActive = 0
  for (const r of rows) {
    if (new Date(r.answered_at) >= weekAgo) attempts++
  }
  for (const [key, count] of dayMap) {
    if (count > 0) {
      const d = new Date(key + 'T12:00:00')
      if (d >= weekAgo) daysActive++
    }
  }
  let streak = 0
  for (let i = 0; i < 60; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = dateKey(d)
    if (dayMap.has(key)) streak++
    else break
  }
  return { attempts, daysActive, streakDays: streak }
}
