// Minimal HTML — server-rendered, no JS framework needed. CSRF token is the
// hex of a random 16-byte buffer signed into a hidden form field; verified
// at /consent. Form POSTs to /api/oauth/consent with all OAuth params.

export type ConsentParams = {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  state: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: string;
  csrf_token: string;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

export function renderConsentHtml(p: ConsentParams): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Authorize ${esc(p.client_name)}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 64px auto; padding: 0 24px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; margin-bottom: 8px; }
  p { color: #555; line-height: 1.5; }
  .row { margin-top: 24px; display: flex; gap: 12px; }
  button { font-size: 1rem; padding: 10px 16px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
  button.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
</style></head><body>
<h1>${esc(p.client_name)} wants to read your family's practice data</h1>
<p>Scope: <code>${esc(p.scope)}</code>. The agent will be able to call read-only tools to see your kids' practice sessions, accuracy, and misconceptions. It cannot make changes.</p>
<form method="POST" action="/api/oauth/consent">
  <input type="hidden" name="client_id" value="${esc(p.client_id)}">
  <input type="hidden" name="redirect_uri" value="${esc(p.redirect_uri)}">
  <input type="hidden" name="state" value="${esc(p.state)}">
  <input type="hidden" name="scope" value="${esc(p.scope)}">
  <input type="hidden" name="code_challenge" value="${esc(p.code_challenge)}">
  <input type="hidden" name="code_challenge_method" value="${esc(p.code_challenge_method)}">
  <input type="hidden" name="csrf_token" value="${esc(p.csrf_token)}">
  <div class="row">
    <button type="submit" name="decision" value="deny">Deny</button>
    <button type="submit" name="decision" value="allow" class="primary">Allow</button>
  </div>
</form>
</body></html>`;
}
