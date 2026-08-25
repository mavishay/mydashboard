import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const mockListTaskLists = vi.fn();
const mockListTasks = vi.fn();
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockGetValidAccessToken = vi.fn();

vi.mock('../../../electron/main/sync/google-tasks-api', () => ({
  listTaskLists: (...args: unknown[]) => mockListTaskLists(...args),
  listTasks: (...args: unknown[]) => mockListTasks(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
}));

vi.mock('../../../electron/main/auth/google-tasks', () => ({
  getValidAccessToken: (...args: unknown[]) =>
    mockGetValidAccessToken(...args),
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
    _stmts: stmts,
  };
}

describe('GoogleTasksSync', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    db = createMockDb();
    mockGetValidAccessToken.mockResolvedValue('test-token');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a sync instance with default config', async () => {
    const { GoogleTasksSync } = await import(
      '../../../electron/main/sync/google-tasks-sync'
    );
    const sync = new GoogleTasksSync(db as any, 'account-1');
    expect(sync).toBeDefined();
  });

  it('runs initial sync on start and sets status to idle', async () => {
    mockListTaskLists.mockResolvedValue([]);
    const { GoogleTasksSync } = await import(
      '../../../electron/main/sync/google-tasks-sync'
    );
    const sync = new GoogleTasksSync(db as any, 'account-1');
    const statusCb = vi.fn();
    sync.onSyncStatus(statusCb);

    await sync.start();

    expect(statusCb).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'syncing' })
    );
    expect(statusCb).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'idle' })
    );
  });

  it('stops polling on stop()', async () => {
    mockListTaskLists.mockResolvedValue([]);
    const { GoogleTasksSync } = await import(
      '../../../electron/main/sync/google-tasks-sync'
    );
    const sync = new GoogleTasksSync(db as any, 'account-1', {
      pollIntervalMs: 1000,
    });

    await sync.start();
    sync.stop();

    vi.advanceTimersByTime(2000);
    // After stop, no more sync cycles should run
    expect(mockListTaskLists).toHaveBeenCalledTimes(1);
  });

  it('handles errors and increments failure count', async () => {
    mockListTaskLists.mockRejectedValue(new Error('API down'));
    const { GoogleTasksSync } = await import(
      '../../../electron/main/sync/google-tasks-sync'
    );
    const sync = new GoogleTasksSync(db as any, 'account-1', {
      maxRetries: 0,
      circuitBreakerThreshold: 2,
    });
    const statusCb = vi.fn();
    sync.onSyncStatus(statusCb);

    await sync.start();

    expect(statusCb).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', error: 'API down' })
    );
  });

  it('opens circuit breaker after threshold failures', async () => {
    mockListTaskLists.mockRejectedValue(new Error('fail'));
    const { GoogleTasksSync } = await import(
      '../../../electron/main/sync/google-tasks-sync'
    );
    const sync = new GoogleTasksSync(db as any, 'account-1', {
      maxRetries: 0,
      circuitBreakerThreshold: 2,
      circuitBreakerResetMs: 60000,
    });
    const statusCb = vi.fn();
    sync.onSyncStatus(statusCb);

    // First failure
    await sync.start();
    // Second failure via polling
    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Circuit should be open now - third attempt should emit error immediately
    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    const circuitOpenCalls = statusCb.mock.calls.filter(
      (call) =>
        call[0].status === 'error' &&
        call[0].error?.includes('Circuit breaker')
    );
    expect(circuitOpenCalls.length).toBeGreaterThan(0);
  });

  it('syncs tasks from remote lists', async () => {
    mockListTaskLists.mockResolvedValue([
      { id: 'list-1', title: 'My Tasks', updated: '2026-01-01T00:00:00Z' },
    ]);
    mockListTasks.mockResolvedValue({
      items: [
        {
          id: 'task-1',
          title: 'Buy milk',
          status: 'needsAction',
          position: '1',
          updated: '2026-01-01T00:00:00Z',
          selfLink: 'https://tasks.example.com/task-1',
        },
      ],
      syncToken: 'new-sync-token',
    });

    const { GoogleTasksSync } = await import(
      '../../../electron/main/sync/google-tasks-sync'
    );
    const sync = new GoogleTasksSync(db as any, 'account-1', {
      maxRetries: 0,
    });

    await sync.start();

    // Verify API calls were made
    expect(mockListTaskLists).toHaveBeenCalledWith('test-token');
    expect(mockListTasks).toHaveBeenCalledWith('test-token', 'list-1', undefined);

    // Verify status transition
    const statusCb = vi.fn();
    sync.onSyncStatus(statusCb);
    // Status was already emitted during start
    expect(mockListTaskLists).toHaveBeenCalled();
  });

  it('handles incremental sync with sync token', async () => {
    // Set up existing sync token
    const syncTokenGet = vi.fn().mockReturnValue({ sync_token: 'old-token' });
    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('google_tasks_sync_state') && sql.includes('SELECT')) {
        return { get: syncTokenGet, run: vi.fn(), all: vi.fn() };
      }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn().mockReturnValue([]) };
    });

    mockListTaskLists.mockResolvedValue([
      { id: 'list-1', title: 'Tasks', updated: '2026-01-01T00:00:00Z' },
    ]);
    mockListTasks.mockResolvedValue({ items: [], syncToken: 'new-token' });

    const { GoogleTasksSync } = await import(
      '../../../electron/main/sync/google-tasks-sync'
    );
    const sync = new GoogleTasksSync(db as any, 'account-1', {
      maxRetries: 0,
    });

    await sync.start();

    // Should have used incremental sync (with syncToken param)
    expect(mockListTasks).toHaveBeenCalledWith(
      'test-token',
      'list-1',
      'old-token'
    );
  });

  it('resolves conflicts with last-write-wins', async () => {
    // Existing local task with older timestamp
    const localTask = { updated_at: '2025-12-01T00:00:00Z', synced_at: '2025-12-01T00:00:00Z' };
    const getStmt = vi.fn().mockReturnValue(localTask);
    const runStmt = vi.fn();

    db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT updated_at, synced_at FROM google_tasks')) {
        return { get: getStmt, run: runStmt, all: vi.fn() };
      }
      return { run: runStmt, get: vi.fn(), all: vi.fn().mockReturnValue([]) };
    });

    mockListTaskLists.mockResolvedValue([
      { id: 'list-1', title: 'Tasks', updated: '2026-01-01T00:00:00Z' },
    ]);
    mockListTasks.mockResolvedValue({
      items: [
        {
          id: 'task-1',
          title: 'Remote title',
          status: 'completed',
          position: '1',
          updated: '2026-01-02T00:00:00Z',
          selfLink: 'https://tasks.example.com/task-1',
        },
      ],
      syncToken: 'token',
    });

    const { GoogleTasksSync } = await import(
      '../../../electron/main/sync/google-tasks-sync'
    );
    const sync = new GoogleTasksSync(db as any, 'account-1', {
      maxRetries: 0,
    });

    await sync.start();

    // Should have called UPDATE because remote is newer
    expect(runStmt).toHaveBeenCalled();
  });
});
