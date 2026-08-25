import { describe, it, expect, vi, beforeAll } from 'vitest';

const mockContextBridge = {
  exposeInMainWorld: vi.fn(),
};

const mockIpcRenderer = {
  invoke: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
};

vi.mock('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}));

beforeAll(async () => {
  await import('../../electron/preload/index');
});

describe('preload contextBridge', () => {
  it('exposes electronAPI to renderer', () => {
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'electronAPI',
      expect.objectContaining({
        window: expect.objectContaining({
          minimize: expect.any(Function),
          maximize: expect.any(Function),
          close: expect.any(Function),
          isMaximized: expect.any(Function),
        }),
        app: expect.objectContaining({
          quit: expect.any(Function),
          onQuit: expect.any(Function),
        }),
      })
    );
  });

  it('window.minimize calls correct channel', () => {
    mockIpcRenderer.invoke.mockClear();
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    api.window.minimize();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window:minimize');
  });

  it('window.maximize calls correct channel', () => {
    mockIpcRenderer.invoke.mockClear();
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    api.window.maximize();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window:maximize');
  });

  it('window.close calls correct channel', () => {
    mockIpcRenderer.invoke.mockClear();
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    api.window.close();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window:close');
  });

  it('window.isMaximized calls correct channel', () => {
    mockIpcRenderer.invoke.mockClear();
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    api.window.isMaximized();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window:isMaximized');
  });

  it('app.quit calls correct channel', () => {
    mockIpcRenderer.invoke.mockClear();
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    api.app.quit();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('app:quit');
  });

  it('app.onQuit registers listener on correct channel', () => {
    mockIpcRenderer.on.mockClear();
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    const callback = vi.fn();
    api.app.onQuit(callback);
    expect(mockIpcRenderer.on).toHaveBeenCalledWith('app:quit', expect.any(Function));
  });

  it('does not expose raw ipcRenderer', () => {
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    expect(api).not.toHaveProperty('ipcRenderer');
    expect(api).not.toHaveProperty('invoke');
  });

  it('does not expose raw SQL execution methods', () => {
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    expect(api).not.toHaveProperty('db');
  });

  it('n8n.dockerStatus calls correct channel', () => {
    mockIpcRenderer.invoke.mockClear();
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    api.n8n.dockerStatus();
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('n8n:docker-status');
  });
});
