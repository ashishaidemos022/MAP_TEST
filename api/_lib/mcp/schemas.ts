import { z } from 'zod';

// Reusable bits
const SubjectEnum = z.enum(['math', 'reading', 'language']);
const Uuid = z.string().uuid();

export const ListKidsInput = z.object({}).strict();
export type ListKidsInput = z.infer<typeof ListKidsInput>;

export const GetKidOverviewInput = z.object({ student_id: Uuid }).strict();
export type GetKidOverviewInput = z.infer<typeof GetKidOverviewInput>;

export const ListRecentSessionsInput = z
  .object({
    student_id: Uuid,
    limit: z.number().int().min(1).max(50).default(10),
    subject: SubjectEnum.optional(),
  })
  .strict();
export type ListRecentSessionsInput = z.infer<typeof ListRecentSessionsInput>;

export const GetSessionDetailsInput = z.object({ session_id: Uuid }).strict();
export type GetSessionDetailsInput = z.infer<typeof GetSessionDetailsInput>;

export const GetAccuracyByStandardInput = z
  .object({
    student_id: Uuid,
    subject: SubjectEnum.optional(),
    since_days: z.number().int().min(1).max(365).default(30),
    min_questions: z.number().int().min(1).max(100).default(3),
  })
  .strict();
export type GetAccuracyByStandardInput = z.infer<typeof GetAccuracyByStandardInput>;

export const GetTopMisconceptionsInput = z
  .object({
    student_id: Uuid,
    since_days: z.number().int().min(1).max(365).default(30),
    limit: z.number().int().min(1).max(25).default(10),
  })
  .strict();
export type GetTopMisconceptionsInput = z.infer<typeof GetTopMisconceptionsInput>;

export const GetRecentWrongAnswersInput = z
  .object({
    student_id: Uuid,
    limit: z.number().int().min(1).max(50).default(20),
    subject: SubjectEnum.optional(),
    since_days: z.number().int().min(1).max(365).default(14),
  })
  .strict();
export type GetRecentWrongAnswersInput = z.infer<typeof GetRecentWrongAnswersInput>;

export const GetActivityCalendarInput = z
  .object({
    student_id: Uuid,
    since_days: z.number().int().min(1).max(180).default(30),
  })
  .strict();
export type GetActivityCalendarInput = z.infer<typeof GetActivityCalendarInput>;

export const CompareKidsInput = z
  .object({
    subject: SubjectEnum.optional(),
    since_days: z.number().int().min(1).max(365).default(30),
  })
  .strict();
export type CompareKidsInput = z.infer<typeof CompareKidsInput>;

// ===========================================================================
// Custom-question bank (Phase 4 Cycle 1) — write-tool inputs.
// Custom_Questions_Brief.md §5.1-§5.10.
// ===========================================================================

const PassageSubjectEnum = z.enum(['reading', 'language']);
const QuestionStatusEnum = z.enum(['draft', 'published', 'archived']);
const SourceEnum = z.enum(['parent_manual', 'parent_ai_assisted', 'parent_ai_generated']);
const GenreEnum = z.enum([
  'fiction', 'nonfiction', 'poetry', 'drama', 'informational', 'editing_draft',
]);
const ChoiceLabelEnum = z.enum(['A', 'B', 'C', 'D', 'E']);

// SVG inputs are base64 strings on the wire. We don't enforce the byte cap
// here because the sanitizer does that with byte-accurate measurement on the
// decoded bytes; this just guards against obviously-empty values.
const Base64Svg = z.string().min(8);
const SvgAltText = z.string().min(1).max(500);

const ChoiceInputSchema = z.object({
  label: ChoiceLabelEnum,
  text: z.string().min(1).max(500),
  is_correct: z.boolean(),
  choice_svg: Base64Svg.nullable().optional(),
  choice_svg_alt_text: z.string().min(1).max(300).nullable().optional(),
  explanation_correct: z.string().min(1).max(1500).nullable().optional(),
  explanation_wrong: z.string().min(1).max(1500).nullable().optional(),
  misconception_tag: z.string().min(1).max(80).nullable().optional(),
}).strict();

const QuestionInputSchema = z.object({
  subject: SubjectEnum,
  grade: z.number().int().min(0).max(12),
  stem: z.string().min(5).max(2000),
  stem_svg: Base64Svg.nullable().optional(),
  stem_svg_alt_text: SvgAltText.nullable().optional(),
  standard_code: z.string().min(1).max(40).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  question_focus: z.string().min(1).max(200).nullable().optional(),
  passage_id: Uuid.nullable().optional(),
  passage_version_id: Uuid.nullable().optional(),
  ai_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  choices: z.array(ChoiceInputSchema).min(1).max(5),
}).strict();

const PassageInputSchema = z.object({
  subject: PassageSubjectEnum,
  grade: z.number().int().min(0).max(12),
  title: z.string().min(1).max(200).nullable().optional(),
  body: z.string().min(50).max(10_000),
  passage_svg: Base64Svg.nullable().optional(),
  passage_svg_alt_text: SvgAltText.nullable().optional(),
  genre: GenreEnum.nullable().optional(),
  estimated_grade_level: z.number().min(0).max(12).nullable().optional(),
  standard_codes: z.array(z.string().min(1).max(40)).max(20).optional(),
  ai_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();

// 5.1 list_custom_questions
export const ListCustomQuestionsInput = z.object({
  status: QuestionStatusEnum.optional(),
  subject: SubjectEnum.optional(),
  source: SourceEnum.optional(),
  has_passage: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
}).strict();
export type ListCustomQuestionsInput = z.infer<typeof ListCustomQuestionsInput>;

// 5.2 get_custom_question
export const GetCustomQuestionInput = z.object({
  question_id: Uuid,
  version_number: z.number().int().min(1).optional(),
}).strict();
export type GetCustomQuestionInput = z.infer<typeof GetCustomQuestionInput>;

// 5.3 list_custom_passages
export const ListCustomPassagesInput = z.object({
  status: QuestionStatusEnum.optional(),
  subject: PassageSubjectEnum.optional(),
  source: SourceEnum.optional(),
  genre: GenreEnum.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
}).strict();
export type ListCustomPassagesInput = z.infer<typeof ListCustomPassagesInput>;

// 5.4 get_custom_passage
export const GetCustomPassageInput = z.object({
  passage_id: Uuid,
  version_number: z.number().int().min(1).optional(),
}).strict();
export type GetCustomPassageInput = z.infer<typeof GetCustomPassageInput>;

// Refine helpers shared by both creation schemas.
const bankTargetRefine = (b: { bank_id?: string; bank_name?: string }) =>
  (Boolean(b.bank_id) !== Boolean(b.bank_name));
const bankTargetMsg = 'Provide exactly one of bank_id or bank_name';

// 5.5 create_custom_questions
// The inner ZodObject is exported separately so tool registrations can access
// .shape for SDK parameter derivation (ZodEffects doesn't expose .shape).
// Tasks 6 & 7 will switch tool files from Schema.shape to SchemaShape.shape.
export const CreateCustomQuestionsShape = z.object({
  bank_id:   z.string().uuid().optional(),
  bank_name: z.string().min(1).max(120).optional(),
  questions: z.array(QuestionInputSchema).min(1).max(25),
}).strict();
export const CreateCustomQuestionsInput = CreateCustomQuestionsShape
  .refine(bankTargetRefine, { message: bankTargetMsg });
export type CreateCustomQuestionsInput = z.infer<typeof CreateCustomQuestionsInput>;

// 5.6 create_custom_passage_and_questions
// Same pattern: inner shape exported for .shape access; refined schema for .parse().
export const CreateCustomPassageAndQuestionsShape = z.object({
  bank_id:   z.string().uuid().optional(),
  bank_name: z.string().min(1).max(120).optional(),
  passage:   PassageInputSchema,
  questions: z.array(
    QuestionInputSchema.omit({ passage_id: true, passage_version_id: true }).extend({
      // Inside this composite call, math is invalid (the questions auto-attach).
      subject: PassageSubjectEnum,
    }),
  ).min(1).max(8),
}).strict();
export const CreateCustomPassageAndQuestionsInput = CreateCustomPassageAndQuestionsShape
  .refine(bankTargetRefine, { message: bankTargetMsg });
export type CreateCustomPassageAndQuestionsInput = z.infer<typeof CreateCustomPassageAndQuestionsInput>;

// 5.7 update_custom_question
export const UpdateCustomQuestionInput = QuestionInputSchema.extend({
  question_id: Uuid,
  passage_action: z.enum(['upgrade_to_current', 'detach']).optional(),
}).strict();
export type UpdateCustomQuestionInput = z.infer<typeof UpdateCustomQuestionInput>;

// 5.8 update_custom_passage
export const UpdateCustomPassageInput = PassageInputSchema.extend({
  passage_id: Uuid,
}).strict();
export type UpdateCustomPassageInput = z.infer<typeof UpdateCustomPassageInput>;

// 5.9 bulk_upgrade_passage_references
export const BulkUpgradePassageReferencesInput = z.object({
  passage_id: Uuid,
  question_ids: z.array(Uuid).min(1).max(50),
}).strict();
export type BulkUpgradePassageReferencesInput = z.infer<typeof BulkUpgradePassageReferencesInput>;

// 5.10 publish_custom_question / publish_custom_passage
export const PublishCustomQuestionInput = z.object({ question_id: Uuid }).strict();
export type PublishCustomQuestionInput = z.infer<typeof PublishCustomQuestionInput>;

export const PublishCustomPassageInput = z.object({ passage_id: Uuid }).strict();
export type PublishCustomPassageInput = z.infer<typeof PublishCustomPassageInput>;
