const DEFAULT_ALLOWED = [
  'https://claude.ai',
  'https://chatgpt.com',
  'https://cursor.so',
];
const DEFAULT_WILDCARDS = [/^https:\/\/[a-z0-9-]+\.claude\.ai$/i];

function parseExtras(): string[] {
  const raw = process.env.MCP_ALLOWED_ORIGINS_EXTRA ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // server-to-server, no Origin header
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  const allowed = [...DEFAULT_ALLOWED, ...parseExtras()];
  if (allowed.includes(origin)) return true;
  return DEFAULT_WILDCARDS.some((re) => re.test(origin));
}
