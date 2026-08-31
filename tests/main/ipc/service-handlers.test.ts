import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceRegistry } from '../../../electron/main/services/service-registry';

const mockIpcMain = {
  handle: vi.fn(),
};

function createMockService(id: string, name: string) {
  let status: 'running' | 'stopped' | 'error' | 'starting' = 'stopped';
  const lastError: string | null = null;
  let startedAt: string | null = null;

  return {
    id,
    name,
    start: vi.fn(async () => { status = 'running'; startedAt = new Date().toISOString(); }),
    stop: vi.fn(() => { status = 'stopped'; startedAt = null; }),
    getStatus: () => status,
    getLastError: () => lastError,
    getStartedAt: () => startedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerServiceHandlers', () => {
  it('registers services:status handler', async () => {
    const registry = new ServiceRegistry();
    const { registerServiceHandlers } = await import('../../../electron/main/ipc/service-handlers');
    registerServiceHandlers(mockIpcMain as any, registry);
    
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'services:status'
    );
    expect(handler).toBeDefined();
  });

  it('registers services:start handler', async () => {
    const registry = new ServiceRegistry();
    const { registerServiceHandlers } = await import('../../../electron/main/ipc/service-handlers');
    registerServiceHandlers(mockIpcMain as any, registry);
    
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'services:start'
    );
    expect(handler).toBeDefined();
  });

  it('registers services:stop handler', async () => {
    const registry = new ServiceRegistry();
    const { registerServiceHandlers } = await import('../../../electron/main/ipc/service-handlers');
    registerServiceHandlers(mockIpcMain as any, registry);
    
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'services:stop'
    );
    expect(handler).toBeDefined();
  });

  it('services:status returns service list', async () => {
    const registry = new ServiceRegistry();
    registry.register(createMockService('cron', 'Email Auto-Fetch'));
    registry.register(createMockService('google-tasks', 'Google Tasks Sync'));

    const { registerServiceHandlers } = await import('../../../electron/main/ipc/service-handlers');
    registerServiceHandlers(mockIpcMain as any, registry);

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'services:status'
    );
    const result = await handler[1]();
    expect(result.services).toHaveLength(2);
    expect(result.services[0].id).toBe('cron');
    expect(result.services[1].id).toBe('google-tasks');
  });

  it('services:start starts all services and returns status', async () => {
    const registry = new ServiceRegistry();
    const service = createMockService('cron', 'Email Auto-Fetch');
    registry.register(service);

    const { registerServiceHandlers } = await import('../../../electron/main/ipc/service-handlers');
    registerServiceHandlers(mockIpcMain as any, registry);

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'services:start'
    );
    const result = await handler[1]();
    expect(service.start).toHaveBeenCalled();
    expect(result.services[0].status).toBe('running');
  });

  it('services:stop stops all services and returns status', async () => {
    const registry = new ServiceRegistry();
    const service = createMockService('cron', 'Email Auto-Fetch');
    registry.register(service);

    const { registerServiceHandlers } = await import('../../../electron/main/ipc/service-handlers');
    registerServiceHandlers(mockIpcMain as any, registry);

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'services:stop'
    );
    const result = await handler[1]();
    expect(service.stop).toHaveBeenCalled();
    expect(result.services[0].status).toBe('stopped');
  });
});
