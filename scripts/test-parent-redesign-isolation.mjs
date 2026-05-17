// scripts/test-parent-redesign-isolation.mjs
// Spec §9.6 — CRITICAL cross-family isolation gate. Do not ship if this fails.
// Run: node --env-file=.env.local scripts/test-parent-redesign-isolation.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);
  const cb = await signInClient(ctx.B.email, ctx.B.password);

  // A creates + assigns to A's kids (2 rows).
  const { data: defId } = await ca.rpc('map_create_test_definition', {
    p_name: 'Iso def', p_subject: 'math', p_grade: 2, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  const { data: aIds, error: ae } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId, p_student_ids: ctx.A.kids.map((k) => k.id), p_due_by: null, p_parent_note: null,
  });
  assert(!ae && aIds.length === 2, 'A assigns to A kids → 2 rows');

  // A assigning with a family-B student_id → rejected, zero rows created.
  const before = await admin.from('map_test_assignments').select('id', { count: 'exact', head: true });
  const { error: xe } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId, p_student_ids: [ctx.B.kids[0].id], p_due_by: null, p_parent_note: null,
  });
  const after = await admin.from('map_test_assignments').select('id', { count: 'exact', head: true });
  assert(!!xe && /not your kid/i.test(xe.message ?? JSON.stringify(xe)),
    'A assigning B-kid raises "not your kid"');
  assert(before.count === after.count, 'no assignment rows created on cross-family attempt');

  // B SELECT over map_test_assignments returns only B's rows (none here).
  const { data: bRows, error: be } = await cb.from('map_test_assignments').select('id, family_id');
  assert(!be && bRows.every((r) => r.family_id === ctx.B.familyId),
    'B sees only B assignments (RLS)');

  // B cannot revoke an A-owned assignment.
  const { error: rbe } = await cb.rpc('map_revoke_assignment', { p_assignment_id: aIds[1] });
  const stillThere = await admin.from('map_test_assignments')
    .select('status').eq('id', aIds[1]).single();
  assert(!!rbe && stillThere.data.status === 'assigned',
    'B cannot revoke A assignment; row unmutated');

  // B cannot read A's definition via the view.
  const { data: bOv } = await cb.from('map_v_assignment_overview').select('definition_id');
  assert((bOv ?? []).every((r) => r.definition_id !== defId),
    'B cannot see A definition via map_v_assignment_overview');

  console.log('\nAll isolation checks passed.');
} finally {
  await teardown(ctx);
}
