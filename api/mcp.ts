export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { randomUUID } from 'node:crypto';
import { isAllowedOrigin } from './_lib/mcp/origin.js';
import { resolveContextOrThrow, bumpLastUsedAt, buildUnauthorizedResponse } from './_lib/mcp/auth.js';
import { enforceRateLimit, buildRateLimitedResponse } from './_lib/mcp/rate-limit.js';
import { registerTools } from './_lib/mcp/tools/index.js';
import { McpError } from './_lib/mcp/errors.js';

async function dispatch(req: Request): Promise<Response> {
  // 1. Origin check (DNS rebinding guard)
  const origin = req.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return new Response('forbidden origin', { status: 403 });
  }

  // 2. Auth
  let ctx;
  try {
    ctx = await resolveContextOrThrow(req);
  } catch (err) {
    if (err instanceof McpError && err.code === 'unauthorized') {
      const code = /header/i.test(err.message) ? 'invalid_request' : 'invalid_token';
      return buildUnauthorizedResponse(err.message, code);
    }
    if (err instanceof McpError) {
      return new Response(err.message, { status: err.httpStatus });
    }
    throw err;
  }

  // 3. Rate limit
  try {
    enforceRateLimit(ctx.token_id);
  } catch (err) {
    if (err instanceof McpError && err.code === 'rate_limited') {
      const retry = (err as McpError & { retryAfter?: number }).retryAfter ?? 60;
      return buildRateLimitedResponse(retry);
    }
    throw err;
  }

  // 4. Bump last_used_at (await; ~20-50ms)
  await bumpLastUsedAt(ctx);

  // 5. Per-request server with tools bound to ctx
  const server = new McpServer(
    { name: 'map-practice-family', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(server, ctx);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  }
  try {
    return await dispatch(req);
  } catch (err) {
    console.error('[mcp] unhandled', err);
    const msg = err instanceof Error ? err.message : 'internal error';
    return new Response(JSON.stringify({ error: 'internal', message: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
