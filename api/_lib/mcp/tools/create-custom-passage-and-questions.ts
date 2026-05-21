import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { CreateCustomPassageAndQuestionsInput, CreateCustomPassageAndQuestionsShape } from '../schemas.js';
import { McpError } from '../errors.js';
import { composeWriteToolDescription } from '../../svg/capability-blurb.js';
import {
  enforceWriteQuota,
  refundWriteQuota,
  resolveBankById,
  resolveCreateOrFindBank,
  addItemsToBank,
  getBankItemCount,
} from '../../custom/db.js';
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
        // 1. Subject/grade come from the passage. All questions must match.
        const subject = args.passage.subject;
        const grade   = args.passage.grade;
        if (args.questions.some(q => q.subject !== subject || q.grade !== grade)) {
          throw new McpError('mixed_subjects_in_call',
            'all questions must share the passage\'s subject and grade');
        }

        // 2. Bank resolution.
        let bank: { id: string; name: string; wasCreated: boolean };
        if (args.bank_id) {
          const b = await resolveBankById(ctx, args.bank_id, subject as 'reading'|'language', grade);
          bank = { id: b.id, name: b.name, wasCreated: false };
        } else {
          const b = await resolveCreateOrFindBank(ctx, args.bank_name!, subject as 'reading'|'language', grade);
          bank = { id: b.id, name: b.name, wasCreated: b.wasCreated };
        }

        // 3. Capacity pre-check (passage + questions = 1 + N rows in the bank).
        const existing = await getBankItemCount(ctx, bank.id);
        const toAdd = 1 + args.questions.length;
        if (existing + toAdd > 60) {
          throw new McpError('bank_capacity_exceeded',
            `bank already holds ${existing} items; adding ${toAdd} would exceed the 60-item cap`);
        }

        // 4. Reserve both quotas.
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

          // 5. Attach passage + questions to bank.
          await addItemsToBank(
            ctx,
            bank.id,
            createdQuestions.map(q => q.question_id),
            [createdPassage.passage_id],
          );
        } catch (err) {
          if (createdPassage) {
            await ctx.supabase.from('map_custom_passages').delete().eq('id', createdPassage.passage_id);
          }
          for (const q of createdQuestions) {
            await ctx.supabase.from('map_custom_questions').delete().eq('id', q.question_id);
          }
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
              bank: { id: bank.id, name: bank.name, was_created: bank.wasCreated, item_count: existing + toAdd },
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
