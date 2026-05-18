// src/lib/banks/queries.ts
import { supabase } from '../supabase'
import type {
  BankRow,
  BankAssignmentOverviewRow,
  BankItemRow,
  PublishableCustomQuestion,
} from './types'

export async function listBanks(): Promise<BankRow[]> {
  const { data, error } = await supabase
    .from('map_question_banks')
    .select('id,name,subject,grade,lane,standard_codes,planned_length,difficulty,created_at')
    .is('soft_deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BankRow[]
}

export async function getBankAssignmentOverview(): Promise<BankAssignmentOverviewRow[]> {
  const { data, error } = await supabase
    .from('map_v_bank_assignment_overview')
    .select('*')
    .order('assigned_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BankAssignmentOverviewRow[]
}

export async function listBankItems(bankId: string): Promise<BankItemRow[]> {
  const { data, error } = await supabase
    .from('map_v_bank_items')
    .select('item_id,bank_id,sort_order,custom_question_id,question_status,question_source,stem,is_ready')
    .eq('bank_id', bankId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as BankItemRow[]
}

// Published custom questions in the family not already in this bank — the
// "Add from AI drafts" / "Add existing" picker source.
export async function listAddablePublishedCustomQuestions(
  bankId: string,
): Promise<PublishableCustomQuestion[]> {
  const { data: items, error: iErr } = await supabase
    .from('map_question_bank_items')
    .select('custom_question_id')
    .eq('bank_id', bankId)
  if (iErr) throw iErr
  const inBank = new Set((items ?? []).map((r) => r.custom_question_id as string))
  const { data, error } = await supabase
    .from('map_custom_questions')
    .select('id,status,source,map_custom_question_versions!current_version_id(stem)')
    .eq('status', 'published')
    .is('soft_deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? [])
    .filter((r) => !inBank.has(r.id as string))
    .map((r) => ({
      id: r.id as string,
      status: r.status as 'published',
      source: r.source as string,
      stem:
        ((r as { map_custom_question_versions?: { stem?: string | null } })
          .map_custom_question_versions?.stem) ?? null,
    }))
}
