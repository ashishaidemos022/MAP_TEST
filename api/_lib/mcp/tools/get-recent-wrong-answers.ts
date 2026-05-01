import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetRecentWrongAnswersInput } from '../schemas.js';

export const DESC =
  "The most useful single tool. Returns the child's recent incorrect attempts with full context: question stem, what they picked, what was correct, the standard, and the misconception tag.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('get_recent_wrong_answers', DESC, GetRecentWrongAnswersInput.shape, async (raw) => {
    const args = GetRecentWrongAnswersInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);
      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();

      let q = ctx.supabase
        .from('map_attempts')
        .select('answered_at, question_id, selected_choice_id, time_spent_ms, is_correct, map_questions!inner(subject, stem, standard_id, passage_id)')
        .eq('student_id', args.student_id)
        .eq('is_correct', false)
        .gte('answered_at', since)
        .order('answered_at', { ascending: false })
        .limit(args.limit);
      if (args.subject) q = q.eq('map_questions.subject', args.subject);

      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);

      type Att = {
        answered_at: string;
        question_id: string;
        selected_choice_id: string | null;
        time_spent_ms: number | null;
        map_questions: {
          subject: string;
          stem: string;
          standard_id: string | null;
          passage_id: string | null;
        };
      };
      const attempts = (rows ?? []) as unknown as Att[];
      if (attempts.length === 0) {
        await logToolCall({ ctx, toolName: 'get_recent_wrong_answers', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ wrong_answers: [] }) }] };
      }

      const questionIds = [...new Set(attempts.map((a) => a.question_id))];
      const standardIds = [...new Set(attempts.map((a) => a.map_questions.standard_id).filter((x): x is string => !!x))];
      const passageIds = [...new Set(attempts.map((a) => a.map_questions.passage_id).filter((x): x is string => !!x))];
      const choiceIds = [...new Set(attempts.map((a) => a.selected_choice_id).filter((x): x is string => !!x))];

      const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
      const [{ data: chosenChoices }, { data: correctChoices }, { data: standards }, { data: passages }] = await Promise.all([
        ctx.supabase.from('map_question_choices').select('id, body, misconception_tag').in('id', choiceIds.length ? choiceIds : [PLACEHOLDER]),
        ctx.supabase.from('map_question_choices').select('question_id, body').in('question_id', questionIds).eq('is_correct', true),
        ctx.supabase.from('map_standards').select('id, teks_code').in('id', standardIds.length ? standardIds : [PLACEHOLDER]),
        ctx.supabase.from('map_reading_passages').select('id, body').in('id', passageIds.length ? passageIds : [PLACEHOLDER]),
      ]);

      const chosenById = new Map((chosenChoices ?? []).map((c) => [c.id, c]));
      const correctByQ = new Map((correctChoices ?? []).map((c) => [c.question_id, c.body]));
      const standardById = new Map((standards ?? []).map((s) => [s.id, s.teks_code]));
      const passageById = new Map((passages ?? []).map((p) => [p.id, p.body]));

      const out = {
        wrong_answers: attempts.map((a) => {
          const chosen = a.selected_choice_id ? chosenById.get(a.selected_choice_id) : undefined;
          const passageBody = a.map_questions.passage_id ? passageById.get(a.map_questions.passage_id) : null;
          return {
            attempted_at: a.answered_at,
            question_id: a.question_id,
            subject: a.map_questions.subject,
            standard_code: a.map_questions.standard_id ? standardById.get(a.map_questions.standard_id) ?? '' : '',
            stem: a.map_questions.stem.slice(0, 500),
            chosen_text: chosen?.body ?? '',
            correct_text: correctByQ.get(a.question_id) ?? '',
            misconception_tag: chosen?.misconception_tag ?? null,
            passage_excerpt: passageBody ? passageBody.slice(0, 300) : null,
            time_ms: a.time_spent_ms,
          };
        }),
      };

      await logToolCall({ ctx, toolName: 'get_recent_wrong_answers', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_recent_wrong_answers', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
