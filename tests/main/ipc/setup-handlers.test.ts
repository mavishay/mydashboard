import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const mockIpcMain = {
  handle: vi.fn(),
};

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test'),
  },
}));

let db: Database.Database;

beforeEach(async () => {
  vi.clearAllMocks();
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS setup_tracking (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL CHECK (event_type IN (
        'setup_started',
        'setup_step_completed',
        'setup_completed',
        'setup_resumed'
      )),
      step_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      elapsed_ms INTEGER,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS setup_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      services_ready INTEGER NOT NULL DEFAULT 0,
      api_key_complete INTEGER NOT NULL DEFAULT 0,
      account_connected INTEGER NOT NULL DEFAULT 0,
      setup_completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
});

afterEach(() => {
  db.close();
});

describe('registerSetupHandlers', () => {
  it('registers onboarding:getStatus handler', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:getStatus'
    );
    expect(handler).toBeDefined();
  });

  it('registers onboarding:setStepComplete handler', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:setStepComplete'
    );
    expect(handler).toBeDefined();
  });

  it('registers onboarding:recordSetupEvent handler', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:recordSetupEvent'
    );
    expect(handler).toBeDefined();
  });

  it('registers onboarding:startTracking handler', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:startTracking'
    );
    expect(handler).toBeDefined();
  });

  it('onboarding:getStatus returns default setup status', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:getStatus'
    );
    const result = await handler[1]();
    expect(result).toEqual({
      servicesReady: false,
      apiKeyComplete: false,
      accountConnected: false,
      setupCompletedAt: null,
    });
  });

  it('onboarding:setStepComplete updates status', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:setStepComplete'
    );
    await handler[1](null, { stepId: 'docker-check' });
    const statusHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:getStatus'
    );
    const result = await statusHandler[1]();
    expect(result.servicesReady).toBe(true);
  });

  it('onboarding:setStepComplete rejects invalid payload', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:setStepComplete'
    );
    await expect(handler[1](null, {})).rejects.toThrow('Invalid payload');
  });

  it('onboarding:setStepComplete rejects missing stepId', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:setStepComplete'
    );
    await expect(handler[1](null, { stepId: 123 })).rejects.toThrow('Invalid payload');
  });

  it('onboarding:recordSetupEvent rejects invalid payload', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:recordSetupEvent'
    );
    await expect(handler[1](null, {})).rejects.toThrow('Invalid payload');
  });

  it('onboarding:recordSetupEvent accepts valid payload', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:recordSetupEvent'
    );
    await handler[1](null, { eventType: 'setup_started' });
    const rows = db.prepare("SELECT * FROM setup_tracking WHERE event_type = 'setup_started'").all();
    expect(rows).toHaveLength(1);
  });

  it('onboarding:startTracking records setup_started if none exists', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:startTracking'
    );
    await handler[1]();
    const rows = db.prepare("SELECT * FROM setup_tracking WHERE event_type = 'setup_started'").all();
    expect(rows).toHaveLength(1);
  });

  it('onboarding:startTracking does not duplicate setup_started event', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:startTracking'
    );
    await handler[1]();
    await handler[1]();
    const rows = db.prepare("SELECT * FROM setup_tracking WHERE event_type = 'setup_started'").all();
    expect(rows).toHaveLength(1);
  });

  it('onboarding:startTracking returns current setup status', async () => {
    const { registerSetupHandlers } = await import('../../../electron/main/ipc/setup-handlers');
    registerSetupHandlers(mockIpcMain as any, db);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'onboarding:startTracking'
    );
    const result = await handler[1]();
    expect(result).toHaveProperty('servicesReady');
    expect(result).toHaveProperty('apiKeyComplete');
    expect(result).toHaveProperty('accountConnected');
    expect(result).toHaveProperty('setupCompletedAt');
  });
});
