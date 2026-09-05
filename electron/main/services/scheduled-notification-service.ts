import type Database from 'better-sqlite3';
import { Notification, BrowserWindow } from 'electron';
import type { QuietHoursService } from './quiet-hours-service';
import type { NotificationService } from './notification-service';
import type { ManagedService, ServiceStatus } from './service-registry';

export interface NotificationSettings {
  enabled: boolean;
  slots: [
    { enabled: boolean; hour: number; minute: number },
    { enabled: boolean; hour: number; minute: number },
    { enabled: boolean; hour: number; minute: number },
  ];
}

export interface ScheduledNotificationData {
  unreadCount: number;
  urgentCount: number;
  urgentEmails: Array<{ subject: string; sender: string }>;
  todayEvents: Array<{ time: string; title: string }>;
  todayTasks: Array<{ title: string; source: string }>;
}

export class ScheduledNotificationService implements ManagedService {
  id = 'scheduled-notifications';
  name = 'Scheduled Notifications';
  private status: ServiceStatus = 'stopped';
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private getWindow: () => BrowserWindow | null;

  constructor(
    private db: Database.Database,
    private quietHoursService: QuietHoursService,
    private notificationService: NotificationService,
    getWindow: () => BrowserWindow | null = () => null,
  ) {
    this.getWindow = getWindow;
  }

  async start(): Promise<void> {
    this.status = 'starting';
    try {
      this.scheduleAllSlots();
      this.status = 'running';
      this.startedAt = new Date().toISOString();
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  stop(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
    this.status = 'stopped';
    this.startedAt = null;
  }

  getStatus(): ServiceStatus {
    return this.status;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getStartedAt(): string | null {
    return this.startedAt;
  }

  private scheduleAllSlots(): void {
    this.stop();
    const settings = this.getSettings();
    if (!settings.enabled) return;

    for (const slot of settings.slots) {
      if (slot.enabled) {
        this.scheduleSlot(slot.hour, slot.minute);
      }
    }
  }

  private scheduleSlot(hour: number, minute: number): void {
    const now = new Date();
    const target = new Date();
    target.setHours(hour, minute, 0, 0);

    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    const delay = target.getTime() - now.getTime();
    const timer = setTimeout(async () => {
      try {
        await this.sendScheduledNotification();
      } catch (err) {
        console.error('Scheduled notification failed:', err);
      } finally {
        this.scheduleSlot(hour, minute);
      }
    }, delay);

    this.timers.push(timer);
  }

  private async sendScheduledNotification(): Promise<void> {
    if (this.notificationService.getDndStatus()) return;
    if (this.quietHoursService.isQuietHours()) return;

    const data = this.gatherNotificationData();
    if (data.unreadCount === 0 && data.todayEvents.length === 0 && data.todayTasks.length === 0) {
      return;
    }

    const notification = new Notification({
      title: 'Focus Board Summary',
      body: this.buildNotificationBody(data),
      silent: false,
      timeoutType: 'default',
    });

    notification.on('click', () => {
      const mainWindow = this.getWindow();
      if (mainWindow) {
        mainWindow.focus();
      }
    });

    notification.show();

    this.db.prepare(
      `INSERT INTO notification_log (id, email_id, subject, sender, classification, status, quiet_hours_suppressed, dnd_suppressed)
       VALUES (?, 'scheduled', ?, '', 'scheduled', 'sent', 0, 0)`
    ).run(crypto.randomUUID(), `Summary: ${data.unreadCount} unread, ${data.todayEvents.length} events, ${data.todayTasks.length} tasks`);
  }

  private gatherNotificationData(): ScheduledNotificationData {
    const emailStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN classification = 'urgent' THEN 1 ELSE 0 END) as urgent
      FROM emails WHERE is_read = 0
    `).get() as { total: number; urgent: number };

    const urgentEmails = this.db.prepare(`
      SELECT subject, from_address as sender
      FROM emails
      WHERE classification = 'urgent' AND is_read = 0
      LIMIT 3
    `).all() as Array<{ subject: string; sender: string }>;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const todayEvents = this.db.prepare(`
      SELECT title, start_time as time
      FROM calendar_events
      WHERE start_time >= ? AND start_time < ?
      ORDER BY start_time ASC
      LIMIT 5
    `).all(startOfDay.toISOString(), endOfDay.toISOString()) as Array<{ time: string; title: string }>;

    const todayStr = now.toISOString().split('T')[0];
    const todayTasks = this.db.prepare(`
      SELECT title, 'Google Tasks' as source FROM google_tasks
      WHERE due LIKE ? AND status = 'needsAction' AND is_deleted = 0
      UNION ALL
      SELECT title, 'TickTick' as source FROM ticktick_tasks
      WHERE due_date LIKE ? AND status = 0 AND is_deleted = 0
      LIMIT 5
    `).all(`${todayStr}%`, `${todayStr}%`) as Array<{ title: string; source: string }>;

    return {
      unreadCount: emailStats.total,
      urgentCount: emailStats.urgent,
      urgentEmails,
      todayEvents,
      todayTasks,
    };
  }

  private buildNotificationBody(data: ScheduledNotificationData): string {
    const parts: string[] = [];

    if (data.unreadCount > 0) {
      parts.push(`${data.unreadCount} unread (${data.urgentCount} urgent)`);
    }

    if (data.todayEvents.length > 0) {
      parts.push(`${data.todayEvents.length} event${data.todayEvents.length > 1 ? 's' : ''} today`);
    }

    if (data.todayTasks.length > 0) {
      parts.push(`${data.todayTasks.length} task${data.todayTasks.length > 1 ? 's' : ''} due today`);
    }

    return parts.join(', ') || 'No items to report';
  }

  getSettings(): NotificationSettings {
    const row = this.db.prepare(
      'SELECT * FROM notification_preferences WHERE id = 1'
    ).get() as {
      scheduled_notifications_enabled: number;
      slot_1_enabled: number;
      slot_1_hour: number;
      slot_1_minute: number;
      slot_2_enabled: number;
      slot_2_hour: number;
      slot_2_minute: number;
      slot_3_enabled: number;
      slot_3_hour: number;
      slot_3_minute: number;
    } | undefined;

    if (!row) {
      return {
        enabled: true,
        slots: [
          { enabled: true, hour: 9, minute: 0 },
          { enabled: true, hour: 12, minute: 0 },
          { enabled: true, hour: 17, minute: 0 },
        ],
      };
    }

    return {
      enabled: row.scheduled_notifications_enabled === 1,
      slots: [
        { enabled: row.slot_1_enabled === 1, hour: row.slot_1_hour, minute: row.slot_1_minute },
        { enabled: row.slot_2_enabled === 1, hour: row.slot_2_hour, minute: row.slot_2_minute },
        { enabled: row.slot_3_enabled === 1, hour: row.slot_3_hour, minute: row.slot_3_minute },
      ],
    };
  }

  updateSettings(settings: NotificationSettings): { success: boolean } {
    this.db.prepare(
      `INSERT INTO notification_preferences (id, scheduled_notifications_enabled,
        slot_1_enabled, slot_1_hour, slot_1_minute,
        slot_2_enabled, slot_2_hour, slot_2_minute,
        slot_3_enabled, slot_3_hour, slot_3_minute, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         scheduled_notifications_enabled = excluded.scheduled_notifications_enabled,
         slot_1_enabled = excluded.slot_1_enabled,
         slot_1_hour = excluded.slot_1_hour,
         slot_1_minute = excluded.slot_1_minute,
         slot_2_enabled = excluded.slot_2_enabled,
         slot_2_hour = excluded.slot_2_hour,
         slot_2_minute = excluded.slot_2_minute,
         slot_3_enabled = excluded.slot_3_enabled,
         slot_3_hour = excluded.slot_3_hour,
         slot_3_minute = excluded.slot_3_minute,
         updated_at = excluded.updated_at`
    ).run(
      settings.enabled ? 1 : 0,
      settings.slots[0].enabled ? 1 : 0, settings.slots[0].hour, settings.slots[0].minute,
      settings.slots[1].enabled ? 1 : 0, settings.slots[1].hour, settings.slots[1].minute,
      settings.slots[2].enabled ? 1 : 0, settings.slots[2].hour, settings.slots[2].minute,
    );

    this.stop();
    this.start().catch((err) => {
      console.error('Failed to restart scheduled notifications after settings update:', err);
    });

    return { success: true };
  }

  sendTestNotification(): { success: boolean } {
    const notification = new Notification({
      title: 'Focus Board Test',
      body: 'Scheduled notifications are working correctly!',
      silent: false,
      timeoutType: 'default',
    });

    notification.on('click', () => {
      const mainWindow = this.getWindow();
      if (mainWindow) {
        mainWindow.focus();
      }
    });

    notification.show();
    return { success: true };
  }
}
