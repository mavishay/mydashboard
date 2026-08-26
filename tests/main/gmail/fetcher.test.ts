import { describe, it, expect, vi } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-app'),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    decryptString: vi.fn().mockReturnValue('decrypted-key'),
  },
}));

function testDbPath(): string {
  return join(__dirname, `__test_${randomBytes(4).toString('hex')}.db`);
}

function cleanupDb(path: string): void {
  try { rmSync(path); } catch {}
  try { rmSync(path + '-wal'); } catch {}
  try { rmSync(path + '-shm'); } catch {}
}

describe('fetcher', () => {
  it('throws when Google credentials not configured', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const originalEnv = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;

    const { fetchEmailsForAccount } = await import('../../../electron/main/gmail/fetcher');

    await expect(fetchEmailsForAccount(db, 'non-existent')).rejects.toThrow(
      'Google OAuth credentials not configured'
    );

    if (originalEnv) process.env.GOOGLE_CLIENT_ID = originalEnv;
    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('throws when no tokens found for account', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const { fetchEmailsForAccount } = await import('../../../electron/main/gmail/fetcher');

    await expect(fetchEmailsForAccount(db, 'non-existent')).rejects.toThrow(
      'No tokens found for account'
    );

    db.close();
    cleanupDb(dbPath);
  }, 15000);
});
