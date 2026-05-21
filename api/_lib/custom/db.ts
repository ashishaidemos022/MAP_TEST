// Service-role helpers for the custom-question bank — Custom_Questions_Brief.md
// §6 (server-side scoping for writes). Mirrors the Phase 3 pattern in
// api/_lib/mcp/db.ts: take an explicit family_id from the auth context, never
// trust the caller, and throw McpError with a structured code on miss.

import type { McpContext } from '../mcp/auth.js'
import { McpError } from '../mcp/errors.js'

function assertFamily(ctx: McpContext): string {
  if (!ctx.family_id) {
    throw new McpError('internal', 'family_id missing from auth context', 500)
  }
  return ctx.family_id
}

export type CustomQuestionRow = {
  id: string
  family_id: string
  status: string
  source: string
  current_version_id: string | null
  created_at: string
  updated_at: string
}

export async function getCustomQuestionInFamily(
  ctx: McpContext,
  questionId: string,
): Promise<CustomQuestionRow> {
  const family_id = assertFamily(ctx)
  const { data, error } = await ctx.supabase
    .from('map_custom_questions')
    .select('id, family_id, status, source, current_version_id, created_at, updated_at')
    .eq('id', questionId)
    .eq('family_id', family_id)
    .is('soft_deleted_at', null)
    .maybeSingle()
  if (error) throw new McpError('internal', error.message, 500)
  if (!data) {
    throw new McpError(
      'question_not_in_family',
      `question ${questionId} not found in this family`,
    )
  }
  return data as CustomQuestionRow
}

export type CustomPassageRow = {
  id: string
  family_id: string
  status: string
  source: string
  current_version_id: string | null
  created_at: string
  updated_at: string
}

export async function getCustomPassageInFamily(
  ctx: McpContext,
  passageId: string,
): Promise<CustomPassageRow> {
  const family_id = assertFamily(ctx)
  const { data, error } = await ctx.supabase
    .from('map_custom_passages')
    .select('id, family_id, status, source, current_version_id, created_at, updated_at')
    .eq('id', passageId)
    .eq('family_id', family_id)
    .is('soft_deleted_at', null)
    .maybeSingle()
  if (error) throw new McpError('internal', error.message, 500)
  if (!data) {
    throw new McpError(
      'passage_not_in_family',
      `passage ${passageId} not found in this family`,
    )
  }
  return data as CustomPassageRow
}

export type CustomPassageVersionRow = {
  id: string
  passage_id: string
  family_id: string
  version_number: number
  subject: string
  grade: number
}

/**
 * Resolve a passage_version_id to its row AFTER verifying the passage it
 * belongs to is in the requesting family. Used by question-create handlers
 * to confirm cross-family attachment is impossible.
 */
export async function getCustomPassageVersionInFamily(
  ctx: McpContext,
  passageVersionId: string,
): Promise<CustomPassageVersionRow> {
  const family_id = assertFamily(ctx)
  const { data, error } = await ctx.supabase
    .from('map_custom_passage_versions')
    .select(
      'id, passage_id, version_number, subject, grade, map_custom_passages!map_custom_passage_versions_passage_id_fkey!inner(family_id, soft_deleted_at)',
    )
    .eq('id', passageVersionId)
    .maybeSingle()
  if (error) throw new McpError('internal', error.message, 500)
  if (!data) {
    throw new McpError(
      'passage_version_not_in_family',
      `passage version ${passageVersionId} not found`,
    )
  }
  const join = (data as unknown as {
    map_custom_passages: { family_id: string; soft_deleted_at: string | null } | { family_id: string; soft_deleted_at: string | null }[]
  }).map_custom_passages
  const parent = Array.isArray(join) ? join[0] : join
  if (!parent || parent.family_id !== family_id || parent.soft_deleted_at !== null) {
    throw new McpError(
      'passage_version_not_in_family',
      `passage version ${passageVersionId} not in this family`,
    )
  }
  return {
    id: (data as { id: string }).id,
    passage_id: (data as { passage_id: string }).passage_id,
    family_id: parent.family_id,
    version_number: (data as { version_number: number }).version_number,
    subject: (data as { subject: string }).subject,
    grade: (data as { grade: number }).grade,
  }
}

/**
 * Resolve a passage's current_version_id, scoped to the family. Used when an
 * agent passes passage_id (header-level) and we need the version it should
 * link to. Throws if the passage is in 'draft' (no current published version
 * to link to) or in another family.
 */
export async function resolveCurrentPassageVersionInFamily(
  ctx: McpContext,
  passageId: string,
): Promise<CustomPassageVersionRow> {
  const passage = await getCustomPassageInFamily(ctx, passageId)
  if (!passage.current_version_id) {
    throw new McpError(
      'invalid_question_shape',
      `passage ${passageId} has no current version`,
    )
  }
  return getCustomPassageVersionInFamily(ctx, passage.current_version_id)
}

// ===== Write quotas (Custom_Questions_Brief.md §2 Amendment B) =====
//
// Per-family per-day caps tracked in an in-memory bucket (matches the Phase 3
// rate-limit pattern). Resets at UTC midnight (the brief mentions family
// timezone but we don't have a timezone column yet — Cycle 1 uses UTC).

export type WriteQuotaKind =
  | 'question_create'
  | 'question_update'
  | 'passage_create'
  | 'passage_update'

interface QuotaBucket {
  date: string // YYYY-MM-DD UTC
  counts: Record<WriteQuotaKind, number>
}

const QUOTA_BUCKETS = new Map<string, QuotaBucket>()

function utcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function bucketKey(family_id: string): string {
  return family_id
}

export const DEFAULT_QUOTA_LIMITS: Record<WriteQuotaKind, number> = {
  question_create: 250,
  question_update: 100,
  passage_create: 50,
  passage_update: 25,
}

function readLimit(kind: WriteQuotaKind): number {
  switch (kind) {
    case 'question_create':
      return Number(process.env.MAP_CUSTOM_Q_DAILY_CREATE_LIMIT ?? DEFAULT_QUOTA_LIMITS.question_create)
    case 'question_update':
      return Number(process.env.MAP_CUSTOM_Q_DAILY_UPDATE_LIMIT ?? DEFAULT_QUOTA_LIMITS.question_update)
    case 'passage_create':
      return Number(process.env.MAP_CUSTOM_P_DAILY_CREATE_LIMIT ?? DEFAULT_QUOTA_LIMITS.passage_create)
    case 'passage_update':
      return Number(process.env.MAP_CUSTOM_P_DAILY_UPDATE_LIMIT ?? DEFAULT_QUOTA_LIMITS.passage_update)
  }
}

/**
 * Check quota and reserve `count` slots atomically. Throws McpError(429,
 * 'write_quota_exceeded') if the reservation would breach the cap, with a
 * `resets_at` ISO date for tomorrow's UTC midnight.
 *
 * Per §5.6 the composite create_custom_passage_and_questions counts against
 * BOTH passage_create and question_create — call this twice for that case.
 *
 * Per §5.9 bulk_upgrade_passage_references is atomic: call enforceWriteQuota
 * with the full count BEFORE doing any updates so a quota breach blocks the
 * whole batch.
 */
export function enforceWriteQuota(
  ctx: McpContext,
  kind: WriteQuotaKind,
  count: number,
): void {
  const family_id = assertFamily(ctx)
  const today = utcDate()
  const key = bucketKey(family_id)
  let b = QUOTA_BUCKETS.get(key)
  if (!b || b.date !== today) {
    b = {
      date: today,
      counts: { question_create: 0, question_update: 0, passage_create: 0, passage_update: 0 },
    }
    QUOTA_BUCKETS.set(key, b)
  }
  const limit = readLimit(kind)
  if (b.counts[kind] + count > limit) {
    const tomorrow = new Date(`${today}T00:00:00Z`)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    throw new McpError(
      'write_quota_exceeded',
      JSON.stringify({
        scope: 'family',
        kind,
        limit,
        used: b.counts[kind],
        requested: count,
        resets_at: tomorrow.toISOString(),
      }),
      429,
    )
  }
  b.counts[kind] += count
}

/**
 * Roll back a previously-reserved quota slot count. Used when a tool
 * pre-reserves quota and a later step fails (so the reservation is not
 * permanently consumed).
 */
export function refundWriteQuota(
  ctx: McpContext,
  kind: WriteQuotaKind,
  count: number,
): void {
  const family_id = assertFamily(ctx)
  const today = utcDate()
  const b = QUOTA_BUCKETS.get(bucketKey(family_id))
  if (!b || b.date !== today) return
  b.counts[kind] = Math.max(0, b.counts[kind] - count)
}

// Test-only export. Used by acceptance tests to start each test from a clean
// per-family quota bucket.
export const __test_resetQuotaBuckets = (): void => {
  QUOTA_BUCKETS.clear()
}

/** Resolve a bank_id, asserting it belongs to the family, is custom-lane,
 *  not soft-deleted, and matches the call's subject + grade. */
export async function resolveBankById(
  ctx: McpContext,
  bankId: string,
  subject: 'math' | 'reading' | 'language',
  grade: number,
): Promise<{ id: string; name: string }> {
  const { data, error } = await ctx.supabase
    .from('map_question_banks')
    .select('id, name, lane, subject, grade, soft_deleted_at')
    .eq('id', bankId)
    .maybeSingle();
  if (error) throw new McpError('internal', `bank lookup failed: ${error.message}`, 500);
  if (!data || data.soft_deleted_at)
    throw new McpError('bank_target_mismatch', `bank ${bankId} not found in your family`);
  if (data.lane !== 'custom')
    throw new McpError('bank_not_custom_lane', `bank ${bankId} is a vetted recipe; AI authoring only targets custom banks`);
  if (data.subject !== subject || data.grade !== grade)
    throw new McpError(
      'bank_target_mismatch',
      `bank ${bankId} is ${data.subject} G${data.grade}; this call is ${subject} G${grade}`,
    );
  return { id: data.id, name: data.name };
}

/** Create-or-find a custom bank by (name, subject, grade) within the family.
 *  Returns the resolved (possibly suffixed) name. */
export async function resolveCreateOrFindBank(
  ctx: McpContext,
  name: string,
  subject: 'math' | 'reading' | 'language',
  grade: number,
): Promise<{ id: string; name: string; wasCreated: boolean }> {
  const { data, error } = await ctx.supabase.rpc('map_create_or_find_custom_bank', {
    p_name: name,
    p_subject: subject,
    p_grade: grade,
    // Service-role calls have no auth.uid(), so map_current_family_id()
    // inside the RPC returns NULL. Pass our resolved family explicitly.
    p_family_id: ctx.family_id,
  });
  if (error) {
    // The Postgres function raises explicit exceptions for these validation
    // cases — surface them as bad_input rather than internal.
    if (/name must be 1\.\.120 chars|unknown subject|grade out of range/.test(error.message)) {
      throw new McpError('bad_input', error.message);
    }
    throw new McpError('internal', `bank create-or-find failed: ${error.message}`, 500);
  }
  const row = (data ?? [])[0];
  if (!row) throw new McpError('bank_target_mismatch', 'create-or-find returned no row');
  return { id: row.bank_id, name: row.resolved_name, wasCreated: row.was_created };
}

/** Append items to a custom bank. Maps DB exceptions to structured codes. */
export async function addItemsToBank(
  ctx: McpContext,
  bankId: string,
  questionIds: string[],
  passageIds: string[],
): Promise<void> {
  const { error } = await ctx.supabase.rpc('map_add_items_to_bank', {
    p_bank_id: bankId,
    p_question_ids: questionIds,
    p_passage_ids: passageIds,
    // Same reason as resolveCreateOrFindBank above.
    p_family_id: ctx.family_id,
  });
  if (!error) return;
  if (/at most 60 items/.test(error.message)) {
    throw new McpError('bank_capacity_exceeded', error.message);
  }
  if (/bank not found or not yours|only custom banks accept items/.test(error.message)) {
    throw new McpError('bank_target_mismatch', error.message);
  }
  if (/one or more (questions|passages) are not yours, are deleted, or do not match the bank/.test(error.message)) {
    throw new McpError('bank_target_mismatch', error.message);
  }
  throw new McpError('internal', `bank add-items failed: ${error.message}`, 500);
}

/** Count items currently in a bank (used to short-circuit cap errors before insert). */
export async function getBankItemCount(ctx: McpContext, bankId: string): Promise<number> {
  const { count, error } = await ctx.supabase
    .from('map_question_bank_items')
    .select('id', { count: 'exact', head: true })
    .eq('bank_id', bankId);
  if (error) throw new McpError('internal', `bank item-count failed: ${error.message}`, 500);
  return count ?? 0;
}
