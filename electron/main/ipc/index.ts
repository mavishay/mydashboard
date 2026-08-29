import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { registerWindowHandlers } from './window-handlers';
import { registerGmailHandlers } from './gmail-handlers';
import { registerN8nHandlers } from './n8n-handlers';
import { registerLanHandlers } from './lan-handlers';
import type { LanServerInstance } from '../server/index';
import { registerApiKeyHandlers } from './api-key-handlers';
import { registerGoogleTasksHandlers } from './google-tasks-handlers';
import { registerTickTickHandlers } from './ticktick-handlers';
import { registerTelemetryHandlers } from './telemetry-handlers';
import { registerClassificationHandlers } from './classification-handlers';
import { registerAiConsentHandlers } from './ai-consent-handlers';
import { registerNotificationHandlers } from './notification-handlers';
import { registerSetupHandlers } from './setup-handlers';
import { registerCronHandlers } from './cron-handlers';
import { CronScheduler } from '../cron/cron-scheduler';
import { registerAccountColorHandlers } from './account-color-handlers';

export function registerIpcHandlers(
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null,
  quit: () => void = () => {},
  composeDir: string = process.cwd(),
  lanServer?: LanServerInstance
): { notificationService?: import('../services/notification-service').NotificationService; cronScheduler: CronScheduler } {
  registerWindowHandlers(ipcMain, getWindow, quit);
  registerGmailHandlers(ipcMain, db, getWindow);
  registerN8nHandlers(ipcMain, composeDir);
  registerApiKeyHandlers(ipcMain, db);
  if (lanServer) {
    registerLanHandlers(ipcMain, lanServer);
  }
  registerGoogleTasksHandlers(ipcMain, db);
  registerTickTickHandlers(ipcMain, db);
  registerTelemetryHandlers(ipcMain, db);
  const { notificationService } = registerNotificationHandlers(ipcMain, db, getWindow);
  registerClassificationHandlers(ipcMain, db, notificationService);
  registerAiConsentHandlers(ipcMain, db);
  registerSetupHandlers(ipcMain, db);
  registerAccountColorHandlers(ipcMain, db);

  const cronScheduler = new CronScheduler(db, getWindow);
  registerCronHandlers(ipcMain, db, cronScheduler);

  return { notificationService, cronScheduler };
}
