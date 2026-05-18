// src/lib/parent/mutations.ts
// Thin wrappers over the four parent-area RPCs. No business logic — argument
// shaping only. Family scoping is enforced server-side via map_current_family_id().
import { supabase } from '../supabase';
import type { CreateDefinitionInput } from './types';

export async function createTestDefinition(
  input: CreateDefinitionInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('map_create_test_definition', {
    p_name: input.name,
    p_subject: input.subject,
    p_grade: input.grade,
    p_planned_length: input.planned_length,
    p_source_mix: input.source_mix,
    p_custom_pct: input.custom_pct,
    p_difficulty_mix: input.difficulty_mix,
    p_standard_codes: input.standard_codes,
    p_custom_question_ids: input.custom_question_ids,
    p_custom_passage_ids: input.custom_passage_ids,
    p_is_template: input.is_template,
  });
  if (error) throw error;
  return data as string;
}

export async function assignTestDefinition(
  definitionId: string,
  studentIds: string[],
  dueBy: string | null,
  parentNote: string | null,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('map_assign_test_definition', {
    p_definition_id: definitionId,
    p_student_ids: studentIds,
    p_due_by: dueBy,
    p_parent_note: parentNote,
  });
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function revokeAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.rpc('map_revoke_assignment', {
    p_assignment_id: assignmentId,
  });
  if (error) throw error;
}

export async function startAssignment(
  assignmentId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('map_start_assignment', {
    p_assignment_id: assignmentId,
    p_session_id: sessionId,
  });
  if (error) throw error;
}
