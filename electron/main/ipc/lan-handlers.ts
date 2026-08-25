import type { IpcMain } from 'electron';
import { z } from 'zod';
import type { LanServerInstance } from '../server/index.js';

const LanStartResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  url: z.string().optional(),
});

const LanStopResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

const LanStatusResponseSchema = z.object({
  running: z.boolean(),
  port: z.number(),
  url: z.string().nullable(),
});

const LanTokenResponseSchema = z.object({
  token: z.string(),
});

const LanRegenerateTokenResponseSchema = z.object({
  token: z.string(),
});

const LanDevicesResponseSchema = z.object({
  count: z.number(),
});

export function registerLanHandlers(
  ipcMain: IpcMain,
  lanServer: LanServerInstance
): void {
  ipcMain.handle('lan:start', async () => {
    try {
      await lanServer.start();
      const status = lanServer.status();
      return LanStartResponseSchema.parse({
        success: true,
        url: status.url,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return LanStartResponseSchema.parse({
        success: false,
        error: message,
      });
    }
  });

  ipcMain.handle('lan:stop', async () => {
    try {
      await lanServer.stop();
      return LanStopResponseSchema.parse({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return LanStopResponseSchema.parse({
        success: false,
        error: message,
      });
    }
  });

  ipcMain.handle('lan:status', async () => {
    const status = lanServer.status();
    return LanStatusResponseSchema.parse(status);
  });

  ipcMain.handle('lan:getToken', async () => {
    const token = lanServer.getToken();
    return LanTokenResponseSchema.parse({ token });
  });

  ipcMain.handle('lan:regenerateToken', async () => {
    const token = lanServer.regenerateToken();
    return LanRegenerateTokenResponseSchema.parse({ token });
  });

  ipcMain.handle('lan:getConnectedDevices', async () => {
    const count = lanServer.getConnectedDevices();
    return LanDevicesResponseSchema.parse({ count });
  });
}
