import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { ListCustomQuestionsInput } from '../schemas.js';
import { McpError } from '../errors.js';

export const LIST_CUSTOM_QUESTIONS_DESCRIPTION =
  "List the family's custom questions. Filterable by status, subject, source, and whether they reference a passage. Returns at most 100. Use this to find a question_id before calling get_custom_question or update_custom_question.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'list_custom_questions',
    LIST_CUSTOM_QUESTIONS_DESCRIPTION,
    ListCustomQuestionsInput.shape,
    async (rawArgs) => {
      const args = ListCustomQuestionsInput.parse(rawArgs ?? {});
      try {
        if (!ctx.family_id) throw new McpError('internal', 'family_id missing', 500);

        let query = ctx.supabase
          .from('map_custom_questions')
          .select(
            'id, status, source, current_version_id, created_at, updated_at, ' +
              'map_custom_question_versions!current_version_id(subject, grade, stem, standard_code, difficulty, passage_version_id, ' +
              'map_custom_passage_versions(passage_id, version_number, map_custom_passages(current_version_id)))',
          )
          .eq('family_id', ctx.family_id)
          .is('soft_deleted_at', null)
          .order('updated_at', { ascending: false })
          .range(args.offset, args.offset + args.limit - 1);

        if (args.status) query = query.eq('status', args.status);
        if (args.source) query = query.eq('source', args.source);

        const { data, error } = await query;
        if (error) throw new McpError('internal', error.message, 500);

        const questions = (data ?? [])
          .map((row) => {
            const v = (row as unknown as { map_custom_question_versions: unknown })
              .map_custom_question_versions as
              | { subject: string; grade: number; stem: string; standard_code: string | null; difficulty: number | null; passage_version_id: string | null; map_custom_passage_versions: unknown }
              | null;
            const pv = v?.map_custom_passage_versions as
              | { passage_id: string; version_number: number; map_custom_passages: { current_version_id: string | null } | { current_version_id: string | null }[] | null }
              | null;
            const parentP = Array.isArray(pv?.map_custom_passages) ? pv?.map_custom_passages[0] : pv?.map_custom_passages;
            return {
              question_id: (row as unknown as { id: string }).id,
              status: (row as unknown as { status: string }).status,
              source: (row as unknown as { source: string }).source,
              subject: v?.subject ?? null,
              grade: v?.grade ?? null,
              stem_excerpt: v?.stem?.slice(0, 200) ?? null,
              standard_code: v?.standard_code ?? null,
              difficulty: v?.difficulty ?? null,
              passage_id: pv?.passage_id ?? null,
              passage_version_number: pv?.version_number ?? null,
              passage_is_outdated: !!(pv && parentP && parentP.current_version_id !== v?.passage_version_id),
              created_at: (row as unknown as { created_at: string }).created_at,
              updated_at: (row as unknown as { updated_at: string }).updated_at,
            };
          })
          .filter((q) => {
            if (args.subject && q.subject !== args.subject) return false;
            if (args.has_passage === true && !q.passage_id) return false;
            if (args.has_passage === false && q.passage_id) return false;
            return true;
          });

        await logToolCall({ ctx, toolName: 'list_custom_questions', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ questions }) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({ ctx, toolName: 'list_custom_questions', toolArgs: args, status: 'error', errorMessage: msg });
        throw err;
      }
    },
  );
}
