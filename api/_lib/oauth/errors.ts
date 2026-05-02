// RFC 6749 §5.2 + §4.1.2.1 + RFC 7591 + RFC 7009 error codes.
export const OAUTH_ERROR_CODES = {
  invalid_request: 'invalid_request',
  invalid_client: 'invalid_client',
  invalid_grant: 'invalid_grant',
  unauthorized_client: 'unauthorized_client',
  unsupported_grant_type: 'unsupported_grant_type',
  invalid_scope: 'invalid_scope',
  invalid_redirect_uri: 'invalid_redirect_uri',
  invalid_client_metadata: 'invalid_client_metadata',
  server_error: 'server_error',
  access_denied: 'access_denied',
  unsupported_response_type: 'unsupported_response_type',
  rate_limited: 'rate_limited',
} as const;

export type OAuthErrorCode = keyof typeof OAUTH_ERROR_CODES;

export class OAuthError extends Error {
  readonly code: OAuthErrorCode;
  readonly httpStatus: number;
  constructor(code: OAuthErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function buildOAuthErrorResponse(err: OAuthError): Response {
  return new Response(
    JSON.stringify({ error: err.code, error_description: err.message }),
    { status: err.httpStatus, headers: { 'Content-Type': 'application/json' } },
  );
}
