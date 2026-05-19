import type { McpContext } from './auth.js';
import { McpError } from './errors.js';

/** One raw map_attempts row plus the session subject fallback. */
export type RawAttemptRow = {
  /** stable key to align output with input order (use attempt id or array index as string) */
  key: string;
  question_id: string | null;
  custom_question_version_id: string | null;
  selected_choice_id: string | null;
  is_correct: boolean | null;
  time_spent_ms: number | null;
};

/** Uniform superset shape. Each tool projects the subset it emits. */
export type ResolvedAttempt = {
  key: string;
  question_id: string | null; // custom rows: the custom_question_version_id
  subject: string;
  standard_code: string;
  stem: string;
  passage_id: string | null; // vetted reading only; null for custom
  chosen_label: string | null;
  chosen_text: string;
  correct_label: string;
  correct_text: string;
  is_correct: boolean;
  time_ms: number | null;
  misconception_tag: string | null;
};

const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

function emptyResolved(r: RawAttemptRow): ResolvedAttempt {
  return {
    key: r.key,
    question_id: r.question_id ?? r.custom_question_version_id ?? null,
    subject: '',
    standard_code: '',
    stem: '',
    passage_id: null,
    chosen_label: null,
    chosen_text: '',
    correct_label: '',
    correct_text: '',
    is_correct: r.is_correct === true,
    time_ms: r.time_spent_ms,
    misconception_tag: null,
  };
}

/**
 * Resolve a batch of attempts from whichever question source each row uses.
 * Custom rows are family-scoped via map_custom_questions.family_id — the
 * service-role client bypasses RLS, so this filter is the security boundary.
 * Never throws for a single unresolved row; never emits cross-family content.
 */
export async function resolveAttempts(
  ctx: McpContext,
  rows: RawAttemptRow[],
): Promise<ResolvedAttempt[]> {
  if (!ctx.family_id) throw new McpError('internal', 'family_id missing from auth context', 500);
  const vetted = rows.filter((r) => r.question_id);
  const custom = rows.filter((r) => !r.question_id && r.custom_question_version_id);

  const byKey = new Map<string, ResolvedAttempt>();
  for (const r of rows) byKey.set(r.key, emptyResolved(r));

  // ---- Vetted branch ----
  if (vetted.length) {
    const qIds = [...new Set(vetted.map((r) => r.question_id as string))];
    const [{ data: questions }, { data: choices }] = await Promise.all([
      ctx.supabase.from('map_questions').select('id, subject, stem, standard_id, passage_id').in('id', qIds),
      ctx.supabase.from('map_question_choices').select('id, question_id, label, body, is_correct, misconception_tag').in('question_id', qIds),
    ]);
    const stdIds = [...new Set((questions ?? []).map((q) => q.standard_id).filter((x): x is string => !!x))];
    const { data: standards } = await ctx.supabase
      .from('map_standards')
      .select('id, teks_code')
      .in('id', stdIds.length ? stdIds : [PLACEHOLDER]);
    const qById = new Map((questions ?? []).map((q) => [q.id, q]));
    const stdById = new Map((standards ?? []).map((s) => [s.id, s.teks_code]));
    type C = { id: string; question_id: string; label: string; body: string; is_correct: boolean; misconception_tag: string | null };
    const byQ = new Map<string, C[]>();
    for (const c of (choices ?? []) as C[]) {
      if (!byQ.has(c.question_id)) byQ.set(c.question_id, []);
      byQ.get(c.question_id)!.push(c);
    }
    const chosenById = new Map<string, C>();
    for (const list of byQ.values()) for (const c of list) chosenById.set(c.id, c);

    for (const r of vetted) {
      const q = qById.get(r.question_id as string);
      if (!q) continue; // leave empty row
      const chosen = r.selected_choice_id ? chosenById.get(r.selected_choice_id) : undefined;
      const correct = (byQ.get(r.question_id as string) ?? []).find((c) => c.is_correct);
      byKey.set(r.key, {
        key: r.key,
        question_id: r.question_id,
        subject: q.subject ?? '',
        standard_code: q.standard_id ? stdById.get(q.standard_id) ?? '' : '',
        stem: (q.stem ?? '').slice(0, 500),
        passage_id: q.passage_id ?? null,
        chosen_label: chosen?.label ?? null,
        chosen_text: chosen?.body ?? '',
        correct_label: correct?.label ?? '',
        correct_text: correct?.body ?? '',
        is_correct: r.is_correct === true,
        time_ms: r.time_spent_ms,
        misconception_tag: chosen && !chosen.is_correct ? chosen.misconception_tag ?? null : null,
      });
    }
  }

  // ---- Custom branch (family-scoped) ----
  if (custom.length) {
    const vIds = [...new Set(custom.map((r) => r.custom_question_version_id as string))];
    // Two separate queries instead of an embedded join: there are TWO FKs
    // between map_custom_question_versions and map_custom_questions
    // (version.question_id -> question.id AND question.current_version_id ->
    // version.id), so a PostgREST `map_custom_questions!inner(...)` embed is
    // ambiguous and errors out. Fetch versions, then their parent questions,
    // and apply the family + soft-delete filter in JS.
    type V = { id: string; subject: string | null; stem: string | null; standard_code: string | null; question_id: string };
    const { data: versions } = await ctx.supabase
      .from('map_custom_question_versions')
      .select('id, subject, stem, standard_code, question_id')
      .in('id', vIds);
    const parentQIds = [...new Set(((versions ?? []) as V[]).map((v) => v.question_id).filter((x): x is string => !!x))];
    const { data: parents } = await ctx.supabase
      .from('map_custom_questions')
      .select('id, family_id, soft_deleted_at')
      .in('id', parentQIds.length ? parentQIds : [PLACEHOLDER]);
    const inFamilyParents = new Set(
      ((parents ?? []) as Array<{ id: string; family_id: string; soft_deleted_at: string | null }>)
        .filter((p) => p.family_id === ctx.family_id && p.soft_deleted_at === null)
        .map((p) => p.id),
    );
    const okVersions = ((versions ?? []) as V[]).filter((v) => inFamilyParents.has(v.question_id));
    const inFamilyVIds = new Set(okVersions.map((v) => v.id));
    const vById = new Map(okVersions.map((v) => [v.id, v]));

    // DB errors here degrade to empty rows per the resolver's no-throw contract.
    const { data: cChoices } = await ctx.supabase
      .from('map_custom_question_choices')
      .select('id, version_id, label, text, is_correct, misconception_tag')
      .in('version_id', inFamilyVIds.size ? [...inFamilyVIds] : [PLACEHOLDER]);
    type CC = { id: string; version_id: string; label: string; text: string; is_correct: boolean; misconception_tag: string | null };
    const ccByV = new Map<string, CC[]>();
    for (const c of (cChoices ?? []) as CC[]) {
      if (!ccByV.has(c.version_id)) ccByV.set(c.version_id, []);
      ccByV.get(c.version_id)!.push(c);
    }
    const ccById = new Map<string, CC>();
    for (const list of ccByV.values()) for (const c of list) ccById.set(c.id, c);

    for (const r of custom) {
      const vId = r.custom_question_version_id as string;
      const v = vById.get(vId);
      if (!v || !inFamilyVIds.has(vId)) continue; // not in family / deleted → leave empty row
      const chosen = r.selected_choice_id ? ccById.get(r.selected_choice_id) : undefined;
      const correct = (ccByV.get(vId) ?? []).find((c) => c.is_correct);
      byKey.set(r.key, {
        key: r.key,
        question_id: vId,
        subject: v.subject ?? '',
        standard_code: v.standard_code ?? '',
        stem: (v.stem ?? '').slice(0, 500),
        passage_id: null,
        chosen_label: chosen?.label ?? null,
        chosen_text: chosen?.text ?? '',
        correct_label: correct?.label ?? '',
        correct_text: correct?.text ?? '',
        is_correct: r.is_correct === true,
        time_ms: r.time_spent_ms,
        misconception_tag: chosen && !chosen.is_correct ? chosen.misconception_tag ?? null : null,
      });
    }
  }

  // Every key was pre-seeded by emptyResolved; get() is always defined.
  return rows.map((r) => byKey.get(r.key)!);
}
