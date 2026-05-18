// scripts/test-parent-2c-data.mjs
// 2c data guard: definition-grain queries, zero-assignment-template
// visibility gap, from-template = assign-only (no new definition), candidate
// count narrows, cross-family isolation. Reuses the Cycle-1 harness.
// Run: node --env-file=.env.local scripts/test-parent-2c-data.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  // Create a TEMPLATE definition (zero assignments).
  const { data: tplId, error: ce } = await ca.rpc('map_create_test_definition', {
    p_name: '2c template', p_subject: 'math', p_grade: 3, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: true,
  });
  assert(!ce && typeof tplId === 'string', 'create template definition');

  // listTestDefinitions({templatesOnly}) sees it; assignment-overview does NOT.
  const { data: defs, error: de } = await ca
    .from('map_test_definitions').select('*').eq('is_template', true);
  assert(!de && defs.some((d) => d.id === tplId), 'listTestDefinitions(templatesOnly) returns the 0-assignment template');
  const { data: ov0 } = await ca.from('map_v_assignment_overview').select('definition_id');
  assert(!(ov0 ?? []).some((r) => r.definition_id === tplId),
    'zero-assignment template is INVISIBLE to assignment-overview (the gap)');

  // getTestDefinition RLS: family B cannot fetch A's definition.
  const cb = await signInClient(ctx.B.email, ctx.B.password);
  const { data: bDef } = await cb.from('map_test_definitions').select('*').eq('id', tplId).maybeSingle();
  assert(bDef == null, 'getTestDefinition: family B cannot read family A definition (RLS)');
  const { data: bList } = await cb.from('map_test_definitions').select('id');
  assert(!(bList ?? []).some((d) => d.id === tplId), 'listTestDefinitions: B excludes A definitions');

  // From-template = assign-only: definition count unchanged, assignment added.
  const { count: before } = await admin
    .from('map_test_definitions').select('*', { count: 'exact', head: true })
    .eq('family_id', ctx.A.familyId);
  const { data: aIds, error: ae } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: tplId, p_student_ids: [ctx.A.kids[0].id], p_due_by: null, p_parent_note: null,
  });
  assert(!ae && Array.isArray(aIds) && aIds.length === 1, 'from-template assign creates 1 assignment');
  const { count: after } = await admin
    .from('map_test_definitions').select('*', { count: 'exact', head: true })
    .eq('family_id', ctx.A.familyId);
  assert(before === after, 'from-template path created NO new definition row (reuse, no bloat)');

  // Fresh path: create+assign → definition count +1.
  const { data: freshId } = await ca.rpc('map_create_test_definition', {
    p_name: '2c fresh', p_subject: 'math', p_grade: 3, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  await ca.rpc('map_assign_test_definition', {
    p_definition_id: freshId, p_student_ids: [ctx.A.kids[1].id], p_due_by: null, p_parent_note: null,
  });
  const { count: after2 } = await admin
    .from('map_test_definitions').select('*', { count: 'exact', head: true })
    .eq('family_id', ctx.A.familyId);
  assert(after2 === after + 1, 'fresh path created exactly one new definition');

  // getCandidateCount narrows server-side: a bogus standard yields fewer than no filter.
  const vettedAll = await ca.from('map_v_library_content')
    .select('*', { count: 'exact', head: true })
    .eq('source_tab', 'vetted').eq('subject', 'math').eq('grade', 3);
  const vettedBogus = await ca.from('map_v_library_content')
    .select('*', { count: 'exact', head: true })
    .eq('source_tab', 'vetted').eq('subject', 'math').eq('grade', 3)
    .in('teks_code', ['ZZ.9Z']);
  assert((vettedBogus.count ?? 0) <= (vettedAll.count ?? 0) && (vettedBogus.count ?? 0) === 0,
    'getCandidateCount standardCodes filter narrows server-side (bogus → 0)');

  console.log('\n2c data checks complete.');
} finally {
  await teardown(ctx);
}
