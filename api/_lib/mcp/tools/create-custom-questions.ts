import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { CreateCustomQuestionsInput, CreateCustomQuestionsShape } from '../schemas.js';
import { McpError } from '../errors.js';
import { composeWriteToolDescription } from '../../svg/capability-blurb.js';
import {
  resolveCurrentPassageVersionInFamily,
  getCustomPassageVersionInFamily,
  enforceWriteQuota,
  refundWriteQuota,
  resolveBankById,
  resolveCreateOrFindBank,
  addItemsToBank,
  getBankItemCount,
} from '../../custom/db.js';
import { createQuestionInFamily } from '../../custom/writes.js';

export const CREATE_CUSTOM_QUESTIONS_DESCRIPTION = composeWriteToolDescription(
  'Create one or more standalone custom questions in a single call. For passage-based questions use create_custom_passage_and_questions instead — that tool creates the passage and its questions atomically. All questions land in status="draft". Maximum 25 per call, 250 per family per day. To attach to an existing passage pass passage_id; the question will link to that passage\'s current version.',
  'create_custom_questions',
);

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'create_custom_questions',
    CREATE_CUSTOM_QUESTIONS_DESCRIPTION,
    CreateCustomQuestionsShape.shape,
    async (rawArgs) => {
      const args = CreateCustomQuestionsInput.parse(rawArgs ?? {});
      try {
        // 1. Single-subject + single-grade rule.
        const subject = args.questions[0].subject;
        const grade = args.questions[0].grade;
        if (args.questions.some(q => q.subject !== subject || q.grade !== grade)) {
          throw new McpError('mixed_subjects_in_call',
            'all questions in one call must share the same subject and grade');
        }

        // 2. Bank resolution.
        let bank: { id: string; name: string; wasCreated: boolean };
        if (args.bank_id) {
          const b = await resolveBankById(ctx, args.bank_id, subject as 'math'|'reading'|'language', grade);
          bank = { id: b.id, name: b.name, wasCreated: false };
        } else {
          const b = await resolveCreateOrFindBank(ctx, args.bank_name!, subject as 'math'|'reading'|'language', grade);
          bank = { id: b.id, name: b.name, wasCreated: b.wasCreated };
        }

        // 3. Capacity pre-check.
        const existing = await getBankItemCount(ctx, bank.id);
        if (existing + args.questions.length > 60) {
          throw new McpError('bank_capacity_exceeded',
            `bank already holds ${existing} items; adding ${args.questions.length} would exceed the 60-item cap`);
        }

        // 4. Reserve quota up front.
        enforceWriteQuota(ctx, 'question_create', args.questions.length);
        const created: Array<{ question_id: string; status: 'draft'; passage_version_id: string | null }> = [];
        const warnings: Array<{ index: number; message: string }> = [];

        try {
          for (let i = 0; i < args.questions.length; i++) {
            const q = args.questions[i];

            let pvId: string | null = q.passage_version_id ?? null;
            if (q.passage_id && !pvId) {
              const pv = await resolveCurrentPassageVersionInFamily(ctx, q.passage_id);
              pvId = pv.id;
            } else if (pvId) {
              await getCustomPassageVersionInFamily(ctx, pvId);
            }

            if (q.subject === 'math' && pvId) {
              throw new McpError('invalid_question_shape',
                `questions[${i}]: math questions cannot reference a passage`);
            }
            if (q.subject === 'reading' && !pvId) {
              warnings.push({ index: i, message: 'reading question has no passage; attach one before publishing' });
            }

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
                passage_version_id: pvId,
                ai_metadata: q.ai_metadata ?? null,
                choices: q.choices,
              },
              'parent_ai_generated',
              'mcp',
            );
            created.push({ question_id: result.question_id, status: 'draft', passage_version_id: pvId });
          }

          // 5. Attach all new questions to the bank in one call.
          if (created.length > 0) {
            await addItemsToBank(ctx, bank.id, created.map(c => c.question_id), []);
          }
        } catch (err) {
          refundWriteQuota(ctx, 'question_create', args.questions.length - created.length);
          // Roll back item rows that did get created.
          for (const c of created) {
            await ctx.supabase.from('map_custom_questions').delete().eq('id', c.question_id);
          }
          throw err;
        }

        await logToolCall({
          ctx, toolName: 'create_custom_questions', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              bank: { id: bank.id, name: bank.name, was_created: bank.wasCreated, item_count: existing + created.length },
              created,
              warnings: warnings.length ? warnings : undefined,
            }),
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({
          ctx, toolName: 'create_custom_questions', toolArgs: args, status: 'error', errorMessage: msg, mode: 'write',
        });
        throw err;
      }
    },
  );
}
