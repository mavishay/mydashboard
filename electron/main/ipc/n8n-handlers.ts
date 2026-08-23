import type { IpcMain } from 'electron';
import { z } from 'zod';
import { checkHealth } from '../docker/health';
import { composeUp, composeDown } from '../docker/compose';

const N8nStatusResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'starting', 'unknown']),
});

const N8nActionResponseSchema = z.object({
  success: z.boolean(),
});

export function registerN8nHandlers(ipcMain: IpcMain, composeDir: string): void {
  ipcMain.handle('n8n:status', async () => {
    const status = await checkHealth();
    return N8nStatusResponseSchema.parse({ status });
  });

  ipcMain.handle('n8n:start', async () => {
    await composeUp(composeDir);
    return N8nActionResponseSchema.parse({ success: true });
  });

  ipcMain.handle('n8n:stop', async () => {
    await composeDown(composeDir);
    return N8nActionResponseSchema.parse({ success: true });
  });
}
