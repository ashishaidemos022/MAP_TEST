import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { getFamilyStudents } from '../db.js';
import { logToolCall } from '../audit.js';
import { ListKidsInput } from '../schemas.js';

export const LIST_KIDS_DESCRIPTION =
  'List the children in this family. Returns at most 10. Use this first if the user mentions a kid by name and you do not yet know their student_id.';

export function registerListKids(server: McpServer, ctx: McpContext): void {
  server.tool(
    'list_kids',
    LIST_KIDS_DESCRIPTION,
    ListKidsInput.shape,
    async (rawArgs) => {
      const args = ListKidsInput.parse(rawArgs ?? {});
      try {
        const rows = await getFamilyStudents(ctx);
        const kids = rows.slice(0, 10).map((r) => ({
          student_id: r.id,
          display_name: r.display_name,
          grade: r.grade,
          avatar_emoji: r.avatar_emoji,
          created_at: r.created_at,
        }));
        await logToolCall({ ctx, toolName: 'list_kids', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ kids }) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({ ctx, toolName: 'list_kids', toolArgs: args, status: 'error', errorMessage: msg });
        throw err;
      }
    },
  );
}
