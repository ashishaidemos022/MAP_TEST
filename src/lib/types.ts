export type Subject = 'math' | 'reading' | 'language'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type RitBand =
  | 'below_161'
  | '161_170'
  | '171_180'
  | '181_190'
  | '191_200'
  | '201_210'
  | '211_220'
  | '221_230'
  | '231_240'
  | 'above_230' // legacy catchall introduced ad-hoc; treat as 231_240 bucket
  | 'above_210' // deprecated for G5+; kept so existing G2/G3 rows stay valid
export type PassageGenre = 'literary' | 'informational' | 'poetry' | 'drama'
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned'

export interface Standard {
  id: string
  subject: Subject
  grade: number
  teks_code: string
  teks_title: string
  teks_description: string
  reporting_category: string | null
  khan_unit: string | null
  nwea_goal_area: string | null
  staar_readiness: boolean
  is_supporting: boolean
  sort_order: number
}

export interface Passage {
  id: string
  title: string
  body: string
  genre: PassageGenre
  word_count: number | null
  lexile: number | null
  rit_band: RitBand
  source: string | null
  topic: string | null
}

export interface Question {
  id: string
  subject: Subject
  grade: number
  standard_id: string | null
  passage_id: string | null
  rit_band: RitBand
  difficulty: Difficulty
  stem: string
  stem_image_svg: string | null
  audio_supported: boolean
  explanation: string | null
  source_note: string | null
  is_active: boolean
  created_at: string
}

export interface Choice {
  id: string
  question_id: string
  label: 'A' | 'B' | 'C' | 'D'
  body: string
  body_image_svg: string | null
  is_correct: boolean
  misconception: string | null
  sort_order: number
}

export type SessionKind = 'test' | 'boost' | 'custom'

/** Shape of map_test_sessions.custom_config, only set when kind === 'custom'. */
export interface CustomTestConfig {
  standard_ids: string[]
  requested_count: number
  actual_count: number
  shortfall_reason: 'bank_thin' | null
}

export interface Session {
  id: string
  student_id: string | null
  subject: Subject
  /** Grade the session was taken at — captured when the session was created. */
  grade: number
  status: SessionStatus
  question_ids: string[]
  current_index: number
  correct_count: number
  estimated_rit: number | null
  started_at: string
  completed_at: string | null
  kind: SessionKind
  misconception_tag: string | null
  is_adaptive: boolean
  start_band: RitBand | null
  planned_length: number
  custom_config: CustomTestConfig | null
}

export interface MisconceptionSignal {
  id: string
  student_id: string
  misconception_tag: string
  occurrence_count: number
  consecutive_correct: number
  first_seen_at: string
  last_seen_at: string
  cleared_at: string | null
  active: boolean
}

export interface MisconceptionTag {
  tag: string
  subject: Subject
  display_name: string
  description: string
  remediation_hint: string | null
  related_teks: string[] | null
  child_cta: string | null
}

export interface Attempt {
  id: string
  session_id: string
  student_id: string | null
  question_id: string
  selected_choice_id: string | null
  is_correct: boolean | null
  time_spent_ms: number | null
  answered_at: string
}

export interface QuestionWithChoices extends Question {
  choices: Choice[]
  passage: Passage | null
  standard: Pick<Standard, 'teks_code' | 'teks_title'> | null
}

// --- Question reporting ("Report a problem") ---
export type ReportReason =
  | 'confusing_wording'
  | 'wrong_answer'
  | 'typo_or_error'
  | 'image_problem'
  | 'off_topic_or_hard'
  | 'other'

export type ReportStatus = 'new' | 'triaged' | 'resolved' | 'dismissed'

export interface QuestionReport {
  id: string
  question_id: string
  family_id: string
  student_id: string | null
  session_id: string | null
  selected_choice_id: string | null
  reason: ReportReason
  reason_text: string | null
  status: ReportStatus
  created_at: string
}

// Order here drives the radio list in ReportQuestionButton.
export const REPORT_REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: 'confusing_wording', label: 'The question is confusing' },
  { value: 'wrong_answer', label: 'The right answer looks wrong' },
  { value: 'typo_or_error', label: "There's a typo or mistake" },
  { value: 'image_problem', label: 'The picture is broken or wrong' },
  { value: 'off_topic_or_hard', label: "This doesn't fit / too hard" },
  { value: 'other', label: 'Something else' },
]
