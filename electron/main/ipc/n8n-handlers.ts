import type { IpcMain } from 'electron';
import { z } from 'zod';
import { checkHealth } from '../docker/health';
import { composeUp, composeDown } from '../docker/compose';

const N8nStatusResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'starting', 'unknown']),
});

const N8nActionResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export function registerN8nHandlers(ipcMain: IpcMain, composeDir: string): void {
  ipcMain.handle('n8n:status', async () => {
    try {
      const status = await checkHealth();
      return N8nStatusResponseSchema.parse({ status });
    } catch {
      return N8nStatusResponseSchema.parse({ status: 'unknown' });
    }
  });

  ipcMain.handle('n8n:start', async () => {
    try {
      await composeUp(composeDir);
      return N8nActionResponseSchema.parse({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return N8nActionResponseSchema.parse({ success: false, error: message });
    }
  });

  ipcMain.handle('n8n:stop', async () => {
    try {
      await composeDown(composeDir);
      return N8nActionResponseSchema.parse({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return N8nActionResponseSchema.parse({ success: false, error: message });
    }
  });
}
