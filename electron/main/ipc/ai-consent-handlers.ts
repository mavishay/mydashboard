import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  getAiConsentSettings,
  setAiConsent,
} from '../ai/consent';

export const SetAiConsentSchema = z.object({
  consented: z.boolean(),
});

type SetAiConsentPayload = z.infer<typeof SetAiConsentSchema>;

export function registerAiConsentHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle('ai-consent:getSettings', async () => {
    return getAiConsentSettings(db);
  });

  ipcMain.handle(
    'ai-consent:setConsent',
    async (_event, payload: SetAiConsentPayload) => {
      const parsed = SetAiConsentSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      setAiConsent(db, parsed.data.consented);
      return { success: true };
    }
  );
}
