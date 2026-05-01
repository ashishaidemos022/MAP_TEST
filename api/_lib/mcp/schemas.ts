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
