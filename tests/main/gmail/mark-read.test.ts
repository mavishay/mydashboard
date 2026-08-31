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

describe('markEmailAsRead', () => {
  it('throws when emailId is empty', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const { markEmailAsRead } = await import('../../../electron/main/gmail/fetcher');

    await expect(markEmailAsRead(db, '', 'ext1', 'acc1')).rejects.toThrow(
      'emailId, externalId, and accountId are required'
    );

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('throws when credentials not configured', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    delete process.env.GOOGLE_CLIENT_ID;

    const { markEmailAsRead } = await import('../../../electron/main/gmail/fetcher');

    await expect(markEmailAsRead(db, 'email1', 'ext1', 'acc1')).rejects.toThrow(
      'Google OAuth credentials not configured'
    );

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('throws when no tokens found', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const { markEmailAsRead } = await import('../../../electron/main/gmail/fetcher');

    await expect(markEmailAsRead(db, 'email1', 'ext1', 'non-existent')).rejects.toThrow(
      'No tokens found for account'
    );

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('marks email as read in DB on success', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();
    db.prepare(
      "INSERT INTO emails (id, account_id, external_id, subject, is_read) VALUES ('email1', 'acc1', 'ext1', 'Test', 0)"
    ).run();

    // Store mock tokens
    db.prepare(
      "INSERT INTO tokens (account_id, access_token, refresh_token, expiry_date, scope) VALUES ('acc1', 'mock-token', 'mock-refresh', 9999999999999, 'gmail.readonly')"
    ).run();

    // Mock googleapis
    vi.doMock('googleapis', () => ({
      google: {
        auth: {
          OAuth2: vi.fn().mockImplementation(() => ({
            setCredentials: vi.fn(),
          })),
        },
        gmail: vi.fn().mockReturnValue({
          users: {
            messages: {
              modify: vi.fn().mockResolvedValue({}),
            },
          },
        }),
      },
    }));

    const { markEmailAsRead } = await import('../../../electron/main/gmail/fetcher');
    const result = await markEmailAsRead(db, 'email1', 'ext1', 'acc1');

    expect(result.success).toBe(true);

    const email = db.prepare('SELECT is_read FROM emails WHERE id = ?').get('email1') as { is_read: number };
    expect(email.is_read).toBe(1);

    db.close();
    cleanupDb(dbPath);
    vi.doUnmock('googleapis');
  }, 15000);

  it('marks locally on 404', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();
    db.prepare(
      "INSERT INTO emails (id, account_id, external_id, subject, is_read) VALUES ('email1', 'acc1', 'ext1', 'Test', 0)"
    ).run();
    db.prepare(
      "INSERT INTO tokens (account_id, access_token, refresh_token, expiry_date, scope) VALUES ('acc1', 'mock-token', 'mock-refresh', 9999999999999, 'gmail.readonly')"
    ).run();

    const mockModify = vi.fn().mockRejectedValue({ code: 404, message: 'Not Found' });
    vi.doMock('googleapis', () => ({
      google: {
        auth: {
          OAuth2: vi.fn().mockImplementation(() => ({
            setCredentials: vi.fn(),
          })),
        },
        gmail: vi.fn().mockReturnValue({
          users: {
            messages: {
              modify: mockModify,
            },
          },
        }),
      },
    }));

    const { markEmailAsRead } = await import('../../../electron/main/gmail/fetcher');
    const result = await markEmailAsRead(db, 'email1', 'ext1', 'acc1');

    expect(result.success).toBe(true);
    const email = db.prepare('SELECT is_read FROM emails WHERE id = ?').get('email1') as { is_read: number };
    expect(email.is_read).toBe(1);

    db.close();
    cleanupDb(dbPath);
    vi.doUnmock('googleapis');
  }, 15000);
});

describe('markEmailsAsReadBatch', () => {
  it('processes emails in chunks', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();

    for (let i = 1; i <= 3; i++) {
      db.prepare(
        `INSERT INTO emails (id, account_id, external_id, subject, is_read) VALUES ('email${i}', 'acc1', 'ext${i}', 'Test ${i}', 0)`
      ).run();
    }

    db.prepare(
      "INSERT INTO tokens (account_id, access_token, refresh_token, expiry_date, scope) VALUES ('acc1', 'mock-token', 'mock-refresh', 9999999999999, 'gmail.readonly')"
    ).run();

    vi.doMock('googleapis', () => ({
      google: {
        auth: {
          OAuth2: vi.fn().mockImplementation(() => ({
            setCredentials: vi.fn(),
          })),
        },
        gmail: vi.fn().mockReturnValue({
          users: {
            messages: {
              modify: vi.fn().mockResolvedValue({}),
            },
          },
        }),
      },
    }));

    const { markEmailsAsReadBatch } = await import('../../../electron/main/gmail/fetcher');
    const result = await markEmailsAsReadBatch(db, [
      { emailId: 'email1', externalId: 'ext1', accountId: 'acc1' },
      { emailId: 'email2', externalId: 'ext2', accountId: 'acc1' },
      { emailId: 'email3', externalId: 'ext3', accountId: 'acc1' },
    ]);

    expect(result.success).toBe(true);
    expect(result.marked).toBe(3);
    expect(result.failed).toHaveLength(0);

    db.close();
    cleanupDb(dbPath);
    vi.doUnmock('googleapis');
  }, 15000);

  it('tracks failed emails', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();
    db.prepare(
      "INSERT INTO emails (id, account_id, external_id, subject, is_read) VALUES ('email1', 'acc1', 'ext1', 'Test', 0)"
    ).run();
    db.prepare(
      "INSERT INTO emails (id, account_id, external_id, subject, is_read) VALUES ('email2', 'acc1', 'ext2', 'Test', 0)"
    ).run();
    db.prepare(
      "INSERT INTO tokens (account_id, access_token, refresh_token, expiry_date, scope) VALUES ('acc1', 'mock-token', 'mock-refresh', 9999999999999, 'gmail.readonly')"
    ).run();

    let callCount = 0;
    vi.doMock('googleapis', () => ({
      google: {
        auth: {
          OAuth2: vi.fn().mockImplementation(() => ({
            setCredentials: vi.fn(),
          })),
        },
        gmail: vi.fn().mockReturnValue({
          users: {
            messages: {
              modify: vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                  return Promise.resolve({});
                }
                return Promise.reject({ code: 500, message: 'Server error' });
              }),
            },
          },
        }),
      },
    }));

    const { markEmailsAsReadBatch } = await import('../../../electron/main/gmail/fetcher');
    const result = await markEmailsAsReadBatch(db, [
      { emailId: 'email1', externalId: 'ext1', accountId: 'acc1' },
      { emailId: 'email2', externalId: 'ext2', accountId: 'acc1' },
    ]);

    expect(result.marked).toBe(1);
    expect(result.failed).toContain('email2');

    db.close();
    cleanupDb(dbPath);
    vi.doUnmock('googleapis');
  }, 15000);
});
