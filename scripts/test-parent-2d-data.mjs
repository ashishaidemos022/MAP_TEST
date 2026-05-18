// scripts/test-parent-2d-data.mjs
// 2d data guard: the DB-layer contract startAssignedTest depends on —
// standard_codes→id resolution, map_start_assignment flips assigned→
// in_progress+session_id (and rejects non-assigned), parent_v2 flip behavior,
// cross-family RLS. The createCustomTest client composition is unchanged
// proven code, exercised in manual QA, not re-implemented here.
// Run: node --env-file=.env.local scripts/test-parent-2d-data.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  // A real vetted standard exists for some grade/subject (Grade 2-5 seeded).
  const { data: std, error: se } = await ca
    .from('map_standards')
    .select('teks_code, subject, grade')
    .limit(1)
    .single();
  assert(!se && std?.teks_code, 'a vetted map_standards row exists');

  // standard_codes→id resolution (the exact query startAssignedTest runs).
  const { data: ids, error: re } = await ca
    .from('map_standards')
    .select('id')
    .in('teks_code', [std.teks_code])
    .eq('subject', std.subject)
    .eq('grade', std.grade);
  assert(!re && (ids ?? []).length >= 1, 'standard_codes→id resolution returns the standard');

  // Create a definition with that code + assign to kid A1 (status='assigned').
  const { data: defId } = await ca.rpc('map_create_test_definition', {
    p_name: '2d def', p_subject: std.subject, p_grade: std.grade, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [std.teks_code], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  const { data: aIds } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId, p_student_ids: [ctx.A.kids[0].id], p_due_by: null, p_parent_note: 'after dinner',
  });
  const assignmentId = aIds[0];

  // getTestDefinition returns the recipe the helper reads (standard_codes).
  const { data: def } = await ca.from('map_test_definitions').select('*').eq('id', defId).single();
  assert(def && Array.isArray(def.standard_codes) && def.standard_codes.includes(std.teks_code),
    'getTestDefinition exposes standard_codes for the helper');

  // map_start_assignment flips assigned→in_progress + links a session.
  // (Use the harness ephemeral custom session as the session_id stand-in —
  // the contract under test is the assignment transition, not composition.)
  const { error: sErr } = await ca.rpc('map_start_assignment', {
    p_assignment_id: assignmentId, p_session_id: ctx.customSessionId,
  });
  assert(!sErr, 'map_start_assignment accepts an assigned assignment');
  const { data: a1 } = await admin.from('map_test_assignments')
    .select('status, session_id').eq('id', assignmentId).single();
  assert(a1.status === 'in_progress' && a1.session_id === ctx.customSessionId,
    'assignment is now in_progress with session_id linked');

  // map_start_assignment rejects a non-assigned (now in_progress) assignment —
  // the guard the helper's error policy relies on.
  const { error: sErr2 } = await ca.rpc('map_start_assignment', {
    p_assignment_id: assignmentId, p_session_id: ctx.customSessionId,
  });
  assert(!!sErr2, 'map_start_assignment rejects a non-assigned assignment');

  // Empty standard_codes definition → the helper would take the adaptive
  // fallback; assert getTestDefinition returns [] so the branch is reachable.
  const { data: defEmptyId } = await ca.rpc('map_create_test_definition', {
    p_name: '2d any-standard', p_subject: std.subject, p_grade: std.grade, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  const { data: defEmpty } = await ca.from('map_test_definitions').select('standard_codes').eq('id', defEmptyId).single();
  assert(Array.isArray(defEmpty.standard_codes) && defEmpty.standard_codes.length === 0,
    'empty-standard_codes definition → helper takes the adaptive fallback branch');

  // parent_v2 flip behavior (what getParentV2 + the panel gate on).
  await admin.from('map_families').update({ parent_v2: true }).eq('id', ctx.A.familyId);
  const { data: f1 } = await ca.from('map_families').select('parent_v2').eq('id', ctx.A.familyId).single();
  assert(f1.parent_v2 === true, 'flip parent_v2 → true reflected (panel would render)');
  await admin.from('map_families').update({ parent_v2: false }).eq('id', ctx.A.familyId);
  const { data: f2 } = await ca.from('map_families').select('parent_v2').eq('id', ctx.A.familyId).single();
  assert(f2.parent_v2 === false, 'flip parent_v2 → false reflected (panel hidden, reversible)');

  // Cross-family: B never sees A's assigned assignment (the boundary the panel consumes).
  const cb = await signInClient(ctx.B.email, ctx.B.password);
  const { data: bAssigns } = await cb.from('map_v_assignment_overview').select('assignment_id');
  assert(!(bAssigns ?? []).some((x) => x.assignment_id === assignmentId),
    'family B never sees family A assigned assignment (RLS)');

  console.log('\n2d data checks complete.');
} finally {
  await teardown(ctx);
}
