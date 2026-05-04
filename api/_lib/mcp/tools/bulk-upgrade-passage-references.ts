import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../auth.js';
import { logToolCall } from '../audit.js';
import { BulkUpgradePassageReferencesInput } from '../schemas.js';
import { McpError } from '../errors.js';
import { getCustomPassageInFamily, getCustomQuestionInFamily, enforceWriteQuota } from '../../custom/db.js';

export const BULK_UPGRADE_PASSAGE_REFERENCES_DESCRIPTION =
  "Upgrade a batch of questions' passage references to the passage's current version. Each listed question gets a NEW version pointing at the passage's current_version_id; old versions stay intact (kid attempt history is preserved). Atomic against the question_update quota — if the batch would breach the cap, no question is upgraded.";

export function register(server: McpServer, ctx: McpContext): void {
  server.tool(
    'bulk_upgrade_passage_references',
    BULK_UPGRADE_PASSAGE_REFERENCES_DESCRIPTION,
    BulkUpgradePassageReferencesInput.shape,
    async (rawArgs) => {
      const args = BulkUpgradePassageReferencesInput.parse(rawArgs ?? {});
      try {
        enforceWriteQuota(ctx, 'question_update', args.question_ids.length);

        const passage = await getCustomPassageInFamily(ctx, args.passage_id);
        if (!passage.current_version_id) {
          throw new McpError('invalid_passage_shape', 'passage has no current version');
        }
        const targetPv = passage.current_version_id;

        const upgraded: Array<{ question_id: string; new_version_id: string }> = [];
        for (const qid of args.question_ids) {
          const q = await getCustomQuestionInFamily(ctx, qid);
          if (!q.current_version_id) continue;

          // Read current version to copy fields.
          const { data: oldV, error: oldErr } = await ctx.supabase
            .from('map_custom_question_versions')
            .select('subject, grade, stem, stem_svg, stem_svg_alt_text, standard_code, difficulty, question_focus, ai_metadata')
            .eq('id', q.current_version_id)
            .single();
          if (oldErr || !oldV) throw new McpError('internal', oldErr?.message ?? 'old version missing', 500);

          // Insert new version pointing at the upgraded passage.
          const { data: maxRow } = await ctx.supabase
            .from('map_custom_question_versions')
            .select('version_number')
            .eq('question_id', q.id)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();
          const nextNumber = ((maxRow as unknown as { version_number: number } | null)?.version_number ?? 0) + 1;
          const { data: newV, error: newErr } = await ctx.supabase
            .from('map_custom_question_versions')
            .insert({
              question_id: q.id,
              version_number: nextNumber,
              subject: (oldV as unknown as { subject: string }).subject,
              grade: (oldV as unknown as { grade: number }).grade,
              stem: (oldV as unknown as { stem: string }).stem,
              stem_svg: (oldV as unknown as { stem_svg: unknown }).stem_svg,
              stem_svg_alt_text: (oldV as unknown as { stem_svg_alt_text: string | null }).stem_svg_alt_text,
              passage_version_id: targetPv,
              question_focus: (oldV as unknown as { question_focus: string | null }).question_focus,
              standard_code: (oldV as unknown as { standard_code: string | null }).standard_code,
              difficulty: (oldV as unknown as { difficulty: number | null }).difficulty,
              ai_metadata: (oldV as unknown as { ai_metadata: unknown }).ai_metadata,
            })
            .select('id')
            .single();
          if (newErr || !newV) throw new McpError('invalid_question_shape', newErr?.message ?? 'new version insert failed');
          const newVid = (newV as unknown as { id: string }).id;

          // Copy choices.
          const { data: choices } = await ctx.supabase
            .from('map_custom_question_choices')
            .select('ordinal, label, text, choice_svg, choice_svg_alt_text, is_correct, explanation_correct, explanation_wrong, misconception_tag')
            .eq('version_id', q.current_version_id);
          if (choices && choices.length > 0) {
            const newChoices = choices.map((c) => ({
              version_id: newVid,
              ordinal: (c as unknown as { ordinal: number }).ordinal,
              label: (c as unknown as { label: string }).label,
              text: (c as unknown as { text: string }).text,
              choice_svg: (c as unknown as { choice_svg: unknown }).choice_svg,
              choice_svg_alt_text: (c as unknown as { choice_svg_alt_text: string | null }).choice_svg_alt_text,
              is_correct: (c as unknown as { is_correct: boolean }).is_correct,
              explanation_correct: (c as unknown as { explanation_correct: string | null }).explanation_correct,
              explanation_wrong: (c as unknown as { explanation_wrong: string | null }).explanation_wrong,
              misconception_tag: (c as unknown as { misconception_tag: string | null }).misconception_tag,
            }));
            const { error: chErr } = await ctx.supabase.from('map_custom_question_choices').insert(newChoices);
            if (chErr) throw new McpError('invalid_question_shape', chErr.message);
          }

          await ctx.supabase
            .from('map_custom_questions')
            .update({ current_version_id: newVid, updated_at: new Date().toISOString() })
            .eq('id', q.id);

          upgraded.push({ question_id: q.id, new_version_id: newVid });
        }

        await logToolCall({
          ctx, toolName: 'bulk_upgrade_passage_references', toolArgs: args, status: 'ok', mode: 'write',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ upgraded }) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logToolCall({
          ctx, toolName: 'bulk_upgrade_passage_references', toolArgs: args, status: 'error', errorMessage: msg, mode: 'write',
        });
        throw err;
      }
    },
  );
}
