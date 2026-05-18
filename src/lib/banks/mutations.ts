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

export async function createCustomBank(args: {
  name: string
  subject: Subject
  grade: number
}): Promise<string> {
  const { data, error } = await supabase.rpc('map_create_bank', {
    p_name: args.name,
    p_subject: args.subject,
    p_grade: args.grade,
    p_lane: 'custom',
    p_standard_codes: [],
    p_planned_length: null,
    p_difficulty: null,
  })
  if (error) throw error
  return data as string
}

export async function setBankItems(
  bankId: string,
  customQuestionIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('map_set_bank_items', {
    p_bank_id: bankId,
    p_custom_question_ids: customQuestionIds,
  })
  if (error) throw error
}

// Manual authoring for a bank: create the custom question, publish it
// immediately (decision: manual is ready with no review queue), then add it
// to the bank's item set. Reuses the existing custom-question RPCs.
export async function createManualBankQuestion(args: {
  bankId: string
  subject: Subject
  grade: number
  stem: string
  standardCode: string | null
  choices: Array<{
    label: string
    text: string
    is_correct: boolean
    explanation_correct: string | null
    explanation_wrong: string | null
  }>
  currentItemIds: string[]
}): Promise<void> {
  const choicesPayload = args.choices.map((c, i) => ({
    label: c.label,
    text: c.text,
    is_correct: c.is_correct,
    ordinal: i,
    explanation_correct: c.explanation_correct,
    explanation_wrong: c.explanation_wrong,
    misconception_tag: null,
  }))
  const { data: qid, error: cErr } = await supabase.rpc('map_create_custom_question', {
    p_source: 'parent_manual',
    p_created_via: 'ui',
    p_subject: args.subject,
    p_grade: args.grade,
    p_stem: args.stem,
    p_standard_code: args.standardCode,
    p_difficulty: null,
    p_ai_metadata: null,
    p_choices: choicesPayload,
    p_passage_version_id: null,
    p_question_focus: null,
    p_stem_svg: null,
    p_stem_svg_alt_text: null,
  })
  if (cErr) throw cErr
  const newId = qid as string
  const { error: pErr } = await supabase.rpc('map_publish_custom_question', {
    p_question_id: newId,
  })
  if (pErr) throw pErr
  await setBankItems(args.bankId, [...args.currentItemIds, newId])
}
