import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduledNotificationService } from '../../../electron/main/services/scheduled-notification-service';

vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
  BrowserWindow: vi.fn(),
}));

describe('ScheduledNotificationService', () => {
  let service: ScheduledNotificationService;
  const mockDb = {
    prepare: vi.fn().mockReturnThis(),
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  };
  const mockQuietHoursService = { isQuietHours: vi.fn().mockReturnValue(false) };
  const mockNotificationService = { getDndStatus: vi.fn().mockReturnValue(false) };
  const mockGetWindow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
});
