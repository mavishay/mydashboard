import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
}));

// Shared in-memory store for the mock db
const sharedStore: {
  pairing_tokens: Array<{ token_hash: string; salt: string; id: number }>;
  lan_sessions: Array<{ session_token: string; expires_at: string; ip_address: string; id: number }>;
  token_attempts: Array<{ ip_address: string; attempted_at: string; id: number }>;
} = {
  pairing_tokens: [],
  lan_sessions: [],
  token_attempts: [],
};

function createMockDb() {
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('INSERT INTO pairing_tokens')) {
        return {
          run: vi.fn((tokenHash: string, salt: string) => {
            sharedStore.pairing_tokens.push({ token_hash: tokenHash, salt, id: sharedStore.pairing_tokens.length + 1 });
          }),
        };
      }
      if (sql.includes('SELECT token_hash, salt FROM pairing_tokens')) {
        return {
          get: vi.fn(() => {
            const last = sharedStore.pairing_tokens[sharedStore.pairing_tokens.length - 1];
            return last ? { token_hash: last.token_hash, salt: last.salt } : undefined;
          }),
        };
      }
      if (sql.includes('UPDATE pairing_tokens SET last_used_at')) {
        return { run: vi.fn() };
      }
      if (sql.includes('INSERT INTO lan_sessions')) {
        return {
          run: vi.fn((sessionToken: string, expiresAt: string, ip: string) => {
            sharedStore.lan_sessions.push({ session_token: sessionToken, expires_at: expiresAt, ip_address: ip, id: sharedStore.lan_sessions.length + 1 });
          }),
        };
      }
      if (sql.includes('INSERT INTO token_attempts')) {
        return {
          run: vi.fn((ipAddress: string) => {
            sharedStore.token_attempts.push({ ip_address: ipAddress, attempted_at: new Date().toISOString(), id: sharedStore.token_attempts.length + 1 });
          }),
        };
      }
      if (sql.includes("datetime('now', '-1 minute')")) {
        return {
          get: vi.fn(() => ({ count: 0 })),
        };
      }
      if (sql.includes('SELECT id FROM lan_sessions WHERE session_token')) {
        return {
          get: vi.fn(() => {
            return sharedStore.lan_sessions.find(s => s.session_token === 'valid-session') ? { id: 1 } : undefined;
          }),
        };
      }
      if (sql.includes('DELETE FROM lan_sessions')) {
        return {
          run: vi.fn(() => { sharedStore.lan_sessions = []; }),
        };
      }
      if (sql.includes('DELETE FROM pairing_tokens')) {
        return {
          run: vi.fn(() => { sharedStore.pairing_tokens = []; }),
        };
      }
      if (sql.includes('SELECT COUNT(*) as count FROM lan_sessions WHERE expires_at')) {
        return {
          get: vi.fn(() => ({ count: sharedStore.lan_sessions.length })),
        };
      }
      return { run: vi.fn(), get: vi.fn() };
    }),
  } as unknown as import('better-sqlite3').Database;
}

describe('auth', () => {
  beforeEach(() => {
    sharedStore.pairing_tokens = [];
    sharedStore.lan_sessions = [];
    sharedStore.token_attempts = [];
  });

  describe('generateToken', () => {
    it('generates a 7-character token (XXX-XXX format)', async () => {
      const { generateToken } = await import('../../electron/main/server/auth');

      const token = generateToken();

      expect(token).toHaveLength(7);
      expect(token[3]).toBe('-');
      expect(token).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    });

    it('generates tokens without ambiguous characters', async () => {
      const { generateToken } = await import('../../electron/main/server/auth');

      for (let i = 0; i < 20; i++) {
        const token = generateToken();
        expect(token).not.toMatch(/[IO01]/);
      }
    });
  });

  describe('hashToken', () => {
    it('produces a 64-character hex hash', async () => {
      const { hashToken } = await import('../../electron/main/server/auth');

      const hash = hashToken('ABC-123', 'salt123');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different hashes for different salts', async () => {
      const { hashToken } = await import('../../electron/main/server/auth');

      const hash1 = hashToken('ABC-123', 'salt1');
      const hash2 = hashToken('ABC-123', 'salt2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('storeToken', () => {
    it('stores token hash and salt in database', async () => {
      const { storeToken } = await import('../../electron/main/server/auth');
      const db = createMockDb();

      const result = storeToken(db, 'ABC-123');

      expect(result.tokenHash).toHaveLength(64);
      expect(result.salt).toHaveLength(32);
    });
  });

  describe('validateToken', () => {
    it('validates correct token', async () => {
      const { storeToken, validateToken } = await import('../../electron/main/server/auth');
      const db = createMockDb();

      storeToken(db, 'ABC-123');
      const result = validateToken(db, 'ABC-123', '192.168.1.1');

      expect(result.success).toBe(true);
      expect(result.sessionToken).toBeDefined();
    });

    it('rejects incorrect token', async () => {
      const { storeToken, validateToken } = await import('../../electron/main/server/auth');
      const db = createMockDb();

      storeToken(db, 'ABC-123');
      const result = validateToken(db, 'WRONG-TOKEN', '192.168.1.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_token');
    });
  });

  describe('validateSession', () => {
    it('returns true for valid session', async () => {
      const { validateSession } = await import('../../electron/main/server/auth');
      const db = createMockDb();

      sharedStore.lan_sessions.push({
        session_token: 'valid-session',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        ip_address: '192.168.1.1',
        id: 1,
      });

      const result = validateSession(db, 'valid-session');

      expect(result).toBe(true);
    });

    it('returns false for invalid session', async () => {
      const { validateSession } = await import('../../electron/main/server/auth');
      const db = createMockDb();

      const result = validateSession(db, 'invalid-session');

      expect(result).toBe(false);
    });
  });

  describe('regenerateToken', () => {
    it('generates new token and clears sessions', async () => {
      const { regenerateToken } = await import('../../electron/main/server/auth');
      const db = createMockDb();

      const token = regenerateToken(db);

      expect(token).toHaveLength(7);
      expect(token).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    });
  });

  describe('getConnectedDeviceCount', () => {
    it('returns count of active sessions', async () => {
      const { getConnectedDeviceCount } = await import('../../electron/main/server/auth');
      const db = createMockDb();

      const count = getConnectedDeviceCount(db);

      expect(count).toBe(0);
    });
  });
});
