import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(), whenReady: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((str: string) => Buffer.from(str, 'utf-8')),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8')),
  },
  shell: { openExternal: vi.fn() },
}));

const mockListAccounts = vi.fn();
const mockDeleteAccount = vi.fn();
const mockStoreGoogleTasksTokens = vi.fn();
const mockStartAuthFlow = vi.fn();
const mockGetValidAccessToken = vi.fn();

vi.mock('../../../electron/main/auth/google-tasks', () => ({
  listAccounts: (...args: unknown[]) => mockListAccounts(...args),
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
  storeGoogleTasksTokens: (...args: unknown[]) =>
    mockStoreGoogleTasksTokens(...args),
  startAuthFlow: (...args: unknown[]) => mockStartAuthFlow(...args),
  getValidAccessToken: (...args: unknown[]) =>
    mockGetValidAccessToken(...args),
}));

vi.mock('../../../electron/main/sync/google-tasks-api', () => ({
  insertTask: vi.fn().mockResolvedValue({
    id: 'new-task-1',
    title: 'Created Task',
    notes: undefined,
    status: 'needsAction',
  }),
  updateTask: vi.fn().mockResolvedValue({}),
  deleteTask: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../electron/main/sync/google-tasks-sync', () => ({
  GoogleTasksSync: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    onSyncStatus: vi.fn(),
  })),
}));

function createMockDb() {
  const stmts = new Map<string, ReturnType<typeof vi.fn>>();
  return {
    prepare: vi.fn((sql: string) => {
      if (!stmts.has(sql)) {
        stmts.set(sql, {
          run: vi.fn(),
          get: vi.fn(),
          all: vi.fn().mockReturnValue([]),
        });
      }
      return stmts.get(sql)!;
    }),
  };
}

describe('Google Tasks IPC Handlers', () => {
  let mockIpcMain: { handle: ReturnType<typeof vi.fn> };
  let db: ReturnType<typeof createMockDb>;
  let handlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockListAccounts.mockReturnValue([]);
    mockStartAuthFlow.mockResolvedValue({
      account: { id: 'acct-1', email: 'test@gmail.com', display_name: 'Test' },
      tokens: {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expiry_date: Date.now() + 3600000,
        scope: 'tasks.readonly',
      },
    });
    db = createMockDb();
    handlers = new Map();

    mockIpcMain = {
      handle: vi.fn(
        (channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler);
        }
      ),
    };

    const { registerGoogleTasksHandlers } = await import(
      '../../../electron/main/ipc/google-tasks-handlers'
    );
    registerGoogleTasksHandlers(mockIpcMain as any, db as any);
  });

  it('registers all expected channels', () => {
    const expectedChannels = [
      'google-tasks:connect',
      'google-tasks:disconnect',
      'google-tasks:listAccounts',
      'google-tasks:sync',
      'google-tasks:status',
      'google-tasks:listTasks',
      'google-tasks:createTask',
      'google-tasks:updateTask',
      'google-tasks:deleteTask',
    ];
    for (const ch of expectedChannels) {
      expect(handlers.has(ch)).toBe(true);
    }
  });

  describe('google-tasks:connect', () => {
    it('starts auth flow and returns account info', async () => {
      const handler = handlers.get('google-tasks:connect')!;
      const result = await handler({}, {});
      expect(result).toEqual({
        id: 'acct-1',
        email: 'test@gmail.com',
        displayName: 'Test',
      });
      expect(mockStartAuthFlow).toHaveBeenCalled();
      expect(mockStoreGoogleTasksTokens).toHaveBeenCalled();
    });
  });

  describe('google-tasks:listAccounts', () => {
    it('returns mapped account list', async () => {
      mockListAccounts.mockReturnValue([
        { id: 'a1', email: 'user@test.com', display_name: 'User' },
      ]);
      const handler = handlers.get('google-tasks:listAccounts')!;
      const result = await handler({}, {});
      expect(result).toEqual([
        { id: 'a1', email: 'user@test.com', displayName: 'User' },
      ]);
    });
  });

  describe('google-tasks:disconnect', () => {
    it('deletes account and stops sync', async () => {
      const handler = handlers.get('google-tasks:disconnect')!;
      await handler({}, { accountId: 'acct-1' });
      expect(mockDeleteAccount).toHaveBeenCalledWith(db, 'acct-1');
    });

    it('throws on missing accountId', async () => {
      const handler = handlers.get('google-tasks:disconnect')!;
      await expect(handler({}, {})).rejects.toThrow('Invalid payload');
    });
  });

  describe('google-tasks:status', () => {
    it('returns idle status when no syncs active', async () => {
      const handler = handlers.get('google-tasks:status')!;
      const result = await handler({}, {});
      expect(result.status).toBe('idle');
      expect(result.accountCount).toBe(0);
    });
  });

  describe('google-tasks:listTasks', () => {
    it('returns empty array when no tasks', async () => {
      const handler = handlers.get('google-tasks:listTasks')!;
      const result = await handler({}, undefined);
      expect(result).toEqual([]);
    });
  });

  describe('google-tasks:createTask', () => {
    it('creates a task with valid payload', async () => {
      const handler = handlers.get('google-tasks:createTask')!;
      const result = await handler(
        {},
        {
          accountId: 'acct-1',
          taskListId: 'list-1',
          title: 'New task',
          notes: 'Some notes',
        }
      );
      expect(result.id).toBe('new-task-1');
      expect(result.title).toBe('Created Task');
      expect(result.source).toBe('Google Tasks');
    });

    it('throws on missing title', async () => {
      const handler = handlers.get('google-tasks:createTask')!;
      await expect(
        handler({}, { accountId: 'acct-1', taskListId: 'list-1' })
      ).rejects.toThrow('Invalid payload');
    });
  });

  describe('google-tasks:updateTask', () => {
    it('updates a task with valid payload', async () => {
      const handler = handlers.get('google-tasks:updateTask')!;
      const result = await handler(
        {},
        {
          accountId: 'acct-1',
          taskListId: 'list-1',
          taskId: 'task-1',
          status: 'completed',
        }
      );
      expect(result).toEqual({ success: true });
    });

    it('throws on missing taskId', async () => {
      const handler = handlers.get('google-tasks:updateTask')!;
      await expect(
        handler({}, { accountId: 'acct-1', taskListId: 'list-1' })
      ).rejects.toThrow('Invalid payload');
    });
  });

  describe('google-tasks:deleteTask', () => {
    it('deletes a task with valid payload', async () => {
      const handler = handlers.get('google-tasks:deleteTask')!;
      const result = await handler(
        {},
        { accountId: 'acct-1', taskListId: 'list-1', taskId: 'task-1' }
      );
      expect(result).toEqual({ success: true });
    });

    it('throws on empty taskId', async () => {
      const handler = handlers.get('google-tasks:deleteTask')!;
      await expect(
        handler(
          {},
          { accountId: 'acct-1', taskListId: 'list-1', taskId: '' }
        )
      ).rejects.toThrow('Invalid payload');
    });
  });

  describe('google-tasks:sync', () => {
    it('starts a sync and returns success', async () => {
      const handler = handlers.get('google-tasks:sync')!;
      const result = await handler({}, { accountId: 'acct-1' });
      expect(result).toEqual({ success: true });
    });

    it('returns error on sync failure', async () => {
      const { GoogleTasksSync } = await import(
        '../../../electron/main/sync/google-tasks-sync'
      );
      (GoogleTasksSync as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => ({
          start: vi.fn().mockRejectedValue(new Error('Sync failed')),
          stop: vi.fn(),
          onSyncStatus: vi.fn(),
        })
      );

      const handler = handlers.get('google-tasks:sync')!;
      const result = await handler({}, { accountId: 'acct-1' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync failed');
    });
  });
});
