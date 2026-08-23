import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { registerWindowHandlers } from './window-handlers';

export function registerIpcHandlers(
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null,
  quit: () => void = () => {}
): void {
  registerWindowHandlers(ipcMain, getWindow, quit);

  // Future handlers registered here:
  // registerDbHandlers(ipcMain, db);
  // registerAccountHandlers(ipcMain, db);
}
