// scripts/test-parent-redesign-isolation.mjs
// Spec §9.6 — CRITICAL cross-family isolation gate. Do not ship if this fails.
// Hardened: B owns its own definition+assignment so every B-side check is
// non-vacuous (proves isolation AND B's positive read access), counts are
// family-pinned not global, and every error is captured (no swallowed-error
// false-greens).
// Run: node --env-file=.env.local scripts/test-parent-redesign-isolation.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);
  const cb = await signInClient(ctx.B.email, ctx.B.password);

  // A creates + assigns to A's kids (2 rows).
  const { data: defId, error: ce } = await ca.rpc('map_create_test_definition', {
    p_name: 'Iso def A', p_subject: 'math', p_grade: 2, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  assert(!ce && typeof defId === 'string', 'A creates definition → uuid returned');
  const { data: aIds, error: ae } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId, p_student_ids: ctx.A.kids.map((k) => k.id), p_due_by: null, p_parent_note: null,
  });
  assert(!ae && Array.isArray(aIds) && aIds.length === 2, 'A assigns to A kids → 2 rows');

  // B creates + assigns its OWN definition so the B-side checks below are not
  // vacuously true on an empty result set.
  const { data: defB, error: ceB } = await cb.rpc('map_create_test_definition', {
    p_name: 'Iso def B', p_subject: 'math', p_grade: 2, p_planned_length: 10,
    p_source_mix: 'vetted_only', p_custom_pct: null, p_difficulty_mix: null,
    p_standard_codes: [], p_custom_question_ids: [], p_custom_passage_ids: [], p_is_template: false,
  });
  assert(!ceB && typeof defB === 'string', 'B creates its own definition → uuid');
  const { data: bIds, error: aeB } = await cb.rpc('map_assign_test_definition', {
    p_definition_id: defB, p_student_ids: [ctx.B.kids[0].id], p_due_by: null, p_parent_note: null,
  });
  assert(!aeB && Array.isArray(bIds) && bIds.length === 1, 'B assigns to its own kid → 1 row');

  // A assigning with a family-B student_id → rejected.
  const { error: xe } = await ca.rpc('map_assign_test_definition', {
    p_definition_id: defId, p_student_ids: [ctx.B.kids[0].id], p_due_by: null, p_parent_note: null,
  });
  assert(!!xe && /not your kid/i.test(xe.message ?? JSON.stringify(xe)),
    'A assigning B-kid raises "not your kid"');

  // Family-pinned (not global) check: the B-kid has ONLY B's own assignment;
  // A's rejected cross-family attempt added nothing.
  const { data: bKidRows, error: bke } = await admin
    .from('map_test_assignments')
    .select('id, definition_id')
    .eq('student_id', ctx.B.kids[0].id);
  assert(!bke && bKidRows.length === 1 && bKidRows[0].definition_id === defB,
    'no cross-family rows for B-kid; only B\'s own assignment present');

  // B SELECT over map_test_assignments: sees exactly its own row, never A's (RLS).
  const { data: bRows, error: be } = await cb.from('map_test_assignments').select('id, family_id');
  assert(!be && bRows.length === 1 && bRows.every((r) => r.family_id === ctx.B.familyId),
    'B sees exactly its own assignment, none of A (RLS)');

  // B cannot revoke an A-owned assignment.
  const { error: rbe } = await cb.rpc('map_revoke_assignment', { p_assignment_id: aIds[1] });
  const stillThere = await admin.from('map_test_assignments')
    .select('status').eq('id', aIds[1]).single();
  assert(!!rbe && stillThere.data.status === 'assigned',
    'B cannot revoke A assignment; row unmutated');

  // B's assignment-overview view exists, shows B's definition, never A's.
  const { data: bOv, error: bove } = await cb.from('map_v_assignment_overview').select('definition_id');
  assert(!bove, 'B can query map_v_assignment_overview (view exists)');
  assert((bOv ?? []).some((r) => r.definition_id === defB)
    && (bOv ?? []).every((r) => r.definition_id !== defId),
    'B sees its own definition in the view, never A\'s');

  console.log('\nAll isolation checks passed.');
} finally {
  await teardown(ctx);
}
