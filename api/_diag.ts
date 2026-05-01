// Minimal diagnostic. Confirms whether @vercel/node's auto-detection
// recognizes the fetch-style handler signature.
//
// If this returns 200 quickly, fetch-style works → /api/mcp problem is specific.
// If this also times out, the builder needs Node-style. Delete after diagnosis.
export default async function handler(req: Request): Promise<Response> {
  return new Response(
    JSON.stringify({ ok: true, method: req.method, ts: Date.now() }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
