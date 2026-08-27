import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-app'),
  },
}));

function testDbPath(): string {
  return join(__dirname, `__test_${randomBytes(4).toString('hex')}.db`);
}

function cleanupDb(path: string): void {
  try { rmSync(path); } catch {}
  try { rmSync(path + '-wal'); } catch {}
  try { rmSync(path + '-shm'); } catch {}
}

describe('QuietHoursService', () => {
  let dbPath: string;

  beforeEach(async () => {
    dbPath = testDbPath();
  });

  it('returns false when quiet hours are disabled', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { QuietHoursService } = await import('../../../electron/main/services/quiet-hours-service');
    const svc = new QuietHoursService(db);

    expect(svc.isQuietHours()).toBe(false);
    db.close();
    cleanupDb(dbPath);
  });

  it('returns settings with defaults', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { QuietHoursService } = await import('../../../electron/main/services/quiet-hours-service');
    const svc = new QuietHoursService(db);

    const settings = svc.getSettings();
    expect(settings.enabled).toBe(false);
    expect(settings.startHour).toBe(22);
    expect(settings.startMinute).toBe(0);
    expect(settings.endHour).toBe(7);
    expect(settings.endMinute).toBe(0);
    db.close();
    cleanupDb(dbPath);
  });

  it('updates settings and persists to DB', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { QuietHoursService } = await import('../../../electron/main/services/quiet-hours-service');
    const svc = new QuietHoursService(db);

    svc.updateSettings({
      enabled: true,
      startHour: 20,
      startMinute: 30,
      endHour: 8,
      endMinute: 0,
    });

    const settings = svc.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.startHour).toBe(20);
    expect(settings.startMinute).toBe(30);
    expect(settings.endHour).toBe(8);
    expect(settings.endMinute).toBe(0);

    // Verify persisted
    const svc2 = new QuietHoursService(db);
    const settings2 = svc2.getSettings();
    expect(settings2.enabled).toBe(true);
    expect(settings2.startHour).toBe(20);

    db.close();
    cleanupDb(dbPath);
  });

  it('handles overnight range correctly', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { QuietHoursService } = await import('../../../electron/main/services/quiet-hours-service');
    const svc = new QuietHoursService(db);

    svc.updateSettings({
      enabled: true,
      startHour: 22,
      startMinute: 0,
      endHour: 7,
      endMinute: 0,
    });

    // Mock time to be during quiet hours (23:00 = 1380 minutes)
    const mockDate = new Date();
    mockDate.getHours = () => 23;
    mockDate.getMinutes = () => 0;
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(mockDate);

    expect(svc.isQuietHours()).toBe(true);

    vi.useRealTimers();
    db.close();
    cleanupDb(dbPath);
  });

  it('returns false outside quiet hours window', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { QuietHoursService } = await import('../../../electron/main/services/quiet-hours-service');
    const svc = new QuietHoursService(db);

    svc.updateSettings({
      enabled: true,
      startHour: 22,
      startMinute: 0,
      endHour: 7,
      endMinute: 0,
    });

    // Mock time to be outside quiet hours (12:00 = 720 minutes)
    const mockDate = new Date();
    mockDate.getHours = () => 12;
    mockDate.getMinutes = () => 0;
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(mockDate);

    expect(svc.isQuietHours()).toBe(false);

    vi.useRealTimers();
    db.close();
    cleanupDb(dbPath);
  });

  it('handles same-day range correctly', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { QuietHoursService } = await import('../../../electron/main/services/quiet-hours-service');
    const svc = new QuietHoursService(db);

    svc.updateSettings({
      enabled: true,
      startHour: 12,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
    });

    // Mock time to be during quiet hours (14:00 = 840 minutes)
    const mockDate = new Date();
    mockDate.getHours = () => 14;
    mockDate.getMinutes = () => 0;
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(mockDate);

    expect(svc.isQuietHours()).toBe(true);

    vi.useRealTimers();
    db.close();
    cleanupDb(dbPath);
  });

  it('returns success on updateSettings', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { QuietHoursService } = await import('../../../electron/main/services/quiet-hours-service');
    const svc = new QuietHoursService(db);

    const result = svc.updateSettings({
      enabled: true,
      startHour: 23,
      startMinute: 0,
      endHour: 6,
      endMinute: 30,
    });

    expect(result).toEqual({ success: true });
    db.close();
    cleanupDb(dbPath);
  });
});
