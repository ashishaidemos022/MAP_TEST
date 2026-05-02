import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetActivityCalendarInput } from '../schemas.js';

export const DESC =
  "Per-day question counts for the last N days. Use this when the parent asks about consistency, streaks, or whether the child practiced this week.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('get_activity_calendar', DESC, GetActivityCalendarInput.shape, async (raw) => {
    const args = GetActivityCalendarInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);
      const since = new Date(Date.now() - args.since_days * 86_400_000);
      since.setUTCHours(0, 0, 0, 0);
      const sinceIso = since.toISOString();

      const [{ data: atts, error: attErr }, { data: sess, error: sessErr }] = await Promise.all([
        ctx.supabase
          .from('map_attempts')
          .select('answered_at, is_correct')
          .eq('student_id', args.student_id)
          .gte('answered_at', sinceIso),
        ctx.supabase
          .from('map_test_sessions')
          .select('started_at')
          .eq('student_id', args.student_id)
          .gte('started_at', sinceIso),
      ]);
      if (attErr) throw new Error(attErr.message);
      if (sessErr) throw new Error(sessErr.message);

      type Acc = { questions: number; correct: number; sessions: number };
      const byDay = new Map<string, Acc>();
      const ensure = (d: string): Acc => {
        let r = byDay.get(d);
        if (!r) { r = { questions: 0, correct: 0, sessions: 0 }; byDay.set(d, r); }
        return r;
      };
      for (const a of atts ?? []) {
        const d = a.answered_at.slice(0, 10);
        const r = ensure(d);
        r.questions += 1;
        if (a.is_correct === true) r.correct += 1;
      }
      for (const s of sess ?? []) {
        const d = s.started_at.slice(0, 10);
        ensure(d).sessions += 1;
      }

      const days: Array<{ date: string; questions_answered: number; sessions: number; accuracy: number | null }> = [];
      for (let i = 0; i < args.since_days; i++) {
        const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
        const r = byDay.get(d) ?? { questions: 0, correct: 0, sessions: 0 };
        days.push({
          date: d,
          questions_answered: r.questions,
          sessions: r.sessions,
          accuracy: r.questions > 0 ? r.correct / r.questions : null,
        });
      }

      const out = { days };
      await logToolCall({ ctx, toolName: 'get_activity_calendar', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_activity_calendar', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
