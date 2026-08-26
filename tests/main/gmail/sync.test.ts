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
    decryptString: vi.fn().mockReturnValue('decrypted-token'),
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

describe('GmailSync', () => {
  it('initializes with idle status', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const { GmailSync } = await import('../../../electron/main/gmail/sync');

    const onStatusChange = vi.fn();
    const sync = new GmailSync(db, 'acc1', { onStatusChange });

    expect(sync.isSyncing()).toBe(false);
    expect(sync.getStatus().status).toBe('idle');
    expect(sync.getStatus().accountId).toBe('acc1');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('reports error status when fetch fails', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    db.prepare(
      "INSERT INTO accounts (id, type, email, display_name) VALUES ('acc1', 'gmail', 'test@example.com', 'Test')"
    ).run();

    const { GmailSync } = await import('../../../electron/main/gmail/sync');

    const onStatusChange = vi.fn();
    const sync = new GmailSync(db, 'acc1', { onStatusChange });

    const result = await sync.sync();

    expect(sync.isSyncing()).toBe(false);
    expect(result.status).toBe('error');
    expect(result.error).toContain('No tokens found');

    db.close();
    cleanupDb(dbPath);
  }, 15000);
});

describe('GmailSyncManager', () => {
  it('creates sync for account', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const { GmailSyncManager } = await import('../../../electron/main/gmail/sync');

    const getWindow = vi.fn().mockReturnValue(null);
    const manager = new GmailSyncManager(db, getWindow);

    manager.startForAccount('acc1');

    const statuses = manager.getStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].accountId).toBe('acc1');

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('does not duplicate sync for same account', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const { GmailSyncManager } = await import('../../../electron/main/gmail/sync');

    const getWindow = vi.fn().mockReturnValue(null);
    const manager = new GmailSyncManager(db, getWindow);

    manager.startForAccount('acc1');
    manager.startForAccount('acc1');

    expect(manager.getStatuses()).toHaveLength(1);

    db.close();
    cleanupDb(dbPath);
  }, 15000);

  it('removes sync for account', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const { GmailSyncManager } = await import('../../../electron/main/gmail/sync');

    const getWindow = vi.fn().mockReturnValue(null);
    const manager = new GmailSyncManager(db, getWindow);

    manager.startForAccount('acc1');
    manager.stopForAccount('acc1');

    expect(manager.getStatuses()).toHaveLength(0);

    db.close();
    cleanupDb(dbPath);
  }, 15000);
});
