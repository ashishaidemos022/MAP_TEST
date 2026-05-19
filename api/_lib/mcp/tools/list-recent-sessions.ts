import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily, getSessionBankNames } from '../db.js';
import { logToolCall } from '../audit.js';
import { ListRecentSessionsInput } from '../schemas.js';

export const DESC =
  "List the child's recent practice sessions, newest first. Each session is one sitting with N questions on one subject.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('list_recent_sessions', DESC, ListRecentSessionsInput.shape, async (raw) => {
    const args = ListRecentSessionsInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);

      let q = ctx.supabase
        .from('map_test_sessions')
        .select('id, subject, kind, started_at, completed_at, question_ids, correct_count')
        .eq('student_id', args.student_id)
        .order('started_at', { ascending: false })
        .limit(args.limit);
      if (args.subject) q = q.eq('subject', args.subject);
      const { data: sessions, error } = await q;
      if (error) throw new Error(error.message);

      const sessionIds = (sessions ?? []).map((s) => s.id);
      const timesBySession: Record<string, number[]> = {};
      if (sessionIds.length) {
        const { data: atts } = await ctx.supabase
          .from('map_attempts')
          .select('session_id, time_spent_ms')
          .in('session_id', sessionIds);
        for (const a of (atts ?? []) as Array<{ session_id: string; time_spent_ms: number | null }>) {
          if (a.time_spent_ms == null) continue;
          (timesBySession[a.session_id] ??= []).push(a.time_spent_ms);
        }
      }
      const median = (xs: number[]): number | null => {
        if (!xs.length) return null;
        const s = [...xs].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
      };
      const bankNames = await getSessionBankNames(ctx, sessionIds);

      const out = {
        sessions: (sessions ?? []).map((s) => {
          const total = (s.question_ids ?? []).length;
          const correct = s.correct_count ?? 0;
          return {
            session_id: s.id,
            subject: s.subject,
            kind: s.kind,
            bank_name: bankNames.get(s.id) ?? null,
            started_at: s.started_at,
            completed_at: s.completed_at,
            question_count: total,
            correct_count: correct,
            accuracy: total > 0 ? correct / total : 0,
            median_seconds_per_question: ((m) => (m == null ? null : Math.round(m / 100) / 10))(median(timesBySession[s.id] ?? [])),
          };
        }),
      };

      await logToolCall({ ctx, toolName: 'list_recent_sessions', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'list_recent_sessions', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
