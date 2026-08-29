import type Database from 'better-sqlite3';
import { z } from 'zod';

const PRESET_COLORS = [
  '#1976d2', // Blue
  '#388e3c', // Green
  '#f57c00', // Orange
  '#7b1fa2', // Purple
  '#c62828', // Red
  '#00838f', // Teal
  '#455a64', // Blue Grey
  '#ad1457', // Pink
  '#558b2f', // Light Green
  '#ef6c00', // Amber
];

const UpdateColorSchema = z.object({
  accountId: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/).nullable(),
});

export function registerAccountColorHandlers(
  ipcMain: typeof import('electron').ipcMain,
  db: Database.Database,
): void {
  ipcMain.handle(
    'accounts:updateColor',
    async (_event, rawPayload: { accountId: string; color: string | null }) => {
      const parsed = UpdateColorSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const { accountId, color } = parsed.data;
      db.prepare('UPDATE accounts SET color = ? WHERE id = ?').run(color, accountId);
      return { success: true };
    }
  );
}

export { PRESET_COLORS };
