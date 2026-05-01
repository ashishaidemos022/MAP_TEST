import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { registerListKids } from './list-kids.js';
import { register as registerGetKidOverview } from './get-kid-overview.js';
import { register as registerListRecentSessions } from './list-recent-sessions.js';
import { register as registerGetRecentWrongAnswers } from './get-recent-wrong-answers.js';

export function registerTools(server: McpServer, ctx: McpContext): void {
  registerListKids(server, ctx);
  registerGetKidOverview(server, ctx);
  registerListRecentSessions(server, ctx);
  registerGetRecentWrongAnswers(server, ctx);
  // Subsequent tools are registered here in Phase D.
}
