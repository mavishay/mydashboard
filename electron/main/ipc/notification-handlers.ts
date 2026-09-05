import type { BrowserWindow, IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { QuietHoursService } from '../services/quiet-hours-service';
import { FeedbackService } from '../services/feedback-service';
import { NotificationService } from '../services/notification-service';
import { ScheduledNotificationService } from '../services/scheduled-notification-service';

const SetQuietHoursSchema = z.object({
  enabled: z.boolean(),
  startHour: z.number().int().min(0).max(23),
  startMinute: z.number().int().min(0).max(59),
  endHour: z.number().int().min(0).max(23),
  endMinute: z.number().int().min(0).max(59),
}).refine(
  (data) => !(data.startHour === data.endHour && data.startMinute === data.endMinute),
  { message: 'Start and end times must differ' }
);

const SetDndSchema = z.object({
  enabled: z.boolean(),
});

const FeedbackSchema = z.object({
  notificationId: z.string().min(1),
  emailId: z.string().min(1),
  classification: z.literal('urgent'),
  feedback: z.enum(['thumbs_up', 'thumbs_down']),
});

const ScheduledSettingsSchema = z.object({
  enabled: z.boolean(),
  slots: z.array(z.object({
    enabled: z.boolean(),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })).length(3),
});

export function registerNotificationHandlers(
  ipcMain: IpcMain,
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null,
): { notificationService: NotificationService; scheduledNotificationService: ScheduledNotificationService } {
  const quietHoursService = new QuietHoursService(db);
  const feedbackService = new FeedbackService(db);
  const notificationService = new NotificationService(db, quietHoursService, getWindow);
  const scheduledNotificationService = new ScheduledNotificationService(db, quietHoursService, notificationService, getWindow);

  ipcMain.handle('notification:get-quiet-hours', async () => {
    return quietHoursService.getSettings();
  });

  ipcMain.handle('notification:set-quiet-hours', async (_, payload) => {
    const parsed = SetQuietHoursSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`);
    }
    return quietHoursService.updateSettings(parsed.data);
  });

  ipcMain.handle('notification:get-dnd-status', async () => {
    return { enabled: notificationService.getDndStatus() };
  });

  ipcMain.handle('notification:set-dnd', async (_, payload) => {
    const parsed = SetDndSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`);
    }
    return notificationService.setDnd(parsed.data.enabled);
  });

  ipcMain.handle('notification:get-preferences', async () => {
    return notificationService.getPreferences();
  });

  ipcMain.handle('notification:feedback', async (_, payload) => {
    const parsed = FeedbackSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`);
    }
    return feedbackService.record(parsed.data);
  });

  ipcMain.handle('notification:get-scheduled-settings', async () => {
    return scheduledNotificationService.getSettings();
  });

  ipcMain.handle('notification:set-scheduled-settings', async (_, payload) => {
    const parsed = ScheduledSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`);
    }
    return scheduledNotificationService.updateSettings(parsed.data);
  });

  ipcMain.handle('notification:send-test-notification', async () => {
    return scheduledNotificationService.sendTestNotification();
  });

  return { notificationService, scheduledNotificationService };
}
