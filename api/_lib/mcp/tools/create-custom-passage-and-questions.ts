import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { CreateCustomPassageAndQuestionsInput, CreateCustomPassageAndQuestionsShape } from '../schemas.js';
import { composeWriteToolDescription } from '../../svg/capability-blurb.js';
import { enforceWriteQuota, refundWriteQuota } from '../../custom/db.js';
import { createPassageInFamily, createQuestionInFamily } from '../../custom/writes.js';

export const CREATE_CUSTOM_PASSAGE_AND_QUESTIONS_DESCRIPTION = composeWriteToolDescription(
  'Create a passage AND its questions in one atomic call. The natural unit for reading and passage-based language: a passage with 3-8 questions about it. Passage and all questions land in status="draft" together. 1 passage and up to 8 questions per call. Counts against both the passage and question daily quotas.',
  'create_custom_passage_and_questions',
);

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'create_custom_passage_and_questions',
    CREATE_CUSTOM_PASSAGE_AND_QUESTIONS_DESCRIPTION,
    CreateCustomPassageAndQuestionsShape.shape,
    async (rawArgs) => {
      const args = CreateCustomPassageAndQuestionsInput.parse(rawArgs ?? {});
      try {
        // Reserve both quota slots up front; refund whichever overshoots if the
        // passage step succeeds but a later question fails.
        enforceWriteQuota(ctx, 'passage_create', 1);
        enforceWriteQuota(ctx, 'question_create', args.questions.length);

        let createdPassage: { passage_id: string; passage_version_id: string } | null = null;
        const createdQuestions: Array<{ question_id: string; status: 'draft' }> = [];

        try {
          createdPassage = await createPassageInFamily(
            ctx,
            {
              subject: args.passage.subject,
              grade: args.passage.grade,
              title: args.passage.title ?? null,
              body: args.passage.body,
              genre: args.passage.genre ?? null,
              estimated_grade_level: args.passage.estimated_grade_level ?? null,
              standard_codes: args.passage.standard_codes ?? [],
              passage_svg: args.passage.passage_svg ?? null,
              passage_svg_alt_text: args.passage.passage_svg_alt_text ?? null,
              ai_metadata: args.passage.ai_metadata ?? null,
            },
            'parent_ai_generated',
            'mcp',
          );

          for (const q of args.questions) {
            const result = await createQuestionInFamily(
              ctx,
              {
                subject: q.subject,
                grade: q.grade,
                stem: q.stem,
                stem_svg: q.stem_svg ?? null,
                stem_svg_alt_text: q.stem_svg_alt_text ?? null,
                standard_code: q.standard_code ?? null,
                difficulty: q.difficulty ?? null,
                question_focus: q.question_focus ?? null,
                passage_version_id: createdPassage.passage_version_id,
                ai_metadata: q.ai_metadata ?? null,
                choices: q.choices,
              },
              'parent_ai_generated',
              'mcp',
            );
            createdQuestions.push({ question_id: result.question_id, status: 'draft' });
          }
        } catch (err) {
          // Atomicity: undo any successful inserts.
          if (createdPassage) {
            await ctx.supabase.from('map_custom_passages').delete().eq('id', createdPassage.passage_id);
          }
          for (const q of createdQuestions) {
            await ctx.supabase.from('map_custom_questions').delete().eq('id', q.question_id);
          }
          // Refund the unused quota — we may have used some, so refund the
          // ones that did NOT succeed.
          refundWriteQuota(ctx, 'passage_create', createdPassage ? 0 : 1);
          refundWriteQuota(ctx, 'question_create', args.questions.length - createdQuestions.length);
          throw err;
        }

        await logToolCall({
          ctx, toolName: 'create_custom_passage_and_questions', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              passage: { passage_id: createdPassage!.passage_id, passage_version_id: createdPassage!.passage_version_id, status: 'draft' },
              questions: createdQuestions,
            }),
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({
          ctx, toolName: 'create_custom_passage_and_questions', toolArgs: args, status: 'error', errorMessage: msg, mode: 'write',
        });
        throw err;
      }
    },
  );
}
