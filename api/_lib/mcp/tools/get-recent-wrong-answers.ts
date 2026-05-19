import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetRecentWrongAnswersInput } from '../schemas.js';
import { resolveAttempts } from '../custom-attempt-resolver.js';

export const DESC =
  "The most useful single tool. Returns the child's recent incorrect attempts with full context: question stem, what they picked, what was correct, the standard, and the misconception tag.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('get_recent_wrong_answers', DESC, GetRecentWrongAnswersInput.shape, async (raw) => {
    const args = GetRecentWrongAnswersInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);

      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();

      // When a subject filter is requested the SQL query can't join to the
      // question to filter by subject (custom rows have no map_questions row),
      // so we over-fetch within bounds and slice to args.limit after the
      // resolver derives each row's subject. No subject filter → limit as-is.
      const fetchLimit = args.subject
        ? Math.min(Math.max(args.limit * 5, 100), 500)
        : args.limit;

      const { data: rows, error } = await ctx.supabase
        .from('map_attempts')
        .select('id, answered_at, question_id, custom_question_version_id, selected_choice_id, time_spent_ms, is_correct')
        .eq('student_id', args.student_id)
        .eq('is_correct', false)
        .gte('answered_at', since)
        .order('answered_at', { ascending: false })
        .limit(fetchLimit);
      if (error) throw new Error(error.message);

      const attempts = (rows ?? []) as Array<{
        id: string;
        answered_at: string;
        question_id: string | null;
        custom_question_version_id: string | null;
        selected_choice_id: string | null;
        time_spent_ms: number | null;
        is_correct: boolean | null;
      }>;
      if (attempts.length === 0) {
        await logToolCall({ ctx, toolName: 'get_recent_wrong_answers', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ wrong_answers: [] }) }] };
      }

      const answeredAtByKey = new Map(attempts.map((a) => [a.id, a.answered_at]));
      const resolved = await resolveAttempts(
        ctx,
        attempts.map((a) => ({
          key: a.id,
          question_id: a.question_id,
          custom_question_version_id: a.custom_question_version_id,
          selected_choice_id: a.selected_choice_id,
          is_correct: a.is_correct,
          time_spent_ms: a.time_spent_ms,
        })),
      );

      // subject filter moved from the (removed) SQL inner join to here;
      // slice enforces args.limit after filtering so a subject-filtered
      // call still returns up to args.limit matching rows.
      const filtered = (args.subject
        ? resolved.filter((r) => r.subject === args.subject)
        : resolved
      ).slice(0, args.limit);

      // Passage excerpts: vetted reading rows only.
      const passageIds = [...new Set(filtered.map((r) => r.passage_id).filter((x): x is string => !!x))];
      const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
      const { data: passages } = await ctx.supabase
        .from('map_reading_passages')
        .select('id, body')
        .in('id', passageIds.length ? passageIds : [PLACEHOLDER]);
      const passageById = new Map((passages ?? []).map((p) => [p.id, p.body as string]));

      const out = {
        wrong_answers: filtered.map((r) => ({
          attempted_at: answeredAtByKey.get(r.key) ?? '',
          question_id: r.question_id,
          subject: r.subject,
          standard_code: r.standard_code,
          stem: r.stem,
          chosen_text: r.chosen_text,
          correct_text: r.correct_text,
          misconception_tag: r.misconception_tag,
          passage_excerpt: r.passage_id ? (passageById.get(r.passage_id) ?? '').slice(0, 300) || null : null,
          time_ms: r.time_ms,
        })),
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
