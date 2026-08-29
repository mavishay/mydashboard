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

const mockGetValidAccessToken = vi.fn();
const mockListTaskLists = vi.fn();
const mockInsertTask = vi.fn();

vi.mock('../../../electron/main/auth/google-tasks', () => ({
  getValidAccessToken: (...args: unknown[]) => mockGetValidAccessToken(...args),
}));

vi.mock('../../../electron/main/sync/google-tasks-api', () => ({
  listTaskLists: (...args: unknown[]) => mockListTaskLists(...args),
  insertTask: (...args: unknown[]) => mockInsertTask(...args),
}));

const mockGetAccessToken = vi.fn();
const mockListProjects = vi.fn();
const mockTickTickAdapter = vi.fn();

vi.mock('../../../electron/main/auth/ticktick', () => ({
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
}));

vi.mock('../../../electron/main/sync/ticktick-adapter', () => ({
  TickTickAdapter: vi.fn().mockImplementation(() => ({
    listProjects: (...args: unknown[]) => mockListProjects(...args),
    createTask: (...args: unknown[]) => mockTickTickAdapter(...args),
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

describe('Tasks IPC Handlers', () => {
  let mockIpcMain: { handle: ReturnType<typeof vi.fn> };
  let db: ReturnType<typeof createMockDb>;
  let handlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    db = createMockDb();
    handlers = new Map();

    mockIpcMain = {
      handle: vi.fn(
        (channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler);
        }
      ),
    };

    mockGetValidAccessToken.mockResolvedValue('gt-access-token');
    mockListTaskLists.mockResolvedValue([
      { id: 'list-1', title: 'My Tasks' },
    ]);
    mockInsertTask.mockResolvedValue({
      id: 'remote-task-1',
      title: 'Remote Task',
      notes: undefined,
      status: 'needsAction',
    });

    mockGetAccessToken.mockReturnValue('tt-access-token');
    mockListProjects.mockResolvedValue([
      { id: 'proj-1', name: 'Project', kind: 'TASK' },
    ]);
    mockTickTickAdapter.mockResolvedValue({
      id: 'remote-tt-task-1',
      title: 'Remote TT Task',
      content: undefined,
      status: 0,
    });

    const { registerTasksHandlers } = await import(
      '../../../electron/main/ipc/tasks-handlers'
    );
    registerTasksHandlers(mockIpcMain as any, db as any);
  });

  it('registers all expected channels', () => {
    const expectedChannels = [
      'google-tasks:listLists',
      'ticktick:listProjects',
      'tasks:createFromEmail',
    ];
    for (const ch of expectedChannels) {
      expect(handlers.has(ch)).toBe(true);
    }
  });

  describe('google-tasks:listLists', () => {
    it('returns list of task lists', async () => {
      const handler = handlers.get('google-tasks:listLists')!;
      const result = await handler({}, { accountId: 'acct-1' });
      expect(result).toEqual([{ id: 'list-1', title: 'My Tasks' }]);
      expect(mockGetValidAccessToken).toHaveBeenCalledWith(db, 'acct-1');
      expect(mockListTaskLists).toHaveBeenCalledWith('gt-access-token');
    });

    it('throws on invalid payload', async () => {
      const handler = handlers.get('google-tasks:listLists')!;
      await expect(handler({}, { invalid: true })).rejects.toThrow('Invalid payload');
    });
  });

  describe('ticktick:listProjects', () => {
    it('returns list of projects', async () => {
      const handler = handlers.get('ticktick:listProjects')!;
      const result = await handler({}, { accountId: 'acct-2' });
      expect(result).toEqual([{ id: 'proj-1', name: 'Project', kind: 'TASK' }]);
      expect(mockGetAccessToken).toHaveBeenCalledWith(db, 'acct-2');
      expect(mockListProjects).toHaveBeenCalled();
    });

    it('throws on invalid payload', async () => {
      const handler = handlers.get('ticktick:listProjects')!;
      await expect(handler({}, {})).rejects.toThrow('Invalid payload');
    });
  });

  describe('tasks:createFromEmail', () => {
    it('creates Google Tasks task', async () => {
      const handler = handlers.get('tasks:createFromEmail')!;
      const result = await handler(
        {},
        {
          listType: 'google-tasks',
          accountId: 'acct-1',
          listId: 'list-1',
          title: 'Task from email',
          description: 'Email snippet',
        }
      );
      expect(result).toEqual({ success: true, taskId: 'remote-task-1' });
      expect(mockInsertTask).toHaveBeenCalledWith(
        'gt-access-token',
        'list-1',
        'Task from email',
        'Email snippet'
      );
    });

    it('creates TickTick task', async () => {
      const handler = handlers.get('tasks:createFromEmail')!;
      const result = await handler(
        {},
        {
          listType: 'ticktick',
          accountId: 'acct-2',
          listId: 'proj-1',
          title: 'TT task',
          description: 'desc',
        }
      );
      expect(result).toEqual({ success: true, taskId: 'remote-tt-task-1' });
      expect(mockTickTickAdapter).toHaveBeenCalledWith('proj-1', {
        title: 'TT task',
        content: 'desc',
      });
    });

    it('returns error on failure', async () => {
      mockInsertTask.mockRejectedValueOnce(new Error('Network error'));
      const handler = handlers.get('tasks:createFromEmail')!;
      const result = await handler(
        {},
        {
          listType: 'google-tasks',
          accountId: 'acct-1',
          listId: 'list-1',
          title: 'Task',
        }
      );
      expect(result).toEqual({ success: false, error: 'Network error' });
    });

    it('throws on invalid payload', async () => {
      const handler = handlers.get('tasks:createFromEmail')!;
      await expect(handler({}, { listType: 'invalid' })).rejects.toThrow('Invalid payload');
    });
  });
});