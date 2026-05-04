import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { PublishCustomQuestionInput } from '../schemas.js';
import { McpError } from '../errors.js';
import { getCustomQuestionInFamily } from '../../custom/db.js';

export const PUBLISH_CUSTOM_QUESTION_DESCRIPTION =
  'Publish a draft custom question. The question must already have a valid current version (3-5 choices, exactly 1 correct, all-or-none choice SVG, reading must reference a published passage). Returns { question_id, status: "published" } on success.';

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'publish_custom_question',
    PUBLISH_CUSTOM_QUESTION_DESCRIPTION,
    PublishCustomQuestionInput.shape,
    async (rawArgs) => {
      const args = PublishCustomQuestionInput.parse(rawArgs ?? {});
      try {
        const q = await getCustomQuestionInFamily(ctx, args.question_id);
        if (q.status !== 'draft') {
          throw new McpError('invalid_question_shape', `question is in status ${q.status}, not draft`);
        }

        // Flip status. Schema-level deferred constraint triggers fire at COMMIT
        // and surface invariant violations as PostgrestError.
        const { error: upErr } = await ctx.supabase
          .from('map_custom_questions')
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('id', q.id)
          .eq('family_id', ctx.family_id);

        if (upErr) {
          // Trigger-level RAISE EXCEPTION surfaces with code P0001. PostgREST
          // wraps it as a 400 with the message we set in the trigger function.
          throw new McpError('invalid_question_shape', upErr.message);
        }

        await logToolCall({
          ctx, toolName: 'publish_custom_question', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ question_id: q.id, status: 'published' }) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({
          ctx, toolName: 'publish_custom_question', toolArgs: args, status: 'error', errorMessage: msg, mode: 'write',
        });
        throw err;
      }
    },
  );
}
