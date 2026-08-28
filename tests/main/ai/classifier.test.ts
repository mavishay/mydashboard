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

function grantAiConsent(db: any): void {
  db.prepare(
    "INSERT OR IGNORE INTO ai_consent_settings (id, consented, consented_at) VALUES (1, 1, datetime('now'))"
  ).run();
}

describe('classifier', () => {
  it('returns null for non-existent email', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    grantAiConsent(db);

    const { classifyEmail } = await import('../../../electron/main/ai/classifier');
    const result = await classifyEmail(db, 'non-existent-id');
    expect(result).toBeNull();

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('throws when no API key is configured', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    grantAiConsent(db);

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();

    db.prepare(
      `INSERT INTO emails (id, account_id, external_id, subject, snippet, from_address)
       VALUES ('email1', 'acc1', 'ext1', 'Test Subject', 'Test snippet', 'sender@example.com')`
    ).run();

    const { classifyEmail } = await import('../../../electron/main/ai/classifier');

    await expect(classifyEmail(db, 'email1')).rejects.toThrow('No API key configured');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('stores classification result in database', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    grantAiConsent(db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"category": "urgent", "confidence": 0.9, "reasoning": "Time-sensitive"}' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();

    db.prepare(
      `INSERT INTO api_keys (id, provider, label, encrypted_key)
       VALUES ('key1', 'openai', 'Test Key', X'656E63727970746564')`
    ).run();

    db.prepare(
      `INSERT INTO emails (id, account_id, external_id, subject, snippet, from_address)
       VALUES ('email1', 'acc1', 'ext1', 'URGENT: Server down', 'Production server is down', 'ops@company.com')`
    ).run();

    const { classifyEmail } = await import('../../../electron/main/ai/classifier');
    const result = await classifyEmail(db, 'email1');

    expect(result).not.toBeNull();
    expect(result?.classification).toBe('urgent');
    expect(result?.confidence).toBe(0.9);

    const stored = db.prepare('SELECT classification FROM emails WHERE id = ?').get('email1') as { classification: string };
    expect(stored.classification).toBe('urgent');

    vi.unstubAllGlobals();
    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('returns classified emails sorted by priority', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();

    db.prepare(
      `INSERT INTO emails (id, account_id, external_id, subject, from_address, classification, received_at)
       VALUES
         ('e1', 'acc1', 'ext1', 'FYI Update', 'a@b.com', 'fyi', '2026-08-25T10:00:00Z'),
         ('e2', 'acc1', 'ext2', 'Urgent Alert', 'c@d.com', 'urgent', '2026-08-25T09:00:00Z'),
         ('e3', 'acc1', 'ext3', 'Action Required', 'e@f.com', 'action', '2026-08-25T11:00:00Z')`
    ).run();

    const { getClassifiedEmails } = await import('../../../electron/main/ai/classifier');
    const emails = getClassifiedEmails(db);

    expect(emails).toHaveLength(3);
    expect(emails[0].classification).toBe('urgent');
    expect(emails[1].classification).toBe('action');
    expect(emails[2].classification).toBe('fyi');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('filters by classification', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();

    db.prepare(
      `INSERT INTO emails (id, account_id, external_id, subject, from_address, classification)
       VALUES
         ('e1', 'acc1', 'ext1', 'FYI', 'a@b.com', 'fyi'),
         ('e2', 'acc1', 'ext2', 'Urgent', 'c@d.com', 'urgent')`
    ).run();

    const { getClassifiedEmails } = await import('../../../electron/main/ai/classifier');
    const emails = getClassifiedEmails(db, { classification: 'urgent' });

    expect(emails).toHaveLength(1);
    expect(emails[0].classification).toBe('urgent');

    db.close();
    cleanupDb(dbPath);
  }, 15000);
});
