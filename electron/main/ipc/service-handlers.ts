import type { IpcMain } from 'electron';
import { z } from 'zod';
import type { ServiceRegistry } from '../services/service-registry';

const ServiceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['running', 'stopped', 'error', 'starting']),
  lastError: z.string().nullable(),
  startedAt: z.string().nullable(),
});

const ServiceStatusResponseSchema = z.object({
  services: z.array(ServiceInfoSchema),
});

export function registerServiceHandlers(
  ipcMain: IpcMain,
  registry: ServiceRegistry,
): void {
  ipcMain.handle('services:status', async () => {
    return ServiceStatusResponseSchema.parse({
      services: registry.getStatus(),
    });
  });

  ipcMain.handle('services:start', async () => {
    await registry.startAll();
    return ServiceStatusResponseSchema.parse({
      services: registry.getStatus(),
    });
  });

  ipcMain.handle('services:stop', async () => {
    registry.stopAll();
    return ServiceStatusResponseSchema.parse({
      services: registry.getStatus(),
    });
  });
}
