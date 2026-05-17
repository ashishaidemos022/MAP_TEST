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
  const { error: fue } = await admin.from('map_test_assignments')
    .update({ status: 'in_progress', session_id: ctx.customSessionId, started_at: new Date().toISOString() })
    .eq('id', aIds[1]);
  assert(!fue, '§9.2 admin force-to-in_progress update succeeded (precondition)');
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
  assert(!le && Array.isArray(lib) && lib.length > 0
    && lib.every((r) => ['vetted', 'my_questions', 'ai_studio'].includes(r.source_tab)),
    '§9.3 map_v_library_content returns rows with valid source_tab');

  // §9.9 backfill invariant. The migration's backfill is a one-time step that
  // ran at apply time; it cannot cover the harness's ephemeral custom session
  // (created after apply). So assert the real invariant: every pre-existing
  // kind='custom' session is backfilled — the only custom session WITHOUT a
  // linked assignment is this harness's own ephemeral one — and a sampled
  // backfilled definition is faithful (vetted_only, system-owned, named).
  const { data: customSessions, error: cse } = await admin
    .from('map_test_sessions').select('id').eq('kind', 'custom');
  const { data: backfilledAssigns, error: bae } = await admin
    .from('map_test_assignments').select('session_id').not('session_id', 'is', null);
  const linked = new Set((backfilledAssigns ?? []).map((r) => r.session_id));
  const orphaned = (customSessions ?? [])
    .map((r) => r.id)
    .filter((id) => id !== ctx.customSessionId && !linked.has(id));
  assert(!cse && !bae && orphaned.length === 0,
    '§9.9 every pre-existing kind=custom session is backfilled (only the harness ephemeral one is unlinked)');

  const { data: sampleDef, error: sde } = await admin
    .from('map_test_definitions')
    .select('name, source_mix, owner_user_id')
    .like('name', 'Backfilled · %')
    .is('owner_user_id', null)
    .limit(1)
    .maybeSingle();
  assert(!sde && sampleDef
    && sampleDef.source_mix === 'vetted_only'
    && sampleDef.owner_user_id === null
    && sampleDef.name.startsWith('Backfilled · '),
    '§9.9 a backfilled definition is faithful (vetted_only, system-owned, named)');

  console.log('\nFoundation checks complete.');
} finally {
  await teardown(ctx);
}
