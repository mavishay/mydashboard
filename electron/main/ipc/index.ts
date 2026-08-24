import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { registerWindowHandlers } from './window-handlers';
import { registerGmailHandlers } from './gmail-handlers';
import { registerN8nHandlers } from './n8n-handlers';
import { registerApiKeyHandlers } from './api-key-handlers';

export function registerIpcHandlers(
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null,
  quit: () => void = () => {},
  composeDir: string = process.cwd()
): void {
  registerWindowHandlers(ipcMain, getWindow, quit);
  registerGmailHandlers(ipcMain, db);
  registerN8nHandlers(ipcMain, composeDir);
  registerApiKeyHandlers(ipcMain, db);
}
