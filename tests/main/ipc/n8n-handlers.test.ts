import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIpcMain = {
  handle: vi.fn(),
};

const mockComposeDir = '/tmp/test-compose';

const mockExecFileAsync = vi.fn();

vi.mock('../../../electron/main/docker/health', () => ({
  checkHealth: vi.fn().mockResolvedValue('unknown'),
}));

vi.mock('../../../electron/main/docker/compose', () => ({
  composeUp: vi.fn().mockResolvedValue(undefined),
  composeDown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerN8nHandlers', () => {
  it('registers n8n:status handler', async () => {
    const { registerN8nHandlers } = await import('../../../electron/main/ipc/n8n-handlers');
    registerN8nHandlers(mockIpcMain as any, mockComposeDir);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'n8n:status'
    );
    expect(handler).toBeDefined();
  });

  it('registers n8n:start handler', async () => {
    const { registerN8nHandlers } = await import('../../../electron/main/ipc/n8n-handlers');
    registerN8nHandlers(mockIpcMain as any, mockComposeDir);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'n8n:start'
    );
    expect(handler).toBeDefined();
  });

  it('registers n8n:stop handler', async () => {
    const { registerN8nHandlers } = await import('../../../electron/main/ipc/n8n-handlers');
    registerN8nHandlers(mockIpcMain as any, mockComposeDir);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'n8n:stop'
    );
    expect(handler).toBeDefined();
  });

  it('registers n8n:docker-status handler', async () => {
    const { registerN8nHandlers } = await import('../../../electron/main/ipc/n8n-handlers');
    registerN8nHandlers(mockIpcMain as any, mockComposeDir);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'n8n:docker-status'
    );
    expect(handler).toBeDefined();
  });

  it('n8n:docker-status returns available=true when Docker is running', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: '24.0.0' });

    const { registerN8nHandlers } = await import('../../../electron/main/ipc/n8n-handlers');
    registerN8nHandlers(mockIpcMain as any, mockComposeDir);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'n8n:docker-status'
    );
    const result = await handler[1]();
    expect(result).toEqual({ available: true });
  });

  it('n8n:docker-status returns available=false when Docker is not running', async () => {
    mockExecFileAsync.mockRejectedValue(new Error('command not found'));

    const { registerN8nHandlers } = await import('../../../electron/main/ipc/n8n-handlers');
    registerN8nHandlers(mockIpcMain as any, mockComposeDir);
    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'n8n:docker-status'
    );
    const result = await handler[1]();
    expect(result).toEqual({ available: false, error: 'Docker daemon is not running' });
  });
});
