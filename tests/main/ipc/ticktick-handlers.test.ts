// tests/main/ipc/ticktick-handlers.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(), whenReady: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    decryptString: vi.fn().mockReturnValue('decrypted-token'),
  },
}));

// Mock auth module
vi.mock('../../../electron/main/auth/ticktick', () => ({
  createAccount: vi.fn().mockReturnValue({
    id: 'acc-1',
    email: 'test@ticktick.com',
    display_name: 'Test User',
  }),
  listAccounts: vi.fn().mockReturnValue([]),
  deleteAccount: vi.fn(),
  validateToken: vi.fn().mockResolvedValue(true),
  getAccessToken: vi.fn().mockReturnValue('test-token'),
}));

// Mock TickTickSync
vi.mock('../../../electron/main/sync/ticktick-sync', () => ({
  TickTickSync: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    onSyncStatus: vi.fn(),
  })),
}));

// Mock TickTickAdapter
vi.mock('../../../electron/main/sync/ticktick-adapter', () => ({
  TickTickAdapter: vi.fn().mockImplementation(() => ({
    listProjects: vi.fn().mockResolvedValue([]),
    listTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  })),
}));

describe('TickTick Handlers', () => {
  let mockIpcMain: { handle: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
  let mockDb: { prepare: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; all: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIpcMain = { handle: vi.fn(), on: vi.fn() };
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      run: vi.fn(),
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
    };
  });

  it('registers all ticktick channels', async () => {
    const { registerTickTickHandlers } = await import('../../../electron/main/ipc/ticktick-handlers');
    registerTickTickHandlers(
      mockIpcMain as unknown as import('electron').IpcMain,
      mockDb as unknown as import('better-sqlite3').Database
    );

    const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0]);
    expect(channels).toContain('ticktick:connect');
    expect(channels).toContain('ticktick:disconnect');
    expect(channels).toContain('ticktick:listAccounts');
    expect(channels).toContain('ticktick:sync');
    expect(channels).toContain('ticktick:status');
    expect(channels).toContain('ticktick:listTasks');
    expect(channels).toContain('ticktick:createTask');
    expect(channels).toContain('ticktick:updateTask');
    expect(channels).toContain('ticktick:deleteTask');
  });

  it('validates Zod schema on connect', async () => {
    const { registerTickTickHandlers } = await import('../../../electron/main/ipc/ticktick-handlers');
    registerTickTickHandlers(
      mockIpcMain as unknown as import('electron').IpcMain,
      mockDb as unknown as import('better-sqlite3').Database
    );

    const connectHandler = mockIpcMain.handle.mock.calls.find(
      (c: unknown[]) => c[0] === 'ticktick:connect'
    )?.[1] as ((...args: unknown[]) => Promise<unknown>) | undefined;

    // Invalid payload should throw
    await expect(
      connectHandler!(null, { token: '', email: 'not-an-email', displayName: '' })
    ).rejects.toThrow('Invalid payload');
  });
});
