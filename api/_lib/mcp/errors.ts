export const MCP_ERROR_CODES = {
  invalid_request: 'invalid_request',
  unauthorized: 'unauthorized',
  forbidden_origin: 'forbidden_origin',
  rate_limited: 'rate_limited',
  student_not_in_family: 'student_not_in_family',
  session_not_in_family: 'session_not_in_family',
  not_found: 'not_found',
  bad_input: 'bad_input',
  internal: 'internal',
  // Custom-question bank (Phase 4)
  question_not_in_family: 'question_not_in_family',
  passage_not_in_family: 'passage_not_in_family',
  passage_version_not_in_family: 'passage_version_not_in_family',
  invalid_question_shape: 'invalid_question_shape',
  invalid_passage_shape: 'invalid_passage_shape',
  invalid_svg: 'invalid_svg',
  mixed_choice_svg_not_allowed: 'mixed_choice_svg_not_allowed',
  write_quota_exceeded: 'write_quota_exceeded',
  // Bank-first authoring (Phase 4.1)
  bank_capacity_exceeded: 'bank_capacity_exceeded',
  bank_not_custom_lane: 'bank_not_custom_lane',
  bank_target_mismatch: 'bank_target_mismatch',
  mixed_subjects_in_call: 'mixed_subjects_in_call',
} as const;

export type McpErrorCode = keyof typeof MCP_ERROR_CODES;

export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly httpStatus: number;
  // The original (un-prefixed) message — useful for callers that want the
  // human-readable detail without the redundant code prefix.
  readonly detail: string;
  constructor(code: McpErrorCode, message: string, httpStatus = 400) {
    // Prefix the code into the message so JSON-RPC tool responses (which only
    // surface .message) carry the structured classification too. Lets agents
    // grep for `invalid_svg`, `passage_not_in_family`, etc. in the response
    // text. Custom_Questions_Brief.md §12.10a requires this for SVG rejection.
    const alreadyPrefixed = message.startsWith(`${code}:`);
    super(alreadyPrefixed ? message : `${code}: ${message}`);
    this.name = 'McpError';
    this.code = code;
    this.detail = message;
    this.httpStatus = httpStatus;
  }
}
