// tests/main/sync/ticktick-sync.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TickTickSync } from '../../../electron/main/sync/ticktick-sync';
import type { TickTickAdapter } from '../../../electron/main/sync/ticktick-adapter';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    decryptString: vi.fn().mockReturnValue('decrypted-token'),
  },
}));

function createMockDb() {
  const store = new Map<string, Record<string, unknown>>();
  return {
    prepare: vi.fn().mockImplementation((sql: string) => ({
      get: vi.fn().mockImplementation((...args: unknown[]) => {
        if (sql.includes('ticktick_tasks') && sql.includes('SELECT')) {
          return store.get(`task:${args[0]}`) ?? undefined;
        }
        if (sql.includes('ticktick_projects') && sql.includes('SELECT')) {
          return undefined;
        }
        if (sql.includes('ticktick_projects') && sql.includes('MAX')) {
          return { last_sync: null };
        }
        return undefined;
      }),
      run: vi.fn().mockImplementation((...args: unknown[]) => {
        if (sql.includes('INSERT INTO ticktick_tasks')) {
          store.set(`task:${args[0]}`, {
            updated_at: args[8],
            synced_at: args[9],
          });
        }
        if (sql.includes('UPDATE ticktick_tasks SET synced_at')) {
          const existing = store.get(`task:${args[1]}`);
          if (existing) existing.synced_at = args[0];
        }
        return { changes: 1 };
      }),
      all: vi.fn().mockReturnValue([]),
    })),
  };
}

function createMockAdapter(): TickTickAdapter {
  return {
    provider: 'ticktick',
    listProjects: vi.fn().mockResolvedValue([
      { id: 'p1', name: 'Test Project', kind: 'TASK' },
    ]),
    listTasks: vi.fn().mockResolvedValue([
      {
        id: 't1',
        projectId: 'p1',
        title: 'Remote Task',
        content: null,
        dueDate: null,
        status: 0 as const,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ]),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  } as unknown as TickTickAdapter;
}

describe('TickTickSync', () => {
  let db: ReturnType<typeof createMockDb>;
  let adapter: TickTickAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    db = createMockDb();
    adapter = createMockAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs remote tasks to local database', async () => {
    const sync = new TickTickSync(db as unknown as import('better-sqlite3').Database, 'acc-1', adapter, {
      pollIntervalMs: 60_000,
      maxRetries: 1,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 300_000,
    });

    await sync.start();
    sync.stop();

    expect(adapter.listProjects).toHaveBeenCalled();
    expect(adapter.listTasks).toHaveBeenCalledWith('p1');
  });

  it('stops cleanly', async () => {
    const sync = new TickTickSync(db as unknown as import('better-sqlite3').Database, 'acc-1', adapter, {
      pollIntervalMs: 60_000,
      maxRetries: 1,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 300_000,
    });

    await sync.start();
    sync.stop();

    // No error should occur
  });

  it('emits error status on failure', async () => {
    (adapter.listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    );

    const sync = new TickTickSync(db as unknown as import('better-sqlite3').Database, 'acc-1', adapter, {
      pollIntervalMs: 60_000,
      maxRetries: 0,
      circuitBreakerThreshold: 1,
      circuitBreakerResetMs: 300_000,
    });

    const statusFn = vi.fn();
    sync.onSyncStatus(statusFn);

    await sync.start();
    sync.stop();

    expect(statusFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
  });
});
