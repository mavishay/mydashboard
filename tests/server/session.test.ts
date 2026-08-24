import { describe, it, expect } from 'vitest';

function createMockReq(cookieHeader?: string) {
  return {
    headers: {
      cookie: cookieHeader,
    },
  } as import('node:http').IncomingMessage;
}

function createMockRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    getHeaders: () => headers,
    _headers: headers,
  } as unknown as import('node:http').ServerResponse;
}

describe('session', () => {
  describe('parseCookies', () => {
    it('parses cookie header correctly', async () => {
      const { parseCookies } = await import('../../electron/main/server/session');

      const cookies = parseCookies('lan_session=abc123; other=val');

      expect(cookies).toEqual({
        lan_session: 'abc123',
        other: 'val',
      });
    });

    it('returns empty object for undefined header', async () => {
      const { parseCookies } = await import('../../electron/main/server/session');

      const cookies = parseCookies(undefined);

      expect(cookies).toEqual({});
    });

    it('handles URL-encoded values', async () => {
      const { parseCookies } = await import('../../electron/main/server/session');

      const cookies = parseCookies('lan_session=abc%20123');

      expect(cookies.lan_session).toBe('abc 123');
    });
  });

  describe('getSessionToken', () => {
    it('extracts session token from cookies', async () => {
      const { getSessionToken } = await import('../../electron/main/server/session');

      const req = createMockReq('lan_session=session-token-123');
      const token = getSessionToken(req);

      expect(token).toBe('session-token-123');
    });

    it('returns null when no session cookie present', async () => {
      const { getSessionToken } = await import('../../electron/main/server/session');

      const req = createMockReq('other=value');
      const token = getSessionToken(req);

      expect(token).toBeNull();
    });

    it('returns null when no cookies header', async () => {
      const { getSessionToken } = await import('../../electron/main/server/session');

      const req = createMockReq(undefined);
      const token = getSessionToken(req);

      expect(token).toBeNull();
    });
  });

  describe('setSessionCookie', () => {
    it('sets cookie with secure flags', async () => {
      const { setSessionCookie } = await import('../../electron/main/server/session');

      const res = createMockRes();
      setSessionCookie(res, 'session-123');

      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('lan_session=session-123')
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('HttpOnly')
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('Secure')
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('SameSite=Strict')
      );
    });

    it('sets 30-day expiry', async () => {
      const { setSessionCookie } = await import('../../electron/main/server/session');

      const res = createMockRes();
      setSessionCookie(res, 'session-123');

      const cookie = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0] === 'Set-Cookie'
      )?.[1] as string;

      expect(cookie).toContain('Max-Age=2592000');
    });
  });

  describe('clearSessionCookie', () => {
    it('clears the session cookie', async () => {
      const { clearSessionCookie } = await import('../../electron/main/server/session');

      const res = createMockRes();
      clearSessionCookie(res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('Max-Age=0')
      );
    });
  });
});
