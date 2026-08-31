import type { CronScheduler } from '../cron/cron-scheduler';
import type { ManagedService, ServiceStatus } from './service-registry';

export class CronService implements ManagedService {
  id = 'cron';
  name = 'Email Auto-Fetch';
  private status: ServiceStatus = 'stopped';
  private lastError: string | null = null;
  private startedAt: string | null = null;

  constructor(private scheduler: CronScheduler) {}

  async start(): Promise<void> {
    this.status = 'starting';
    try {
      this.scheduler.start();
      this.status = 'running';
      this.startedAt = new Date().toISOString();
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  stop(): void {
    this.scheduler.stop();
    this.status = 'stopped';
    this.startedAt = null;
  }

  getStatus(): ServiceStatus {
    return this.status;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getStartedAt(): string | null {
    return this.startedAt;
  }
}
