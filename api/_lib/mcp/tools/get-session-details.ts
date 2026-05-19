import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getSessionInFamily, getSessionBankNames } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetSessionDetailsInput } from '../schemas.js';
import { resolveAttempts } from '../custom-attempt-resolver.js';

export const DESC =
  "Question-by-question breakdown of one session, including stems, the child's answer, the correct answer, time taken, and any misconception tag triggered.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('get_session_details', DESC, GetSessionDetailsInput.shape, async (raw) => {
    const args = GetSessionDetailsInput.parse(raw ?? {});
    try {
      const session = await getSessionInFamily(ctx, args.session_id);

      const { data: attempts, error } = await ctx.supabase
        .from('map_attempts')
        .select('id, question_id, custom_question_version_id, selected_choice_id, is_correct, time_spent_ms, answered_at')
        .eq('session_id', session.id)
        .order('answered_at', { ascending: true });
      if (error) throw new Error(error.message);

      const raw = (attempts ?? []).map((a) => ({
        key: a.id as string,
        question_id: a.question_id as string | null,
        custom_question_version_id: a.custom_question_version_id as string | null,
        selected_choice_id: a.selected_choice_id as string | null,
        is_correct: a.is_correct as boolean | null,
        time_spent_ms: a.time_spent_ms as number | null,
      }));
      const resolved = await resolveAttempts(ctx, raw);
      const bankNames = await getSessionBankNames(ctx, [session.id]);

      const out = {
        session: {
          session_id: session.id,
          student_id: session.student_id,
          subject: session.subject,
          kind: session.kind,
          bank_name: bankNames.get(session.id) ?? null,
          started_at: session.started_at,
          completed_at: session.completed_at,
        },
        attempts: resolved.map((a) => ({
          question_id: a.question_id,
          standard_code: a.standard_code,
          stem: a.stem,
          chosen_label: a.chosen_label,
          chosen_text: a.chosen_text,
          correct_label: a.correct_label,
          correct_text: a.correct_text,
          is_correct: a.is_correct,
          time_ms: a.time_ms,
          misconception_tag: a.misconception_tag,
        })),
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
