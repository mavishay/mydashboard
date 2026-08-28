import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const mockShow = vi.fn();
const mockOn = vi.fn();
const mockClose = vi.fn();
const mockFocus = vi.fn();
const mockSend = vi.fn();

vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: mockShow,
    on: mockOn,
    close: mockClose,
  })),
  BrowserWindow: vi.fn(),
}));

function testDbPath(): string {
  return join(__dirname, `__test_${randomBytes(4).toString('hex')}.db`);
}

function cleanupDb(path: string): void {
  try { rmSync(path); } catch {}
  try { rmSync(path + '-wal'); } catch {}
  try { rmSync(path + '-shm'); } catch {}
}

describe('NotificationService', () => {
  let dbPath: string;

  beforeEach(async () => {
    dbPath = testDbPath();
    vi.clearAllMocks();
  });

  async function createService(getWindow?: () => { focus: () => void; webContents: { send: () => void } } | null) {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { QuietHoursService } = await import('../../../electron/main/services/quiet-hours-service');
    const { NotificationService } = await import('../../../electron/main/services/notification-service');
    const quietHoursService = new QuietHoursService(db);
    const service = new NotificationService(db, quietHoursService, getWindow ?? (() => null));
    return { service, db, quietHoursService };
  }

  it('sends notification for urgent classification', async () => {
    const { service, db } = await createService();

    const result = await service.send({
      emailId: 'email-1',
      subject: 'Test Subject',
      sender: 'test@example.com',
      classification: 'urgent',
    });

    expect(result.success).toBe(true);
    expect(result.notificationId).toBeTruthy();
    expect(mockShow).toHaveBeenCalled();

    const logRow = db.prepare(
      'SELECT * FROM notification_log WHERE email_id = ?'
    ).get('email-1') as { classification: string };
    expect(logRow.classification).toBe('urgent');

    db.close();
    cleanupDb(dbPath);
  });

  it('suppresses notification when DND is enabled', async () => {
    const { service, db } = await createService();
    service.setDnd(true);

    const result = await service.send({
      emailId: 'email-1',
      subject: 'Test Subject',
      sender: 'test@example.com',
      classification: 'urgent',
    });

    expect(result.success).toBe(false);
    expect(mockShow).not.toHaveBeenCalled();

    const logRow = db.prepare(
      'SELECT dnd_suppressed FROM notification_log WHERE email_id = ?'
    ).get('email-1') as { dnd_suppressed: number };
    expect(logRow.dnd_suppressed).toBe(1);

    db.close();
    cleanupDb(dbPath);
  });

  it('suppresses notification during quiet hours', async () => {
    const { service, db, quietHoursService } = await createService();
    quietHoursService.updateSettings({
      enabled: true,
      startHour: 0,
      startMinute: 0,
      endHour: 23,
      endMinute: 59,
    });

    // Mock time to be during quiet hours (14:00)
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date(2026, 0, 1, 14, 0, 0));

    const result = await service.send({
      emailId: 'email-1',
      subject: 'Test Subject',
      sender: 'test@example.com',
      classification: 'urgent',
    });

    expect(result.success).toBe(false);

    const logRow = db.prepare(
      'SELECT quiet_hours_suppressed FROM notification_log WHERE email_id = ?'
    ).get('email-1') as { quiet_hours_suppressed: number };
    expect(logRow.quiet_hours_suppressed).toBe(1);

    vi.useRealTimers();
    db.close();
    cleanupDb(dbPath);
  });

  it('loads DND from DB on construction', async () => {
    const { service, db } = await createService();
    service.setDnd(true);

    // Create a new service instance to test loading
    const { QuietHoursService } = await import('../../../electron/main/services/quiet-hours-service');
    const { NotificationService } = await import('../../../electron/main/services/notification-service');
    const qhs = new QuietHoursService(db);
    const service2 = new NotificationService(db, qhs, () => null);

    expect(service2.getDndStatus()).toBe(true);

    db.close();
    cleanupDb(dbPath);
  });

  it('persists DND to DB on setDnd', async () => {
    const { service, db } = await createService();
    service.setDnd(true);

    const row = db.prepare(
      'SELECT dnd_enabled FROM notification_preferences WHERE id = 1'
    ).get() as { dnd_enabled: number };
    expect(row.dnd_enabled).toBe(1);

    db.close();
    cleanupDb(dbPath);
  });

  it('enforces max concurrent notifications', async () => {
    const { service, db } = await createService();

    // Fill up to max concurrent (3)
    await service.send({ emailId: 'e1', subject: 'S1', sender: 'a', classification: 'urgent' });
    await service.send({ emailId: 'e2', subject: 'S2', sender: 'b', classification: 'urgent' });
    await service.send({ emailId: 'e3', subject: 'S3', sender: 'c', classification: 'urgent' });

    // This should queue
    const result = await service.send({ emailId: 'e4', subject: 'S4', sender: 'd', classification: 'urgent' });
    expect(result.queued).toBe(true);
    expect(result.success).toBe(false);

    db.close();
    cleanupDb(dbPath);
  });

  it('click handler focuses window and sends IPC', async () => {
    const mockWindow = { focus: mockFocus, webContents: { send: mockSend } };
    const { service, db } = await createService(() => mockWindow);

    await service.send({
      emailId: 'email-1',
      subject: 'Test Subject',
      sender: 'test@example.com',
      classification: 'urgent',
    });

    // Find the click handler that was registered
    const clickHandler = mockOn.mock.calls.find(
      (call: unknown[]) => (call as [string, () => void])[0] === 'click'
    )?.[1] as (() => void) | undefined;

    expect(clickHandler).toBeTruthy();
    clickHandler?.();

    expect(mockFocus).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith('notification:focus-email', { emailId: 'email-1' });

    db.close();
    cleanupDb(dbPath);
  });

  it('returns preferences', async () => {
    const { service, db } = await createService();
    const prefs = service.getPreferences();
    expect(prefs.maxConcurrent).toBe(3);
    expect(prefs.notificationTimeoutMs).toBe(5000);

    db.close();
    cleanupDb(dbPath);
  });

  it('returns success on setDnd', async () => {
    const { service, db } = await createService();
    const result = service.setDnd(true);
    expect(result).toEqual({ success: true });

    db.close();
    cleanupDb(dbPath);
  });

  it('loads preferences from DB', async () => {
    const { service, db } = await createService();

    // Preferences loaded on construction should match defaults
    expect(service.getPreferences()).toEqual({
      notificationTimeoutMs: 5000,
      maxConcurrent: 3,
    });

    db.close();
    cleanupDb(dbPath);
  });
});
