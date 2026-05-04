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
} as const;

export type McpErrorCode = keyof typeof MCP_ERROR_CODES;

export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly httpStatus: number;
  constructor(code: McpErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
