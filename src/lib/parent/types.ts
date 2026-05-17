// src/lib/parent/types.ts
// TS shapes for the parent-area views + the assignment status enum.
// Mirrors the migration's view columns 1:1.

export type AssignmentStatus =
  | 'assigned' | 'in_progress' | 'completed' | 'expired' | 'revoked';

export interface ClassroomRosterRow {
  student_id: string;
  family_id: string;
  display_name: string;
  grade: number;
  current_band: string | null;
  questions_this_week: number;
  active_days_this_week: number;
  standards_mastered: number;
  standards_developing: number;
  standards_growth: number;
  active_misconceptions: number;
  pending_assignments: number;
  last_session: {
    id: string;
    subject: string;
    completed_at: string;
    correct_count: number;
    questions_attempted: number | null;
    score: number | null;
  } | null;
}

export interface AssignmentOverviewRow {
  assignment_id: string;
  family_id: string;
  status: AssignmentStatus;
  assigned_at: string;
  due_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  session_id: string | null;
  parent_note: string | null;
  student_id: string;
  student_name: string;
  student_grade: number;
  definition_id: string;
  definition_name: string;
  subject: string;
  definition_grade: number;
  planned_length: number;
  source_mix: 'vetted_only' | 'custom_only' | 'mixed';
  is_template: boolean;
  questions_correct: number | null;
  questions_attempted: number | null;
  score: number | null;
  estimated_rit: number | null;
}

export interface LibraryContentRow {
  content_id: string;
  content_type: 'question' | 'passage';
  source_tab: 'vetted' | 'my_questions' | 'ai_studio';
  source_detail: string | null;
  subject: string;
  grade: number | null;
  rit_band: string | null;
  teks_code: string | null;
  teks_title: string | null;
  status: string | null;
  family_id: string | null;
  created_at: string;
}

export interface CreateDefinitionInput {
  name: string;
  subject: string;
  grade: number;
  planned_length: number;
  source_mix: 'vetted_only' | 'custom_only' | 'mixed';
  custom_pct: number | null;
  difficulty_mix: Record<string, number> | null;
  standard_codes: string[];
  custom_question_ids: string[];
  custom_passage_ids: string[];
  is_template: boolean;
}
