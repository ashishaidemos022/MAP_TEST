import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getFamilyStudents } from '../db.js';
import { logToolCall } from '../audit.js';
import { CompareKidsInput } from '../schemas.js';

export const DESC =
  "Side-by-side snapshot for all kids in the family on one subject. Same-shape rows for each child so they're directly comparable.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('compare_kids', DESC, CompareKidsInput.shape, async (raw) => {
    const args = CompareKidsInput.parse(raw ?? {});
    try {
      const kids = await getFamilyStudents(ctx);
      if (kids.length === 0) {
        await logToolCall({ ctx, toolName: 'compare_kids', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ rows: [] }) }] };
      }
      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();
      const studentIds = kids.map((k) => k.id);

      let aq = ctx.supabase
        .from('map_attempts')
        .select('student_id, is_correct, map_questions!inner(subject, standard_id, map_standards(teks_code, teks_title))')
        .in('student_id', studentIds)
        .gte('answered_at', since);
      if (args.subject) aq = aq.eq('map_questions.subject', args.subject);
      const { data: rows, error } = await aq;
      if (error) throw new Error(error.message);

      type R = {
        student_id: string;
        is_correct: boolean | null;
        map_questions: {
          subject: string;
          standard_id: string | null;
          map_standards: { teks_code: string; teks_title: string } | null;
        };
      };

      type PerStd = { code: string; description: string; total: number; correct: number };
      type PerKid = { questions: number; correct: number; standards: Map<string, PerStd> };
      const byKid = new Map<string, PerKid>();
      for (const k of kids) byKid.set(k.id, { questions: 0, correct: 0, standards: new Map() });

      for (const r of (rows ?? []) as unknown as R[]) {
        const k = byKid.get(r.student_id);
        if (!k) continue;
        k.questions += 1;
        if (r.is_correct === true) k.correct += 1;
        const std = r.map_questions?.map_standards;
        if (std) {
          const cur = k.standards.get(std.teks_code) ?? { code: std.teks_code, description: std.teks_title, total: 0, correct: 0 };
          cur.total += 1;
          if (r.is_correct === true) cur.correct += 1;
          k.standards.set(std.teks_code, cur);
        }
      }

      const out = {
        rows: kids.map((k) => {
          const agg = byKid.get(k.id)!;
          let weakest: { code: string; description: string; accuracy: number } | null = null;
          for (const s of agg.standards.values()) {
            if (s.total < 3) continue;
            const acc = s.correct / s.total;
            if (!weakest || acc < weakest.accuracy) weakest = { code: s.code, description: s.description, accuracy: acc };
          }
          return {
            student_id: k.id,
            display_name: k.display_name,
            grade: k.grade,
            questions: agg.questions,
            accuracy: agg.questions > 0 ? agg.correct / agg.questions : 0,
            weakest_standard: weakest,
          };
        }),
      };

      await logToolCall({ ctx, toolName: 'compare_kids', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'compare_kids', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
