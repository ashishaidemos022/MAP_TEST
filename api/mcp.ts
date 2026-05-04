export const config = { runtime: 'nodejs', maxDuration: 30 } as const;

import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isAllowedOrigin } from './_lib/mcp/origin.js';
import { resolveContextOrThrow, bumpLastUsedAt, buildUnauthorizedResponse } from './_lib/mcp/auth.js';
import { enforceRateLimit, buildRateLimitedResponse } from './_lib/mcp/rate-limit.js';
import { registerTools } from './_lib/mcp/tools/index.js';
import { McpError } from './_lib/mcp/errors.js';

const SERVER_INSTRUCTIONS = [
  'This MCP server represents one family\'s practice data on the MAP test prep platform.',
  'You can read the family\'s practice history (9 read tools) and create custom practice content (write tools).',
  '',
  'Custom content (passages and questions) supports inline SVG illustrations on three slots:',
  'a passage, a question stem, and each of a question\'s answer choices.',
  'Use SVG when a figure makes the question clearer (geometry, charts, "which shape" choices).',
  'Skip it when text alone is sufficient.',
  '',
  'SVG constraints (enforced server-side; violations return invalid_svg errors):',
  '- Root must be <svg> with a viewBox. No external references, no scripts, no event handlers,',
  '  no foreignObject, no animations, no embedded raster images.',
  '- Use only basic geometric and text elements: path, rect, circle, line, polygon, text, g, defs,',
  '  gradients, patterns, markers.',
  '- Size cap: 64KB for passages and stems, 32KB for individual answer choices.',
  '- Always include readable alt text. Every SVG must come with an alt_text field.',
  '- On a single question, either every answer choice has an SVG or none do.',
  '- Use neutral colors that work on light and dark backgrounds.',
  '',
  'All content you create lands in status="draft" and requires the parent to publish it via the',
  'app\'s review queue. There is no auto-publish.',
].join('\n');

async function dispatch(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return new Response('forbidden origin', { status: 403 });
  }

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

  try {
    enforceRateLimit(ctx.token_id);
  } catch (err) {
    if (err instanceof McpError && err.code === 'rate_limited') {
      const retry = (err as McpError & { retryAfter?: number }).retryAfter ?? 60;
      return buildRateLimitedResponse(retry);
    }
    throw err;
  }

  await bumpLastUsedAt(ctx);

  const server = new McpServer(
    {
      name: 'map-practice-family',
      version: '1.1.0',
    },
    {
      capabilities: { tools: {} },
      // §4.13 — capability advertisement. Agents read this on connect.
      instructions: SERVER_INSTRUCTIONS,
    },
  );
  registerTools(server, ctx);

  // Stateless mode: omit sessionIdGenerator. Each request is self-contained
  // (a serverless function instance can't reliably persist sessions across
  // requests anyway). enableJsonResponse returns plain JSON, not SSE.
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

// @vercel/node passes Node IncomingMessage/ServerResponse, not a Web Request.
// Bridge to fetch-style here so the SDK transport can do its job.
async function nodeToWebRequest(req: IncomingMessage): Promise<Request> {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host ?? 'localhost';
  const url = `${proto}://${host}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }
  let body: Buffer | undefined;
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    // @vercel/node auto-parses JSON bodies and exposes them on req.body, which
    // drains the underlying stream — so for-await reads zero chunks. Prefer the
    // pre-parsed body when present; fall back to reading the stream otherwise.
    const reqAny = req as unknown as { body?: unknown };
    if (reqAny.body !== undefined) {
      const serialized = typeof reqAny.body === 'string' ? reqAny.body : JSON.stringify(reqAny.body);
      body = Buffer.from(serialized, 'utf8');
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      body = Buffer.concat(chunks);
    }
  }
  return new Request(url, { method: req.method, headers, body });
}

async function writeWebResponseToNode(webRes: Response, nodeRes: ServerResponse): Promise<void> {
  nodeRes.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    nodeRes.setHeader(key, value);
  });
  if (!webRes.body) {
    nodeRes.end();
    return;
  }
  const reader = webRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    nodeRes.write(value);
  }
  nodeRes.end();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST');
    res.end('method not allowed');
    return;
  }
  try {
    const webReq = await nodeToWebRequest(req);
    const webRes = await dispatch(webReq);
    await writeWebResponseToNode(webRes, res);
  } catch (err) {
    console.error('[mcp] unhandled', err);
    const msg = err instanceof Error ? err.message : 'internal error';
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal', message: msg }));
  }
}
