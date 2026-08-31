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
  shell: {
    openExternal: vi.fn(),
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

describe('gmail mark-as-read handlers', () => {
  it('registers gmail:markAsRead and gmail:markAsReadBatch channels', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerGmailHandlers } = await import('../../../electron/main/ipc/gmail-handlers');
    registerGmailHandlers(mockIpcMain as never, db);

    const registeredChannels = mockIpcMain.handle.mock.calls.map(
      (call) => call[0] as string
    );

    expect(registeredChannels).toContain('gmail:markAsRead');
    expect(registeredChannels).toContain('gmail:markAsReadBatch');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('gmail:markAsRead validates Zod schema', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerGmailHandlers } = await import('../../../electron/main/ipc/gmail-handlers');
    registerGmailHandlers(mockIpcMain as never, db);

    const markAsReadHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'gmail:markAsRead'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    await expect(markAsReadHandler({}, { emailId: '' })).rejects.toThrow('Invalid payload');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('gmail:markAsReadBatch validates Zod schema', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerGmailHandlers } = await import('../../../electron/main/ipc/gmail-handlers');
    registerGmailHandlers(mockIpcMain as never, db);

    const markAsReadBatchHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'gmail:markAsReadBatch'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    await expect(markAsReadBatchHandler({}, { emails: [] })).rejects.toThrow('Invalid payload');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('gmail:markAsRead rejects missing externalId', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerGmailHandlers } = await import('../../../electron/main/ipc/gmail-handlers');
    registerGmailHandlers(mockIpcMain as never, db);

    const markAsReadHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'gmail:markAsRead'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    await expect(
      markAsReadHandler({}, { emailId: 'e1', externalId: '', accountId: 'a1' })
    ).rejects.toThrow('Invalid payload');

    db.close();
    cleanupDb(dbPath);
  }, 15000);
});
