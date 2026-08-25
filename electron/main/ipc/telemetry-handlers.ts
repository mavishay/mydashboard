import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  getTelemetrySettings,
  setTelemetryOptIn,
  getTelemetryEvents,
  clearTelemetryEvents,
} from '../telemetry';

export const SetTelemetryOptInSchema = z.object({
  optedIn: z.boolean(),
});

export const GetTelemetryEventsSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
});

type SetTelemetryOptInPayload = z.infer<typeof SetTelemetryOptInSchema>;
type GetTelemetryEventsPayload = z.infer<typeof GetTelemetryEventsSchema>;

export function registerTelemetryHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle('telemetry:getSettings', async () => {
    return getTelemetrySettings(db);
  });

  ipcMain.handle(
    'telemetry:setOptIn',
    async (_event, payload: SetTelemetryOptInPayload) => {
      const parsed = SetTelemetryOptInSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      setTelemetryOptIn(db, parsed.data.optedIn);
    }
  );

  ipcMain.handle(
    'telemetry:getEvents',
    async (_event, payload: GetTelemetryEventsPayload) => {
      const parsed = GetTelemetryEventsSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      return getTelemetryEvents(db, parsed.data.limit);
    }
  );

  ipcMain.handle('telemetry:clearEvents', async () => {
    clearTelemetryEvents(db);
  });
}
