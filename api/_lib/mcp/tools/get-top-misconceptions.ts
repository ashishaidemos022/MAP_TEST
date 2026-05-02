import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getStudentInFamily } from '../db.js';
import { logToolCall } from '../audit.js';
import { GetTopMisconceptionsInput } from '../schemas.js';

export const DESC =
  "Most-frequent error patterns the child has triggered, drawn from misconception_tag on wrong-answer choices. Sorted by frequency. Each row includes a sample wrong question.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool('get_top_misconceptions', DESC, GetTopMisconceptionsInput.shape, async (raw) => {
    const args = GetTopMisconceptionsInput.parse(raw ?? {});
    try {
      await getStudentInFamily(ctx, args.student_id);
      const since = new Date(Date.now() - args.since_days * 86_400_000).toISOString();

      // Query 1: fetch wrong attempts with question stems
      const { data: rows, error } = await ctx.supabase
        .from('map_attempts')
        .select('answered_at, question_id, selected_choice_id, map_questions!inner(stem)')
        .eq('student_id', args.student_id)
        .eq('is_correct', false)
        .gte('answered_at', since)
        .order('answered_at', { ascending: false });
      if (error) throw new Error(error.message);

      type Att = {
        answered_at: string;
        question_id: string;
        selected_choice_id: string | null;
        map_questions: { stem: string };
      };
      const attempts = (rows ?? []) as unknown as Att[];

      if (attempts.length === 0) {
        await logToolCall({ ctx, toolName: 'get_top_misconceptions', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ misconceptions: [] }) }] };
      }

      // Query 2: fetch choice details for all selected (wrong) choices
      const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
      const choiceIds = [...new Set(attempts.map((a) => a.selected_choice_id).filter((x): x is string => !!x))];
      const { data: choiceRows } = await ctx.supabase
        .from('map_question_choices')
        .select('id, misconception_tag, body')
        .in('id', choiceIds.length ? choiceIds : [PLACEHOLDER]);
      const choiceById = new Map((choiceRows ?? []).map((c) => [c.id, c]));

      // Tally by misconception_tag, tracking most-recent occurrence as the sample
      const tally = new Map<
        string,
        { count: number; mostRecentAt: string; sampleQ: { question_id: string; stem: string; chosen_text: string } }
      >();
      for (const a of attempts) {
        if (!a.selected_choice_id) continue;
        const choice = choiceById.get(a.selected_choice_id);
        const tag = choice?.misconception_tag;
        if (!tag) continue;
        const cur = tally.get(tag);
        if (!cur) {
          tally.set(tag, {
            count: 1,
            mostRecentAt: a.answered_at,
            sampleQ: {
              question_id: a.question_id,
              stem: a.map_questions.stem.slice(0, 500),
              chosen_text: choice.body,
            },
          });
        } else {
          cur.count += 1;
          if (a.answered_at > cur.mostRecentAt) {
            cur.mostRecentAt = a.answered_at;
            cur.sampleQ = {
              question_id: a.question_id,
              stem: a.map_questions.stem.slice(0, 500),
              chosen_text: choice.body,
            };
          }
        }
      }

      const tags = [...tally.keys()];

      // Query 3: resolve tag descriptions from map_misconception_tags
      const tagDescriptions = new Map<string, string>();
      if (tags.length) {
        const { data: tagRows } = await ctx.supabase
          .from('map_misconception_tags')
          .select('tag, description')
          .in('tag', tags);
        for (const t of tagRows ?? []) tagDescriptions.set(t.tag, t.description);
      }

      // Query 4: fetch the correct choice text for each sample question
      const sampleQids = [...new Set([...tally.values()].map((v) => v.sampleQ.question_id))];
      const correctByQ = new Map<string, string>();
      if (sampleQids.length) {
        const { data: corrects } = await ctx.supabase
          .from('map_question_choices')
          .select('question_id, body')
          .in('question_id', sampleQids)
          .eq('is_correct', true);
        for (const c of corrects ?? []) correctByQ.set(c.question_id, c.body);
      }

      const list = [...tally.entries()]
        .map(([tag, v]) => ({
          tag,
          description: tagDescriptions.get(tag) ?? tag,
          hit_count: v.count,
          most_recent_at: v.mostRecentAt,
          sample_question: {
            question_id: v.sampleQ.question_id,
            stem: v.sampleQ.stem,
            chosen_text: v.sampleQ.chosen_text,
            correct_text: correctByQ.get(v.sampleQ.question_id) ?? '',
          },
        }))
        .sort((a, b) => b.hit_count - a.hit_count)
        .slice(0, args.limit);

      const out = { misconceptions: list };
      await logToolCall({ ctx, toolName: 'get_top_misconceptions', toolArgs: args, status: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logToolCall({ ctx, toolName: 'get_top_misconceptions', toolArgs: args, status: 'error', errorMessage: msg });
      throw err;
    }
  });
}
