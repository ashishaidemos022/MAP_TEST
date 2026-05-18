// scripts/test-parent-2b-data.mjs
// 2b data guard: source-boundary isolation (both directions), publish/archive
// lifecycle, and extended getLibraryContent filters — at the lib boundary 2b
// consumes. Reuses the Cycle-1 ephemeral-family harness.
// Run: node --env-file=.env.local scripts/test-parent-2b-data.mjs
import { admin, setup, signInClient, teardown, assert } from './_parent-redesign-helpers.mjs';

async function libraryContent(client, sourceTab, filters) {
  let q = client.from('map_v_library_content').select('*').eq('source_tab', sourceTab);
  if (filters?.subject) q = q.eq('subject', filters.subject);
  if (filters?.grade != null) q = q.eq('grade', filters.grade);
  if (filters?.status) q = q.eq('status', filters.status);
  const limit = filters?.limit ?? 500;
  const offset = filters?.offset ?? 0;
  const { data, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}

const ctx = await setup();
try {
  const ca = await signInClient(ctx.A.email, ctx.A.password);

  const { data: cq, error: cqe } = await admin
    .from('map_custom_questions')
    .insert({ family_id: ctx.A.familyId, source: 'parent_ai_generated', status: 'draft', created_via: 'mcp' })
    .select('id')
    .single();
  assert(!cqe && cq?.id, 'seed: parent_ai_generated draft custom question created');
  const { data: ver, error: ve } = await admin
    .from('map_custom_question_versions')
    .insert({
      question_id: cq.id, version_number: 1, subject: 'math', grade: 3,
      stem: '2b test stem', question_focus: 'test', standard_code: '3.4A', difficulty: 2,
    })
    .select('id')
    .single();
  assert(!ve && ver?.id, 'seed: question version created');
  const { error: che } = await admin.from('map_custom_question_choices').insert([
    { version_id: ver.id, ordinal: 0, label: 'A', text: 'choice a', is_correct: true, explanation_correct: 'A is correct because it is the seeded right answer.' },
    { version_id: ver.id, ordinal: 1, label: 'B', text: 'choice b', is_correct: false, explanation_wrong: 'B is a seeded distractor.' },
    { version_id: ver.id, ordinal: 2, label: 'C', text: 'choice c', is_correct: false, explanation_wrong: 'C is a seeded distractor.' },
    { version_id: ver.id, ordinal: 3, label: 'D', text: 'choice d', is_correct: false, explanation_wrong: 'D is a seeded distractor.' },
  ]);
  assert(!che, 'seed: 4 choices created (publish-gate precondition)');
  await admin.from('map_custom_questions').update({ current_version_id: ver.id }).eq('id', cq.id);

  const aiDraft = await libraryContent(ca, 'ai_studio', { status: 'draft' });
  assert(aiDraft.some((r) => r.content_id === cq.id), '§10.1 ai_studio returns the AI draft');
  const mine = await libraryContent(ca, 'my_questions');
  assert(!mine.some((r) => r.content_id === cq.id), '§10.1 my_questions never returns the AI item');
  const vetted = await libraryContent(ca, 'vetted', { limit: 50 });
  assert(vetted.every((r) => r.family_id === null), '§10.1 vetted returns only family_id IS NULL rows');
  assert(!vetted.some((r) => r.content_id === cq.id), '§10.1 vetted never returns the family AI item');

  const { error: pubErr } = await ca.rpc('map_publish_custom_question', { p_question_id: cq.id });
  assert(!pubErr, 'publish: draft AI question publishes');
  const aiPub = await libraryContent(ca, 'ai_studio', { status: 'published' });
  assert(aiPub.some((r) => r.content_id === cq.id), 'publish: now visible under status=published');
  const aiDraft2 = await libraryContent(ca, 'ai_studio', { status: 'draft' });
  assert(!aiDraft2.some((r) => r.content_id === cq.id), 'publish: no longer under status=draft');
  const { error: pubErr2 } = await ca.rpc('map_publish_custom_question', { p_question_id: cq.id });
  assert(!!pubErr2, 'publish: re-publishing a non-draft is rejected (server gate)');

  const { error: arcErr } = await ca.rpc('map_soft_delete_custom_question', { p_question_id: cq.id });
  assert(!arcErr, 'archive: soft-delete succeeds');
  const aiAll = await libraryContent(ca, 'ai_studio', {});
  assert(!aiAll.some((r) => r.content_id === cq.id), 'archive: excluded from the view after soft-delete');

  const cb = await signInClient(ctx.B.email, ctx.B.password);
  const bAi = await libraryContent(cb, 'ai_studio', {});
  assert(!bAi.some((r) => r.content_id === cq.id), '§10.5 family B never sees family A AI content');

  console.log('\n2b data checks complete.');
} finally {
  await teardown(ctx);
}
