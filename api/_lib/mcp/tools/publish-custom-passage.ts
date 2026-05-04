import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { PublishCustomPassageInput } from '../schemas.js';
import { McpError } from '../errors.js';
import { getCustomPassageInFamily } from '../../custom/db.js';

export const PUBLISH_CUSTOM_PASSAGE_DESCRIPTION =
  'Publish a draft custom passage. After publishing, questions can reference it by passage_id. Returns { passage_id, status: "published" }.';

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'publish_custom_passage',
    PUBLISH_CUSTOM_PASSAGE_DESCRIPTION,
    PublishCustomPassageInput.shape,
    async (rawArgs) => {
      const args = PublishCustomPassageInput.parse(rawArgs ?? {});
      try {
        const p = await getCustomPassageInFamily(ctx, args.passage_id);
        if (p.status !== 'draft') {
          throw new McpError('invalid_passage_shape', `passage is in status ${p.status}, not draft`);
        }
        const { error: upErr } = await ctx.supabase
          .from('map_custom_passages')
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('id', p.id)
          .eq('family_id', ctx.family_id);
        if (upErr) throw new McpError('internal', upErr.message, 500);

        await logToolCall({
          ctx, toolName: 'publish_custom_passage', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ passage_id: p.id, status: 'published' }) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({
          ctx, toolName: 'publish_custom_passage', toolArgs: args, status: 'error', errorMessage: msg, mode: 'write',
        });
        throw err;
      }
    },
  );
}
