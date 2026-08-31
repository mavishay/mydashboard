import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { ipcMain, shell } from 'electron';
import { registerWindowHandlers } from './window-handlers';
import { registerGmailHandlers } from './gmail-handlers';
import { registerLanHandlers } from './lan-handlers';
import type { LanServerInstance } from '../server/index';
import { registerApiKeyHandlers } from './api-key-handlers';
import { registerGoogleTasksHandlers } from './google-tasks-handlers';
import { registerTickTickHandlers } from './ticktick-handlers';
import { registerTasksHandlers } from './tasks-handlers';
import { registerTelemetryHandlers } from './telemetry-handlers';
import { registerClassificationHandlers } from './classification-handlers';
import { registerAiConsentHandlers } from './ai-consent-handlers';
import { registerNotificationHandlers } from './notification-handlers';
import { registerSetupHandlers } from './setup-handlers';
import { registerRulesHandlers } from './rules-handlers';
import { registerCronHandlers } from './cron-handlers';
import { CronScheduler } from '../cron/cron-scheduler';
import { registerAccountColorHandlers } from './account-color-handlers';
import { registerEmailCleanupHandlers } from './email-cleanup-handlers';

export function registerIpcHandlers(
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null,
  quit: () => void = () => {},
  lanServer?: LanServerInstance
): { notificationService?: import('../services/notification-service').NotificationService; cronScheduler: CronScheduler } {
  registerWindowHandlers(ipcMain, getWindow, quit);
  registerGmailHandlers(ipcMain, db, getWindow);
  registerApiKeyHandlers(ipcMain, db);
  if (lanServer) {
    registerLanHandlers(ipcMain, lanServer);
  }
  registerGoogleTasksHandlers(ipcMain, db);
  registerTickTickHandlers(ipcMain, db);
  registerTasksHandlers(ipcMain, db);
  registerTelemetryHandlers(ipcMain, db);
  const { notificationService } = registerNotificationHandlers(ipcMain, db, getWindow);
  registerClassificationHandlers(ipcMain, db, notificationService);
  registerAiConsentHandlers(ipcMain, db);
  registerSetupHandlers(ipcMain, db);
  registerRulesHandlers(ipcMain, db);
  registerAccountColorHandlers(ipcMain, db);
  registerEmailCleanupHandlers(ipcMain, db);

  ipcMain.handle('shell:openExternal', async (_event, payload: { url: string }) => {
    const url = new URL(payload.url);
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error('Only HTTP(S) URLs are allowed');
    }
    await shell.openExternal(payload.url);
  });

  const cronScheduler = new CronScheduler(db, getWindow);
  registerCronHandlers(ipcMain, db, cronScheduler);

  return { notificationService, cronScheduler };
}
