import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerNotificationHandlers } from '../../../electron/main/ipc/notification-handlers';

vi.mock('electron', () => ({
  Notification: vi.fn(),
  BrowserWindow: vi.fn(),
}));

describe('registerNotificationHandlers', () => {
  const mockIpcMain = {
    handle: vi.fn(),
  };
  const mockDb = {
    prepare: vi.fn().mockReturnThis(),
    get: vi.fn(),
    run: vi.fn(),
  };
  const mockGetWindow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register scheduled notification channels', () => {
    registerNotificationHandlers(mockIpcMain as any, mockDb as any, mockGetWindow);
    const channels = mockIpcMain.handle.mock.calls.map(call => call[0]);
    expect(channels).toContain('notification:get-scheduled-settings');
    expect(channels).toContain('notification:set-scheduled-settings');
    expect(channels).toContain('notification:send-test-notification');
  });

  it('should register all existing notification channels', () => {
    registerNotificationHandlers(mockIpcMain as any, mockDb as any, mockGetWindow);
    const channels = mockIpcMain.handle.mock.calls.map(call => call[0]);
    expect(channels).toContain('notification:get-quiet-hours');
    expect(channels).toContain('notification:set-quiet-hours');
    expect(channels).toContain('notification:get-dnd-status');
    expect(channels).toContain('notification:set-dnd');
    expect(channels).toContain('notification:get-preferences');
    expect(channels).toContain('notification:feedback');
  });

  it('should return both notificationService and scheduledNotificationService', () => {
    const result = registerNotificationHandlers(mockIpcMain as any, mockDb as any, mockGetWindow);
    expect(result.notificationService).toBeDefined();
    expect(result.scheduledNotificationService).toBeDefined();
  });
});
