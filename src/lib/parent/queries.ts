// src/lib/parent/queries.ts
// Typed reads against the parent-area views. RLS scopes rows to the
// signed-in parent's family; callers do not pass family_id.
import { supabase } from '../supabase';
import type {
  ClassroomRosterRow, AssignmentOverviewRow, LibraryContentRow, LibraryFilters,
  TestDefinitionRow,
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
  filters?: LibraryFilters,
): Promise<LibraryContentRow[]> {
  let q = supabase
    .from('map_v_library_content')
    .select('*')
    .eq('source_tab', sourceTab);
  if (filters?.subject) q = q.eq('subject', filters.subject);
  if (filters?.grade != null) q = q.eq('grade', filters.grade);
  if (filters?.teksCode) q = q.eq('teks_code', filters.teksCode);
  if (filters?.ritBand) q = q.eq('rit_band', filters.ritBand);
  if (filters?.status) q = q.eq('status', filters.status);
  const limit = filters?.limit ?? 500;
  const offset = filters?.offset ?? 0;
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
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

export async function listTestDefinitions(
  opts?: { templatesOnly?: boolean },
): Promise<TestDefinitionRow[]> {
  let q = supabase.from('map_test_definitions').select('*');
  if (opts?.templatesOnly) q = q.eq('is_template', true);
  const { data, error } = await q.order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TestDefinitionRow[];
}

export async function getTestDefinition(
  id: string,
): Promise<TestDefinitionRow | null> {
  const { data, error } = await supabase
    .from('map_test_definitions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as TestDefinitionRow | null;
}

export async function getCandidateCount(args: {
  subject: string;
  grade: number;
  standardCodes: string[];
  sourceMix: 'vetted_only' | 'custom_only' | 'mixed';
}): Promise<number> {
  let q = supabase
    .from('map_v_library_content')
    .select('*', { count: 'exact', head: true })
    .eq('subject', args.subject)
    .eq('grade', args.grade);
  if (args.sourceMix === 'vetted_only') {
    q = q.eq('source_tab', 'vetted');
  } else if (args.sourceMix === 'custom_only') {
    q = q.in('source_tab', ['my_questions', 'ai_studio']).eq('status', 'published');
  } else {
    q = q.or('source_tab.eq.vetted,status.eq.published');
  }
  if (args.standardCodes.length > 0) {
    q = q.in('teks_code', args.standardCodes);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}
