// src/lib/banks/mutations.ts
import { supabase } from '../supabase'
import type { Subject } from '../types'

export async function createVettedBank(args: {
  name: string
  subject: Subject
  grade: number
  standardCodes: string[]
  plannedLength: number
  difficulty: 'easy' | 'medium' | 'hard' | 'any'
}): Promise<string> {
  const { data, error } = await supabase.rpc('map_create_bank', {
    p_name: args.name,
    p_subject: args.subject,
    p_grade: args.grade,
    p_lane: 'vetted',
    p_standard_codes: args.standardCodes,
    p_planned_length: args.plannedLength,
    p_difficulty: args.difficulty,
  })
  if (error) throw error
  return data as string
}

export async function assignBank(args: {
  bankId: string
  studentIds: string[]
  dueBy: string | null
  parentNote: string | null
}): Promise<string[]> {
  const { data, error } = await supabase.rpc('map_assign_bank', {
    p_bank_id: args.bankId,
    p_student_ids: args.studentIds,
    p_due_by: args.dueBy,
    p_parent_note: args.parentNote,
  })
  if (error) throw error
  return (data ?? []) as string[]
}

export async function revokeBankAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.rpc('map_revoke_bank_assignment', {
    p_assignment_id: assignmentId,
  })
  if (error) throw error
}
