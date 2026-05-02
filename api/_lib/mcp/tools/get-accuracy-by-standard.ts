import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetAccuracyByStandardInput } from '../schemas.js';

export const DESC =
  "Group the child's accuracy by Texas TEKS standard. Returns standards practiced with question count and accuracy each. Sorted by lowest accuracy first so weak spots surface naturally.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('get_accuracy_by_standard', DESC, GetAccuracyByStandardInput.shape, async (raw) => {
    const args = GetAccuracyByStandardInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);
      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();

      let q = ctx.supabase
        .from('map_attempts')
        .select('is_correct, map_questions!inner(subject, standard_id, map_standards!inner(teks_code, teks_title, subject))')
        .eq('student_id', args.student_id)
        .gte('answered_at', since);
      if (args.subject) q = q.eq('map_questions.subject', args.subject);

      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);

      type R = {
        is_correct: boolean | null;
        map_questions: {
          standard_id: string | null;
          map_standards: { teks_code: string; teks_title: string; subject: string } | null;
        };
      };
      const buckets = new Map<string, { code: string; description: string; subject: string; total: number; correct: number }>();
      for (const r of (rows ?? []) as unknown as R[]) {
        const std = r.map_questions?.map_standards;
        if (!std) continue;
        const k = std.teks_code;
        const cur = buckets.get(k) ?? { code: std.teks_code, description: std.teks_title, subject: std.subject, total: 0, correct: 0 };
        cur.total += 1;
        if (r.is_correct === true) cur.correct += 1;
        buckets.set(k, cur);
      }
      const list = [...buckets.values()]
        .filter((b) => b.total >= args.min_questions)
        .map((b) => ({
          standard_code: b.code,
          standard_description: b.description,
          subject: b.subject,
          questions_attempted: b.total,
          accuracy: b.correct / b.total,
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

      const out = { standards: list };
      await logToolCall({ ctx, toolName: 'get_accuracy_by_standard', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_accuracy_by_standard', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
