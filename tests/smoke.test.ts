import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-app'),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: { setWindowOpenHandler: vi.fn() },
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn().mockReturnValue(false),
  })),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('app smoke test', () => {
  it('registers all expected IPC channels via registerIpcHandlers', async () => {
    const { registerIpcHandlers } = await import('../electron/main/ipc');
    const { ipcMain } = await import('electron');
    const db = {} as any;

    registerIpcHandlers(db, () => null, vi.fn());

    const registeredChannels = (ipcMain.handle as any).mock.calls.map(
      ([channel]: [string]) => channel
    );

    expect(registeredChannels).toContain('window:minimize');
    expect(registeredChannels).toContain('window:maximize');
    expect(registeredChannels).toContain('window:close');
    expect(registeredChannels).toContain('window:isMaximized');
  });

  it('preload exposes electronAPI with window methods', async () => {
    const { contextBridge } = await import('electron');

    await import('../electron/preload/index');

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'electronAPI',
      expect.objectContaining({
        window: expect.objectContaining({
          minimize: expect.any(Function),
          maximize: expect.any(Function),
          close: expect.any(Function),
          isMaximized: expect.any(Function),
        }),
      })
    );
  });
});
