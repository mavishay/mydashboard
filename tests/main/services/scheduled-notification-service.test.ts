import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Notification } from 'electron';
import { ScheduledNotificationService } from '../../../electron/main/services/scheduled-notification-service';

vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
  BrowserWindow: vi.fn(),
}));

const MockNotification = vi.mocked(Notification);

describe('ScheduledNotificationService', () => {
  let service: ScheduledNotificationService;
  let mockDb: {
    prepare: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };
  const mockQuietHoursService = { isQuietHours: vi.fn().mockReturnValue(false) };
  const mockNotificationService = { getDndStatus: vi.fn().mockReturnValue(false) };
  const mockGetWindow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
    // make prepare return the mockDb object so chained .get/.all/.run work
    mockDb.prepare.mockReturnValue(mockDb);
    mockQuietHoursService.isQuietHours.mockReturnValue(false);
    mockNotificationService.getDndStatus.mockReturnValue(false);
    service = new ScheduledNotificationService(
      mockDb as any,
      mockQuietHoursService as any,
      mockNotificationService as any,
      mockGetWindow
    );
  });

  it('should create service with correct id and name', () => {
    expect(service.id).toBe('scheduled-notifications');
    expect(service.name).toBe('Scheduled Notifications');
  });

  it('should start and schedule timers for enabled slots', () => {
    mockDb.prepare.mockReturnValue({
      get: vi.fn().mockReturnValue({
        scheduled_notifications_enabled: 1,
        slot_1_enabled: 1,
        slot_1_hour: 9,
        slot_1_minute: 0,
        slot_2_enabled: 1,
        slot_2_hour: 12,
        slot_2_minute: 0,
        slot_3_enabled: 1,
        slot_3_hour: 17,
        slot_3_minute: 0,
      }),
    });
    service.start();
    expect(service['timers']).toHaveLength(3);
  });

  it('should not schedule disabled slots', () => {
    mockDb.prepare.mockReturnValue({
      get: vi.fn().mockReturnValue({
        scheduled_notifications_enabled: 1,
        slot_1_enabled: 1,
        slot_1_hour: 9,
        slot_1_minute: 0,
        slot_2_enabled: 0,
        slot_2_hour: 12,
        slot_2_minute: 0,
        slot_3_enabled: 0,
        slot_3_hour: 17,
        slot_3_minute: 0,
      }),
    });
    service.start();
    expect(service['timers']).toHaveLength(1);
  });

  it('should not schedule when disabled globally', () => {
    mockDb.prepare.mockReturnValue({
      get: vi.fn().mockReturnValue({
        scheduled_notifications_enabled: 0,
        slot_1_enabled: 1,
        slot_1_hour: 9,
        slot_1_minute: 0,
        slot_2_enabled: 1,
        slot_2_hour: 12,
        slot_2_minute: 0,
        slot_3_enabled: 1,
        slot_3_hour: 17,
        slot_3_minute: 0,
      }),
    });
    service.start();
    expect(service['timers']).toHaveLength(0);
  });

  it('should return correct status', () => {
    expect(service.getStatus()).toBe('stopped');
    mockDb.prepare.mockReturnValue({
      get: vi.fn().mockReturnValue({
        scheduled_notifications_enabled: 1,
        slot_1_enabled: 1,
        slot_1_hour: 9,
        slot_1_minute: 0,
        slot_2_enabled: 1,
        slot_2_hour: 12,
        slot_2_minute: 0,
        slot_3_enabled: 1,
        slot_3_hour: 17,
        slot_3_minute: 0,
      }),
    });
    service.start();
    expect(service.getStatus()).toBe('running');
  });

  it('should clear timers on stop', () => {
    mockDb.prepare.mockReturnValue({
      get: vi.fn().mockReturnValue({
        scheduled_notifications_enabled: 1,
        slot_1_enabled: 1,
        slot_1_hour: 9,
        slot_1_minute: 0,
        slot_2_enabled: 1,
        slot_2_hour: 12,
        slot_2_minute: 0,
        slot_3_enabled: 1,
        slot_3_hour: 17,
        slot_3_minute: 0,
      }),
    });
    service.start();
    expect(service['timers']).toHaveLength(3);
    service.stop();
    expect(service['timers']).toHaveLength(0);
    expect(service.getStatus()).toBe('stopped');
  });

  describe('sendScheduledNotification', () => {
    it('should not send if quiet hours active', async () => {
      mockQuietHoursService.isQuietHours.mockReturnValue(true);
      mockDb.get.mockReturnValue({ total: 0, urgent: 0 });
      await service['sendScheduledNotification']();
      expect(MockNotification).not.toHaveBeenCalled();
    });

    it('should not send if DND enabled', async () => {
      mockNotificationService.getDndStatus.mockReturnValue(true);
      mockDb.get.mockReturnValue({ total: 0, urgent: 0 });
      await service['sendScheduledNotification']();
      expect(MockNotification).not.toHaveBeenCalled();
    });

    it('should not send if nothing to report', async () => {
      mockDb.get.mockReturnValue({ total: 0, urgent: 0 });
      mockDb.all.mockReturnValue([]);
      await service['sendScheduledNotification']();
      expect(MockNotification).not.toHaveBeenCalled();
    });

    it('should send notification with correct data', async () => {
      // prepare().get() returns email stats
      mockDb.get.mockReturnValue({ total: 5, urgent: 2 });
      // prepare().all() returns data for urgent emails, events, tasks (in order)
      mockDb.all
        .mockReturnValueOnce([{ subject: 'Urgent email', sender: 'test@example.com' }])
        .mockReturnValueOnce([{ title: 'Team meeting', time: '2026-09-05T10:00:00Z' }])
        .mockReturnValueOnce([{ title: 'Review PR', source: 'Google Tasks' }]);

      await service['sendScheduledNotification']();

      expect(MockNotification).toHaveBeenCalledWith({
        title: 'Focus Board Summary',
        body: expect.stringContaining('5 unread (2 urgent)'),
        silent: false,
        timeoutType: 'default',
      });
      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    it('should update settings and reschedule timers', () => {
      mockDb.get.mockReturnValue({
        scheduled_notifications_enabled: 1,
        slot_1_enabled: 1,
        slot_1_hour: 10,
        slot_1_minute: 0,
        slot_2_enabled: 0,
        slot_2_hour: 12,
        slot_2_minute: 0,
        slot_3_enabled: 1,
        slot_3_hour: 18,
        slot_3_minute: 0,
      });
      const newSettings = {
        enabled: true,
        slots: [
          { enabled: true, hour: 10, minute: 0 },
          { enabled: false, hour: 12, minute: 0 },
          { enabled: true, hour: 18, minute: 0 },
        ] as const,
      };
      const result = service.updateSettings(newSettings);
      expect(result).toEqual({ success: true });
      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('sendTestNotification', () => {
    it('should send test notification immediately', () => {
      const result = service.sendTestNotification();
      expect(result).toEqual({ success: true });
      expect(MockNotification).toHaveBeenCalledWith({
        title: 'Focus Board Test',
        body: 'Scheduled notifications are working correctly!',
        silent: false,
        timeoutType: 'default',
      });
    });

    it('should focus window on click', () => {
      const mockFocus = vi.fn();
      mockGetWindow.mockReturnValue({ focus: mockFocus });
      service.sendTestNotification();
      const notification = MockNotification.mock.results[0].value;
      const clickHandler = notification.on.mock.calls.find((call: any[]) => call[0] === 'click');
      expect(clickHandler).toBeDefined();
      clickHandler![1]();
      expect(mockFocus).toHaveBeenCalled();
    });
  });

  describe('buildNotificationBody', () => {
    it('should format email count with urgent highlights', () => {
      const body = service['buildNotificationBody']({
        unreadCount: 5,
        urgentCount: 2,
        urgentEmails: [],
        todayEvents: [],
        todayTasks: [],
      });
      expect(body).toBe('5 unread (2 urgent)');
    });

    it('should format events count', () => {
      const body = service['buildNotificationBody']({
        unreadCount: 0,
        urgentCount: 0,
        urgentEmails: [],
        todayEvents: [{ time: '10:00', title: 'Meeting' }],
        todayTasks: [],
      });
      expect(body).toBe('1 event today');
    });

    it('should format tasks count', () => {
      const body = service['buildNotificationBody']({
        unreadCount: 0,
        urgentCount: 0,
        urgentEmails: [],
        todayEvents: [],
        todayTasks: [{ title: 'Task 1', source: 'Google Tasks' }],
      });
      expect(body).toBe('1 task due today');
    });

    it('should combine multiple sections', () => {
      const body = service['buildNotificationBody']({
        unreadCount: 3,
        urgentCount: 1,
        urgentEmails: [],
        todayEvents: [{ time: '10:00', title: 'Meeting' }],
        todayTasks: [{ title: 'Task 1', source: 'Google Tasks' }],
      });
      expect(body).toContain('3 unread (1 urgent)');
      expect(body).toContain('1 event today');
      expect(body).toContain('1 task due today');
    });

    it('should return no items message when empty', () => {
      const body = service['buildNotificationBody']({
        unreadCount: 0,
        urgentCount: 0,
        urgentEmails: [],
        todayEvents: [],
        todayTasks: [],
      });
      expect(body).toBe('No items to report');
    });
  });
});
