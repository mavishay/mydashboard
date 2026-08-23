import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWindow = {
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn().mockReturnValue(false),
} as any;

const mockIpcMain = {
  handle: vi.fn(),
};

const mockQuit = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerWindowHandlers', () => {
  it('registers window:minimize handler', async () => {
    const { registerWindowHandlers } = await import('../../../electron/main/ipc/window-handlers');
    registerWindowHandlers(mockIpcMain as any, () => mockWindow, mockQuit);
    const minimizeHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'window:minimize'
    );
    expect(minimizeHandler).toBeDefined();
  });

  it('registers window:maximize handler that toggles', async () => {
    const { registerWindowHandlers } = await import('../../../electron/main/ipc/window-handlers');
    registerWindowHandlers(mockIpcMain as any, () => mockWindow, mockQuit);
    const maximizeHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'window:maximize'
    );
    expect(maximizeHandler).toBeDefined();

    maximizeHandler[1]({}, {});
    expect(mockWindow.maximize).toHaveBeenCalled();
  });

  it('registers window:close handler', async () => {
    const { registerWindowHandlers } = await import('../../../electron/main/ipc/window-handlers');
    registerWindowHandlers(mockIpcMain as any, () => mockWindow, mockQuit);
    const closeHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'window:close'
    );
    expect(closeHandler).toBeDefined();
  });

  it('registers window:isMaximized handler', async () => {
    const { registerWindowHandlers } = await import('../../../electron/main/ipc/window-handlers');
    registerWindowHandlers(mockIpcMain as any, () => mockWindow, mockQuit);
    const isMaxHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'window:isMaximized'
    );
    expect(isMaxHandler).toBeDefined();
    const result = isMaxHandler[1]({}, {});
    expect(result).toBe(false);
  });

  it('registers app:quit handler that calls quit', async () => {
    const { registerWindowHandlers } = await import('../../../electron/main/ipc/window-handlers');
    registerWindowHandlers(mockIpcMain as any, () => mockWindow, mockQuit);
    const quitHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'app:quit'
    );
    expect(quitHandler).toBeDefined();
    quitHandler[1]({}, {});
    expect(mockQuit).toHaveBeenCalled();
  });

  it('rejects invalid payload for window:minimize', async () => {
    const { registerWindowHandlers } = await import('../../../electron/main/ipc/window-handlers');
    registerWindowHandlers(mockIpcMain as any, () => mockWindow, mockQuit);
    const minimizeHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'window:minimize'
    );
    expect(() => minimizeHandler[1]({}, { extra: 'field' })).toThrow('Invalid payload');
  });
});
