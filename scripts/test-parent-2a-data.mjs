// scripts/test-parent-2a-data.mjs
// Regression guard on the Cycle-1 lib calls 2a's UI consumes. The lib is
// already proven by Cycle-1 gates; this asserts no regression in the exact
// call shapes 2a depends on, under a signed-in family client.
// Run: node --env-file=.env.local scripts/test-parent-2a-data.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  // getParentV2 reflects map_families.parent_v2 (default false for the test family).
  const { data: fam, error: fe } = await ca
    .from('map_families').select('parent_v2').eq('id', ctx.A.familyId).single();
  assert(!fe && fam.parent_v2 === false, 'getParentV2 source: parent_v2 defaults false');

  // Classroom roster: one row per kid, family-scoped.
  const { data: roster, error: re } = await ca
    .from('map_v_classroom_roster').select('*');
  assert(!re && roster.length === 2 && roster.every((r) => r.family_id === ctx.A.familyId),
    'classroom roster: 2 rows, family-scoped');
  assert(roster.every((r) =>
    'standards_mastered' in r && 'active_misconceptions' in r &&
    'questions_this_week' in r && 'last_session' in r),
    'roster row shape matches ClassroomRosterRow');

  // Assignment overview filtered to one kid + revoke lifecycle.
  const { data: def } = await ca.rpc('map_create_test_definition', {
    p_name: '2a smoke', p_subject: 'math', p_grade: 2, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  const { data: ids } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: def, p_student_ids: [ctx.A.kids[0].id], p_due_by: null, p_parent_note: 'after dinner',
  });
  const { data: ov, error: oe } = await ca
    .from('map_v_assignment_overview').select('*').eq('student_id', ctx.A.kids[0].id);
  assert(!oe && ov.length === 1 && ov[0].definition_name === '2a smoke'
    && ov[0].status === 'assigned',
    'assignment overview filtered to kid returns the assigned row');

  const { error: rvOk } = await ca.rpc('map_revoke_assignment', { p_assignment_id: ids[0] });
  assert(!rvOk, 'revoke of assigned assignment succeeds');

  // Re-assign, force in_progress, confirm revoke now rejected (UI hides the control).
  const { data: ids2 } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: def, p_student_ids: [ctx.A.kids[1].id], p_due_by: null, p_parent_note: null,
  });
  await admin.from('map_test_assignments')
    .update({ status: 'in_progress', session_id: ctx.customSessionId, started_at: new Date().toISOString() })
    .eq('id', ids2[0]);
  const { error: rvBad } = await ca.rpc('map_revoke_assignment', { p_assignment_id: ids2[0] });
  assert(!!rvBad, 'revoke of in_progress assignment is rejected');

  console.log('\n2a data checks complete.');
} finally {
  await teardown(ctx);
}
