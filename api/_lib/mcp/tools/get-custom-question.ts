import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { GetCustomQuestionInput } from '../schemas.js';
import { getCustomQuestionInFamily } from '../../custom/db.js';
import { McpError } from '../errors.js';

export const GET_CUSTOM_QUESTION_DESCRIPTION =
  'Return one custom question with its choices and any referenced passage. Returns the current version unless version_number is set. SVG fields (stem_svg, passage_svg, choice_svg) are returned as base64-encoded sanitized canonical bytes — re-fetching after a write may differ from the original input because sanitization normalizes attribute order.';

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
    'get_custom_question',
    GET_CUSTOM_QUESTION_DESCRIPTION,
    GetCustomQuestionInput.shape,
    async (rawArgs) => {
      const args = GetCustomQuestionInput.parse(rawArgs ?? {});
      try {
        const q = await getCustomQuestionInFamily(ctx, args.question_id);

        let versionId = q.current_version_id;
        if (args.version_number) {
          const { data: vRow, error: vErr } = await ctx.supabase
            .from('map_custom_question_versions')
            .select('id')
            .eq('question_id', args.question_id)
            .eq('version_number', args.version_number)
            .maybeSingle();
          if (vErr) throw new McpError('internal', vErr.message, 500);
          if (!vRow) throw new McpError('not_found', `version ${args.version_number} not found`);
          versionId = (vRow as unknown as { id: string }).id;
        }
        if (!versionId) throw new McpError('not_found', 'question has no current version');

        const { data: vData, error: vErr } = await ctx.supabase
          .from('map_custom_question_versions')
          .select(
            'id, version_number, subject, grade, stem, stem_svg, stem_svg_alt_text, ' +
              'standard_code, difficulty, question_focus, ai_metadata, passage_version_id, ' +
              'map_custom_passage_versions(id, passage_id, version_number, subject, grade, title, body, passage_svg, passage_svg_alt_text, genre, estimated_grade_level, standard_codes, map_custom_passages(current_version_id))',
          )
          .eq('id', versionId)
          .maybeSingle();
        if (vErr) throw new McpError('internal', vErr.message, 500);
        if (!vData) throw new McpError('not_found', 'version row missing');

        const { data: choices, error: cErr } = await ctx.supabase
          .from('map_custom_question_choices')
          .select(
            'label, text, choice_svg, choice_svg_alt_text, is_correct, explanation_correct, explanation_wrong, misconception_tag, ordinal',
          )
          .eq('version_id', versionId)
          .order('ordinal');
        if (cErr) throw new McpError('internal', cErr.message, 500);

        const v = vData as unknown as {
          version_number: number;
          subject: string;
          grade: number;
          stem: string;
          stem_svg: unknown;
          stem_svg_alt_text: string | null;
          standard_code: string | null;
          difficulty: number | null;
          question_focus: string | null;
          ai_metadata: unknown;
          map_custom_passage_versions:
            | {
                id: string;
                passage_id: string;
                version_number: number;
                subject: string;
                grade: number;
                title: string | null;
                body: string;
                passage_svg: unknown;
                passage_svg_alt_text: string | null;
                genre: string | null;
                estimated_grade_level: number | null;
                standard_codes: string[];
                map_custom_passages: { current_version_id: string | null } | { current_version_id: string | null }[] | null;
              }
            | null;
        };

        let passage = null;
        if (v.map_custom_passage_versions) {
          const pv = v.map_custom_passage_versions;
          const parentP = Array.isArray(pv.map_custom_passages) ? pv.map_custom_passages[0] : pv.map_custom_passages;
          passage = {
            passage_id: pv.passage_id,
            passage_version_id: pv.id,
            passage_version_number: pv.version_number,
            is_current_version: parentP?.current_version_id === pv.id,
            subject: pv.subject,
            grade: pv.grade,
            title: pv.title,
            body: pv.body,
            passage_svg: bytesToBase64(pv.passage_svg),
            passage_svg_alt_text: pv.passage_svg_alt_text,
            genre: pv.genre,
            estimated_grade_level: pv.estimated_grade_level,
            standard_codes: pv.standard_codes ?? [],
          };
        }

        const out = {
          question_id: q.id,
          status: q.status,
          source: q.source,
          version_number: v.version_number,
          subject: v.subject,
          grade: v.grade,
          stem: v.stem,
          stem_svg: bytesToBase64(v.stem_svg),
          stem_svg_alt_text: v.stem_svg_alt_text,
          standard_code: v.standard_code,
          difficulty: v.difficulty,
          question_focus: v.question_focus,
          passage,
          choices: (choices ?? []).map((c) => ({
            label: (c as unknown as { label: string }).label,
            text: (c as unknown as { text: string }).text,
            choice_svg: bytesToBase64((c as unknown as { choice_svg: unknown }).choice_svg),
            choice_svg_alt_text: (c as unknown as { choice_svg_alt_text: string | null }).choice_svg_alt_text,
            is_correct: (c as unknown as { is_correct: boolean }).is_correct,
            explanation_correct: (c as unknown as { explanation_correct: string | null }).explanation_correct,
            explanation_wrong: (c as unknown as { explanation_wrong: string | null }).explanation_wrong,
            misconception_tag: (c as unknown as { misconception_tag: string | null }).misconception_tag,
          })),
          ai_metadata: v.ai_metadata,
        };

        await logToolCall({ ctx, toolName: 'get_custom_question', toolArgs: args, status: 'ok' });
        return { content: [{ type: 'text', text: JSON.stringify(out) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({ ctx, toolName: 'get_custom_question', toolArgs: args, status: 'error', errorMessage: msg });
        throw err;
      }
    },
  );
}
