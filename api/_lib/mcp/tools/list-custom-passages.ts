import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { ListCustomPassagesInput } from '../schemas.js';
import { McpError } from '../errors.js';

export const LIST_CUSTOM_PASSAGES_DESCRIPTION =
  "List the family's custom passages. Returns at most 100. Each row includes how many published questions reference any version of the passage and how many reference an outdated version.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'list_custom_passages',
    LIST_CUSTOM_PASSAGES_DESCRIPTION,
    ListCustomPassagesInput.shape,
    async (rawArgs) => {
      const args = ListCustomPassagesInput.parse(rawArgs ?? {});
      try {
        if (!ctx.family_id) throw new McpError('internal', 'family_id missing', 500);

        let q = ctx.supabase
          .from('map_custom_passages')
          .select(
            'id, status, source, current_version_id, created_at, updated_at, ' +
              'map_custom_passage_versions!current_version_id(subject, grade, title, body, genre, estimated_grade_level, standard_codes, version_number)',
          )
          .eq('family_id', ctx.family_id)
          .is('soft_deleted_at', null)
          .order('updated_at', { ascending: false })
          .range(args.offset, args.offset + args.limit - 1);

        if (args.status) q = q.eq('status', args.status);
        if (args.source) q = q.eq('source', args.source);

        const { data, error } = await q;
        if (error) throw new McpError('internal', error.message, 500);

        // For each passage, count referencing published questions.
        const passageIds = (data ?? []).map((r) => (r as unknown as { id: string }).id);
        const refCounts = new Map<string, { total: number; outdated: number }>();
        if (passageIds.length > 0) {
          const { data: refs, error: refsErr } = await ctx.supabase
            .from('map_custom_question_versions')
            .select(
              'passage_version_id, ' +
                'map_custom_passage_versions!inner(passage_id, id, map_custom_passages!map_custom_passage_versions_passage_id_fkey!inner(current_version_id)), ' +
                'map_custom_questions!map_custom_question_versions_question_id_fkey!inner(status)',
            )
            .in('map_custom_passage_versions.passage_id', passageIds)
            .eq('map_custom_questions.status', 'published');
          if (refsErr) throw new McpError('internal', refsErr.message, 500);
          for (const r of refs ?? []) {
            const pvJoin = (r as unknown as { map_custom_passage_versions: unknown }).map_custom_passage_versions as
              | { passage_id: string; id: string; map_custom_passages: { current_version_id: string | null } | { current_version_id: string | null }[] }
              | null;
            if (!pvJoin) continue;
            const pid = pvJoin.passage_id;
            const parent = Array.isArray(pvJoin.map_custom_passages) ? pvJoin.map_custom_passages[0] : pvJoin.map_custom_passages;
            const current = parent?.current_version_id;
            const isOutdated = current !== pvJoin.id;
            const e = refCounts.get(pid) ?? { total: 0, outdated: 0 };
            e.total += 1;
            if (isOutdated) e.outdated += 1;
            refCounts.set(pid, e);
          }
        }

        const passages = (data ?? [])
          .map((row) => {
            const pv = (row as unknown as { map_custom_passage_versions: unknown }).map_custom_passage_versions as
              | { subject: string; grade: number; title: string | null; body: string; genre: string | null; estimated_grade_level: number | null; standard_codes: string[]; version_number: number }
              | null;
            const counts = refCounts.get((row as unknown as { id: string }).id) ?? { total: 0, outdated: 0 };
            return {
              passage_id: (row as unknown as { id: string }).id,
              status: (row as unknown as { status: string }).status,
              source: (row as unknown as { source: string }).source,
              subject: pv?.subject ?? null,
              grade: pv?.grade ?? null,
              title: pv?.title ?? null,
              body_excerpt: pv?.body?.slice(0, 200) ?? null,
              genre: pv?.genre ?? null,
              estimated_grade_level: pv?.estimated_grade_level ?? null,
              standard_codes: pv?.standard_codes ?? [],
              current_version_number: pv?.version_number ?? null,
              question_count: counts.total,
              question_count_outdated: counts.outdated,
              created_at: (row as unknown as { created_at: string }).created_at,
              updated_at: (row as unknown as { updated_at: string }).updated_at,
            };
          })
          .filter((p) => {
            if (args.subject && p.subject !== args.subject) return false;
            if (args.genre && p.genre !== args.genre) return false;
            return true;
          });

        await logToolCall({ ctx, toolName: 'list_custom_passages', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify({ passages }) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({ ctx, toolName: 'list_custom_passages', toolArgs: args, status: 'error', errorMessage: msg });
        throw err;
      }
    },
  );
}
