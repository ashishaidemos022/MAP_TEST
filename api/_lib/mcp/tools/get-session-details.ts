import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getSessionInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetSessionDetailsInput } from '../schemas.js';

export const DESC =
  "Question-by-question breakdown of one session, including stems, the child's answer, the correct answer, time taken, and any misconception tag triggered.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('get_session_details', DESC, GetSessionDetailsInput.shape, async (raw) => {
    const args = GetSessionDetailsInput.parse(raw ?? {});
    try {
      const session = await getSessionInFamily(ctx, args.session_id);

      const { data: attempts, error } = await ctx.supabase
        .from('map_attempts')
        .select('question_id, selected_choice_id, is_correct, time_spent_ms, answered_at')
        .eq('session_id', session.id)
        .order('answered_at', { ascending: true });
      if (error) throw new Error(error.message);

      const questionIds = [...new Set((attempts ?? []).map((a) => a.question_id))];
      const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

      const [{ data: questions }, { data: choices }, { data: standards }] = await Promise.all([
        ctx.supabase.from('map_questions').select('id, stem, standard_id').in('id', questionIds.length ? questionIds : [PLACEHOLDER]),
        ctx.supabase.from('map_question_choices').select('id, question_id, label, body, is_correct, misconception_tag').in('question_id', questionIds.length ? questionIds : [PLACEHOLDER]),
        ctx.supabase.from('map_standards').select('id, teks_code'),
      ]);

      const qById = new Map((questions ?? []).map((q) => [q.id, q]));
      const stdById = new Map((standards ?? []).map((s) => [s.id, s.teks_code]));
      type ChoiceRow = { id: string; label: string; body: string; is_correct: boolean; misconception_tag: string | null };
      const choicesByQ = new Map<string, ChoiceRow[]>();
      for (const c of (choices ?? []) as Array<ChoiceRow & { question_id: string }>) {
        if (!choicesByQ.has(c.question_id)) choicesByQ.set(c.question_id, []);
        choicesByQ.get(c.question_id)!.push({
          id: c.id, label: c.label, body: c.body, is_correct: c.is_correct, misconception_tag: c.misconception_tag,
        });
      }
      const chosenById = new Map<string, ChoiceRow>();
      for (const list of choicesByQ.values()) for (const c of list) chosenById.set(c.id, c);

      const out = {
        session: {
          session_id: session.id,
          student_id: session.student_id,
          subject: session.subject,
          started_at: session.started_at,
          completed_at: session.completed_at,
        },
        attempts: (attempts ?? []).map((a) => {
          const q = qById.get(a.question_id);
          const std = q?.standard_id ? stdById.get(q.standard_id) ?? '' : '';
          const chosen = a.selected_choice_id ? chosenById.get(a.selected_choice_id) : undefined;
          const correct = (choicesByQ.get(a.question_id) ?? []).find((c) => c.is_correct);
          return {
            question_id: a.question_id,
            standard_code: std,
            stem: (q?.stem ?? '').slice(0, 500),
            chosen_label: chosen?.label ?? null,
            chosen_text: chosen?.body ?? '',
            correct_label: correct?.label ?? '',
            correct_text: correct?.body ?? '',
            is_correct: a.is_correct === true,
            time_ms: a.time_spent_ms,
            misconception_tag: chosen && !chosen.is_correct ? chosen.misconception_tag ?? null : null,
          };
        }),
      };

      await logToolCall({ ctx, toolName: 'get_session_details', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_session_details', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
