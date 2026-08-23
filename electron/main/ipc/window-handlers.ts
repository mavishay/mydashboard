import type { IpcMain } from 'electron';
import { z } from 'zod';

export const windowMinimizeSchema = z.object({}).strict();
export const windowMaximizeSchema = z.object({}).strict();
export const windowCloseSchema = z.object({}).strict();
export const windowIsMaximizedSchema = z.object({}).strict();
export const appQuitSchema = z.object({}).strict();

export function registerWindowHandlers(
  ipcMain: IpcMain,
  getWindow: () => Electron.BrowserWindow | null,
  quit: () => void
): void {
  ipcMain.handle('window:minimize', (_event, payload) => {
    const result = windowMinimizeSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid payload: ${result.error.message}`);
    }
    getWindow()?.minimize();
  });

  ipcMain.handle('window:maximize', (_event, payload) => {
    const result = windowMaximizeSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid payload: ${result.error.message}`);
    }
    const win = getWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle('window:close', (_event, payload) => {
    const result = windowCloseSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid payload: ${result.error.message}`);
    }
    getWindow()?.close();
  });

  ipcMain.handle('window:isMaximized', (_event, payload) => {
    const result = windowIsMaximizedSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid payload: ${result.error.message}`);
    }
    return getWindow()?.isMaximized() ?? false;
  });

  ipcMain.handle('app:quit', (_event, payload) => {
    const result = appQuitSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid payload: ${result.error.message}`);
    }
    quit();
  });
}
