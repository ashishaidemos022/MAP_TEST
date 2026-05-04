import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { UpdateCustomQuestionInput } from '../schemas.js';
import { McpError } from '../errors.js';
import { composeWriteToolDescription } from '../../svg/capability-blurb.js';
import { getCustomQuestionInFamily, getCustomPassageVersionInFamily, resolveCurrentPassageVersionInFamily, enforceWriteQuota } from '../../custom/db.js';
import { sanitizeSvg, SvgRejected, SVG_CAP_STEM, SVG_CAP_CHOICE } from '../../svg/sanitize.js';
import { validateQuestionDraft } from '../../custom/validation.js';

export const UPDATE_CUSTOM_QUESTION_DESCRIPTION = composeWriteToolDescription(
  'Update a custom question. If the question is in draft, edits the current version in place. If published, creates a new version. Pass passage_action="upgrade_to_current" to relink to the passage\'s current version, or "detach" (only valid for language). Pass *_svg=null to remove an existing SVG.',
  'update_custom_question',
);

function bytesToHexLiteral(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`;
}

function sanitizeOrThrow(b64: string | null | undefined, cap: number, slot: string): Buffer | null {
  if (b64 === null || b64 === undefined || b64.length === 0) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    throw new McpError('invalid_svg', `${slot}: not valid base64`);
  }
  try {
    return sanitizeSvg(decoded, cap);
  } catch (e) {
    if (e instanceof SvgRejected) {
      throw new McpError('invalid_svg', `${slot}: ${e.reason}${e.detail ? ` (${e.detail})` : ''}`);
    }
    throw e;
  }
}

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'update_custom_question',
    UPDATE_CUSTOM_QUESTION_DESCRIPTION,
    UpdateCustomQuestionInput.shape,
    async (rawArgs) => {
      const args = UpdateCustomQuestionInput.parse(rawArgs ?? {});
      try {
        enforceWriteQuota(ctx, 'question_update', 1);
        const q = await getCustomQuestionInFamily(ctx, args.question_id);
        if (q.status === 'archived') {
          throw new McpError('invalid_question_shape', 'cannot update an archived question');
        }

        // Resolve passage_version_id with action awareness.
        let pvId: string | null = args.passage_version_id ?? null;
        if (args.passage_action === 'upgrade_to_current') {
          if (!args.passage_id) throw new McpError('invalid_question_shape', 'upgrade_to_current requires passage_id');
          const pv = await resolveCurrentPassageVersionInFamily(ctx, args.passage_id);
          pvId = pv.id;
        } else if (args.passage_action === 'detach') {
          if (args.subject !== 'language') {
            throw new McpError('invalid_question_shape', 'detach is only valid for language questions');
          }
          pvId = null;
        } else if (args.passage_id && !pvId) {
          const pv = await resolveCurrentPassageVersionInFamily(ctx, args.passage_id);
          pvId = pv.id;
        } else if (pvId) {
          await getCustomPassageVersionInFamily(ctx, pvId);
        }

        validateQuestionDraft({ ...args, passage_version_id: pvId });

        // Sanitize SVGs.
        const stemSvg = sanitizeOrThrow(args.stem_svg, SVG_CAP_STEM, 'stem_svg');
        const choiceSvgs: (Buffer | null)[] = [];
        for (const c of args.choices) {
          choiceSvgs.push(sanitizeOrThrow(c.choice_svg, SVG_CAP_CHOICE, `choices[${c.label}].choice_svg`));
        }

        const isDraft = q.status === 'draft';
        let newVersionId: string;

        if (isDraft) {
          // Edit current version in place.
          if (!q.current_version_id) {
            throw new McpError('invalid_question_shape', 'draft question has no current version');
          }
          newVersionId = q.current_version_id;
          const { error: vErr } = await ctx.supabase
            .from('map_custom_question_versions')
            .update({
              subject: args.subject,
              grade: args.grade,
              stem: args.stem,
              stem_svg: args.stem_svg === null ? null : (stemSvg ? bytesToHexLiteral(stemSvg) : undefined),
              stem_svg_alt_text: args.stem_svg === null ? null : (args.stem_svg_alt_text ?? undefined),
              passage_version_id: pvId,
              question_focus: args.question_focus ?? null,
              standard_code: args.standard_code ?? null,
              difficulty: args.difficulty ?? null,
              ai_metadata: args.ai_metadata ?? null,
            })
            .eq('id', newVersionId);
          if (vErr) throw new McpError('invalid_question_shape', vErr.message);
          await ctx.supabase.from('map_custom_question_choices').delete().eq('version_id', newVersionId);
        } else {
          // Published — create a new version row.
          const { data: maxRow } = await ctx.supabase
            .from('map_custom_question_versions')
            .select('version_number')
            .eq('question_id', q.id)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();
          const nextNumber = ((maxRow as unknown as { version_number: number } | null)?.version_number ?? 0) + 1;
          const { data: vRow, error: vErr } = await ctx.supabase
            .from('map_custom_question_versions')
            .insert({
              question_id: q.id,
              version_number: nextNumber,
              subject: args.subject,
              grade: args.grade,
              stem: args.stem,
              stem_svg: stemSvg ? bytesToHexLiteral(stemSvg) : null,
              stem_svg_alt_text: stemSvg ? args.stem_svg_alt_text ?? null : null,
              passage_version_id: pvId,
              question_focus: args.question_focus ?? null,
              standard_code: args.standard_code ?? null,
              difficulty: args.difficulty ?? null,
              ai_metadata: args.ai_metadata ?? null,
            })
            .select('id')
            .single();
          if (vErr || !vRow) throw new McpError('invalid_question_shape', vErr?.message ?? 'version insert failed');
          newVersionId = (vRow as unknown as { id: string }).id;
          await ctx.supabase
            .from('map_custom_questions')
            .update({ current_version_id: newVersionId, updated_at: new Date().toISOString() })
            .eq('id', q.id);
        }

        const choiceRows = args.choices.map((c, i) => ({
          version_id: newVersionId,
          ordinal: i,
          label: c.label,
          text: c.text,
          choice_svg: choiceSvgs[i] ? bytesToHexLiteral(choiceSvgs[i]!) : null,
          choice_svg_alt_text: choiceSvgs[i] ? c.choice_svg_alt_text ?? null : null,
          is_correct: c.is_correct,
          explanation_correct: c.explanation_correct ?? null,
          explanation_wrong: c.explanation_wrong ?? null,
          misconception_tag: c.misconception_tag ?? null,
        }));
        const { error: chErr } = await ctx.supabase.from('map_custom_question_choices').insert(choiceRows);
        if (chErr) throw new McpError('invalid_question_shape', chErr.message);

        await logToolCall({
          ctx, toolName: 'update_custom_question', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ question_id: q.id, version_id: newVersionId, status: q.status }) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({
          ctx, toolName: 'update_custom_question', toolArgs: args, status: 'error', errorMessage: msg, mode: 'write',
        });
        throw err;
      }
    },
  );
}
