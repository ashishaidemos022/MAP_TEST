import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { GetCustomPassageInput } from '../schemas.js';
import { getCustomPassageInFamily } from '../../custom/db.js';
import { McpError } from '../errors.js';

export const GET_CUSTOM_PASSAGE_DESCRIPTION =
  'Return a passage with its body and any SVG illustration. Returns the current version unless version_number is set. SVG is base64-encoded.';

function bytesToBase64(b: unknown): string | null {
  if (!b) return null;
  if (typeof b === 'string' && b.startsWith('\\x')) {
    return Buffer.from(b.slice(2), 'hex').toString('base64');
  }
  if (b instanceof Uint8Array) return Buffer.from(b).toString('base64');
  return null;
}

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'get_custom_passage',
    GET_CUSTOM_PASSAGE_DESCRIPTION,
    GetCustomPassageInput.shape,
    async (rawArgs) => {
      const args = GetCustomPassageInput.parse(rawArgs ?? {});
      try {
        const p = await getCustomPassageInFamily(ctx, args.passage_id);

        let versionId = p.current_version_id;
        if (args.version_number) {
          const { data: vRow, error: vErr } = await ctx.supabase
            .from('map_custom_passage_versions')
            .select('id')
            .eq('passage_id', args.passage_id)
            .eq('version_number', args.version_number)
            .maybeSingle();
          if (vErr) throw new McpError('internal', vErr.message, 500);
          if (!vRow) throw new McpError('not_found', `version ${args.version_number} not found`);
          versionId = (vRow as unknown as { id: string }).id;
        }
        if (!versionId) throw new McpError('not_found', 'passage has no current version');

        const { data: v, error: vErr } = await ctx.supabase
          .from('map_custom_passage_versions')
          .select(
            'id, version_number, subject, grade, title, body, passage_svg, passage_svg_alt_text, genre, estimated_grade_level, standard_codes, ai_metadata',
          )
          .eq('id', versionId)
          .maybeSingle();
        if (vErr) throw new McpError('internal', vErr.message, 500);
        if (!v) throw new McpError('not_found', 'version row missing');

        // Find referencing questions across all family versions of this passage.
        const { data: refs } = await ctx.supabase
          .from('map_custom_question_versions')
          .select(
            'version_number, passage_version_id, ' +
              'map_custom_questions!inner(id, status, current_version_id, family_id), ' +
              'map_custom_passage_versions!inner(passage_id)',
          )
          .eq('map_custom_passage_versions.passage_id', args.passage_id)
          .eq('map_custom_questions.family_id', ctx.family_id);
        const seen = new Set<string>();
        const questions: Array<{ question_id: string; status: string; references_version_number: number; is_outdated_reference: boolean }> = [];
        for (const r of refs ?? []) {
          const join = r as unknown as {
            version_number: number;
            passage_version_id: string;
            map_custom_questions: { id: string; status: string; current_version_id: string | null } | { id: string; status: string; current_version_id: string | null }[];
          };
          const q = Array.isArray(join.map_custom_questions) ? join.map_custom_questions[0] : join.map_custom_questions;
          if (!q || seen.has(q.id)) continue;
          seen.add(q.id);
          questions.push({
            question_id: q.id,
            status: q.status,
            references_version_number: join.version_number,
            is_outdated_reference: join.passage_version_id !== p.current_version_id,
          });
        }

        const out = {
          passage_id: p.id,
          status: p.status,
          source: p.source,
          version_number: (v as unknown as { version_number: number }).version_number,
          subject: (v as unknown as { subject: string }).subject,
          grade: (v as unknown as { grade: number }).grade,
          title: (v as unknown as { title: string | null }).title,
          body: (v as unknown as { body: string }).body,
          passage_svg: bytesToBase64((v as unknown as { passage_svg: unknown }).passage_svg),
          passage_svg_alt_text: (v as unknown as { passage_svg_alt_text: string | null }).passage_svg_alt_text,
          genre: (v as unknown as { genre: string | null }).genre,
          estimated_grade_level: (v as unknown as { estimated_grade_level: number | null }).estimated_grade_level,
          standard_codes: (v as unknown as { standard_codes: string[] }).standard_codes ?? [],
          ai_metadata: (v as unknown as { ai_metadata: unknown }).ai_metadata,
          questions,
        };

        await logToolCall({ ctx, toolName: 'get_custom_passage', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify(out) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({ ctx, toolName: 'get_custom_passage', toolArgs: args, status: 'error', errorMessage: msg });
        throw err;
      }
    },
  );
}
