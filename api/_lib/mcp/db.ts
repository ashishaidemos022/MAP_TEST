import type { McpContext } from './auth.js';
import { McpError } from './errors.js';

export type StudentRow = {
  id: string;
  display_name: string;
  grade: number;
  avatar_emoji: string;
  created_at: string;
  family_id: string;
};

export async function getStudentInFamily(ctx: McpContext, studentId: string): Promise<StudentRow> {
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
  status: string;
  started_at: string;
  completed_at: string | null;
  question_ids: string[];
  correct_count: number;
  planned_length: number;
};

export async function getSessionInFamily(ctx: McpContext, sessionId: string): Promise<SessionRow> {
  // Single query: join through map_students to enforce family_id.
  const { data, error } = await ctx.supabase
    .from('map_test_sessions')
    .select('id, student_id, subject, status, started_at, completed_at, question_ids, correct_count, planned_length, map_students!inner(family_id)')
    .eq('id', sessionId)
    .eq('map_students.family_id', ctx.family_id)
    .maybeSingle();
  if (error) throw new McpError('internal', error.message, 500);
  if (!data) throw new McpError('session_not_in_family', `session ${sessionId} not found in this family`);
  return {
    id: data.id,
    student_id: data.student_id,
    subject: data.subject,
    status: data.status,
    started_at: data.started_at,
    completed_at: data.completed_at,
    question_ids: data.question_ids,
    correct_count: data.correct_count,
    planned_length: data.planned_length,
  };
}
