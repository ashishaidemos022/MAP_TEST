import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { registerListKids } from './list-kids.js';
import { register as registerGetKidOverview } from './get-kid-overview.js';
import { register as registerListRecentSessions } from './list-recent-sessions.js';
import { register as registerGetRecentWrongAnswers } from './get-recent-wrong-answers.js';
import { register as registerGetAccuracyByStandard } from './get-accuracy-by-standard.js';
import { register as registerGetTopMisconceptions } from './get-top-misconceptions.js';
import { register as registerGetSessionDetails } from './get-session-details.js';
import { register as registerGetActivityCalendar } from './get-activity-calendar.js';
import { register as registerCompareKids } from './compare-kids.js';

export function registerTools(server: McpServer, ctx: McpContext): void {
  registerListKids(server, ctx);
  registerGetKidOverview(server, ctx);
  registerListRecentSessions(server, ctx);
  registerGetRecentWrongAnswers(server, ctx);
  registerGetAccuracyByStandard(server, ctx);
  registerGetTopMisconceptions(server, ctx);
  registerGetSessionDetails(server, ctx);
  registerGetActivityCalendar(server, ctx);
  registerCompareKids(server, ctx);
}
