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
