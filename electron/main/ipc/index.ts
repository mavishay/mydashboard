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

export function registerIpcHandlers(
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null,
  quit: () => void = () => {},
  composeDir: string = process.cwd(),
  lanServer?: LanServerInstance
): void {
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
  registerClassificationHandlers(ipcMain, db);
  registerAiConsentHandlers(ipcMain, db);
}
