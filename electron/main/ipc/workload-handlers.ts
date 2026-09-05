import type Database from 'better-sqlite3';
import { WorkloadService } from '../services/workload-service';

export function registerWorkloadHandlers(
  ipcMain: typeof import('electron').ipcMain,
  db: Database.Database
): void {
  const workloadService = new WorkloadService(db);

  ipcMain.handle('workload:calculate', async () => {
    return workloadService.calculate();
  });

  ipcMain.handle('workload:getLatest', async () => {
    return workloadService.getLatest();
  });
}
