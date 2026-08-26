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

describe('classification-handlers', () => {
  it('registers all classification channels', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerClassificationHandlers } = await import('../../../electron/main/ipc/classification-handlers');
    registerClassificationHandlers(mockIpcMain as never, db);

    const registeredChannels = mockIpcMain.handle.mock.calls.map(
      (call) => call[0] as string
    );

    expect(registeredChannels).toContain('classification:classify');
    expect(registeredChannels).toContain('classification:classifyAccount');
    expect(registeredChannels).toContain('classification:fetchEmails');
    expect(registeredChannels).toContain('classification:fetchEmailsAll');
    expect(registeredChannels).toContain('classification:getEmails');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('returns classified emails', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();

    db.prepare(
      `INSERT INTO emails (id, account_id, external_id, subject, from_address, classification)
       VALUES ('e1', 'acc1', 'ext1', 'Test', 'a@b.com', 'urgent')`
    ).run();

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerClassificationHandlers } = await import('../../../electron/main/ipc/classification-handlers');
    registerClassificationHandlers(mockIpcMain as never, db);

    const getEmailsHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'classification:getEmails'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    const result = await getEmailsHandler({}, {});

    expect(result).toHaveLength(1);
    expect((result as Array<{ classification: string }>)[0].classification).toBe('urgent');

    db.close();
    cleanupDb(dbPath);
  }, 15000);
});
