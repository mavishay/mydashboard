import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
  ipcMain: { handle: vi.fn() },
}));

function createMockLanServer() {
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    status: vi.fn(() => ({ running: false, port: 8443, url: null })),
    getToken: vi.fn(() => 'ABC-123'),
    regenerateToken: vi.fn(() => 'XYZ-789'),
    getConnectedDevices: vi.fn(() => 0),
  };
}

describe('lan-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerLanHandlers', () => {
    it('registers all IPC handlers', async () => {
      const { registerLanHandlers } = await import('../../electron/main/ipc/lan-handlers');
      const { ipcMain } = await import('electron');

      const lanServer = createMockLanServer();
      registerLanHandlers(ipcMain as any, lanServer as any);

      const handleCalls = vi.mocked(ipcMain.handle).mock.calls;
      const channels = handleCalls.map((call) => call[0]);

      expect(channels).toContain('lan:start');
      expect(channels).toContain('lan:stop');
      expect(channels).toContain('lan:status');
      expect(channels).toContain('lan:getToken');
      expect(channels).toContain('lan:regenerateToken');
      expect(channels).toContain('lan:getConnectedDevices');
    });

    it('lan:start calls lanServer.start()', async () => {
      const { registerLanHandlers } = await import('../../electron/main/ipc/lan-handlers');
      const { ipcMain } = await import('electron');

      const lanServer = createMockLanServer();
      lanServer.status.mockReturnValue({ running: true, port: 8443, url: 'https://192.168.1.42:8443' });

      registerLanHandlers(ipcMain as any, lanServer as any);

      const startHandler = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'lan:start'
      )?.[1] as (...args: unknown[]) => Promise<unknown>;

      const result = await startHandler();

      expect(lanServer.start).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.url).toBe('https://192.168.1.42:8443');
    });

    it('lan:stop calls lanServer.stop()', async () => {
      const { registerLanHandlers } = await import('../../electron/main/ipc/lan-handlers');
      const { ipcMain } = await import('electron');

      const lanServer = createMockLanServer();
      registerLanHandlers(ipcMain as any, lanServer as any);

      const stopHandler = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'lan:stop'
      )?.[1] as (...args: unknown[]) => Promise<unknown>;

      const result = await stopHandler();

      expect(lanServer.stop).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('lan:status returns server status', async () => {
      const { registerLanHandlers } = await import('../../electron/main/ipc/lan-handlers');
      const { ipcMain } = await import('electron');

      const lanServer = createMockLanServer();
      lanServer.status.mockReturnValue({ running: true, port: 8443, url: 'https://192.168.1.42:8443' });

      registerLanHandlers(ipcMain as any, lanServer as any);

      const statusHandler = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'lan:status'
      )?.[1] as (...args: unknown[]) => Promise<unknown>;

      const result = await statusHandler();

      expect(result.running).toBe(true);
      expect(result.port).toBe(8443);
    });

    it('lan:getToken returns token', async () => {
      const { registerLanHandlers } = await import('../../electron/main/ipc/lan-handlers');
      const { ipcMain } = await import('electron');

      const lanServer = createMockLanServer();
      registerLanHandlers(ipcMain as any, lanServer as any);

      const getTokenHandler = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'lan:getToken'
      )?.[1] as (...args: unknown[]) => Promise<unknown>;

      const result = await getTokenHandler();

      expect(result.token).toBe('ABC-123');
    });

    it('lan:regenerateToken returns new token', async () => {
      const { registerLanHandlers } = await import('../../electron/main/ipc/lan-handlers');
      const { ipcMain } = await import('electron');

      const lanServer = createMockLanServer();
      registerLanHandlers(ipcMain as any, lanServer as any);

      const regenHandler = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'lan:regenerateToken'
      )?.[1] as (...args: unknown[]) => Promise<unknown>;

      const result = await regenHandler();

      expect(lanServer.regenerateToken).toHaveBeenCalled();
      expect(result.token).toBe('XYZ-789');
    });

    it('lan:getConnectedDevices returns count', async () => {
      const { registerLanHandlers } = await import('../../electron/main/ipc/lan-handlers');
      const { ipcMain } = await import('electron');

      const lanServer = createMockLanServer();
      lanServer.getConnectedDevices.mockReturnValue(3);

      registerLanHandlers(ipcMain as any, lanServer as any);

      const devicesHandler = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'lan:getConnectedDevices'
      )?.[1] as (...args: unknown[]) => Promise<unknown>;

      const result = await devicesHandler();

      expect(result.count).toBe(3);
    });

    it('lan:start handles errors gracefully', async () => {
      const { registerLanHandlers } = await import('../../electron/main/ipc/lan-handlers');
      const { ipcMain } = await import('electron');

      const lanServer = createMockLanServer();
      lanServer.start.mockRejectedValue(new Error('Port in use'));

      registerLanHandlers(ipcMain as any, lanServer as any);

      const startHandler = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'lan:start'
      )?.[1] as (...args: unknown[]) => Promise<unknown>;

      const result = await startHandler();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Port in use');
    });
  });
});
