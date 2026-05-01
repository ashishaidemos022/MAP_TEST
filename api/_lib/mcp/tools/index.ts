import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { registerListKids } from './list-kids.js';

export function registerTools(server: McpServer, ctx: McpContext): void {
  registerListKids(server, ctx);
  // Subsequent tools are registered here in Phase D.
}
