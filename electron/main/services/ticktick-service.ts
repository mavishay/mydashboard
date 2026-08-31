import type Database from 'better-sqlite3';
import type { ManagedService, ServiceStatus } from './service-registry';
import { TickTickSync } from '../sync/ticktick-sync';
import { TickTickAdapter } from '../sync/ticktick-adapter';
import { listAccounts, getAccessToken } from '../auth/ticktick';

export class TickTickSyncService implements ManagedService {
  id = 'ticktick-sync';
  name = 'TickTick Sync';
  private status: ServiceStatus = 'stopped';
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private syncs = new Map<string, TickTickSync>();

  constructor(private db: Database.Database) {}

  async start(): Promise<void> {
    this.status = 'starting';
    try {
      const accounts = listAccounts(this.db);
      for (const account of accounts) {
        if (this.syncs.has(account.id)) continue;

        try {
          const accessToken = getAccessToken(this.db, account.id);
          const adapter = new TickTickAdapter(accessToken);
          const sync = new TickTickSync(this.db, account.id, adapter);
          await sync.start();
          this.syncs.set(account.id, sync);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!message.includes('No tokens found')) {
            console.error(`Failed to start TickTick sync for account ${account.id}:`, err);
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
