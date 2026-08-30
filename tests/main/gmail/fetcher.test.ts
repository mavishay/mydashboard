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

  it('getEmailDetail returns null when email not found', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const { getEmailDetail } = await import('../../../electron/main/gmail/fetcher');
    const result = await getEmailDetail(db, 'non-existent');

    expect(result).toBeNull();

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('getEmailDetail returns cached body when available', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    // Create test account
    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name, color) VALUES ('acc1', 'gmail', 'test@example.com', 'Test User', '#FF0000')"
    ).run();

    // Create test email with cached body
    db.prepare(
      "INSERT INTO emails (id, account_id, external_id, subject, from_address, received_at, body_html, snippet) VALUES ('email1', 'acc1', 'ext1', 'Test Subject', 'sender@example.com', '2026-08-30', '<p>Hello</p>', 'Hello...')"
    ).run();

    const { getEmailDetail } = await import('../../../electron/main/gmail/fetcher');
    const result = await getEmailDetail(db, 'email1');

    expect(result).not.toBeNull();
    expect(result?.bodyHtml).toBe('<p>Hello</p>');
    expect(result?.accountIndex).toBe(0);

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('getEmailDetail returns cached attachments when available', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    // Create test account
    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name, color) VALUES ('acc1', 'gmail', 'test@example.com', 'Test User', '#FF0000')"
    ).run();

    // Create test email with cached attachments
    const attachments = JSON.stringify([
      { filename: 'test.pdf', mimeType: 'application/pdf', size: 1024 }
    ]);
    db.prepare(
      "INSERT INTO emails (id, account_id, external_id, subject, from_address, received_at, body_html, snippet, attachments) VALUES ('email1', 'acc1', 'ext1', 'Test Subject', 'sender@example.com', '2026-08-30', '<p>Hello</p>', 'Hello...', ?)"
    ).run(attachments);

    const { getEmailDetail } = await import('../../../electron/main/gmail/fetcher');
    const result = await getEmailDetail(db, 'email1');

    expect(result).not.toBeNull();
    expect(result?.attachments).toHaveLength(1);
    expect(result?.attachments[0].filename).toBe('test.pdf');

    db.close();
    cleanupDb(dbPath);
  }, 15000);
});
