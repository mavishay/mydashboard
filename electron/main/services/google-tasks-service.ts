import type Database from 'better-sqlite3';
import type { ManagedService, ServiceStatus } from './service-registry';
import { GoogleTasksSync } from '../sync/google-tasks-sync';
import { listAccounts } from '../auth/google-tasks';

export class GoogleTasksSyncService implements ManagedService {
  id = 'google-tasks-sync';
  name = 'Google Tasks Sync';
  private status: ServiceStatus = 'stopped';
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private syncs = new Map<string, GoogleTasksSync>();

  constructor(private db: Database.Database) {}

  async start(): Promise<void> {
    this.status = 'starting';
    try {
      const accounts = listAccounts(this.db);
      for (const account of accounts) {
        if (this.syncs.has(account.id)) continue;

        const sync = new GoogleTasksSync(this.db, account.id);
        try {
          await sync.start();
          this.syncs.set(account.id, sync);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!message.includes('No tokens found') && !message.includes('No refresh token')) {
            console.error(`Failed to start Google Tasks sync for account ${account.id}:`, err);
          }
        }
      }
      this.status = 'running';
      this.startedAt = new Date().toISOString();
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  stop(): void {
    for (const [id, sync] of this.syncs) {
      sync.stop();
      this.syncs.delete(id);
    }
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
