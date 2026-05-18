// src/lib/banks/types.ts
import type { Subject } from '../types'

export type BankLane = 'vetted' | 'custom'
export type BankAssignmentStatus =
  | 'assigned' | 'in_progress' | 'completed' | 'revoked'

export interface BankRow {
  id: string
  name: string
  subject: Subject
  grade: number
  lane: BankLane
  standard_codes: string[]
  planned_length: number | null
  difficulty: 'easy' | 'medium' | 'hard' | 'any' | null
  created_at: string
}

export interface BankAssignmentOverviewRow {
  assignment_id: string
  bank_id: string
  bank_name: string
  lane: BankLane
  subject: Subject
  grade: number
  student_id: string
  student_name: string
  status: BankAssignmentStatus
  due_by: string | null
  parent_note: string | null
  assigned_at: string
  completed_at: string | null
  session_id: string | null
  questions_correct: number | null
  questions_total: number | null
}
