import { OAuthError } from './errors.js';

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const LIMIT = 10;

// Per-IP rate limit for /api/oauth/register. In-memory only — per warm
// Vercel instance. Mirrors the existing /api/_lib/mcp/rate-limit.ts shape.
export function enforceDcrRateLimit(sourceIp: string): void {
  const now = Date.now();
  const b = buckets.get(sourceIp);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(sourceIp, { count: 1, windowStart: now });
    return;
  }
  b.count += 1;
  if (b.count > LIMIT) {
    throw new OAuthError('rate_limited', 'too many registration requests', 429);
  }
}

export function clientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0]!.trim();
  if (Array.isArray(xff)) return xff[0]!.split(',')[0]!.trim();
  return 'unknown';
}
