import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { UpdateCustomPassageInput } from '../schemas.js';
import { McpError } from '../errors.js';
import { composeWriteToolDescription } from '../../svg/capability-blurb.js';
import { getCustomPassageInFamily, enforceWriteQuota } from '../../custom/db.js';
import { sanitizeSvg, SvgRejected, SVG_CAP_PASSAGE } from '../../svg/sanitize.js';
import { validatePassageInput } from '../../custom/validation.js';

export const UPDATE_CUSTOM_PASSAGE_DESCRIPTION = composeWriteToolDescription(
  'Update a custom passage. If the passage is in draft, edits the current version in place. If published, creates a new version (existing referencing questions still point at the old version until the parent runs bulk_upgrade_passage_references). Pass passage_svg=null to remove an existing SVG.',
  'update_custom_passage',
);

function bytesToHexLiteral(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`;
}

function sanitizeOrThrow(b64: string | null | undefined, slot: string): Buffer | null {
  if (b64 === null || b64 === undefined || b64.length === 0) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    throw new McpError('invalid_svg', `${slot}: not valid base64`);
  }
  try {
    return sanitizeSvg(decoded, SVG_CAP_PASSAGE);
  } catch (e) {
    if (e instanceof SvgRejected) {
      throw new McpError('invalid_svg', `${slot}: ${e.reason}${e.detail ? ` (${e.detail})` : ''}`);
    }
    throw e;
  }
}

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'update_custom_passage',
    UPDATE_CUSTOM_PASSAGE_DESCRIPTION,
    UpdateCustomPassageInput.shape,
    async (rawArgs) => {
      const args = UpdateCustomPassageInput.parse(rawArgs ?? {});
      try {
        enforceWriteQuota(ctx, 'passage_update', 1);
        const p = await getCustomPassageInFamily(ctx, args.passage_id);
        if (p.status === 'archived') {
          throw new McpError('invalid_passage_shape', 'cannot update an archived passage');
        }
        validatePassageInput(args);
        const svgBuf = sanitizeOrThrow(args.passage_svg, 'passage_svg');

        const isDraft = p.status === 'draft';
        let newVersionId: string;

        if (isDraft) {
          if (!p.current_version_id) {
            throw new McpError('invalid_passage_shape', 'draft passage has no current version');
          }
          newVersionId = p.current_version_id;
          const { error: vErr } = await ctx.supabase
            .from('map_custom_passage_versions')
            .update({
              subject: args.subject,
              grade: args.grade,
              title: args.title ?? null,
              body: args.body,
              passage_svg: args.passage_svg === null ? null : (svgBuf ? bytesToHexLiteral(svgBuf) : undefined),
              passage_svg_alt_text: args.passage_svg === null ? null : (args.passage_svg_alt_text ?? undefined),
              genre: args.genre ?? null,
              estimated_grade_level: args.estimated_grade_level ?? null,
              standard_codes: args.standard_codes ?? [],
              ai_metadata: args.ai_metadata ?? null,
            })
            .eq('id', newVersionId);
          if (vErr) throw new McpError('invalid_passage_shape', vErr.message);
        } else {
          const { data: maxRow } = await ctx.supabase
            .from('map_custom_passage_versions')
            .select('version_number')
            .eq('passage_id', p.id)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();
          const nextNumber = ((maxRow as unknown as { version_number: number } | null)?.version_number ?? 0) + 1;
          const { data: vRow, error: vErr } = await ctx.supabase
            .from('map_custom_passage_versions')
            .insert({
              passage_id: p.id,
              version_number: nextNumber,
              subject: args.subject,
              grade: args.grade,
              title: args.title ?? null,
              body: args.body,
              passage_svg: svgBuf ? bytesToHexLiteral(svgBuf) : null,
              passage_svg_alt_text: svgBuf ? args.passage_svg_alt_text ?? null : null,
              genre: args.genre ?? null,
              estimated_grade_level: args.estimated_grade_level ?? null,
              standard_codes: args.standard_codes ?? [],
              ai_metadata: args.ai_metadata ?? null,
            })
            .select('id')
            .single();
          if (vErr || !vRow) throw new McpError('invalid_passage_shape', vErr?.message ?? 'version insert failed');
          newVersionId = (vRow as unknown as { id: string }).id;
          await ctx.supabase
            .from('map_custom_passages')
            .update({ current_version_id: newVersionId, updated_at: new Date().toISOString() })
            .eq('id', p.id);
        }

        await logToolCall({
          ctx, toolName: 'update_custom_passage', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ passage_id: p.id, version_id: newVersionId, status: p.status }) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({
          ctx, toolName: 'update_custom_passage', toolArgs: args, status: 'error', errorMessage: msg, mode: 'write',
        });
        throw err;
      }
    },
  );
}
