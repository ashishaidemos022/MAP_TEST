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
// Custom-question bank (Phase 4 Cycle 1)
import { register as registerListCustomQuestions } from './list-custom-questions.js';
import { register as registerGetCustomQuestion } from './get-custom-question.js';
import { register as registerListCustomPassages } from './list-custom-passages.js';
import { register as registerGetCustomPassage } from './get-custom-passage.js';
import { register as registerCreateCustomQuestions } from './create-custom-questions.js';
import { register as registerCreateCustomPassageAndQuestions } from './create-custom-passage-and-questions.js';
import { register as registerUpdateCustomQuestion } from './update-custom-question.js';
import { register as registerUpdateCustomPassage } from './update-custom-passage.js';
import { register as registerBulkUpgradePassageReferences } from './bulk-upgrade-passage-references.js';
import { register as registerPublishCustomQuestion } from './publish-custom-question.js';
import { register as registerPublishCustomPassage } from './publish-custom-passage.js';

export function registerTools(server: McpServer, ctx: McpContext): void {
  // Read tools (Phase 3)
  registerListKids(server, ctx);
  registerGetKidOverview(server, ctx);
  registerListRecentSessions(server, ctx);
  registerGetRecentWrongAnswers(server, ctx);
  registerGetAccuracyByStandard(server, ctx);
  registerGetTopMisconceptions(server, ctx);
  registerGetSessionDetails(server, ctx);
  registerGetActivityCalendar(server, ctx);
  registerCompareKids(server, ctx);
  // Custom-question bank read tools
  registerListCustomQuestions(server, ctx);
  registerGetCustomQuestion(server, ctx);
  registerListCustomPassages(server, ctx);
  registerGetCustomPassage(server, ctx);
  // Custom-question bank write tools
  registerCreateCustomQuestions(server, ctx);
  registerCreateCustomPassageAndQuestions(server, ctx);
  registerUpdateCustomQuestion(server, ctx);
  registerUpdateCustomPassage(server, ctx);
  registerBulkUpgradePassageReferences(server, ctx);
  registerPublishCustomQuestion(server, ctx);
  registerPublishCustomPassage(server, ctx);
}
