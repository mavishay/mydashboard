import { Notification, BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { QuietHoursService } from './quiet-hours-service';
import { FeedbackService } from './feedback-service';

export interface QueuedNotification {
  emailId: string;
  subject: string;
  sender: string;
  classification: 'urgent';
}

export class NotificationService {
  private dndEnabled = false;
  private maxConcurrent = 3;
  private notificationTimeoutMs = 5000;
  private activeNotifications = new Map<string, Notification>();
  private queue: QueuedNotification[] = [];
  private maxQueueSize = 10;
  private getWindow: () => BrowserWindow | null;

  constructor(
    private db: Database.Database,
    private quietHoursService: QuietHoursService,
    private _feedbackService: FeedbackService,
    getWindow: () => BrowserWindow | null = () => null,
  ) {
    this.getWindow = getWindow;
    this.loadPreferences();
  }

  async send(data: QueuedNotification): Promise<{ notificationId: string; success: boolean; queued?: boolean }> {
    if (this.dndEnabled) {
      this.db.prepare(
        `INSERT INTO notification_log (id, email_id, subject, sender, classification, status, dnd_suppressed)
         VALUES (?, ?, ?, ?, ?, 'suppressed_dnd', 1)`
      ).run(crypto.randomUUID(), data.emailId, data.subject, data.sender, data.classification);
      return { notificationId: '', success: false };
    }

    if (this.quietHoursService.isQuietHours()) {
      this.db.prepare(
        `INSERT INTO notification_log (id, email_id, subject, sender, classification, status, quiet_hours_suppressed)
         VALUES (?, ?, ?, ?, ?, 'suppressed_quiet_hours', 1)`
      ).run(crypto.randomUUID(), data.emailId, data.subject, data.sender, data.classification);
      return { notificationId: '', success: false };
    }

    if (this.activeNotifications.size >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueueSize) {
        this.db.prepare(
          `INSERT INTO notification_log (id, email_id, subject, sender, classification, status)
           VALUES (?, ?, ?, ?, ?, 'dropped')`
        ).run(crypto.randomUUID(), data.emailId, data.subject, data.sender, data.classification);
        return { notificationId: '', success: false };
      }
      this.queue.push(data);
      this.db.prepare(
        `INSERT INTO notification_log (id, email_id, subject, sender, classification, status)
         VALUES (?, ?, ?, ?, ?, 'queued')`
      ).run(crypto.randomUUID(), data.emailId, data.subject, data.sender, data.classification);
      return { notificationId: '', success: false, queued: true };
    }

    return this.showNotification(data);
  }

  private showNotification(data: QueuedNotification): Promise<{ notificationId: string; success: boolean }> {
    const notificationId = crypto.randomUUID();
    const notification = new Notification({
      title: 'Urgent Email',
      body: `${data.sender}: ${data.subject.slice(0, 80)}`,
      silent: false,
      timeoutType: 'default',
    });

    notification.on('click', () => {
      const mainWindow = this.getWindow();
      if (mainWindow) {
        mainWindow.focus();
        mainWindow.webContents.send('notification:focus-email', { emailId: data.emailId });
      }
    });

    notification.on('close', () => {
      this.activeNotifications.delete(notificationId);
      this.dequeueNext();
    });

    notification.show();
    this.activeNotifications.set(notificationId, notification);

    this.db.prepare(
      `INSERT INTO notification_log (id, email_id, subject, sender, classification, status)
       VALUES (?, ?, ?, ?, ?, 'sent')`
    ).run(notificationId, data.emailId, data.subject, data.sender, data.classification);

    return Promise.resolve({ notificationId, success: true });
  }

  private dequeueNext(): void {
    if (this.queue.length === 0) return;
    if (this.activeNotifications.size >= this.maxConcurrent) return;
    const next = this.queue.shift();
    if (next) {
      this.showNotification(next);
    }
  }

  setDnd(enabled: boolean): { success: boolean } {
    this.dndEnabled = enabled;
    this.db.prepare(
      `INSERT INTO notification_preferences (id, dnd_enabled, updated_at)
       VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET dnd_enabled = excluded.dnd_enabled, updated_at = excluded.updated_at`
    ).run(enabled ? 1 : 0);
    return { success: true };
  }

  getDndStatus(): boolean {
    return this.dndEnabled;
  }

  getPreferences(): { notificationTimeoutMs: number; maxConcurrent: number } {
    return {
      notificationTimeoutMs: this.notificationTimeoutMs,
      maxConcurrent: this.maxConcurrent,
    };
  }

  private loadPreferences(): void {
    const row = this.db.prepare(
      'SELECT dnd_enabled, notification_timeout_ms, max_concurrent FROM notification_preferences WHERE id = 1'
    ).get() as { dnd_enabled: number; notification_timeout_ms: number; max_concurrent: number } | undefined;

    if (row) {
      this.dndEnabled = row.dnd_enabled === 1;
      this.notificationTimeoutMs = row.notification_timeout_ms;
      this.maxConcurrent = row.max_concurrent;
    }
  }
}
