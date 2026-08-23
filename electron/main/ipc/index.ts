import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { registerWindowHandlers } from './window-handlers';
import { registerGmailHandlers } from './gmail-handlers';

export function registerIpcHandlers(
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null,
  quit: () => void = () => {}
): void {
  registerWindowHandlers(ipcMain, getWindow, quit);
  registerGmailHandlers(ipcMain, db);
}
