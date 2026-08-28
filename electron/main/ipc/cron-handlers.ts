import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { CronScheduler } from '../cron/cron-scheduler';

const UpdateConfigSchema = z.object({
  workStartHour: z.number().int().min(0).max(23).optional(),
  workStartMinute: z.number().int().min(0).max(59).optional(),
  workEndHour: z.number().int().min(0).max(23).optional(),
  workEndMinute: z.number().int().min(0).max(59).optional(),
  workIntervalSeconds: z.number().int().min(60).max(3600).optional(),
  offHoursIntervalSeconds: z.number().int().min(300).max(7200).optional(),
});

export function registerCronHandlers(
  ipcMain: IpcMain,
  _db: Database.Database,
  cronScheduler: CronScheduler,
): void {
  ipcMain.handle('cron:start', async () => {
    cronScheduler.start();
    return cronScheduler.getStatus();
  });

  ipcMain.handle('cron:stop', async () => {
    cronScheduler.stop();
    return cronScheduler.getStatus();
  });

  ipcMain.handle('cron:status', async () => {
    return cronScheduler.getStatus();
  });

  ipcMain.handle('cron:update-config', async (_, payload) => {
    const parsed = UpdateConfigSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`);
    }
    cronScheduler.updateConfig(parsed.data);
    return cronScheduler.getStatus();
  });

  ipcMain.handle('cron:run-now', async () => {
    await cronScheduler.runNow();
    return cronScheduler.getStatus();
  });
}
