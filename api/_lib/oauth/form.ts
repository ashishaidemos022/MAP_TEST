import type { IncomingMessage } from 'node:http';

// Reads an application/x-www-form-urlencoded body from a Vercel/Node request.
// Handles four shapes:
//   1. @vercel/node pre-parsed object on req.body (most common in dev/prod)
//   2. Pre-parsed string on req.body
//   3. Raw bytes (Buffer or Uint8Array) on req.body
//   4. Stream that hasn't been consumed yet (when the runtime didn't pre-parse)
export async function readUrlEncodedForm(req: IncomingMessage): Promise<URLSearchParams> {
  const pre = (req as IncomingMessage & { body?: unknown }).body;
  // Object form: convert string-valued keys into URLSearchParams.
  if (pre && typeof pre === 'object' && !Array.isArray(pre) && !ArrayBuffer.isView(pre)) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(pre as Record<string, unknown>)) {
      if (typeof v === 'string') params.set(k, v);
    }
    return params;
  }
  if (typeof pre === 'string' && pre.length > 0) return new URLSearchParams(pre);
  // Raw bytes — Buffer or any Uint8Array variant. ArrayBuffer.isView covers both.
  if (ArrayBuffer.isView(pre)) {
    const buf = Buffer.isBuffer(pre) ? pre : Buffer.from(pre.buffer, pre.byteOffset, pre.byteLength);
    return new URLSearchParams(buf.toString('utf8'));
  }
  // Stream fallback (no pre-parse).
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
