import type { IncomingMessage, ServerResponse } from 'node:http';

const SESSION_COOKIE_NAME = 'lan_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}

export function getSessionToken(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

export function setSessionCookie(res: ServerResponse, sessionToken: string): void {
  const cookie = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Strict`,
    `Max-Age=${COOKIE_MAX_AGE}`,
  ].join('; ');

  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
}
