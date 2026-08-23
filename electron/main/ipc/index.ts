import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { join } from 'path';
import { registerWindowHandlers } from './window-handlers';
import { registerN8nHandlers } from './n8n-handlers';

export function registerIpcHandlers(
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null,
  quit: () => void = () => {}
): void {
  registerWindowHandlers(ipcMain, getWindow, quit);

  const composeDir = join(__dirname, '../../..');
  registerN8nHandlers(ipcMain, composeDir);

  // Future handlers registered here:
  // registerDbHandlers(ipcMain, db);
  // registerAccountHandlers(ipcMain, db);
}
