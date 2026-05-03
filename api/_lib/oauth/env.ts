export function getAppUrl(): string {
  const url = process.env.PUBLIC_APP_URL;
  if (!url) throw new Error('PUBLIC_APP_URL is not set');
  // Strip trailing slash so concatenation is predictable.
  return url.replace(/\/$/, '');
}

export function getAllowedDcrHosts(): string[] {
  const fromEnv = process.env.OAUTH_DCR_ALLOWED_HOSTS;
  if (fromEnv) return fromEnv.split(',').map((s) => s.trim()).filter(Boolean);
  const base = ['claude.ai', 'chatgpt.com'];
  if (process.env.NODE_ENV !== 'production') {
    base.push('localhost', '127.0.0.1');
  }
  return base;
}
