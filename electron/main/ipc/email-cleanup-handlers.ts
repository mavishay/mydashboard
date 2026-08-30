import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  getRetentionDays,
  setRetentionDays,
  countStaleReadEmails,
  cleanupStaleReadEmails,
} from '../cron/cleanup';

const SetRetentionSchema = z.object({
  days: z.number().int().min(1).max(30),
});

type SetRetentionPayload = z.infer<typeof SetRetentionSchema>;

export function registerEmailCleanupHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle('emailCleanup:getSettings', () => {
    return {
      retentionDays: getRetentionDays(db),
    };
  });

  ipcMain.handle(
    'emailCleanup:setRetentionDays',
    async (_event, payload: SetRetentionPayload) => {
      const parsed = SetRetentionSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      setRetentionDays(db, parsed.data.days);
      return { retentionDays: getRetentionDays(db) };
    }
  );

  ipcMain.handle('emailCleanup:runCleanup', () => {
    const eligibleCount = countStaleReadEmails(db);
    const result = cleanupStaleReadEmails(db);
    return {
      deleted: result.deleted,
      eligibleCount,
    };
  });

  ipcMain.handle('emailCleanup:getEligibleCount', () => {
    return {
      count: countStaleReadEmails(db),
    };
  });
}
