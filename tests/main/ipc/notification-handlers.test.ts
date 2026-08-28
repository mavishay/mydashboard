import { describe, it, expect, vi } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-app'),
  },
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

function testDbPath(): string {
  return join(__dirname, `__test_${randomBytes(4).toString('hex')}.db`);
}

function cleanupDb(path: string): void {
  try { rmSync(path); } catch {}
  try { rmSync(path + '-wal'); } catch {}
  try { rmSync(path + '-shm'); } catch {}
}

describe('notification-handlers', () => {
  it('registers all notification channels', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerNotificationHandlers } = await import('../../../electron/main/ipc/notification-handlers');
    registerNotificationHandlers(mockIpcMain as never, db);

    const registeredChannels = mockIpcMain.handle.mock.calls.map(
      (call) => call[0] as string
    );

    expect(registeredChannels).toContain('notification:get-quiet-hours');
    expect(registeredChannels).toContain('notification:set-quiet-hours');
    expect(registeredChannels).toContain('notification:get-dnd-status');
    expect(registeredChannels).toContain('notification:set-dnd');
    expect(registeredChannels).toContain('notification:get-preferences');
    expect(registeredChannels).toContain('notification:feedback');

    db.close();
    cleanupDb(dbPath);
  });

  it('returns notificationService reference', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerNotificationHandlers } = await import('../../../electron/main/ipc/notification-handlers');
    const result = registerNotificationHandlers(mockIpcMain as never, db);

    expect(result.notificationService).toBeDefined();
    expect(typeof result.notificationService.send).toBe('function');
    expect(typeof result.notificationService.getDndStatus).toBe('function');

    db.close();
    cleanupDb(dbPath);
  });

  it('rejects equal start/end quiet hours', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerNotificationHandlers } = await import('../../../electron/main/ipc/notification-handlers');
    registerNotificationHandlers(mockIpcMain as never, db);

    const setQuietHoursHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'notification:set-quiet-hours'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    await expect(
      setQuietHoursHandler({}, { enabled: true, startHour: 12, startMinute: 0, endHour: 12, endMinute: 0 })
    ).rejects.toThrow('Start and end times must differ');

    db.close();
    cleanupDb(dbPath);
  });

  it('validates feedback payload with Zod', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerNotificationHandlers } = await import('../../../electron/main/ipc/notification-handlers');
    registerNotificationHandlers(mockIpcMain as never, db);

    const feedbackHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'notification:feedback'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    await expect(
      feedbackHandler({}, { notificationId: '', emailId: 'e1', classification: 'urgent', feedback: 'thumbs_up' })
    ).rejects.toThrow('Invalid payload');

    await expect(
      feedbackHandler({}, { notificationId: 'n1', emailId: 'e1', classification: 'urgent', feedback: 'invalid' })
    ).rejects.toThrow('Invalid payload');

    db.close();
    cleanupDb(dbPath);
  });

  it('validates DND payload with Zod', async () => {
    const dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);

    const mockIpcMain = {
      handle: vi.fn(),
    };

    const { registerNotificationHandlers } = await import('../../../electron/main/ipc/notification-handlers');
    registerNotificationHandlers(mockIpcMain as never, db);

    const setDndHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'notification:set-dnd'
    )?.[1] as (...args: unknown[]) => Promise<unknown>;

    await expect(
      setDndHandler({}, { enabled: 'not-a-boolean' })
    ).rejects.toThrow('Invalid payload');

    db.close();
    cleanupDb(dbPath);
  });
});
