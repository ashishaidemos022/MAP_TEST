import type { McpContext } from './auth.js';
import { McpError } from './errors.js';

function assertFamilyIdPresent(ctx: McpContext): void {
  if (!ctx.family_id) {
    throw new McpError('internal', 'family_id missing from auth context', 500);
  }
}

export type StudentRow = {
  id: string;
  display_name: string;
  grade: number;
  avatar_emoji: string;
  created_at: string;
  family_id: string;
};

export async function getStudentInFamily(ctx: McpContext, studentId: string): Promise<StudentRow> {
  assertFamilyIdPresent(ctx);
  const { data, error } = await ctx.supabase
    .from('map_students')
    .select('id, display_name, grade, avatar_emoji, created_at, family_id')
    .eq('id', studentId)
    .eq('family_id', ctx.family_id)
    .maybeSingle();
  if (error) throw new McpError('internal', error.message, 500);
  if (!data) throw new McpError('student_not_in_family', `student ${studentId} not found in this family`);
  return data as StudentRow;
}

export async function getFamilyStudents(ctx: McpContext): Promise<StudentRow[]> {
  assertFamilyIdPresent(ctx);
  const { data, error } = await ctx.supabase
    .from('map_students')
    .select('id, display_name, grade, avatar_emoji, created_at, family_id')
    .eq('family_id', ctx.family_id)
    .order('created_at', { ascending: true });
  if (error) throw new McpError('internal', error.message, 500);
  return (data ?? []) as StudentRow[];
}

export async function getFamilyStudentIds(ctx: McpContext): Promise<string[]> {
  const rows = await getFamilyStudents(ctx);
  return rows.map((r) => r.id);
}

export type SessionRow = {
  id: string;
  student_id: string;
  subject: string;
  kind: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  question_ids: string[];
  correct_count: number;
  planned_length: number;
};

export async function getSessionInFamily(ctx: McpContext, sessionId: string): Promise<SessionRow> {
  assertFamilyIdPresent(ctx);
  // Single query: join through map_students to enforce family_id.
  const { data, error } = await ctx.supabase
    .from('map_test_sessions')
    .select('id, student_id, subject, kind, status, started_at, completed_at, question_ids, correct_count, planned_length, map_students!inner(family_id)')
    .eq('id', sessionId)
    .eq('map_students.family_id', ctx.family_id)
    .maybeSingle();
  if (error) throw new McpError('internal', error.message, 500);
  if (!data) throw new McpError('session_not_in_family', `session ${sessionId} not found in this family`);
  return {
    id: data.id,
    student_id: data.student_id,
    subject: data.subject,
    kind: data.kind,
    status: data.status,
    started_at: data.started_at,
    completed_at: data.completed_at,
    question_ids: data.question_ids,
    correct_count: data.correct_count,
    planned_length: data.planned_length,
  };
}

/**
 * For a set of session ids, return session_id -> bank_name for those that are
 * a bank assignment in THIS family. Family-scoped (service-role bypasses RLS).
 * Sessions with no bank assignment are simply absent from the map.
 */
export async function getSessionBankNames(
  ctx: McpContext,
  sessionIds: string[],
): Promise<Map<string, string>> {
  assertFamilyIdPresent(ctx);
  const result = new Map<string, string>();
  if (!sessionIds.length) return result;
  const { data, error } = await ctx.supabase
    .from('map_bank_assignments')
    .select('session_id, family_id, map_question_banks!inner(name)')
    .in('session_id', sessionIds)
    .eq('family_id', ctx.family_id);
  if (error) throw new McpError('internal', error.message, 500);
  for (const row of (data ?? []) as Array<{
    session_id: string | null;
    map_question_banks: { name: string } | { name: string }[];
  }>) {
    if (!row.session_id) continue;
    const b = Array.isArray(row.map_question_banks) ? row.map_question_banks[0] : row.map_question_banks;
    if (b?.name) result.set(row.session_id, b.name);
  }
  return result;
}
