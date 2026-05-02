import { McpError } from './errors.js';

type Bucket = {
  minuteWindowStart: number;
  minuteCount: number;
  dayWindowStart: number;
  dayCount: number;
};

const PER_MINUTE = 60;
const PER_DAY = 2000;
const buckets = new Map<string, Bucket>();

export function enforceRateLimit(tokenId: string, now = Date.now()): void {
  let b = buckets.get(tokenId);
  if (!b) {
    b = { minuteWindowStart: now, minuteCount: 0, dayWindowStart: now, dayCount: 0 };
    buckets.set(tokenId, b);
  }
  if (now - b.minuteWindowStart >= 60_000) {
    b.minuteWindowStart = now;
    b.minuteCount = 0;
  }
  if (now - b.dayWindowStart >= 86_400_000) {
    b.dayWindowStart = now;
    b.dayCount = 0;
  }
  if (b.minuteCount >= PER_MINUTE) {
    const retryMs = 60_000 - (now - b.minuteWindowStart);
    const err = new McpError('rate_limited', `60 req/min exceeded`, 429);
    (err as McpError & { retryAfter?: number }).retryAfter = Math.ceil(retryMs / 1000);
    throw err;
  }
  if (b.dayCount >= PER_DAY) {
    const retryMs = 86_400_000 - (now - b.dayWindowStart);
    const err = new McpError('rate_limited', `2000 req/day exceeded`, 429);
    (err as McpError & { retryAfter?: number }).retryAfter = Math.ceil(retryMs / 1000);
    throw err;
  }
  b.minuteCount += 1;
  b.dayCount += 1;
}

export function buildRateLimitedResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: 'rate_limited', retry_after_seconds: retryAfterSec }),
    {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSec) },
    },
  );
}

// Test-only export. Do not use from production paths.
export function _resetBucketsForTest(): void {
  buckets.clear();
}
