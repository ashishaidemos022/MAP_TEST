import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { CreateCustomQuestionsInput, CreateCustomQuestionsShape } from '../schemas.js';
import { McpError } from '../errors.js';
import { composeWriteToolDescription } from '../../svg/capability-blurb.js';
import { resolveCurrentPassageVersionInFamily, getCustomPassageVersionInFamily, enforceWriteQuota, refundWriteQuota } from '../../custom/db.js';
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
        // Reserve quota up front so a partial batch doesn't sneak past the cap.
        enforceWriteQuota(ctx, 'question_create', args.questions.length);
        const created: Array<{ question_id: string; status: 'draft'; passage_version_id: string | null }> = [];
        const warnings: Array<{ index: number; message: string }> = [];

        try {
          for (let i = 0; i < args.questions.length; i++) {
            const q = args.questions[i];

            // Resolve passage_id → passage_version_id, family-scoped.
            let pvId: string | null = q.passage_version_id ?? null;
            if (q.passage_id && !pvId) {
              const pv = await resolveCurrentPassageVersionInFamily(ctx, q.passage_id);
              pvId = pv.id;
            } else if (pvId) {
              await getCustomPassageVersionInFamily(ctx, pvId);
            }

            if (q.subject === 'math' && pvId) {
              throw new McpError('invalid_question_shape', `questions[${i}]: math questions cannot reference a passage`);
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
        } catch (err) {
          // Roll back the quota reservation on any failure.
          refundWriteQuota(ctx, 'question_create', args.questions.length - created.length);
          throw err;
        }

        await logToolCall({
          ctx, toolName: 'create_custom_questions', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ created, warnings: warnings.length ? warnings : undefined }) }],
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
