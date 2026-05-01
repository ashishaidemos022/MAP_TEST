import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetKidOverviewInput } from '../schemas.js';

export const DESC =
  'High-level snapshot for one child: total practice time, total questions, accuracy by subject (math, reading, language), last-active date. Useful as the first call when the parent asks "how is X doing?"';

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('get_kid_overview', DESC, GetKidOverviewInput.shape, async (raw) => {
    const args = GetKidOverviewInput.parse(raw ?? {});
    try {
      const student = await getStudentInFamily(ctx, args.student_id);

      const [{ count: totalSessions }, { data: attempts }, { data: latest }] = await Promise.all([
        ctx.supabase
          .from('map_test_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', student.id),
        ctx.supabase
          .from('map_attempts')
          .select('is_correct, answered_at, map_questions(subject)')
          .eq('student_id', student.id),
        ctx.supabase
          .from('map_attempts')
          .select('answered_at')
          .eq('student_id', student.id)
          .order('answered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const rows = (attempts ?? []) as unknown as Array<{ is_correct: boolean | null; answered_at: string; map_questions: { subject: string } | null }>;
      const totalAnswered = rows.length;
      const overallCorrect = rows.filter((r) => r.is_correct === true).length;
      const overall_accuracy = totalAnswered > 0 ? overallCorrect / totalAnswered : 0;

      const by_subject: Record<string, { questions: number; correct: number }> = {
        math: { questions: 0, correct: 0 },
        reading: { questions: 0, correct: 0 },
        language: { questions: 0, correct: 0 },
      };
      for (const r of rows) {
        const s = r.map_questions?.subject;
        if (!s || !(s in by_subject)) continue;
        by_subject[s].questions += 1;
        if (r.is_correct === true) by_subject[s].correct += 1;
      }
      const by_subject_out: Record<string, { questions: number; accuracy: number }> = {};
      for (const [s, v] of Object.entries(by_subject)) {
        by_subject_out[s] = { questions: v.questions, accuracy: v.questions > 0 ? v.correct / v.questions : 0 };
      }

      // current_streak_days: count consecutive days back from today with at least one attempt.
      const days = new Set<string>();
      for (const r of rows) days.add(r.answered_at.slice(0, 10));
      let streak = 0;
      const cur = new Date();
      cur.setUTCHours(0, 0, 0, 0);
      while (days.has(cur.toISOString().slice(0, 10))) {
        streak += 1;
        cur.setUTCDate(cur.getUTCDate() - 1);
      }

      const out = {
        student: { student_id: student.id, display_name: student.display_name, grade: student.grade },
        total_sessions: totalSessions ?? 0,
        total_questions_answered: totalAnswered,
        overall_accuracy,
        by_subject: by_subject_out,
        last_active_at: latest?.answered_at ?? null,
        current_streak_days: streak,
      };

      await logToolCall({ ctx, toolName: 'get_kid_overview', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_kid_overview', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
