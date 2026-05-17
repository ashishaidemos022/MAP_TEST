// scripts/test-parent-redesign-foundation.mjs
// Spec §9.1 (constraints present), §9.2 (RPC round-trip), §9.3 (view shapes),
// §9.9 (backfill: legacy custom session -> definition+assignment pair).
// Run: node --env-file=.env.local scripts/test-parent-redesign-foundation.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  // §9.2 create definition
  const { data: defId, error: ce } = await ca.rpc('map_create_test_definition', {
    p_name: 'Plan test def',
    p_subject: 'math',
    p_grade: 2,
    p_planned_length: 10,
    p_source_mix: 'vetted_only',
    p_custom_pct: null,
    p_difficulty_mix: null,
    p_standard_codes: [],
    p_custom_question_ids: [],
    p_custom_passage_ids: [],
    p_is_template: true,
  });
  assert(!ce && typeof defId === 'string', '§9.2 map_create_test_definition returns uuid');

  // §9.2 assign to both of A's kids
  const { data: aIds, error: ae } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId,
    p_student_ids: ctx.A.kids.map((k) => k.id),
    p_due_by: null,
    p_parent_note: 'after dinner',
  });
  assert(!ae && Array.isArray(aIds) && aIds.length === 2, '§9.2 assign creates 2 assignments');

  // §9.2 revoke one (status=assigned) succeeds
  const { error: re } = await ca.rpc('map_revoke_assignment', { p_assignment_id: aIds[0] });
  assert(!re, '§9.2 revoke of assigned assignment succeeds');

  // §9.2 revoke of an in_progress assignment fails
  await admin.from('map_test_assignments')
    .update({ status: 'in_progress', session_id: ctx.customSessionId, started_at: new Date().toISOString() })
    .eq('id', aIds[1]);
  const { error: re2 } = await ca.rpc('map_revoke_assignment', { p_assignment_id: aIds[1] });
  assert(!!re2, '§9.2 revoke of in_progress assignment is rejected');

  // §9.3 views return shape, family-scoped
  const { data: roster, error: rre } = await ca.from('map_v_classroom_roster').select('*');
  assert(!rre && roster.length === 2 && roster.every((r) => r.family_id === ctx.A.familyId),
    '§9.3 map_v_classroom_roster: 2 rows, all family A');
  assert(roster[0].standards_mastered !== undefined && roster[0].pending_assignments !== undefined,
    '§9.3 roster has expected columns');

  const { data: ov, error: oe } = await ca.from('map_v_assignment_overview').select('*');
  assert(!oe && ov.every((r) => r.family_id === ctx.A.familyId),
    '§9.3 map_v_assignment_overview family-scoped');

  const { data: lib, error: le } = await ca.from('map_v_library_content').select('*').limit(5);
  assert(!le && Array.isArray(lib), '§9.3 map_v_library_content selectable');

  // §9.9 backfill: the legacy custom session now has a definition+assignment
  const { data: bf, error: bfe } = await admin
    .from('map_test_assignments')
    .select('id, status, session_id, definition_id, map_test_definitions(name, source_mix, owner_user_id)')
    .eq('session_id', ctx.customSessionId)
    .single();
  assert(!bfe && bf && bf.status === 'completed', '§9.9 backfilled assignment exists & completed');
  assert(bf.map_test_definitions.source_mix === 'vetted_only'
    && bf.map_test_definitions.owner_user_id === null
    && bf.map_test_definitions.name.startsWith('Backfilled · '),
    '§9.9 backfilled definition is faithful (vetted_only, system-owned, named)');

  console.log('\nFoundation checks complete.');
} finally {
  await teardown(ctx);
}
