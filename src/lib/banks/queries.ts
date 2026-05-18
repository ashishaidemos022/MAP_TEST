// src/lib/banks/queries.ts
import { supabase } from '../supabase'
import type { BankRow, BankAssignmentOverviewRow } from './types'

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
