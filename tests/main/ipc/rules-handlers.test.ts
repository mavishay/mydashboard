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
  return join(__dirname, `__test_rules_${randomBytes(4).toString('hex')}.db`);
}

function cleanupDb(path: string): void {
  try { rmSync(path); } catch {}
  try { rmSync(path + '-wal'); } catch {}
  try { rmSync(path + '-shm'); } catch {}
}

describe('rules-handlers', () => {
  it('registers all rules channels', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = { handle: vi.fn() };

    const { registerRulesHandlers } = await import('../../../electron/main/ipc/rules-handlers');
    registerRulesHandlers(mockIpcMain as never, db);

    const channels = mockIpcMain.handle.mock.calls.map((c) => c[0] as string);

    expect(channels).toContain('rules:getAll');
    expect(channels).toContain('rules:create');
    expect(channels).toContain('rules:update');
    expect(channels).toContain('rules:delete');
    expect(channels).toContain('rules:toggle');
    expect(channels).toContain('rules:test');
    expect(channels).toContain('rules:seedDefaults');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('creates a rule via IPC', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = { handle: vi.fn() };

    const { registerRulesHandlers } = await import('../../../electron/main/ipc/rules-handlers');
    registerRulesHandlers(mockIpcMain as never, db);

    const createHandler = mockIpcMain.handle.mock.calls.find(
      (c) => c[0] === 'rules:create'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    const result = await createHandler({}, {
      name: 'Test Rule',
      enabled: true,
      priority: 10,
      conditions: [{ field: 'from', operator: 'contains', value: 'spam' }],
      action: 'skip_llm',
      classification: 'noise',
    });

    const rule = result as { id: string; name: string; classification: string };
    expect(rule.name).toBe('Test Rule');
    expect(rule.classification).toBe('noise');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('rejects rule without conditions', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = { handle: vi.fn() };

    const { registerRulesHandlers } = await import('../../../electron/main/ipc/rules-handlers');
    registerRulesHandlers(mockIpcMain as never, db);

    const createHandler = mockIpcMain.handle.mock.calls.find(
      (c) => c[0] === 'rules:create'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    await expect(
      createHandler({}, {
        name: 'Bad Rule',
        enabled: true,
        priority: 0,
        conditions: [],
        action: 'classify',
        classification: 'urgent',
      })
    ).rejects.toThrow();

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('rejects rule without classification', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = { handle: vi.fn() };

    const { registerRulesHandlers } = await import('../../../electron/main/ipc/rules-handlers');
    registerRulesHandlers(mockIpcMain as never, db);

    const createHandler = mockIpcMain.handle.mock.calls.find(
      (c) => c[0] === 'rules:create'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    await expect(
      createHandler({}, {
        name: 'No Class',
        enabled: true,
        priority: 0,
        conditions: [{ field: 'from', operator: 'contains', value: 'x' }],
        action: 'classify',
      })
    ).rejects.toThrow();

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('test rule match via IPC', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = { handle: vi.fn() };

    const { registerRulesHandlers } = await import('../../../electron/main/ipc/rules-handlers');
    registerRulesHandlers(mockIpcMain as never, db);

    const testHandler = mockIpcMain.handle.mock.calls.find(
      (c) => c[0] === 'rules:test'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    const result = await testHandler({}, {
      conditions: [{ field: 'from', operator: 'contains', value: 'spam' }],
      email: { from: 'spam@junk.com', to: null, subject: null, body: null },
    });

    expect(result).toEqual({ matched: true });

    db.close();
    cleanupDb(dbPath);
  }, 15000);
});
