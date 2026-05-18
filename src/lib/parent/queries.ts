// src/lib/parent/queries.ts
// Typed reads against the parent-area views. RLS scopes rows to the
// signed-in parent's family; callers do not pass family_id.
import { supabase } from '../supabase';
import type {
  ClassroomRosterRow, AssignmentOverviewRow, LibraryContentRow,
} from './types';

export async function getClassroomRoster(): Promise<ClassroomRosterRow[]> {
  const { data, error } = await supabase
    .from('map_v_classroom_roster')
    .select('*')
    .order('display_name');
  if (error) throw error;
  return (data ?? []) as ClassroomRosterRow[];
}

export async function getAssignmentOverview(
  status?: string[],
): Promise<AssignmentOverviewRow[]> {
  let q = supabase.from('map_v_assignment_overview').select('*');
  if (status && status.length > 0) q = q.in('status', status);
  const { data, error } = await q.order('assigned_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AssignmentOverviewRow[];
}

export async function getLibraryContent(
  sourceTab: 'vetted' | 'my_questions' | 'ai_studio',
): Promise<LibraryContentRow[]> {
  const { data, error } = await supabase
    .from('map_v_library_content')
    .select('*')
    .eq('source_tab', sourceTab)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as LibraryContentRow[];
}

export async function getParentV2(familyId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('map_families')
    .select('parent_v2')
    .eq('id', familyId)
    .single();
  if (error) throw error;
  return Boolean(data?.parent_v2);
}
